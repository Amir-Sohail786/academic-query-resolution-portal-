// app.js - router, page rendering, startup and timers.
window.AQRP = window.AQRP || {};

AQRP.app = (function () {
  const esc = AQRP.ui.escapeHTML;
  const DEMO_ACCOUNTS = [
    ["Student", "aarav@student.demo"], ["Examination Staff", "exam@staff.demo"], ["Accounts Staff", "accounts@staff.demo"],
    ["Hostel Staff", "hostel@staff.demo"], ["Academic Affairs Staff", "academic@staff.demo"], ["Registrar Staff", "registrar@staff.demo"],
    ["IT Support Staff", "it@staff.demo"], ["Admin", "admin@portal.demo"]
  ];
  let routeToken = 0;
  let activeTab = "conversation";
  let notifFilter = "all";
  let draftFiles = [];

  // Shortcut to get an element by id.
  function $(id) { return document.getElementById(id); }

  // Decode part of a URL without crashing on bad input.
  function safeDecode(text) {
    try { return decodeURIComponent(text); } catch (error) { return text; }
  }

  // Read the hash and return { key, id } for the matching route.
  function parseRoute() {
    const hash = window.location.hash;
    if (hash === "" || hash === "#" || hash === "#/") {
      return { key: AQRP.auth.isLoggedIn() ? "dashboard" : "login", id: "" };
    }
    const parts = hash.replace(/^#\//, "").split("/");
    const first = parts[0];
    const second = parts[1] ? safeDecode(parts[1]) : "";
    if (parts.length === 1 && ["login", "dashboard", "tickets", "notifications"].indexOf(first) !== -1) { return { key: first, id: "" }; }
    if (parts.length === 2 && first === "tickets" && second === "new") { return { key: "tickets-new", id: "" }; }
    if (parts.length === 2 && first === "ticket" && second) { return { key: "ticket", id: second }; }
    if (parts.length === 2 && first === "track" && second) { return { key: "track", id: second }; }
    if (parts.length === 2 && first === "admin" && ["categories", "departments", "users"].indexOf(second) !== -1) { return { key: "admin-" + second, id: "" }; }
    return { key: "notfound", id: "" };
  }

  // Decide what to show for the current hash: redirect, error page or the real page.
  function route() {
    const user = AQRP.auth.getCurrentUser();
    const r = parseRoute();
    routeToken++;
    const token = routeToken;
    if (r.key !== "notfound" && AQRP.auth.needsLogin(r.key) && !user) { window.location.hash = "#/login"; return; }
    if (r.key === "login" && user) { window.location.hash = "#/dashboard"; return; }
    document.body.className = user ? "" : "public";
    closeMenus();
    if (user) { renderShell(user); }
    const view = $("view");
    if (r.key !== "notfound" && !AQRP.auth.canAccess(r.key)) { view.innerHTML = messageCard("Access denied", "Your role cannot open this page."); return; }
    view.innerHTML = AQRP.ui.skeleton();
    setTimeout(function () {
      if (token !== routeToken) { return; }
      renderPage(r, user);
      window.scrollTo(0, 0);
    }, 300);
  }

  // Build a card with a message and a "Go to dashboard" button (used for 404 and access denied).
  function messageCard(title, text) {
    return '<section class="card empty"><h2>' + esc(title) + "</h2><p>" + esc(text) + '</p><a class="btn btn-primary" href="#/dashboard">Go to dashboard</a></section>';
  }

  // Call the right page function for a route.
  function renderPage(r, user) {
    if (r.key === "login") { renderLogin(); }
    else if (r.key === "dashboard") { renderDashboard(user); }
    else if (r.key === "tickets") { renderTickets(user); }
    else if (r.key === "tickets-new") { renderNewTicket(user); }
    else if (r.key === "ticket") { renderTicket(r.id, user); }
    else if (r.key === "track") { renderTrack(r.id, user); }
    else if (r.key === "notifications") { renderNotifications(user); }
    else if (r.key === "admin-categories") { renderCategories(); }
    else if (r.key === "admin-departments") { renderDepartments(); }
    else if (r.key === "admin-users") { renderUsers(); }
    else { $("view").innerHTML = messageCard("Page not found", "The page you opened does not exist."); }
  }

  // Draw the sidebar links, user menu and bell badge for the logged-in user.
  function renderShell(user) {
    const links = [["#/dashboard", "&#127968;", "Dashboard"]];
    if (user.role === "student") { links.push(["#/tickets", "&#127915;", "My Tickets"], ["#/tickets/new", "&#10133;", "New Ticket"]); }
    if (user.role === "staff") { links.push(["#/tickets", "&#128203;", "Department Queue"]); }
    if (user.role === "admin") { links.push(["#/tickets", "&#128203;", "All Tickets"], ["#/admin/categories", "&#128193;", "Categories"], ["#/admin/departments", "&#127970;", "Departments"], ["#/admin/users", "&#128101;", "Users"]); }
    links.push(["#/notifications", "&#128276;", "Notifications"]);
    const hash = window.location.hash;
    $("sidebar-nav").innerHTML = links.map(function (link) {
      const active = hash === link[0] || (link[0] === "#/tickets" && hash.indexOf("#/ticket/") === 0);
      return '<a class="nav-link ' + (active ? "active" : "") + '" href="' + link[0] + '"><span aria-hidden="true">' + link[1] + '</span><span class="nav-text">' + link[2] + "</span></a>";
    }).join("");
    $("user-btn").innerHTML = '<span class="user-name">' + esc(user.name) + "</span> &#9662;";
    $("user-btn").setAttribute("aria-label", "User menu for " + user.name);
    $("user-menu").innerHTML = "<div style='padding:8px 12px'><strong>" + esc(user.name) + "</strong><br><span class='muted'>" + esc(AQRP.auth.roleName(user.role)) + "</span></div>" +
      '<button class="menu-item" data-action="reset">Reset demo data</button><button class="menu-item" data-action="logout">Logout</button>';
    updateBell(user);
    $("theme-btn").innerHTML = document.documentElement.getAttribute("data-theme") === "dark" ? "&#9728;" : "&#127769;";
  }

  // Show the unread count on the bell.
  function updateBell(user) {
    const count = AQRP.notifications.unreadCount(user.id);
    $("bell-badge").hidden = count === 0;
    $("bell-badge").textContent = count > 99 ? "99+" : String(count);
  }

  // Fill the bell dropdown with the latest 6 notifications.
  function renderBellMenu(user) {
    const latest = AQRP.notifications.getLatest(user.id, 6);
    const items = latest.length === 0 ? '<p class="muted" style="padding:12px">No notifications yet.</p>' : latest.map(AQRP.notifications.itemHTML).join("");
    $("bell-menu").innerHTML = items + '<div class="btn-row" style="padding:8px"><button class="btn btn-secondary btn-sm" data-action="mark-all">Mark all as read</button><a class="btn btn-ghost btn-sm" href="#/notifications">View all</a></div>';
  }

  // Close the bell and user dropdowns and the mobile drawer.
  function closeMenus() {
    ["bell-menu", "user-menu"].forEach(function (id) { if ($(id)) { $(id).hidden = true; } });
    $("bell-btn").setAttribute("aria-expanded", "false");
    $("user-btn").setAttribute("aria-expanded", "false");
    $("sidebar").classList.remove("open");
    $("overlay").classList.remove("show");
  }

  // Update the bell and show toasts for new notifications (runs after actions and every 10 seconds).
  function refreshNotifications() {
    const user = AQRP.auth.getCurrentUser();
    if (!user) { return; }
    AQRP.notifications.checkForToasts(user.id);
    updateBell(user);
  }

  // Draw the landing page with login and signup.
  function renderLogin() {
    const demoButtons = DEMO_ACCOUNTS.map(function (item) {
      return '<button type="button" class="btn btn-secondary btn-sm" data-demo="' + item[1] + '">' + item[0] + "</button>";
    }).join("");
    $("view").innerHTML = '<div class="landing"><section class="hero"><h1>Academic Query Resolution Portal</h1>' +
      "<p>Raise your academic queries as tickets and follow each one from submission to closure. Every ticket is routed to the right department with a clear deadline.</p>" +
      '<div class="feature-grid"><div class="feature"><strong>Track every query</strong>See each step with its date and time.</div>' +
      '<div class="feature"><strong>Automatic routing</strong>The category decides the department.</div>' +
      '<div class="feature"><strong>Smart escalation</strong>Late tickets are escalated automatically.</div></div></section>' +
      '<section class="card" aria-label="Login"><h2>Login</h2><form id="login-form" novalidate><div class="field"><label for="l-email">Email</label><input id="l-email" type="email" autocomplete="username"></div>' +
      '<div class="field"><label for="l-pass">Password</label><input id="l-pass" type="password" autocomplete="current-password"><span class="error-text" id="l-error"></span></div>' +
      '<button class="btn btn-primary" type="submit">Login</button></form><p class="hint" style="margin-top:16px">Quick demo login</p><div class="demo-row">' + demoButtons + "</div>" +
      '<details style="margin-top:16px"><summary><strong>Create student account</strong></summary><form id="signup-form" novalidate style="margin-top:16px">' +
      '<div class="field"><label for="s-name">Full name</label><input id="s-name" data-f="name"><span class="error-text" id="se-name"></span></div>' +
      '<div class="field"><label for="s-email">Email</label><input id="s-email" type="email" data-f="email"><span class="error-text" id="se-email"></span></div>' +
      '<div class="field"><label for="s-reg">Registration number (8 digits)</label><input id="s-reg" inputmode="numeric" data-f="registrationNumber"><span class="error-text" id="se-registrationNumber"></span></div>' +
      '<div class="field"><label for="s-pass">Password (minimum 6 characters)</label><input id="s-pass" type="password" data-f="password"><span class="error-text" id="se-password"></span></div>' +
      '<div class="field"><label for="s-confirm">Confirm password</label><input id="s-confirm" type="password" data-f="confirm"><span class="error-text" id="se-confirm"></span></div>' +
      '<button class="btn btn-primary" id="s-submit" type="submit" disabled>Create account</button></form></details>' +
      '<button class="btn btn-ghost btn-sm" id="reset-login" style="margin-top:16px">Reset demo data</button></section></div>';
    bindLogin();
  }

  // Finish a successful login: start toast tracking and open the dashboard.
  function afterLogin(user) {
    AQRP.notifications.startToastTracking(user.id);
    AQRP.ui.showToast("Welcome, " + user.name + "!", "success");
    window.location.hash = "#/dashboard";
    route();
  }

  // Attach the events of the login page.
  function bindLogin() {
    $("login-form").addEventListener("submit", function (event) {
      event.preventDefault();
      const result = AQRP.auth.login($("l-email").value, $("l-pass").value);
      if (!result.ok) { $("l-error").textContent = result.error; return; }
      afterLogin(result.user);
    });
    $("view").querySelector(".demo-row").addEventListener("click", function (event) {
      const email = event.target.getAttribute("data-demo");
      if (!email) { return; }
      const result = AQRP.auth.quickLogin(email);
      if (result.ok) { afterLogin(result.user); } else { $("l-error").textContent = result.error; }
    });
    const signup = $("signup-form");
    const touched = {};
    // Read the signup fields into an object.
    function values() {
      return { name: $("s-name").value, email: $("s-email").value, registrationNumber: $("s-reg").value, password: $("s-pass").value, confirm: $("s-confirm").value };
    }
    signup.addEventListener("input", function (event) {
      touched[event.target.getAttribute("data-f")] = true;
      const errors = AQRP.auth.validateSignup(values());
      ["name", "email", "registrationNumber", "password", "confirm"].forEach(function (key) {
        $("se-" + key).textContent = touched[key] && errors[key] ? errors[key] : "";
      });
      $("s-submit").disabled = Object.keys(errors).length > 0;
    });
    signup.addEventListener("submit", function (event) {
      event.preventDefault();
      const result = AQRP.auth.signup(values());
      if (result.ok) { afterLogin(result.user); }
    });
    $("reset-login").addEventListener("click", askReset);
  }

  // Ask for confirmation and then reset all demo data.
  function askReset() {
    AQRP.ui.confirmModal("Reset demo data", "This removes all tickets, users and notifications you created and restores the demo data. Continue?", "Reset", function () {
      AQRP.storage.resetAll();
      AQRP.ui.showToast("Demo data was reset.", "success");
      window.location.hash = "#/login";
      route();
    });
  }

  // Show the dashboard for the current role.
  function renderDashboard(user) {
    let html = AQRP.dashboard.adminHTML();
    if (user.role === "student") { html = AQRP.dashboard.studentHTML(user); }
    if (user.role === "staff") { html = AQRP.dashboard.staffHTML(user); }
    $("view").innerHTML = html;
  }

  // Show the ticket list page (My Tickets, Department Queue or All Tickets).
  function renderTickets(user) {
    const title = user.role === "student" ? "My Tickets" : (user.role === "staff" ? "Department Queue" : "All Tickets");
    $("view").innerHTML = AQRP.ui.breadcrumb([{ label: "Dashboard", href: "#/dashboard" }, { label: title }]) +
      '<div class="page-head"><h1>' + title + "</h1>" + (user.role === "student" ? '<a class="btn btn-primary" href="#/tickets/new">Raise new query</a>' : "") + "</div>" +
      '<section class="card">' + AQRP.dashboard.tableShellHTML(user) + "</section>";
    AQRP.dashboard.attachTable($("ticket-table"), user);
  }

  // Read and check files from a file input, then call onDone(accepted, errors).
  function processFiles(fileList, user, existing, limit, onDone) {
    const files = Array.from(fileList);
    const accepted = [];
    const errors = [];
    // Handle file number i, then continue with the next one.
    function next(i) {
      if (i >= files.length) { onDone(accepted, errors); return; }
      const error = AQRP.tickets.validateFile(files[i], existing + accepted.length, limit);
      if (error) { errors.push(error); next(i + 1); return; }
      AQRP.tickets.readFile(files[i], user, function (readError, attachment) {
        if (readError) { errors.push(readError); } else { accepted.push(attachment); }
        next(i + 1);
      });
    }
    next(0);
  }

  // Show the create-ticket form (students only).
  function renderNewTicket(user) {
    draftFiles = [];
    const categories = AQRP.storage.getCategories().map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + "</option>"; }).join("");
    const priorities = AQRP.tickets.PRIORITIES.map(function (p) {
      return '<option value="' + p + '"' + (p === "Medium" ? " selected" : "") + ">" + p + " (" + AQRP.tickets.getSlaHours(p) + " h SLA)</option>";
    }).join("");
    $("view").innerHTML = AQRP.ui.breadcrumb([{ label: "Dashboard", href: "#/dashboard" }, { label: "Tickets", href: "#/tickets" }, { label: "New ticket" }]) +
      '<section class="card"><h1>Raise a new query</h1><form id="ticket-form" novalidate><div class="form-grid">' +
      '<div class="field full"><label for="t-title">Title</label><input id="t-title" data-field="title" maxlength="100"><span class="error-text" id="e-title"></span></div>' +
      '<div class="field full"><label for="t-desc">Description</label><textarea id="t-desc" data-field="description" maxlength="1000"></textarea><span class="hint" id="t-count">0 / 1000</span><span class="error-text" id="e-description"></span></div>' +
      '<div class="field"><label for="t-cat">Category</label><select id="t-cat" data-field="categoryId"><option value="">Select a category</option>' + categories + '</select><span class="error-text" id="e-categoryId"></span></div>' +
      '<div class="field"><label for="t-prio">Priority</label><select id="t-prio" data-field="priority">' + priorities + '</select><span class="error-text" id="e-priority"></span></div>' +
      '<div class="field full"><div class="route-note" id="route-note">Choose a category to see which department will get this query.</div></div>' +
      '<div class="field"><label for="t-reg">Registration number</label><input id="t-reg" data-field="registrationNumber" inputmode="numeric" value="' + esc(user.registrationNumber) + '"><span class="error-text" id="e-registrationNumber"></span></div>' +
      '<div class="field"><label for="t-files">Attachments (optional, max 3, 1 MB each: JPG, PNG, PDF, DOC, DOCX)</label><input id="t-files" type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"><span class="error-text" id="e-files"></span></div>' +
      '<div class="full file-list" id="file-list"></div></div><div class="btn-row"><button class="btn btn-primary" id="t-submit" type="submit" disabled>Submit ticket</button><a class="btn btn-secondary" href="#/tickets">Cancel</a></div></form></section>';
    bindNewTicket(user);
  }

  // Attach the events of the create-ticket form.
  function bindNewTicket(user) {
    const touched = {};
    // Read the form fields into an object.
    function readForm() {
      return { title: $("t-title").value, description: $("t-desc").value, categoryId: $("t-cat").value, priority: $("t-prio").value, registrationNumber: $("t-reg").value };
    }
    // Show errors, the character counter, the department line and enable or disable Submit.
    function refresh() {
      const errors = AQRP.tickets.validateTicketForm(readForm());
      ["title", "description", "categoryId", "priority", "registrationNumber"].forEach(function (key) {
        $("e-" + key).textContent = touched[key] && errors[key] ? errors[key] : "";
        $("t-" + (key === "categoryId" ? "cat" : key === "registrationNumber" ? "reg" : key === "description" ? "desc" : key === "priority" ? "prio" : "title")).parentNode.classList.toggle("invalid", Boolean(touched[key] && errors[key]));
      });
      $("t-count").textContent = $("t-desc").value.length + " / 1000";
      const category = AQRP.storage.getCategories().find(function (c) { return c.id === $("t-cat").value; });
      $("route-note").textContent = category ? "This query will go to: " + AQRP.tickets.getDepartmentName(category.departmentId) : "Choose a category to see which department will get this query.";
      $("t-submit").disabled = Object.keys(errors).length > 0;
    }
    // Draw the selected files with Remove buttons.
    function drawFiles() {
      $("file-list").innerHTML = draftFiles.map(function (file, index) { return AQRP.ui.attachmentChip(file, index, { removable: true }); }).join("");
    }
    $("ticket-form").addEventListener("input", function (event) {
      const key = event.target.getAttribute("data-field");
      if (key) { touched[key] = true; refresh(); }
    });
    $("t-files").addEventListener("change", function (event) {
      processFiles(event.target.files, user, draftFiles.length, 3, function (accepted, errors) {
        draftFiles = draftFiles.concat(accepted);
        $("e-files").innerHTML = errors.map(esc).join("<br>");
        event.target.value = "";
        drawFiles();
      });
    });
    $("file-list").addEventListener("click", function (event) {
      const index = event.target.getAttribute("data-remove-file");
      if (index !== null) { draftFiles.splice(Number(index), 1); drawFiles(); }
    });
    $("ticket-form").addEventListener("submit", function (event) {
      event.preventDefault();
      const result = AQRP.tickets.createTicket(readForm(), user, draftFiles);
      if (!result.ok) { AQRP.ui.showToast(result.error, "error"); return; }
      AQRP.ui.showToast("Ticket " + result.ticket.id + " was created.", "success");
      window.location.hash = "#/ticket/" + result.ticket.id;
    });
    refresh();
  }

  // Build the Conversation tab (comments and the comment box).
  function conversationHTML(ticket, user) {
    const visible = ticket.comments.filter(function (c) { return !(c.isInternal && user.role === "student"); }).sort(function (a, b) { return a.createdAt - b.createdAt; });
    const list = visible.length === 0 ? '<p class="muted">No comments yet.</p>' : visible.map(function (c) {
      return '<div class="comment ' + (c.isInternal ? "internal" : "") + '"><div class="comment-head"><strong>' + esc(AQRP.tickets.getUserName(c.authorId)) + "</strong>" + AQRP.ui.roleBadge(c.authorRole) +
        (c.isInternal ? '<span class="internal-label">Internal</span>' : "") + '<span class="muted">' + esc(AQRP.ui.formatDateTime(c.createdAt)) + '</span></div><div class="comment-text">' + esc(c.text) + "</div></div>";
    }).join("");
    const blocked = ticket.status === "Closed" || (ticket.status === "Resolved" && user.role === "staff");
    if (blocked) { return list + '<p class="hint">' + (ticket.status === "Closed" ? "This ticket is closed. No new comments." : "Only the student and admin can comment on a resolved ticket.") + "</p>"; }
    const internalBox = user.role !== "student" ? '<label><input type="checkbox" id="c-internal" style="width:auto"> Internal note (hidden from student)</label>' : "";
    return list + '<div class="field" style="margin-top:16px"><label for="c-text">Add a comment</label><textarea id="c-text" maxlength="500"></textarea></div>' + internalBox +
      '<div class="btn-row" style="margin-top:8px"><button class="btn btn-primary" data-action="send-comment">Send</button></div>';
  }

  // Build the Attachments tab.
  function attachmentsHTML(ticket) {
    const chips = ticket.attachments.length === 0 ? '<p class="muted">No attachments.</p>' : '<div class="file-list">' + ticket.attachments.map(function (f, i) { return AQRP.ui.attachmentChip(f, i, { downloadable: true }); }).join("") + "</div>";
    if (ticket.status === "Closed") { return chips; }
    return chips + '<div class="field" style="margin-top:16px"><label for="a-file">Add files (maximum 5 per ticket, 1 MB each)</label><input id="a-file" type="file" multiple accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"><span class="error-text" id="a-error"></span></div>';
  }

  // Build the History tab as a timeline (newest first).
  function historyHTML(ticket, user) {
    const entries = ticket.history.filter(function (h) { return !(h.action === "Internal note added" && user.role === "student"); }).sort(function (a, b) { return b.timestamp - a.timestamp; });
    return '<ul class="timeline">' + entries.map(function (h) {
      const change = h.oldValue || h.newValue ? " (" + esc(h.oldValue || "-") + " &rarr; " + esc(h.newValue || "-") + ")" : "";
      return "<li><strong>" + esc(h.action) + "</strong>" + change + '<div class="when">' + esc(h.actorName) + " (" + esc(h.actorRole) + ") - " + esc(AQRP.ui.formatDateTime(h.timestamp)) + "</div>" + (h.note ? "<div>" + esc(h.note) + "</div>" : "") + "</li>";
    }).join("") + "</ul>";
  }

  // Build the details card and the action buttons next to the ticket.
  function sideHTML(ticket, user) {
    const t = AQRP.tickets;
    const rows = [["Category", t.getCategoryName(ticket.categoryId)], ["Department", t.getDepartmentName(ticket.departmentId)], ["Student", t.getUserName(ticket.studentId)],
      ["Registration no.", ticket.registrationNumber], ["Assigned to", ticket.assignedStaffId ? t.getUserName(ticket.assignedStaffId) : "-"], ["Created", AQRP.ui.formatDateTime(ticket.createdAt)],
      ["Last updated", AQRP.ui.formatDateTime(ticket.updatedAt)], ["SLA due", AQRP.ui.formatDateTime(ticket.slaDueAt)]];
    if (ticket.resolutionNote) { rows.push(["Resolution note", ticket.resolutionNote]); }
    if (ticket.escalated) { rows.push(["Escalation (" + ticket.escalationType + ")", ticket.escalationReason]); }
    const details = rows.map(function (r) { return "<p><span class='muted'>" + esc(r[0]) + "</span><br>" + esc(r[1]) + "</p>"; }).join("");
    const buttons = t.getAllowedTransitions(ticket, user).map(function (item) {
      const label = item.to === "Escalated" ? "Escalate" : (item.to === "Closed" ? "Close ticket" : (item.to === "Reopened" ? "Reopen" : "Move to " + item.to));
      return '<button class="btn ' + (item.to === "Escalated" ? "btn-danger" : "btn-secondary") + ' btn-sm" data-transition="' + esc(item.to) + '" data-needs="' + item.needs + '">' + label + "</button>";
    });
    if (user.role !== "student" && ticket.status !== "Closed") { buttons.push('<button class="btn btn-secondary btn-sm" data-action="reassign">Reassign</button>'); }
    return '<aside><section class="card"><h3>Details</h3>' + details + '</section><section class="card"><h3>Actions</h3><div class="btn-row">' + (buttons.length ? buttons.join("") : '<span class="muted">No actions available.</span>') + "</div></section></aside>";
  }

  // Show the full ticket page.
  function renderTicket(id, user) {
    const ticket = AQRP.storage.getTicketById(id);
    if (!ticket) { $("view").innerHTML = messageCard("Ticket not found", "No ticket has the ID " + id + "."); return; }
    if (!AQRP.tickets.canView(ticket, user)) { $("view").innerHTML = messageCard("Access denied", "You cannot open this ticket."); return; }
    const tabs = [["conversation", "Conversation"], ["attachments", "Attachments (" + ticket.attachments.length + ")"], ["history", "History"]];
    const tabBar = tabs.map(function (tab) { return '<button class="tab ' + (activeTab === tab[0] ? "active" : "") + '" data-tab="' + tab[0] + '">' + tab[1] + "</button>"; }).join("");
    let body = conversationHTML(ticket, user);
    if (activeTab === "attachments") { body = attachmentsHTML(ticket); }
    if (activeTab === "history") { body = historyHTML(ticket, user); }
    $("view").innerHTML = '<div id="ticket-page">' + AQRP.ui.breadcrumb([{ label: "Dashboard", href: "#/dashboard" }, { label: "Tickets", href: "#/tickets" }, { label: ticket.id }]) +
      '<div class="page-head"><div><h1>' + esc(ticket.title) + '</h1><div class="btn-row">' + AQRP.ui.statusBadge(ticket.status) + AQRP.ui.priorityBadge(ticket.priority) + AQRP.ui.slaBadge(ticket, true) + "</div></div></div>" +
      AQRP.ui.stateBanner(ticket, false) + '<section class="card">' + AQRP.ui.stepper(ticket) + "<p>" + esc(ticket.description) + '</p></section><div class="two-col"><section class="card"><div class="tabs">' + tabBar + "</div>" + body + "</section>" + sideHTML(ticket, user) + "</div></div>";
    bindTicket(ticket, user);
  }

  // Run a status change and show the result.
  function runTransition(ticket, user, to, text) {
    const result = AQRP.tickets.changeStatus(ticket.id, to, user, text);
    if (!result.ok) { AQRP.ui.showToast(result.error, "error"); return; }
    AQRP.ui.showToast("Status changed to " + to + ".", "success");
    refreshNotifications();
    route();
  }

  // Open the reassign modal (department dropdown and reason).
  function openReassign(ticket, user) {
    const options = AQRP.storage.getDepartments().filter(function (d) { return d.id !== ticket.departmentId; }).map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + "</option>"; }).join("");
    AQRP.ui.openModal({
      title: "Reassign ticket", bodyHTML: '<div class="field"><label for="r-dept">New department</label><select id="r-dept">' + options + '</select></div><div class="field"><label for="r-reason">Reason</label><textarea id="r-reason"></textarea><span class="error-text" id="r-error"></span></div>',
      buttons: [{ label: "Cancel", kind: "secondary" }, { label: "Reassign", kind: "primary", onClick: function (modal) {
        const result = AQRP.tickets.reassign(ticket.id, modal.querySelector("#r-dept").value, user, modal.querySelector("#r-reason").value);
        if (!result.ok) { modal.querySelector("#r-error").textContent = result.error; return false; }
        AQRP.ui.showToast("Ticket reassigned.", "success");
        route();
        return true;
      } }]
    });
  }

  // Attach the events of the ticket page using event delegation.
  function bindTicket(ticket, user) {
    $("ticket-page").addEventListener("click", function (event) {
      const tab = event.target.closest("[data-tab]");
      const transition = event.target.closest("[data-transition]");
      const action = event.target.closest("[data-action]");
      if (tab) { activeTab = tab.getAttribute("data-tab"); renderTicket(ticket.id, user); }
      else if (transition) {
        const to = transition.getAttribute("data-transition");
        const needs = transition.getAttribute("data-needs");
        if (needs === "") { runTransition(ticket, user, to, ""); return; }
        AQRP.ui.reasonModal({ title: needs === "note" ? "Resolution note" : "Reason", label: needs === "note" ? "Write the resolution note (at least 10 characters)" : "Write the reason (at least 10 characters)", minLength: 10, confirmLabel: "Confirm", kind: to === "Escalated" ? "danger" : "primary", onSubmit: function (text) { runTransition(ticket, user, to, text); } });
      } else if (action && action.getAttribute("data-action") === "reassign") { openReassign(ticket, user); }
      else if (action && action.getAttribute("data-action") === "send-comment") {
        const internal = $("c-internal") ? $("c-internal").checked : false;
        const result = AQRP.tickets.addComment(ticket.id, user, $("c-text").value, internal);
        if (!result.ok) { AQRP.ui.showToast(result.error, "error"); return; }
        AQRP.ui.showToast(internal ? "Internal note added." : "Comment sent.", "success");
        refreshNotifications();
        renderTicket(ticket.id, user);
      }
    });
    $("ticket-page").addEventListener("change", function (event) {
      if (event.target.id !== "a-file") { return; }
      processFiles(event.target.files, user, ticket.attachments.length, 5, function (accepted, errors) {
        if (errors.length > 0) { $("a-error").innerHTML = errors.map(esc).join("<br>"); }
        if (accepted.length === 0) { return; }
        const result = AQRP.tickets.addAttachments(ticket.id, user, accepted);
        AQRP.ui.showToast(result.ok ? "Attachment added." : result.error, result.ok ? "success" : "error");
        if (result.ok) { renderTicket(ticket.id, user); }
      });
    });
  }

  // Show the public read-only tracking page (no login needed).
  function renderTrack(id, user) {
    const ticket = AQRP.storage.getTicketById(String(id).trim().toUpperCase());
    const back = user ? '<a href="#/dashboard">Go to dashboard</a>' : '<a href="#/login">Go to login</a>';
    if (!ticket) { $("view").innerHTML = '<section class="card empty"><h2>Ticket not found</h2><p>No ticket has the ID ' + esc(id) + ".</p>" + back + "</section>"; return; }
    const ui = AQRP.ui;
    const rows = [["Ticket ID", esc(ticket.id)], ["Category", esc(AQRP.tickets.getCategoryName(ticket.categoryId))], ["Department", esc(AQRP.tickets.getDepartmentName(ticket.departmentId))],
      ["Priority", ui.priorityBadge(ticket.priority)], ["Status", ui.statusBadge(ticket.status)], ["Created", esc(ui.formatDateTime(ticket.createdAt))], ["Last updated", esc(ui.formatDateTime(ticket.updatedAt))], ["SLA", ui.slaBadge(ticket, true)]];
    $("view").innerHTML = '<section class="card"><h1>Track ticket</h1>' + ui.stateBanner(ticket, true) + ui.stepper(ticket) + "<table><tbody>" +
      rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</tbody></table><p style='margin-top:16px'>" + back + "</p></section>";
  }

  // Show the full notifications page.
  function renderNotifications(user) {
    const all = AQRP.notifications.getForUser(user.id);
    const shown = notifFilter === "unread" ? all.filter(function (n) { return !n.isRead; }) : all;
    const list = shown.length === 0 ? AQRP.ui.emptyState("notifications", "No notifications", notifFilter === "unread" ? "You have no unread notifications." : "You are all caught up.", "", "") : shown.map(AQRP.notifications.itemHTML).join("");
    $("view").innerHTML = AQRP.ui.breadcrumb([{ label: "Dashboard", href: "#/dashboard" }, { label: "Notifications" }]) + '<div class="page-head"><h1>Notifications</h1><div class="btn-row">' +
      '<button class="btn ' + (notifFilter === "all" ? "btn-primary" : "btn-secondary") + ' btn-sm" data-filter="all">All</button><button class="btn ' + (notifFilter === "unread" ? "btn-primary" : "btn-secondary") + ' btn-sm" data-filter="unread">Unread</button>' +
      '<button class="btn btn-secondary btn-sm" data-action="mark-all">Mark all as read</button><button class="btn btn-secondary btn-sm" data-action="clear-read">Clear read notifications</button></div></div><section class="card" id="notif-page">' + list + "</section>";
    $("view").querySelector(".page-head").addEventListener("click", function (event) {
      const filter = event.target.getAttribute("data-filter");
      const action = event.target.getAttribute("data-action");
      if (filter) { notifFilter = filter; }
      if (action === "mark-all") { AQRP.notifications.markAllRead(user.id); }
      if (action === "clear-read") { AQRP.notifications.clearRead(user.id); }
      updateBell(user);
      renderNotifications(user);
    });
  }

  // Open a small modal with one text input and pass the value to onSubmit.
  function inputModal(title, label, value, onSubmit) {
    AQRP.ui.openModal({
      title: title, bodyHTML: '<div class="field"><label for="m-input">' + esc(label) + '</label><input id="m-input" maxlength="60" value="' + esc(value) + '"><span class="error-text" id="m-error"></span></div>',
      buttons: [{ label: "Cancel", kind: "secondary" }, { label: "Save", kind: "primary", onClick: function (modal) {
        const text = modal.querySelector("#m-input").value.trim();
        if (text.length < 3) { modal.querySelector("#m-error").textContent = "Enter at least 3 characters."; return false; }
        onSubmit(text);
        return true;
      } }]
    });
  }

  // Show the manage categories page (admin).
  function renderCategories() {
    const departments = AQRP.storage.getDepartments();
    const deptOptions = function (selected) { return departments.map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === selected ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join(""); };
    const rows = AQRP.storage.getCategories().map(function (c) {
      return '<tr><td data-label="Category">' + esc(c.name) + '</td><td data-label="Department"><select data-cat-dept="' + esc(c.id) + '" aria-label="Department for ' + esc(c.name) + '">' + deptOptions(c.departmentId) + "</select></td>" +
        '<td><button class="btn btn-secondary btn-sm" data-rename="' + esc(c.id) + '">Rename</button> <button class="btn btn-danger btn-sm" data-delete="' + esc(c.id) + '">Delete</button></td></tr>';
    }).join("");
    $("view").innerHTML = AQRP.ui.breadcrumb([{ label: "Dashboard", href: "#/dashboard" }, { label: "Categories" }]) + '<div class="page-head"><h1>Categories</h1></div><section class="card"><div class="table-wrap"><table class="responsive"><thead><tr><th>Category</th><th>Department</th><th>Actions</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>" +
      '<section class="card"><h3>Add category</h3><div class="filters"><input id="new-cat" maxlength="60" placeholder="Category name" aria-label="New category name"><select id="new-cat-dept" aria-label="Department">' + deptOptions("") + '</select><button class="btn btn-primary" id="add-cat">Add category</button></div></section>';
    const view = $("view");
    view.querySelector("tbody").addEventListener("change", function (event) {
      const id = event.target.getAttribute("data-cat-dept");
      if (!id) { return; }
      const list = AQRP.storage.getCategories();
      list.forEach(function (c) { if (c.id === id) { c.departmentId = event.target.value; } });
      AQRP.storage.saveCategories(list);
      AQRP.ui.showToast("Department mapping updated.", "success");
    });
    view.querySelector("tbody").addEventListener("click", function (event) {
      const renameId = event.target.getAttribute("data-rename");
      const deleteId = event.target.getAttribute("data-delete");
      const list = AQRP.storage.getCategories();
      if (renameId) {
        const current = list.find(function (c) { return c.id === renameId; });
        inputModal("Rename category", "Category name", current.name, function (name) { current.name = name; AQRP.storage.saveCategories(list); renderCategories(); });
      }
      if (deleteId) {
        const used = AQRP.storage.getTickets().some(function (t) { return t.categoryId === deleteId; });
        if (used) { AQRP.ui.showToast("This category is used by tickets and cannot be deleted.", "error"); return; }
        AQRP.ui.confirmModal("Delete category", "Do you really want to delete this category?", "Delete", function () {
          AQRP.storage.saveCategories(list.filter(function (c) { return c.id !== deleteId; }));
          AQRP.ui.showToast("Category deleted.", "success");
          renderCategories();
        });
      }
    });
    $("add-cat").addEventListener("click", function () {
      const name = $("new-cat").value.trim();
      if (name.length < 3) { AQRP.ui.showToast("Enter a category name (at least 3 characters).", "error"); return; }
      const list = AQRP.storage.getCategories();
      list.push({ id: AQRP.storage.makeId("c"), name: name, departmentId: $("new-cat-dept").value });
      AQRP.storage.saveCategories(list);
      AQRP.ui.showToast("Category added.", "success");
      renderCategories();
    });
  }

  // Show the manage departments page with SLA hours (admin).
  function renderDepartments() {
    const sla = AQRP.storage.getSettings().sla;
    const rows = AQRP.storage.getDepartments().map(function (d) {
      return '<tr><td data-label="Department">' + esc(d.name) + '</td><td><button class="btn btn-secondary btn-sm" data-rename="' + esc(d.id) + '">Rename</button></td></tr>';
    }).join("");
    const slaFields = AQRP.tickets.PRIORITIES.map(function (p) { return '<div class="field"><label for="sla-' + p + '">' + p + ' (hours)</label><input id="sla-' + p + '" type="number" min="1" max="1000" value="' + sla[p] + '"></div>'; }).join("");
    $("view").innerHTML = AQRP.ui.breadcrumb([{ label: "Dashboard", href: "#/dashboard" }, { label: "Departments" }]) + '<div class="page-head"><h1>Departments</h1></div><section class="card"><div class="table-wrap"><table class="responsive"><thead><tr><th>Department</th><th>Actions</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="filters" style="margin-top:16px"><input id="new-dept" maxlength="60" placeholder="New department name" aria-label="New department name"><button class="btn btn-primary" id="add-dept">Add department</button></div><p class="hint">A new department has no staff user yet, so its tickets have no assigned staff.</p></section>' +
      '<section class="card"><h3>SLA hours by priority</h3><div class="form-grid">' + slaFields + '</div><button class="btn btn-primary" id="save-sla">Save</button></section>';
    $("view").querySelector("tbody").addEventListener("click", function (event) {
      const id = event.target.getAttribute("data-rename");
      if (!id) { return; }
      const list = AQRP.storage.getDepartments();
      const current = list.find(function (d) { return d.id === id; });
      inputModal("Rename department", "Department name", current.name, function (name) { current.name = name; AQRP.storage.saveDepartments(list); renderDepartments(); });
    });
    $("add-dept").addEventListener("click", function () {
      const name = $("new-dept").value.trim();
      if (name.length < 3) { AQRP.ui.showToast("Enter a department name (at least 3 characters).", "error"); return; }
      const list = AQRP.storage.getDepartments();
      list.push({ id: AQRP.storage.makeId("d"), name: name });
      AQRP.storage.saveDepartments(list);
      AQRP.ui.showToast("Department added.", "success");
      renderDepartments();
    });
    $("save-sla").addEventListener("click", function () {
      const newSla = {};
      let valid = true;
      AQRP.tickets.PRIORITIES.forEach(function (p) {
        const hours = Number($("sla-" + p).value);
        if (!Number.isInteger(hours) || hours < 1) { valid = false; }
        newSla[p] = hours;
      });
      if (!valid) { AQRP.ui.showToast("SLA hours must be whole numbers of 1 or more.", "error"); return; }
      AQRP.storage.saveSettings({ sla: newSla });
      AQRP.ui.showToast("SLA settings saved.", "success");
    });
  }

  // Show the read-only users list (admin).
  function renderUsers() {
    const rows = AQRP.storage.getUsers().map(function (u) {
      return '<tr><td data-label="Name">' + esc(u.name) + '</td><td data-label="Email">' + esc(u.email) + '</td><td data-label="Role">' + esc(AQRP.auth.roleName(u.role)) + '</td><td data-label="Department">' + esc(u.departmentId ? AQRP.tickets.getDepartmentName(u.departmentId) : "-") + '</td><td data-label="Reg. no.">' + esc(u.registrationNumber || "-") + "</td></tr>";
    }).join("");
    $("view").innerHTML = AQRP.ui.breadcrumb([{ label: "Dashboard", href: "#/dashboard" }, { label: "Users" }]) + '<div class="page-head"><h1>Users</h1></div><section class="card"><div class="table-wrap"><table class="responsive"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Reg. no.</th></tr></thead><tbody>' + rows + "</tbody></table></div></section>";
  }

  // Attach events that exist once for the whole app (top bar, menus, sidebar).
  function bindShell() {
    $("hamburger").addEventListener("click", function () { $("sidebar").classList.add("open"); $("overlay").classList.add("show"); });
    $("overlay").addEventListener("click", closeMenus);
    $("collapse-btn").addEventListener("click", function () { $("sidebar").classList.toggle("collapsed"); });
    $("sidebar-nav").addEventListener("click", closeMenus);
    $("theme-btn").addEventListener("click", function () {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      AQRP.storage.saveTheme(next);
      if (parseRoute().key === "dashboard") { route(); } else if (AQRP.auth.isLoggedIn()) { renderShell(AQRP.auth.getCurrentUser()); }
    });
    $("track-form").addEventListener("submit", function (event) {
      event.preventDefault();
      const id = $("track-input").value.trim().toUpperCase();
      if (id) { window.location.hash = "#/track/" + encodeURIComponent(id); $("track-input").value = ""; }
    });
    $("bell-btn").addEventListener("click", function (event) {
      event.stopPropagation();
      const wasHidden = $("bell-menu").hidden;
      closeMenus();
      if (wasHidden) { renderBellMenu(AQRP.auth.getCurrentUser()); $("bell-menu").hidden = false; $("bell-btn").setAttribute("aria-expanded", "true"); }
    });
    $("user-btn").addEventListener("click", function (event) {
      event.stopPropagation();
      const wasHidden = $("user-menu").hidden;
      closeMenus();
      if (wasHidden) { $("user-menu").hidden = false; $("user-btn").setAttribute("aria-expanded", "true"); }
    });
    $("bell-menu").addEventListener("click", function (event) {
      const user = AQRP.auth.getCurrentUser();
      const item = event.target.closest("[data-notif-id]");
      if (item) { AQRP.notifications.markRead(item.getAttribute("data-notif-id")); window.location.hash = "#/ticket/" + item.getAttribute("data-ticket-id"); }
      if (event.target.getAttribute("data-action") === "mark-all") { AQRP.notifications.markAllRead(user.id); renderBellMenu(user); }
      updateBell(user);
    });
    $("user-menu").addEventListener("click", function (event) {
      const action = event.target.getAttribute("data-action");
      closeMenus();
      if (action === "logout") { AQRP.auth.logout(); window.location.hash = "#/login"; route(); }
      if (action === "reset") { askReset(); }
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".dropdown")) { closeMenus(); }
      const notif = event.target.closest("#notif-page [data-notif-id]");
      if (notif) { AQRP.notifications.markRead(notif.getAttribute("data-notif-id")); window.location.hash = "#/ticket/" + notif.getAttribute("data-ticket-id"); }
    });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") { closeMenus(); } });
  }

  // Start the app: seed data, bind events, route and start the timers.
  function init() {
    AQRP.storage.seedIfNeeded();
    AQRP.tickets.checkSLA();
    bindShell();
    const user = AQRP.auth.getCurrentUser();
    if (user) { AQRP.notifications.startToastTracking(user.id); }
    window.addEventListener("hashchange", function () { activeTab = "conversation"; route(); });
    route();
    setInterval(function () {
      const changed = AQRP.tickets.checkSLA();
      refreshNotifications();
      const key = parseRoute().key;
      if (changed > 0 && (key === "dashboard" || key === "tickets")) { route(); }
    }, 60000);
    setInterval(refreshNotifications, 10000);
  }

  return { init: init, route: route };
})();

AQRP.app.init();
