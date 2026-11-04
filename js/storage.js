// storage.js - localStorage read/write, seed data and reset for the portal.
window.AQRP = window.AQRP || {};

AQRP.storage = (function () {
  const KEYS = {
    users: "aqrp_users",
    departments: "aqrp_departments",
    categories: "aqrp_categories",
    tickets: "aqrp_tickets",
    notifications: "aqrp_notifications",
    settings: "aqrp_settings",
    session: "aqrp_session",
    theme: "aqrp_theme",
    counter: "aqrp_counter"
  };
  const HOUR = 60 * 60 * 1000;
  const ACTIVE_STATUSES = ["Assigned", "In Progress", "Awaiting Student", "Reopened"];

  // Show an error toast when the UI is ready; otherwise do nothing.
  function notifyError(message) {
    if (AQRP.ui && AQRP.ui.showToast) {
      AQRP.ui.showToast(message, "error");
    }
  }

  // Read one key from localStorage and parse the JSON, or return the fallback.
  function readKey(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  // Convert a value to JSON and save it; returns true when the save worked.
  function writeKey(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      notifyError("Storage is full. Remove attachments or reset demo data.");
      return false;
    }
  }

  // Remove one key from localStorage without crashing.
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      notifyError("Could not clear saved data.");
    }
  }

  // Make a short unique id with a prefix, for comments, history and notifications.
  function makeId(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Get all users.
  function getUsers() { return readKey(KEYS.users, []); }
  // Save all users.
  function saveUsers(list) { return writeKey(KEYS.users, list); }
  // Get all departments.
  function getDepartments() { return readKey(KEYS.departments, []); }
  // Save all departments.
  function saveDepartments(list) { return writeKey(KEYS.departments, list); }
  // Get all categories.
  function getCategories() { return readKey(KEYS.categories, []); }
  // Save all categories.
  function saveCategories(list) { return writeKey(KEYS.categories, list); }
  // Get all tickets.
  function getTickets() { return readKey(KEYS.tickets, []); }
  // Save all tickets.
  function saveTickets(list) { return writeKey(KEYS.tickets, list); }
  // Get all notifications.
  function getNotifications() { return readKey(KEYS.notifications, []); }
  // Save all notifications.
  function saveNotifications(list) { return writeKey(KEYS.notifications, list); }
  // Get settings (SLA hours per priority).
  function getSettings() { return readKey(KEYS.settings, { sla: { Urgent: 24, High: 48, Medium: 72, Low: 120 } }); }
  // Save settings.
  function saveSettings(settings) { return writeKey(KEYS.settings, settings); }
  // Get the saved login session, or null.
  function getSession() { return readKey(KEYS.session, null); }
  // Save the login session.
  function saveSession(session) { return writeKey(KEYS.session, session); }
  // Remove the login session (logout).
  function clearSession() { removeKey(KEYS.session); }
  // Get the saved theme name.
  function getTheme() { return readKey(KEYS.theme, "light"); }
  // Save the theme name.
  function saveTheme(theme) { return writeKey(KEYS.theme, theme); }
  // Get the last used ticket number.
  function getCounter() { return readKey(KEYS.counter, 0); }

  // Increase the ticket counter by 1, save it, and return the new number.
  function nextCounter() {
    const next = getCounter() + 1;
    writeKey(KEYS.counter, next);
    return next;
  }

  // Find one user by id.
  function getUserById(userId) {
    return getUsers().find(function (user) { return user.id === userId; }) || null;
  }

  // Find one ticket by its ID such as AQ-2026-0001.
  function getTicketById(ticketId) {
    return getTickets().find(function (ticket) { return ticket.id === ticketId; }) || null;
  }

  // Replace a ticket in the saved list (or add it) and save everything.
  function saveTicket(ticket) {
    const tickets = getTickets();
    let found = false;
    for (let i = 0; i < tickets.length; i++) {
      if (tickets[i].id === ticket.id) {
        tickets[i] = ticket;
        found = true;
      }
    }
    if (!found) {
      tickets.push(ticket);
    }
    return saveTickets(tickets);
  }

  // Find the staff user who works in a given department.
  function findStaffByDepartment(departmentId) {
    return getUsers().find(function (user) {
      return user.role === "staff" && user.departmentId === departmentId;
    }) || null;
  }

  // Build the list of seed users (3 students, 6 staff, 1 admin).
  function buildSeedUsers() {
    const rows = [
      ["u1", "Aarav Sharma", "aarav@student.demo", "student123", "student", "", "12512345"],
      ["u2", "Simran Kaur", "simran@student.demo", "student123", "student", "", "12512346"],
      ["u3", "Rohan Verma", "rohan@student.demo", "student123", "student", "", "12512347"],
      ["s1", "Dr. Meera Nair", "exam@staff.demo", "staff123", "staff", "d1", ""],
      ["s2", "Mr. Harpreet Singh", "accounts@staff.demo", "staff123", "staff", "d2", ""],
      ["s3", "Ms. Kavita Joshi", "hostel@staff.demo", "staff123", "staff", "d3", ""],
      ["s4", "Dr. Anil Kapoor", "academic@staff.demo", "staff123", "staff", "d4", ""],
      ["s5", "Mr. Sandeep Gill", "registrar@staff.demo", "staff123", "staff", "d5", ""],
      ["s6", "Mr. Vikas Arora", "it@staff.demo", "staff123", "staff", "d6", ""],
      ["a1", "Prof. Neha Malhotra", "admin@portal.demo", "admin123", "admin", "", ""]
    ];
    return rows.map(function (row) {
      return { id: row[0], name: row[1], email: row[2], password: row[3], role: row[4], departmentId: row[5], registrationNumber: row[6] };
    });
  }

  // Build the 6 seed departments.
  function buildSeedDepartments() {
    const names = ["Examination Cell", "Accounts & Fees", "Hostel Office", "Academic Affairs", "Registrar Office", "IT Support"];
    return names.map(function (name, index) {
      return { id: "d" + (index + 1), name: name };
    });
  }

  // Build the 12 seed categories with their department mapping.
  function buildSeedCategories() {
    const rows = [
      ["Exam Schedule or Datesheet", "d1"], ["Marks or Result Discrepancy", "d1"], ["Re-evaluation Request", "d1"],
      ["Fee Payment Issue", "d2"], ["Scholarship or Refund", "d2"], ["Hostel Allotment or Complaint", "d3"],
      ["Attendance Correction", "d4"], ["Timetable or Section Change", "d4"], ["Course Registration", "d4"],
      ["Certificates or Transcripts", "d5"], ["ID Card or Documents", "d5"], ["Portal or Login Problem", "d6"]
    ];
    return rows.map(function (row, index) {
      return { id: "c" + (index + 1), name: row[0], departmentId: row[1] };
    });
  }

  // Return the 16 ticket blueprints (c = category index, u = student index, h = hours ago created).
  function getTicketSpecs() {
    return [
      { title: "Fee paid twice but portal shows pending", desc: "I paid the semester fee twice through net banking and the portal still shows one payment as pending. Please check and refund the extra amount.", c: 3, p: "Medium", u: 0, h: 230,
        path: [["In Progress", 3], ["Resolved", 30], ["Closed", 50]], note: "Duplicate payment found and refund initiated to the original account.",
        cm: [["f", "We found the duplicate payment. Refund has been started.", false, 28]] },
      { title: "Bonafide certificate needed for bank loan", desc: "I need a bonafide certificate with the current semester details for an education loan application. Kindly issue it at the earliest.", c: 9, p: "Low", u: 1, h: 215,
        path: [["In Progress", 4], ["Resolved", 60], ["Closed", 80]], note: "Certificate issued and handed over at the Registrar counter.", cm: [] },
      { title: "Internal marks missing in CSE310 result", desc: "My internal marks for CSE310 are not visible in the published result, although the faculty confirmed uploading them in November.", c: 1, p: "High", u: 2, h: 200,
        path: [["In Progress", 5], ["Resolved", 40]], note: "Marks were not synced from the faculty portal. Corrected in the system.",
        cm: [["f", "Please share a screenshot of the internal marks sheet.", false, 6], ["s", "I have attached the details from the faculty portal.", false, 8],
             ["f", "Faculty upload failed on sync. Fixing it with the data team.", true, 20]] },
      { title: "Cannot log in to UMS after password reset", desc: "After resetting my UMS password I get an invalid credentials message every time. I cannot see my attendance or fee details at all.", c: 11, p: "Medium", u: 0, h: 180,
        path: [["In Progress", 1], ["Resolved", 10]], note: "Account was locked after too many attempts. Unlocked and new password set.", cm: [] },
      { title: "Room change request due to noisy block", desc: "My hostel room is next to the generator and I cannot study at night. I request a room change to a quieter block as soon as possible.", c: 5, p: "Low", u: 1, h: 160,
        path: [["In Progress", 6], ["Resolved", 48]], note: "Room changed to Block C, Room 214. Please collect the new key.", cm: [] },
      { title: "Re-evaluation result not updated for 3 weeks", desc: "I applied for re-evaluation of CSE302 three weeks ago and the result is still not updated. The portal only shows the status as under process.", c: 2, p: "High", u: 2, h: 150,
        path: [["In Progress", 4], ["Escalated", 40, "manual"]], reason: "No update from the department even after the deadline.", note: "",
        cm: [["f", "Your answer sheet is with the external examiner.", false, 10], ["f", "Verified with the faculty. Revaluation is still pending at the examiner.", true, 12]] },
      { title: "Attendance not updated for medical leave days", desc: "I was on approved medical leave for six days and the attendance is still marked absent. The medical certificate was submitted to my mentor.", c: 6, p: "Urgent", u: 0, h: 130,
        path: [["In Progress", 2], ["Escalated", 24, "auto"]], note: "",
        cm: [["f", "Medical certificate verified. Waiting for approval from the Dean.", true, 5]] },
      { title: "Course registration closed before adding elective", desc: "The registration window closed before I could add my elective course. The portal showed a server error during the last day of registration.", c: 8, p: "Medium", u: 1, h: 110,
        path: [["In Progress", 3], ["Resolved", 20], ["Reopened", 60]], note: "Elective added to your registration manually.", reason: "The elective is still not visible in my timetable.",
        cm: [["s", "The course is not visible in my timetable yet.", false, 61]] },
      { title: "Scholarship refund pending since last semester", desc: "My merit scholarship refund for last semester has not been credited. The Accounts office told me to raise a ticket with the sanction letter.", c: 4, p: "High", u: 2, h: 90,
        path: [["In Progress", 5]], note: "",
        cm: [["f", "Finance says the file is with the Registrar for signature.", true, 20]] },
      { title: "ID card lost, need a duplicate card", desc: "I lost my university ID card last week and need a duplicate for hostel and library entry. Please tell me the documents required.", c: 10, p: "Medium", u: 0, h: 60,
        path: [["In Progress", 2], ["Awaiting Student", 8]], note: "",
        cm: [["f", "Please upload an affidavit or FIR copy for the lost ID card.", false, 8]] },
      { title: "Request to shift to Section K12AB", desc: "I want to move to Section K12AB because my current section clashes with a lab class I have to repeat. My mentor has agreed to the change.", c: 7, p: "Low", u: 1, h: 40,
        path: [["In Progress", 3], ["Awaiting Student", 12]], note: "",
        cm: [["f", "Please confirm the mentor approval by attaching the mail.", false, 12]] },
      { title: "Datesheet clash for two papers on 12 December", desc: "The final datesheet shows two of my papers on 12 December at the same time slot. I need a revised slot for one of them.", c: 0, p: "Medium", u: 2, h: 30,
        path: [["In Progress", 2]], note: "", cm: [["f", "We are checking with the datesheet committee.", false, 3]] },
      { title: "Unable to upload assignment on the portal", desc: "The assignment upload button gives a blank page and the deadline is tomorrow. I tried two browsers and both show the same problem.", c: 11, p: "Urgent", u: 1, h: 20,
        path: [["In Progress", 1]], note: "", cm: [["f", "Looking into the upload service now.", false, 2]] },
      { title: "Water leakage in hostel room ceiling", desc: "Water is leaking from the ceiling of my hostel room whenever it rains and my books are getting wet. Please send maintenance quickly.", c: 5, p: "High", u: 0, h: 12,
        path: [["In Progress", 1]], note: "", cm: [] },
      { title: "Late fee fine charged wrongly", desc: "A late fee fine was added to my account even though I paid before the due date. I have the payment receipt to show the date.", c: 3, p: "Low", u: 2, h: 6,
        path: [], note: "", cm: [] },
      { title: "Lab marks showing zero for CSE325", desc: "My CSE325 lab marks are showing zero in the result sheet, but the lab faculty gave me full marks in the final practical exam.", c: 1, p: "Urgent", u: 0, h: 2,
        path: [], note: "", cm: [] }
    ];
  }

  // Turn a role name into the label stored in history and comments.
  function roleLabel(role) {
    if (role === "student") { return "Student"; }
    if (role === "staff") { return "Staff"; }
    if (role === "admin") { return "Admin"; }
    return "System";
  }

  // Build one full ticket (with comments and history) from a blueprint.
  function buildOneTicket(spec, index, ctx) {
    const created = ctx.now - spec.h * HOUR;
    const slaHours = ctx.settings.sla[spec.p];
    const category = ctx.categories[spec.c];
    const student = ctx.students[spec.u];
    const staff = findStaffIn(ctx.users, category.departmentId);
    const deptName = ctx.departments.find(function (d) { return d.id === category.departmentId; }).name;
    const system = { id: "system", name: "System", role: "system" };
    const id = "AQ-" + ctx.year + "-" + String(index + 1).padStart(4, "0");
    const history = [];
    const comments = [];
    let status = "Assigned";
    let resolvedAt = null;
    let resolutionNote = "";
    let escalationType = "";
    let escalationReason = "";
    let slaStart = created;

    // Add one entry to the history list of this ticket.
    function addHistory(action, actor, oldValue, newValue, note, time) {
      history.push({ id: makeId("h"), action: action, actorId: actor.id, actorName: actor.name, actorRole: roleLabel(actor.role),
        oldValue: oldValue, newValue: newValue, note: note, timestamp: time });
    }

    addHistory("Ticket created", student, "", "Open", "", created);
    addHistory("Auto-assigned", system, "Open", "Assigned", "Routed to " + deptName, created + 60000);

    spec.path.forEach(function (step) {
      const newStatus = step[0];
      const when = created + step[1] * HOUR;
      const isAuto = step[2] === "auto";
      let actor = staff;
      let action = "Status changed";
      let note = "";
      if (newStatus === "Closed" || newStatus === "Reopened") { actor = student; }
      if (newStatus === "Escalated") { actor = isAuto ? system : student; }
      if (newStatus === "Resolved") { action = "Resolved"; note = spec.note; resolvedAt = when; resolutionNote = spec.note; }
      if (newStatus === "Closed") { action = "Closed"; }
      if (newStatus === "Reopened") { action = "Reopened"; note = spec.reason; resolvedAt = null; slaStart = when; }
      if (newStatus === "Escalated") {
        action = isAuto ? "Escalated automatically" : "Escalated manually";
        note = isAuto ? "SLA breached" : spec.reason;
        escalationType = isAuto ? "automatic" : "manual";
        escalationReason = note;
      }
      addHistory(action, actor, status, newStatus, note, when);
      status = newStatus;
    });

    spec.cm.forEach(function (item) {
      const author = item[0] === "s" ? student : (item[0] === "f" ? staff : ctx.admin);
      const when = created + item[3] * HOUR;
      comments.push({ id: makeId("c"), authorId: author.id, authorRole: roleLabel(author.role), text: item[1], isInternal: item[2], createdAt: when });
      addHistory(item[2] ? "Internal note added" : "Comment added", author, "", "", "", when);
    });

    history.sort(function (a, b) { return a.timestamp - b.timestamp; });
    const slaDueAt = slaStart + slaHours * HOUR;
    const warnTime = slaStart + slaHours * HOUR * 0.8;
    const warned = status === "Escalated" || (ACTIVE_STATUSES.indexOf(status) !== -1 && ctx.now >= warnTime);

    return {
      id: id, title: spec.title, description: spec.desc, categoryId: category.id, departmentId: category.departmentId,
      priority: spec.p, status: status, studentId: student.id, registrationNumber: student.registrationNumber,
      assignedStaffId: staff.id, createdAt: created, updatedAt: history[history.length - 1].timestamp,
      resolvedAt: resolvedAt, slaDueAt: slaDueAt, attachments: [], comments: comments, history: history,
      escalated: status === "Escalated", escalationReason: escalationReason, escalationType: escalationType,
      resolutionNote: resolutionNote, slaWarned: warned
    };
  }

  // Find the staff user of one department inside a given user list.
  function findStaffIn(users, departmentId) {
    return users.find(function (user) { return user.role === "staff" && user.departmentId === departmentId; });
  }

  // Build all 16 seed tickets.
  function buildSeedTickets(users, departments, categories, settings) {
    const ctx = {
      now: Date.now(), year: new Date().getFullYear(), users: users, departments: departments, categories: categories, settings: settings,
      students: users.filter(function (u) { return u.role === "student"; }),
      admin: users.find(function (u) { return u.role === "admin"; })
    };
    return getTicketSpecs().map(function (spec, index) {
      return buildOneTicket(spec, index, ctx);
    });
  }

  // Build seed notifications so every demo user has some.
  function buildSeedNotifications(users, tickets) {
    const now = Date.now();
    const admin = users.find(function (u) { return u.role === "admin"; });
    const list = [];

    // Add one notification to the list.
    function add(userId, ticket, type, message, time) {
      list.push({ id: makeId("n"), userId: userId, ticketId: ticket.id, type: type, message: message, isRead: now - time > 48 * HOUR, createdAt: time });
    }

    tickets.forEach(function (ticket) {
      add(ticket.studentId, ticket, "Status changed", "Your ticket " + ticket.id + " is now " + ticket.status + ".", ticket.updatedAt);
      add(ticket.assignedStaffId, ticket, "Ticket created", "New ticket " + ticket.id + ": " + ticket.title, ticket.createdAt + 60000);
      if (ticket.status === "Escalated") {
        add(admin.id, ticket, "Escalated", "Ticket " + ticket.id + " was escalated (" + ticket.escalationType + ").", ticket.updatedAt);
      } else if (ticket.slaWarned && ACTIVE_STATUSES.indexOf(ticket.status) !== -1) {
        add(admin.id, ticket, "SLA warning", "Ticket " + ticket.id + " has used 80% of its SLA time.", ticket.updatedAt);
      }
    });
    list.sort(function (a, b) { return b.createdAt - a.createdAt; });
    return list;
  }

  // Create all seed data and save it to localStorage.
  function seedAll() {
    const users = buildSeedUsers();
    const departments = buildSeedDepartments();
    const categories = buildSeedCategories();
    const settings = { sla: { Urgent: 24, High: 48, Medium: 72, Low: 120 } };
    const tickets = buildSeedTickets(users, departments, categories, settings);
    saveUsers(users);
    saveDepartments(departments);
    saveCategories(categories);
    saveSettings(settings);
    saveTickets(tickets);
    writeKey(KEYS.counter, tickets.length);
    saveNotifications(buildSeedNotifications(users, tickets));
  }

  // Seed the demo data only when it does not exist yet (first load).
  function seedIfNeeded() {
    let exists = true;
    try {
      exists = localStorage.getItem(KEYS.users) !== null;
    } catch (error) {
      exists = true;
    }
    if (!exists) {
      seedAll();
    }
  }

  // Remove every key that starts with aqrp_ and seed the demo data again.
  function resetAll() {
    const toRemove = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.indexOf("aqrp_") === 0) {
          toRemove.push(key);
        }
      }
    } catch (error) {
      return;
    }
    toRemove.forEach(removeKey);
    seedAll();
  }

  return {
    KEYS: KEYS, HOUR: HOUR, readKey: readKey, writeKey: writeKey, makeId: makeId,
    getUsers: getUsers, saveUsers: saveUsers, getDepartments: getDepartments, saveDepartments: saveDepartments,
    getCategories: getCategories, saveCategories: saveCategories, getTickets: getTickets, saveTickets: saveTickets,
    getNotifications: getNotifications, saveNotifications: saveNotifications, getSettings: getSettings, saveSettings: saveSettings,
    getSession: getSession, saveSession: saveSession, clearSession: clearSession, getTheme: getTheme, saveTheme: saveTheme,
    getCounter: getCounter, nextCounter: nextCounter, getUserById: getUserById, getTicketById: getTicketById,
    saveTicket: saveTicket, findStaffByDepartment: findStaffByDepartment, seedIfNeeded: seedIfNeeded, resetAll: resetAll
  };
})();
