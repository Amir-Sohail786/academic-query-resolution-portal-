// tickets.js - create, validate transitions, assign, comment, escalate, SLA and history.
window.AQRP = window.AQRP || {};

AQRP.tickets = (function () {
  const HOUR = 60 * 60 * 1000;
  const PRIORITIES = ["Low", "Medium", "High", "Urgent"];
  const ACTIVE = ["Assigned", "In Progress", "Awaiting Student", "Reopened"];
  const MAX_FILE_SIZE = 1024 * 1024;
  const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "pdf", "doc", "docx"];
  const MIME_BY_EXTENSION = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  };
  const SYSTEM_USER = { id: "system", name: "System", role: "system" };

  // Every allowed status change: who may do it (owner = student who owns the ticket) and what text it needs.
  const TRANSITIONS = [
    { from: "Assigned", to: "In Progress", who: ["staff", "admin"], needs: "" },
    { from: "Assigned", to: "Awaiting Student", who: ["staff", "admin"], needs: "" },
    { from: "In Progress", to: "Awaiting Student", who: ["staff", "admin"], needs: "" },
    { from: "In Progress", to: "Resolved", who: ["staff", "admin"], needs: "note" },
    { from: "Awaiting Student", to: "In Progress", who: ["staff", "admin"], needs: "" },
    { from: "Resolved", to: "Closed", who: ["owner", "admin"], needs: "" },
    { from: "Resolved", to: "Reopened", who: ["owner"], needs: "reason" },
    { from: "Closed", to: "Reopened", who: ["owner", "admin"], needs: "reason" },
    { from: "Reopened", to: "In Progress", who: ["staff", "admin"], needs: "" },
    { from: "Assigned", to: "Escalated", who: ["owner", "staff", "admin"], needs: "reason" },
    { from: "In Progress", to: "Escalated", who: ["owner", "staff", "admin"], needs: "reason" },
    { from: "Awaiting Student", to: "Escalated", who: ["owner", "staff", "admin"], needs: "reason" },
    { from: "Reopened", to: "Escalated", who: ["owner", "staff", "admin"], needs: "reason" },
    { from: "Escalated", to: "In Progress", who: ["admin"], needs: "" },
    { from: "Escalated", to: "Resolved", who: ["admin"], needs: "note" }
  ];

  // Turn a role name into the label stored in history and comments.
  function roleLabel(role) {
    if (role === "student") { return "Student"; }
    if (role === "staff") { return "Staff"; }
    if (role === "admin") { return "Admin"; }
    return "System";
  }

  // Get the SLA hours for a priority from the saved settings.
  function getSlaHours(priority) {
    return AQRP.storage.getSettings().sla[priority];
  }

  // Get the ids of all admin users.
  function getAdminIds() {
    return AQRP.storage.getUsers().filter(function (u) { return u.role === "admin"; }).map(function (u) { return u.id; });
  }

  // Get the name of a department by id.
  function getDepartmentName(departmentId) {
    const dept = AQRP.storage.getDepartments().find(function (d) { return d.id === departmentId; });
    return dept ? dept.name : "Unknown";
  }

  // Get the name of a category by id.
  function getCategoryName(categoryId) {
    const cat = AQRP.storage.getCategories().find(function (c) { return c.id === categoryId; });
    return cat ? cat.name : "Unknown";
  }

  // Get the full name of a user by id.
  function getUserName(userId) {
    const user = AQRP.storage.getUserById(userId);
    return user ? user.name : "Unknown";
  }

  // Calculate the time the SLA clock started (due time minus the SLA hours).
  function getSlaStart(ticket) {
    return ticket.slaDueAt - getSlaHours(ticket.priority) * HOUR;
  }

  // Work out the SLA state: { key, label, text } for badges and live text.
  function getSlaInfo(ticket) {
    const now = Date.now();
    const done = ticket.status === "Resolved" || ticket.status === "Closed";
    if (done) {
      const finishedAt = ticket.resolvedAt || ticket.updatedAt;
      if (finishedAt <= ticket.slaDueAt) {
        return { key: "met", label: "Met", text: "Resolved within SLA" };
      }
      return { key: "overdue", label: "Missed", text: "Resolved late" };
    }
    if (now > ticket.slaDueAt) {
      return { key: "overdue", label: "Overdue", text: "Overdue by " + AQRP.ui.formatDuration(now - ticket.slaDueAt) };
    }
    const total = ticket.slaDueAt - getSlaStart(ticket);
    const used = now - getSlaStart(ticket);
    const left = "Due in " + AQRP.ui.formatDuration(ticket.slaDueAt - now);
    if (total > 0 && used / total >= 0.8) {
      return { key: "due-soon", label: "Due soon", text: left };
    }
    return { key: "on-track", label: "On track", text: left };
  }

  // Return true when the ticket is past its due time and not yet resolved.
  function isOverdue(ticket) {
    return ticket.status !== "Resolved" && ticket.status !== "Closed" && Date.now() > ticket.slaDueAt;
  }

  // Return true when the user may see this ticket (owner, department staff or admin).
  function canView(ticket, user) {
    if (!user) { return false; }
    if (user.role === "admin") { return true; }
    if (user.role === "student") { return ticket.studentId === user.id; }
    return user.role === "staff" && ticket.departmentId === user.departmentId;
  }

  // Get the tickets a user is allowed to see.
  function getTicketsForUser(user) {
    return AQRP.storage.getTickets().filter(function (ticket) { return canView(ticket, user); });
  }

  // Find when a ticket was closed, from its history.
  function getClosedTime(ticket) {
    let time = 0;
    ticket.history.forEach(function (entry) {
      if (entry.newValue === "Closed") { time = entry.timestamp; }
    });
    return time;
  }

  // Check whether a user matches one "who" word for a transition rule.
  function userMatches(token, rule, ticket, user) {
    if (token === "admin") { return user.role === "admin"; }
    if (token === "staff") { return user.role === "staff" && ticket.departmentId === user.departmentId; }
    if (token === "owner") {
      const isOwner = user.role === "student" && ticket.studentId === user.id;
      if (rule.from === "Closed") {
        return isOwner && Date.now() - getClosedTime(ticket) <= 7 * 24 * HOUR;
      }
      return isOwner;
    }
    return false;
  }

  // Find the rule for one status change, or null.
  function findRule(from, to) {
    return TRANSITIONS.find(function (rule) { return rule.from === from && rule.to === to; }) || null;
  }

  // List the next statuses this user may choose, as [{ to, needs }].
  function getAllowedTransitions(ticket, user) {
    if (!user) { return []; }
    return TRANSITIONS.filter(function (rule) {
      if (rule.from !== ticket.status) { return false; }
      return rule.who.some(function (token) { return userMatches(token, rule, ticket, user); });
    }).map(function (rule) { return { to: rule.to, needs: rule.needs }; });
  }

  // Add one entry to the history of a ticket.
  function addHistory(ticket, action, actor, oldValue, newValue, note) {
    ticket.history.push({
      id: AQRP.storage.makeId("h"), action: action, actorId: actor.id, actorName: actor.name, actorRole: roleLabel(actor.role),
      oldValue: oldValue || "", newValue: newValue || "", note: note || "", timestamp: Date.now()
    });
  }

  // Send a notification to a list of users (the actor is skipped inside notifyUsers).
  function notify(userIds, actorId, ticket, type, message) {
    if (AQRP.notifications) {
      AQRP.notifications.notifyUsers(userIds, actorId, ticket, type, message);
    }
  }

  // Check the create-ticket form values and return an object of error messages.
  function validateTicketForm(values) {
    const errors = {};
    const title = String(values.title || "").trim();
    const description = String(values.description || "").trim();
    if (title.length < 10 || title.length > 100) { errors.title = "Title must be 10 to 100 characters."; }
    if (description.length < 30 || description.length > 1000) { errors.description = "Description must be 30 to 1000 characters."; }
    const category = AQRP.storage.getCategories().find(function (c) { return c.id === values.categoryId; });
    if (!category) { errors.categoryId = "Please choose a category."; }
    if (PRIORITIES.indexOf(values.priority) === -1) { errors.priority = "Please choose a priority."; }
    if (!AQRP.auth.isValidRegNo(String(values.registrationNumber || "").trim())) { errors.registrationNumber = "Registration number must be exactly 8 digits."; }
    return errors;
  }

  // Get the lowercase extension of a file name.
  function getExtension(fileName) {
    const parts = String(fileName).split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  }

  // Check one file against type, size and count rules; returns an error text or "".
  function validateFile(file, countAlready, maxCount) {
    if (ALLOWED_EXTENSIONS.indexOf(getExtension(file.name)) === -1) {
      return file.name + ": wrong type. Allowed: JPG, JPEG, PNG, PDF, DOC, DOCX.";
    }
    if (file.size > MAX_FILE_SIZE) {
      return file.name + ": too large. Maximum size is 1 MB.";
    }
    if (countAlready >= maxCount) {
      return file.name + ": too many files. Maximum is " + maxCount + ".";
    }
    return "";
  }

  // Read a file as a base64 data URL and return an attachment object through the callback.
  function readFile(file, user, callback) {
    const reader = new FileReader();
    reader.onload = function () {
      callback(null, {
        name: file.name, type: file.type || MIME_BY_EXTENSION[getExtension(file.name)] || "application/octet-stream",
        size: file.size, dataUrl: reader.result, uploadedBy: user.id, uploadedAt: Date.now()
      });
    };
    reader.onerror = function () { callback("Could not read " + file.name, null); };
    reader.readAsDataURL(file);
  }

  // Create a ticket, auto-assign it to the department and notify people; returns { ok, ticket, error }.
  function createTicket(values, user, attachments) {
    const errors = validateTicketForm(values);
    if (Object.keys(errors).length > 0) {
      return { ok: false, ticket: null, error: "Please fix the errors in the form." };
    }
    const category = AQRP.storage.getCategories().find(function (c) { return c.id === values.categoryId; });
    const staff = AQRP.storage.findStaffByDepartment(category.departmentId);
    const now = Date.now();
    const number = AQRP.storage.nextCounter();
    const ticket = {
      id: "AQ-" + new Date().getFullYear() + "-" + String(number).padStart(4, "0"),
      title: String(values.title).trim(), description: String(values.description).trim(),
      categoryId: category.id, departmentId: category.departmentId, priority: values.priority, status: "Assigned",
      studentId: user.id, registrationNumber: String(values.registrationNumber).trim(), assignedStaffId: staff ? staff.id : "",
      createdAt: now, updatedAt: now, resolvedAt: null, slaDueAt: now + getSlaHours(values.priority) * HOUR,
      attachments: attachments || [], comments: [], history: [], escalated: false, escalationReason: "", escalationType: "",
      resolutionNote: "", slaWarned: false
    };
    addHistory(ticket, "Ticket created", user, "", "Open", "");
    addHistory(ticket, "Auto-assigned", SYSTEM_USER, "Open", "Assigned", "Routed to " + getDepartmentName(ticket.departmentId));
    if (!AQRP.storage.saveTicket(ticket)) {
      return { ok: false, ticket: null, error: "Could not save the ticket." };
    }
    notify([user.id], null, ticket, "Ticket created", "Your ticket " + ticket.id + " was created and sent to " + getDepartmentName(ticket.departmentId) + ".");
    notify([ticket.assignedStaffId].concat(getAdminIds()), user.id, ticket, "Ticket created", "New ticket " + ticket.id + " assigned to " + getDepartmentName(ticket.departmentId) + ".");
    return { ok: true, ticket: ticket, error: "" };
  }

  // Change the status after checking the rules; text is the resolution note or reason.
  function changeStatus(ticketId, newStatus, user, text) {
    const ticket = AQRP.storage.getTicketById(ticketId);
    if (!ticket || !canView(ticket, user)) { return { ok: false, error: "Ticket not found or access denied." }; }
    const rule = findRule(ticket.status, newStatus);
    const allowed = getAllowedTransitions(ticket, user).some(function (item) { return item.to === newStatus; });
    if (!rule || !allowed) { return { ok: false, error: "You cannot change " + ticket.status + " to " + newStatus + "." }; }
    const note = String(text || "").trim();
    if (rule.needs !== "" && note.length < 10) {
      return { ok: false, error: "Please write at least 10 characters for the " + (rule.needs === "note" ? "resolution note." : "reason.") };
    }
    applyStatus(ticket, newStatus, user, note, "manual");
    if (!AQRP.storage.saveTicket(ticket)) { return { ok: false, error: "Could not save the change." }; }
    const recipients = [ticket.studentId, ticket.assignedStaffId];
    if (newStatus === "Escalated") { recipients.push.apply(recipients, getAdminIds()); }
    notify(recipients, user.id, ticket, newStatus === "Escalated" ? "Escalated" : "Status changed", "Ticket " + ticket.id + " is now " + newStatus + ".");
    return { ok: true, error: "" };
  }

  // Change the fields of a ticket for a new status and write the history entry.
  function applyStatus(ticket, newStatus, actor, note, mode) {
    const oldStatus = ticket.status;
    let action = "Status changed";
    if (newStatus === "Resolved") { action = "Resolved"; ticket.resolvedAt = Date.now(); ticket.resolutionNote = note; }
    if (newStatus === "Closed") { action = "Closed"; }
    if (newStatus === "Reopened") { action = "Reopened"; ticket.resolvedAt = null; ticket.slaDueAt = Date.now() + getSlaHours(ticket.priority) * HOUR; ticket.slaWarned = false; }
    if (newStatus === "Escalated") {
      action = mode === "automatic" ? "Escalated automatically" : "Escalated manually";
      ticket.escalationReason = note;
      ticket.escalationType = mode;
    }
    ticket.status = newStatus;
    ticket.escalated = newStatus === "Escalated";
    ticket.updatedAt = Date.now();
    addHistory(ticket, action, actor, oldStatus, newStatus, note);
  }

  // Add a comment or internal note after checking the rules; returns { ok, error }.
  function addComment(ticketId, user, text, isInternal) {
    const ticket = AQRP.storage.getTicketById(ticketId);
    const clean = String(text || "").trim();
    if (!ticket || !canView(ticket, user)) { return { ok: false, error: "Ticket not found or access denied." }; }
    if (clean.length < 1 || clean.length > 500) { return { ok: false, error: "Comment must be 1 to 500 characters." }; }
    if (ticket.status === "Closed") { return { ok: false, error: "A closed ticket accepts no new comments." }; }
    if (ticket.status === "Resolved" && user.role === "staff") { return { ok: false, error: "Only the student and admin can comment on a resolved ticket." }; }
    if (isInternal && user.role === "student") { return { ok: false, error: "Students cannot add internal notes." }; }
    ticket.comments.push({ id: AQRP.storage.makeId("c"), authorId: user.id, authorRole: roleLabel(user.role), text: clean, isInternal: Boolean(isInternal), createdAt: Date.now() });
    addHistory(ticket, isInternal ? "Internal note added" : "Comment added", user, "", "", "");
    if (user.role === "student" && ticket.status === "Awaiting Student") {
      applyStatus(ticket, "In Progress", user, "Student replied", "manual");
    }
    ticket.updatedAt = Date.now();
    if (!AQRP.storage.saveTicket(ticket)) { return { ok: false, error: "Could not save the comment." }; }
    if (isInternal) {
      notify([ticket.assignedStaffId].concat(getAdminIds()), user.id, ticket, "Internal note", "New internal note on " + ticket.id + " by " + user.name + ".");
    } else if (user.role === "student") {
      notify([ticket.assignedStaffId], user.id, ticket, "New comment", user.name + " commented on " + ticket.id + ".");
    } else {
      notify([ticket.studentId], user.id, ticket, "New comment", user.name + " replied on " + ticket.id + ".");
    }
    return { ok: true, error: "" };
  }

  // Add attachments (already read as data URLs) to an existing ticket; maximum 5 in total.
  function addAttachments(ticketId, user, files) {
    const ticket = AQRP.storage.getTicketById(ticketId);
    if (!ticket || !canView(ticket, user)) { return { ok: false, error: "Ticket not found or access denied." }; }
    if (ticket.status === "Closed") { return { ok: false, error: "A closed ticket accepts no new attachments." }; }
    if (ticket.attachments.length + files.length > 5) { return { ok: false, error: "A ticket can have at most 5 files in total." }; }
    files.forEach(function (file) {
      ticket.attachments.push(file);
      addHistory(ticket, "Attachment added", user, "", "", file.name);
    });
    ticket.updatedAt = Date.now();
    if (!AQRP.storage.saveTicket(ticket)) { return { ok: false, error: "Could not save the attachment." }; }
    const target = user.role === "student" ? [ticket.assignedStaffId] : [ticket.studentId];
    notify(target, user.id, ticket, "Attachment added", user.name + " added a file to " + ticket.id + ".");
    return { ok: true, error: "" };
  }

  // Move a ticket to another department (admin or current staff); returns { ok, error }.
  function reassign(ticketId, newDepartmentId, user, reason) {
    const ticket = AQRP.storage.getTicketById(ticketId);
    if (!ticket || !canView(ticket, user) || user.role === "student") { return { ok: false, error: "You cannot reassign this ticket." }; }
    if (newDepartmentId === ticket.departmentId) { return { ok: false, error: "Choose a different department." }; }
    if (String(reason || "").trim().length < 10) { return { ok: false, error: "Please write a reason of at least 10 characters." }; }
    const newStaff = AQRP.storage.findStaffByDepartment(newDepartmentId);
    if (!newStaff) { return { ok: false, error: "That department has no staff user." }; }
    const oldName = getDepartmentName(ticket.departmentId);
    const oldStatus = ticket.status;
    ticket.departmentId = newDepartmentId;
    ticket.assignedStaffId = newStaff.id;
    addHistory(ticket, "Reassigned", user, oldName, getDepartmentName(newDepartmentId), String(reason).trim());
    if (oldStatus !== "Closed" && oldStatus !== "Assigned") {
      ticket.status = "Assigned";
      ticket.escalated = false;
      ticket.resolvedAt = null;
      addHistory(ticket, "Status changed", user, oldStatus, "Assigned", "Reassigned to a new department");
    }
    ticket.updatedAt = Date.now();
    if (!AQRP.storage.saveTicket(ticket)) { return { ok: false, error: "Could not save the change." }; }
    notify([newStaff.id, ticket.studentId].concat(getAdminIds()), user.id, ticket, "Reassigned", "Ticket " + ticket.id + " was reassigned to " + getDepartmentName(newDepartmentId) + ".");
    return { ok: true, error: "" };
  }

  // Change the priority (admin or department staff) and move the SLA due time to match.
  function changePriority(ticketId, newPriority, user) {
    const ticket = AQRP.storage.getTicketById(ticketId);
    if (!ticket || !canView(ticket, user) || user.role === "student") { return { ok: false, error: "You cannot change the priority." }; }
    if (PRIORITIES.indexOf(newPriority) === -1 || newPriority === ticket.priority) { return { ok: false, error: "Choose a different priority." }; }
    const oldPriority = ticket.priority;
    const start = getSlaStart(ticket);
    ticket.priority = newPriority;
    ticket.slaDueAt = start + getSlaHours(newPriority) * HOUR;
    ticket.updatedAt = Date.now();
    addHistory(ticket, "Priority changed", user, oldPriority, newPriority, "");
    if (!AQRP.storage.saveTicket(ticket)) { return { ok: false, error: "Could not save the change." }; }
    notify([ticket.studentId], user.id, ticket, "Status changed", "Priority of " + ticket.id + " changed to " + newPriority + ".");
    return { ok: true, error: "" };
  }

  // Check every ticket against its SLA: escalate overdue ones and warn at 80 percent.
  function checkSLA() {
    const now = Date.now();
    const tickets = AQRP.storage.getTickets();
    let changed = 0;
    tickets.forEach(function (ticket) {
      if (ACTIVE.indexOf(ticket.status) === -1) { return; }
      const start = getSlaStart(ticket);
      const total = ticket.slaDueAt - start;
      if (now > ticket.slaDueAt) {
        applyStatus(ticket, "Escalated", SYSTEM_USER, "SLA breached", "automatic");
        ticket.slaWarned = true;
        changed++;
        notify([ticket.studentId, ticket.assignedStaffId].concat(getAdminIds()), null, ticket, "Escalated", "Ticket " + ticket.id + " was escalated automatically (SLA breached).");
      } else if (!ticket.slaWarned && now >= start + total * 0.8) {
        ticket.slaWarned = true;
        changed++;
        notify([ticket.assignedStaffId].concat(getAdminIds()), null, ticket, "SLA warning", "Ticket " + ticket.id + " has used 80% of its SLA time.");
      }
    });
    if (changed > 0) {
      AQRP.storage.saveTickets(tickets);
    }
    return changed;
  }

  return {
    PRIORITIES: PRIORITIES, getSlaHours: getSlaHours, getSlaInfo: getSlaInfo, isOverdue: isOverdue, canView: canView,
    getTicketsForUser: getTicketsForUser, getAllowedTransitions: getAllowedTransitions, getDepartmentName: getDepartmentName,
    getCategoryName: getCategoryName, getUserName: getUserName, validateTicketForm: validateTicketForm, validateFile: validateFile,
    readFile: readFile, createTicket: createTicket, changeStatus: changeStatus, addComment: addComment, addAttachments: addAttachments,
    reassign: reassign, changePriority: changePriority, checkSLA: checkSLA
  };
})();
