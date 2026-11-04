// dashboard.js - statistics, SVG charts, ticket table (filters, sorting, pagination) and CSV export.
window.AQRP = window.AQRP || {};

AQRP.dashboard = (function () {
  const DAY = 24 * 60 * 60 * 1000;
  const PER_PAGE = 10;
  const STATUSES = ["Open", "Assigned", "In Progress", "Awaiting Student", "Escalated", "Reopened", "Resolved", "Closed"];
  const STATUS_COLORS = {
    "Open": "#3B82F6", "Assigned": "#6366F1", "In Progress": "#F59E0B", "Awaiting Student": "#A855F7",
    "Resolved": "#10B981", "Closed": "#64748B", "Escalated": "#EF4444", "Reopened": "#F97316"
  };
  const PRIORITY_RANK = { Low: 1, Medium: 2, High: 3, Urgent: 4 };
  let state = newState();

  // Create a fresh table state (filters, sort and page).
  function newState() {
    return { search: "", status: "", category: "", department: "", priority: "", from: "", to: "", sortKey: "", sortDir: "asc", page: 1 };
  }

  // Count how many tickets have each value returned by keyFn; returns { value: count }.
  function countBy(tickets, keyFn) {
    const counts = {};
    tickets.forEach(function (ticket) {
      const key = keyFn(ticket);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }

  // Calculate the average resolution time in hours (resolvedAt minus createdAt).
  function averageResolutionHours(tickets) {
    const resolved = tickets.filter(function (t) { return t.resolvedAt; });
    if (resolved.length === 0) { return 0; }
    const totalMs = resolved.reduce(function (sum, t) { return sum + (t.resolvedAt - t.createdAt); }, 0);
    return totalMs / resolved.length / (60 * 60 * 1000);
  }

  // Count tickets that have one of the given statuses.
  function countStatus(tickets, statuses) {
    return tickets.filter(function (t) { return statuses.indexOf(t.status) !== -1; }).length;
  }

  // Build a row of summary cards from [{ label, value }].
  function cardsHTML(items) {
    return '<div class="cards-grid">' + items.map(function (item) {
      return '<div class="stat-card"><div class="stat-value">' + AQRP.ui.escapeHTML(item.value) + '</div><div class="stat-label">' + AQRP.ui.escapeHTML(item.label) + "</div></div>";
    }).join("") + "</div>";
  }

  // Build a short list of tickets (used for recent tickets, queue and needs attention).
  function ticketListHTML(tickets, emptyMessage) {
    const ui = AQRP.ui;
    if (tickets.length === 0) {
      return ui.emptyState("tickets", "Nothing here", emptyMessage, "", "");
    }
    return '<div class="table-wrap"><table class="responsive"><tbody>' + tickets.map(function (t) {
      return '<tr class="' + (t.status === "Escalated" ? "escalated" : "") + '" data-ticket-id="' + ui.escapeHTML(t.id) + '">' +
        '<td data-label="Ticket"><a href="#/ticket/' + ui.escapeHTML(t.id) + '">' + ui.escapeHTML(t.id) + "</a></td>" +
        '<td data-label="Title">' + ui.escapeHTML(t.title) + "</td>" +
        '<td data-label="Status">' + ui.statusBadge(t.status) + "</td>" +
        '<td data-label="SLA">' + ui.slaBadge(t, false) + '</td>' +
        '<td><a class="btn btn-secondary btn-sm" href="#/ticket/' + ui.escapeHTML(t.id) + '">Open</a></td></tr>';
    }).join("") + "</tbody></table></div>";
  }

  // Sort tickets for the staff queue: Escalated first, then earliest SLA due time.
  function queueSort(list) {
    return list.slice().sort(function (a, b) {
      const aEsc = a.status === "Escalated" ? 0 : 1;
      const bEsc = b.status === "Escalated" ? 0 : 1;
      if (aEsc !== bEsc) { return aEsc - bEsc; }
      return a.slaDueAt - b.slaDueAt;
    });
  }

  // Build the student dashboard page body.
  function studentHTML(user) {
    const mine = AQRP.tickets.getTicketsForUser(user);
    const recent = mine.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 5);
    return '<div class="page-head"><h1>Welcome, ' + AQRP.ui.escapeHTML(user.name) + '</h1><a class="btn btn-primary" href="#/tickets/new">Raise new query</a></div>' +
      cardsHTML([
        { label: "My total tickets", value: mine.length }, { label: "Open and Assigned", value: countStatus(mine, ["Open", "Assigned"]) },
        { label: "In Progress", value: countStatus(mine, ["In Progress"]) }, { label: "Awaiting my reply", value: countStatus(mine, ["Awaiting Student"]) },
        { label: "Resolved", value: countStatus(mine, ["Resolved"]) }, { label: "Closed", value: countStatus(mine, ["Closed"]) }
      ]) +
      '<section class="card"><div class="card-title"><h2>Recent tickets</h2><a href="#/tickets">View all</a></div>' + ticketListHTML(recent, "You have not raised any query yet.") + "</section>";
  }

  // Build the staff dashboard page body for their department.
  function staffHTML(user) {
    const dept = AQRP.tickets.getTicketsForUser(user);
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const resolvedToday = dept.filter(function (t) { return t.resolvedAt && t.resolvedAt >= startOfToday; }).length;
    const active = queueSort(dept.filter(function (t) { return t.status !== "Resolved" && t.status !== "Closed"; })).slice(0, 8);
    return '<div class="page-head"><h1>' + AQRP.ui.escapeHTML(AQRP.tickets.getDepartmentName(user.departmentId)) + "</h1></div>" +
      cardsHTML([
        { label: "Assigned to my department", value: countStatus(dept, ["Assigned"]) }, { label: "In Progress", value: countStatus(dept, ["In Progress"]) },
        { label: "Awaiting Student", value: countStatus(dept, ["Awaiting Student"]) }, { label: "Escalated", value: countStatus(dept, ["Escalated"]) },
        { label: "Overdue", value: dept.filter(AQRP.tickets.isOverdue).length }, { label: "Resolved today", value: resolvedToday }
      ]) +
      '<section class="card"><div class="card-title"><h2>Department queue</h2><a href="#/tickets">Open full queue</a></div>' + ticketListHTML(active, "No active tickets in your queue.") + "</section>";
  }

  // Build the "Needs attention" list: Escalated first, then the most overdue, up to 5.
  function needsAttentionHTML(tickets) {
    const flagged = tickets.filter(function (t) { return t.status === "Escalated" || AQRP.tickets.isOverdue(t); });
    const sorted = queueSort(flagged).slice(0, 5);
    return '<section class="card"><div class="card-title"><h2>Needs attention</h2></div>' + ticketListHTML(sorted, "No escalated or overdue tickets. Great work!") + "</section>";
  }

  // Build the admin dashboard page body with cards, charts and the attention list.
  function adminHTML() {
    const all = AQRP.storage.getTickets();
    const avg = averageResolutionHours(all).toFixed(1) + " h";
    return '<div class="page-head"><h1>Admin dashboard</h1><a class="btn btn-secondary" href="#/tickets">All tickets</a></div>' +
      cardsHTML([
        { label: "Total tickets", value: all.length }, { label: "Open and Assigned", value: countStatus(all, ["Open", "Assigned"]) },
        { label: "In Progress", value: countStatus(all, ["In Progress"]) }, { label: "Awaiting Student", value: countStatus(all, ["Awaiting Student"]) },
        { label: "Resolved", value: countStatus(all, ["Resolved"]) }, { label: "Closed", value: countStatus(all, ["Closed"]) },
        { label: "Escalated", value: countStatus(all, ["Escalated"]) }, { label: "Overdue", value: all.filter(AQRP.tickets.isOverdue).length },
        { label: "Avg resolution time", value: avg }
      ]) + chartsHTML(all) + needsAttentionHTML(all);
  }

  // Cut a long label to fit inside a chart.
  function shorten(text, max) {
    return text.length > max ? text.slice(0, max - 1) + "..." : text;
  }

  // Draw a horizontal bar chart as SVG; data is [{ label, value }].
  function barChartHTML(title, data, xLabel, yLabel) {
    const safe = AQRP.ui.escapeHTML;
    const rowHeight = 26;
    const left = 180;
    const width = 560;
    const plotWidth = width - left - 44;
    const height = 14 + data.length * rowHeight + 44;
    const max = Math.max(1, Math.max.apply(null, data.map(function (d) { return d.value; })));
    let svg = '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="' + safe(title) + '">';
    data.forEach(function (item, index) {
      const y = 10 + index * rowHeight;
      const barWidth = (item.value / max) * plotWidth;
      svg += '<text x="' + (left - 8) + '" y="' + (y + 15) + '" text-anchor="end">' + safe(shorten(item.label, 26)) + "</text>";
      svg += '<rect x="' + left + '" y="' + (y + 2) + '" width="' + barWidth + '" height="' + (rowHeight - 8) + '" rx="4" style="fill:var(--primary)"><title>' + safe(item.label) + ": " + item.value + " tickets</title></rect>";
      svg += '<text x="' + (left + barWidth + 6) + '" y="' + (y + 15) + '">' + item.value + "</text>";
    });
    const axisY = 10 + data.length * rowHeight + 4;
    svg += '<line x1="' + left + '" y1="10" x2="' + left + '" y2="' + axisY + '" style="stroke:var(--border)"/>';
    svg += '<line x1="' + left + '" y1="' + axisY + '" x2="' + (width - 20) + '" y2="' + axisY + '" style="stroke:var(--border)"/>';
    svg += '<text x="' + (left + plotWidth / 2) + '" y="' + (axisY + 28) + '" text-anchor="middle">' + safe(xLabel) + "</text>";
    svg += '<text x="12" y="' + (axisY / 2) + '" text-anchor="middle" transform="rotate(-90 12 ' + (axisY / 2) + ')">' + safe(yLabel) + "</text></svg>";
    return '<div class="chart-box"><h3>' + safe(title) + "</h3>" + svg + "</div>";
  }

  // Draw a donut chart of tickets by status, with a legend.
  function donutChartHTML(title, counts) {
    const safe = AQRP.ui.escapeHTML;
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const total = STATUSES.reduce(function (sum, s) { return sum + (counts[s] || 0); }, 0);
    let svg = '<svg viewBox="0 0 200 200" role="img" aria-label="' + safe(title) + '">';
    if (total === 0) {
      svg += '<circle cx="100" cy="100" r="' + radius + '" fill="none" stroke-width="28" style="stroke:var(--border)"/>';
    }
    let offset = 0;
    STATUSES.forEach(function (status) {
      const value = counts[status] || 0;
      if (value === 0) { return; }
      const length = (value / total) * circumference;
      svg += '<circle cx="100" cy="100" r="' + radius + '" fill="none" stroke-width="28" stroke="' + STATUS_COLORS[status] + '" stroke-dasharray="' + length + " " + (circumference - length) +
        '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 100 100)"><title>' + safe(status) + ": " + value + " tickets</title></circle>";
      offset += length;
    });
    svg += '<text x="100" y="106" text-anchor="middle" style="font-size:22px;font-weight:600;fill:var(--text)">' + total + "</text></svg>";
    const legend = STATUSES.map(function (status) {
      return '<span><i style="background:' + STATUS_COLORS[status] + '"></i>' + safe(status) + " (" + (counts[status] || 0) + ")</span>";
    }).join("");
    const centeredSvg = svg.replace("<svg ", '<svg style="max-width:240px;display:block;margin:auto" ');
    return '<div class="chart-box"><h3>' + safe(title) + "</h3>" + centeredSvg + '<div class="legend">' + legend + "</div></div>";
  }

  // Draw a line chart of tickets created and resolved per day for the last 7 days.
  function lineChartHTML(title, tickets) {
    const safe = AQRP.ui.escapeHTML;
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 6; i >= 0; i--) { days.push(startOfToday - i * DAY); }
    const created = days.map(function (day) { return tickets.filter(function (t) { return t.createdAt >= day && t.createdAt < day + DAY; }).length; });
    const resolved = days.map(function (day) { return tickets.filter(function (t) { return t.resolvedAt && t.resolvedAt >= day && t.resolvedAt < day + DAY; }).length; });
    const maxValue = Math.max(4, Math.max.apply(null, created.concat(resolved)));
    const step = Math.ceil(maxValue / 4);
    const top = step * 4;
    const left = 44; const right = 520 - 16; const plotTop = 16; const plotBottom = 208;
    // Convert a day index and a value into x and y positions.
    function xOf(index) { return left + (index * (right - left)) / 6; }
    function yOf(value) { return plotBottom - (value / top) * (plotBottom - plotTop); }
    let svg = '<svg viewBox="0 0 520 260" role="img" aria-label="' + safe(title) + '">';
    for (let g = 0; g <= 4; g++) {
      const value = g * step;
      svg += '<line x1="' + left + '" y1="' + yOf(value) + '" x2="' + right + '" y2="' + yOf(value) + '" style="stroke:var(--border)"/><text x="' + (left - 8) + '" y="' + (yOf(value) + 4) + '" text-anchor="end">' + value + "</text>";
    }
    days.forEach(function (day, index) {
      const label = new Date(day).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      svg += '<text x="' + xOf(index) + '" y="' + (plotBottom + 18) + '" text-anchor="middle">' + label + "</text>";
    });
    const series = [{ name: "Created", color: "#6366F1", values: created }, { name: "Resolved", color: "#10B981", values: resolved }];
    series.forEach(function (line) {
      const points = line.values.map(function (v, i) { return xOf(i) + "," + yOf(v); }).join(" ");
      svg += '<polyline points="' + points + '" fill="none" stroke="' + line.color + '" stroke-width="2.5"/>';
      line.values.forEach(function (v, i) {
        svg += '<circle cx="' + xOf(i) + '" cy="' + yOf(v) + '" r="4" fill="' + line.color + '"><title>' + line.name + " on " + new Date(days[i]).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + ": " + v + "</title></circle>";
      });
    });
    svg += '<text x="' + ((left + right) / 2) + '" y="252" text-anchor="middle">Day (last 7 days)</text>';
    svg += '<text x="12" y="112" text-anchor="middle" transform="rotate(-90 12 112)">Tickets</text></svg>';
    const legend = '<div class="legend"><span><i style="background:#6366F1"></i>Created per day</span><span><i style="background:#10B981"></i>Resolved per day</span></div>';
    return '<div class="chart-box"><h3>' + safe(title) + "</h3>" + svg + legend + "</div>";
  }

  // Build the four admin charts.
  function chartsHTML(tickets) {
    const byCategory = countBy(tickets, function (t) { return t.categoryId; });
    const byDepartment = countBy(tickets, function (t) { return t.departmentId; });
    const categoryData = AQRP.storage.getCategories().map(function (c) { return { label: c.name, value: byCategory[c.id] || 0 }; });
    const departmentData = AQRP.storage.getDepartments().map(function (d) { return { label: d.name, value: byDepartment[d.id] || 0 }; });
    return '<div class="charts-grid">' +
      barChartHTML("Tickets by category", categoryData, "Number of tickets", "Category") +
      donutChartHTML("Tickets by status", countBy(tickets, function (t) { return t.status; })) +
      barChartHTML("Tickets by department", departmentData, "Number of tickets", "Department") +
      lineChartHTML("Tickets created and resolved per day", tickets) + "</div>";
  }

  // Build the filter controls (rendered once); also resets the table state.
  function tableShellHTML(user) {
    const safe = AQRP.ui.escapeHTML;
    state = newState();
    // Build the <option> tags for a select.
    function options(items, labelFn, valueFn, firstLabel) {
      return '<option value="">' + firstLabel + "</option>" + items.map(function (item) {
        return '<option value="' + safe(valueFn(item)) + '">' + safe(labelFn(item)) + "</option>";
      }).join("");
    }
    return '<div id="ticket-table"><div class="filters" role="search">' +
      '<input type="search" data-filter="search" placeholder="Search ID, title or student" aria-label="Search tickets">' +
      '<select data-filter="status" aria-label="Filter by status">' + options(STATUSES, String, String, "All statuses") + "</select>" +
      '<select data-filter="category" aria-label="Filter by category">' + options(AQRP.storage.getCategories(), function (c) { return c.name; }, function (c) { return c.id; }, "All categories") + "</select>" +
      '<select data-filter="department" aria-label="Filter by department">' + options(AQRP.storage.getDepartments(), function (d) { return d.name; }, function (d) { return d.id; }, "All departments") + "</select>" +
      '<select data-filter="priority" aria-label="Filter by priority">' + options(AQRP.tickets.PRIORITIES, String, String, "All priorities") + "</select>" +
      '<input type="date" data-filter="from" aria-label="Created from date"><input type="date" data-filter="to" aria-label="Created to date">' +
      '</div><div class="btn-row" style="margin-bottom:16px"><button type="button" class="btn btn-secondary btn-sm" data-action="clear-filters">Clear filters</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="export-csv">Export CSV</button></div><div id="table-results"></div></div>';
  }

  // Apply the search text and filters of the current state to a list of tickets.
  function filterTickets(list) {
    const search = state.search.trim().toLowerCase();
    const fromTime = state.from ? new Date(state.from + "T00:00:00").getTime() : null;
    const toTime = state.to ? new Date(state.to + "T23:59:59.999").getTime() : null;
    return list.filter(function (t) {
      if (search !== "") {
        const haystack = (t.id + " " + t.title + " " + AQRP.tickets.getUserName(t.studentId)).toLowerCase();
        if (haystack.indexOf(search) === -1) { return false; }
      }
      if (state.status && t.status !== state.status) { return false; }
      if (state.category && t.categoryId !== state.category) { return false; }
      if (state.department && t.departmentId !== state.department) { return false; }
      if (state.priority && t.priority !== state.priority) { return false; }
      if (fromTime !== null && t.createdAt < fromTime) { return false; }
      if (toTime !== null && t.createdAt > toTime) { return false; }
      return true;
    });
  }

  // Sort the tickets by the chosen column, or by the default order.
  function sortTickets(list, user) {
    if (state.sortKey === "") {
      return user.role === "staff" ? queueSort(list) : list.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    }
    const direction = state.sortDir === "asc" ? 1 : -1;
    return list.slice().sort(function (a, b) {
      let result = 0;
      if (state.sortKey === "id") { result = a.id.localeCompare(b.id); }
      if (state.sortKey === "priority") { result = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]; }
      if (state.sortKey === "status") { result = STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status); }
      if (state.sortKey === "created") { result = a.createdAt - b.createdAt; }
      return result * direction;
    });
  }

  // Get the tickets after filtering and sorting (all pages).
  function getVisibleTickets(user) {
    return sortTickets(filterTickets(AQRP.tickets.getTicketsForUser(user)), user);
  }

  // Build one sortable table header cell with an arrow.
  function headerCell(label, key) {
    let arrow = "";
    if (state.sortKey === key) { arrow = state.sortDir === "asc" ? " &#9650;" : " &#9660;"; }
    return '<th class="sortable" data-sort="' + key + '">' + label + arrow + "</th>";
  }

  // Draw the table rows and pagination into #table-results.
  function renderResults(user) {
    const ui = AQRP.ui;
    const holder = document.getElementById("table-results");
    if (!holder) { return; }
    const scope = AQRP.tickets.getTicketsForUser(user);
    const visible = getVisibleTickets(user);
    if (scope.length === 0) {
      holder.innerHTML = ui.emptyState("tickets", "No tickets yet", user.role === "student" ? "Raise your first academic query." : "No tickets to show.", user.role === "student" ? "Raise new query" : "", "#/tickets/new");
      return;
    }
    if (visible.length === 0) {
      holder.innerHTML = ui.emptyState("search", "No results", "No ticket matches your search. Try clearing the filters.", "", "");
      return;
    }
    const totalPages = Math.ceil(visible.length / PER_PAGE);
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const startIndex = (state.page - 1) * PER_PAGE;
    const rows = visible.slice(startIndex, startIndex + PER_PAGE).map(function (t) {
      return '<tr class="' + (t.status === "Escalated" ? "escalated" : "") + '" data-ticket-id="' + ui.escapeHTML(t.id) + '">' +
        '<td data-label="Ticket ID"><a href="#/ticket/' + ui.escapeHTML(t.id) + '">' + ui.escapeHTML(t.id) + "</a></td>" +
        '<td data-label="Title">' + ui.escapeHTML(t.title) + "</td>" +
        '<td data-label="Student">' + ui.escapeHTML(AQRP.tickets.getUserName(t.studentId)) + "</td>" +
        '<td data-label="Category">' + ui.escapeHTML(AQRP.tickets.getCategoryName(t.categoryId)) + "</td>" +
        '<td data-label="Department">' + ui.escapeHTML(AQRP.tickets.getDepartmentName(t.departmentId)) + "</td>" +
        '<td data-label="Priority">' + ui.priorityBadge(t.priority) + "</td>" +
        '<td data-label="Status">' + ui.statusBadge(t.status) + "</td>" +
        '<td data-label="SLA">' + ui.slaBadge(t, false) + "</td>" +
        '<td data-label="Created">' + ui.escapeHTML(ui.formatDate(t.createdAt)) + "</td></tr>";
    }).join("");
    let pages = "";
    for (let p = 1; p <= totalPages; p++) {
      pages += '<button type="button" class="page-btn ' + (p === state.page ? "active" : "") + '" data-page="' + p + '" aria-label="Page ' + p + '">' + p + "</button>";
    }
    const last = Math.min(startIndex + PER_PAGE, visible.length);
    holder.innerHTML = '<div class="table-wrap"><table class="responsive"><thead><tr>' + headerCell("Ticket ID", "id") + "<th>Title</th><th>Student</th><th>Category</th><th>Department</th>" +
      headerCell("Priority", "priority") + headerCell("Status", "status") + "<th>SLA</th>" + headerCell("Created", "created") + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<div class="pagination"><span class="muted">Showing ' + (startIndex + 1) + " to " + last + " of " + visible.length + '</span><div class="pages">' +
      '<button type="button" class="page-btn" data-page-nav="prev" ' + (state.page === 1 ? "disabled" : "") + ">Previous</button>" + pages +
      '<button type="button" class="page-btn" data-page-nav="next" ' + (state.page === totalPages ? "disabled" : "") + ">Next</button></div></div>";
  }

  // Wrap one CSV value in quotes and protect against spreadsheet formulas.
  function csvCell(value) {
    let text = String(value === null || value === undefined ? "" : value);
    if (/^[=+\-@]/.test(text)) { text = "'" + text; }
    return '"' + text.replace(/"/g, '""') + '"';
  }

  // Download the filtered tickets as a CSV file using a Blob.
  function exportCSV(user) {
    const rows = getVisibleTickets(user);
    const header = ["Ticket ID", "Title", "Student", "Category", "Department", "Priority", "Status", "SLA", "Created", "Resolved At"];
    const lines = [header.map(csvCell).join(",")];
    rows.forEach(function (t) {
      lines.push([t.id, t.title, AQRP.tickets.getUserName(t.studentId), AQRP.tickets.getCategoryName(t.categoryId), AQRP.tickets.getDepartmentName(t.departmentId),
        t.priority, t.status, AQRP.tickets.getSlaInfo(t).label, new Date(t.createdAt).toISOString(), t.resolvedAt ? new Date(t.resolvedAt).toISOString() : ""].map(csvCell).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aqrp-tickets.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    AQRP.ui.showToast("Exported " + rows.length + " tickets to CSV.", "success");
  }

  // Attach the table events (filters, sorting, pagination, export) to one container.
  function attachTable(container, user) {
    container.addEventListener("input", function (event) {
      const key = event.target.getAttribute("data-filter");
      if (key) {
        state[key] = event.target.value;
        state.page = 1;
        renderResults(user);
      }
    });
    container.addEventListener("click", function (event) {
      const sortCell = event.target.closest("[data-sort]");
      const pageButton = event.target.closest("[data-page]");
      const navButton = event.target.closest("[data-page-nav]");
      const action = event.target.closest("[data-action]");
      const row = event.target.closest("tr[data-ticket-id]");
      if (sortCell) {
        const key = sortCell.getAttribute("data-sort");
        state.sortDir = state.sortKey === key && state.sortDir === "asc" ? "desc" : "asc";
        state.sortKey = key;
        renderResults(user);
      } else if (pageButton) {
        state.page = Number(pageButton.getAttribute("data-page"));
        renderResults(user);
      } else if (navButton) {
        state.page += navButton.getAttribute("data-page-nav") === "next" ? 1 : -1;
        renderResults(user);
      } else if (action && action.getAttribute("data-action") === "clear-filters") {
        state = newState();
        container.querySelectorAll("[data-filter]").forEach(function (control) { control.value = ""; });
        renderResults(user);
      } else if (action && action.getAttribute("data-action") === "export-csv") {
        exportCSV(user);
      } else if (row && !event.target.closest("a")) {
        window.location.hash = "#/ticket/" + row.getAttribute("data-ticket-id");
      }
    });
    renderResults(user);
  }

  return {
    studentHTML: studentHTML, staffHTML: staffHTML, adminHTML: adminHTML, tableShellHTML: tableShellHTML, attachTable: attachTable,
    averageResolutionHours: averageResolutionHours
  };
})();
