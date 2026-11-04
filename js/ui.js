// ui.js - rendering helpers: escapeHTML, badges, stepper, modals, toasts, empty states.
window.AQRP = window.AQRP || {};

AQRP.ui = (function () {
  const STEPS = [
    { label: "Submitted", status: "Open" },
    { label: "Assigned", status: "Assigned" },
    { label: "In Progress", status: "In Progress" },
    { label: "Resolved", status: "Resolved" },
    { label: "Closed", status: "Closed" }
  ];
  let lastFocused = null;
  let modalKeyHandler = null;

  // Replace special characters so user text cannot become HTML (prevents injection).
  function escapeHTML(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Format a timestamp as a short date and time, for example 05 Nov 2026, 10:30 am.
  function formatDateTime(timestamp) {
    if (!timestamp) {
      return "-";
    }
    return new Date(timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // Format a timestamp as a date only.
  function formatDate(timestamp) {
    if (!timestamp) {
      return "-";
    }
    return new Date(timestamp).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  // Turn a number of milliseconds into text such as "5h 20m" or "2d 3h".
  function formatDuration(milliseconds) {
    const totalMinutes = Math.floor(Math.abs(milliseconds) / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) {
      return days + "d " + hours + "h";
    }
    return hours + "h " + minutes + "m";
  }

  // Turn a size in bytes into KB or MB text.
  function formatBytes(bytes) {
    if (bytes < 1024) {
      return bytes + " B";
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(1) + " KB";
    }
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  // Show a toast message in the bottom-right corner for 4 seconds.
  function showToast(message, type) {
    const container = document.getElementById("toast-container");
    if (!container) {
      return;
    }
    const toast = document.createElement("div");
    toast.className = "toast " + (type || "info");
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 4000);
  }

  // Build the colored status badge.
  function statusBadge(status) {
    return '<span class="badge" data-status="' + escapeHTML(status) + '">' + escapeHTML(status) + "</span>";
  }

  // Build the colored priority badge.
  function priorityBadge(priority) {
    return '<span class="badge" data-priority="' + escapeHTML(priority) + '">' + escapeHTML(priority) + "</span>";
  }

  // Build the small role badge (Student, Staff, Admin).
  function roleBadge(roleLabel) {
    return '<span class="role-badge">' + escapeHTML(roleLabel) + "</span>";
  }

  // Build the SLA badge with an optional live remaining-time text.
  function slaBadge(ticket, withText) {
    const info = AQRP.tickets.getSlaInfo(ticket);
    let html = '<span class="badge" data-sla="' + info.key + '" title="' + escapeHTML(info.text) + '">' + info.label + "</span>";
    if (withText) {
      html += ' <span class="muted">' + escapeHTML(info.text) + "</span>";
    }
    return html;
  }

  // Find the time a ticket reached a given status, using the history log.
  function findReachedTime(ticket, status) {
    let found = null;
    ticket.history.forEach(function (entry) {
      if (entry.newValue === status) {
        found = entry.timestamp;
      }
    });
    return found;
  }

  // Decide which stepper step (0 to 4) is the current one for a status.
  function currentStepIndex(status) {
    if (status === "Open") { return 0; }
    if (status === "Assigned") { return 1; }
    if (status === "Resolved") { return 3; }
    if (status === "Closed") { return 4; }
    return 2;
  }

  // Build the one-sentence banner for Awaiting Student, Escalated and Reopened tickets.
  function stateBanner(ticket, isPublic) {
    const messages = {
      "Awaiting Student": isPublic ? "The department is waiting for a reply from the student." : "The department needs more information from you. Please reply in the Conversation tab.",
      "Escalated": "This ticket was escalated and is now being handled by the admin.",
      "Reopened": "This ticket was reopened and is waiting for the department to work on it again."
    };
    if (!messages[ticket.status]) {
      return "";
    }
    return '<div class="banner" data-status="' + escapeHTML(ticket.status) + '"><strong>' + escapeHTML(ticket.status) + ":</strong> " + messages[ticket.status] + "</div>";
  }

  // Build the progress stepper (horizontal on desktop, vertical on mobile).
  function stepper(ticket) {
    const current = currentStepIndex(ticket.status);
    const items = STEPS.map(function (step, index) {
      let stateClass = "";
      let dot = String(index + 1);
      if (index < current || (index === current && ticket.status === "Closed")) {
        stateClass = "done";
        dot = "&#10003;";
      } else if (index === current) {
        stateClass = "current";
      }
      const time = index <= current ? findReachedTime(ticket, step.status) : null;
      const timeText = time ? formatDateTime(time) : "";
      return '<li class="step ' + stateClass + '"><div class="step-dot">' + dot + '</div><div><div class="step-label">' + step.label +
        '</div><div class="step-time">' + timeText + "</div></div></li>";
    });
    return '<ol class="stepper" aria-label="Ticket progress">' + items.join("") + "</ol>";
  }

  // Build the breadcrumb from a list of { label, href } items (last item has no href).
  function breadcrumb(items) {
    const parts = items.map(function (item, index) {
      const text = escapeHTML(item.label);
      const content = item.href ? '<a href="' + item.href + '">' + text + "</a>" : text;
      return index === 0 ? content : "<span>" + content + "</span>";
    });
    return '<nav class="breadcrumb" aria-label="Breadcrumb">' + parts.join("") + "</nav>";
  }

  // Build the skeleton loader shown for 300 ms when a page opens.
  function skeleton() {
    return '<div class="skeleton" style="width:40%;height:32px"></div><div class="skeleton block"></div><div class="skeleton block"></div>';
  }

  // Build an empty state with an inline SVG, a message and an optional button.
  function emptyState(kind, title, message, buttonLabel, href) {
    const icons = {
      tickets: '<rect x="30" y="35" width="60" height="50" rx="8"/><path d="M45 55h30M45 68h20"/>',
      notifications: '<path d="M60 30a22 22 0 0 0-22 22v16l-8 10h60l-8-10V52a22 22 0 0 0-22-22z"/><path d="M52 90a8 8 0 0 0 16 0"/>',
      search: '<circle cx="54" cy="54" r="24"/><path d="M72 72l22 22"/>'
    };
    const button = buttonLabel ? '<a class="btn btn-primary" href="' + href + '">' + escapeHTML(buttonLabel) + "</a>" : "";
    return '<div class="empty"><svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (icons[kind] || icons.tickets) + "</svg><h3>" + escapeHTML(title) + "</h3><p>" + escapeHTML(message) + "</p>" + button + "</div>";
  }

  // Pick an icon for a file type.
  function fileIcon(type) {
    if (type === "application/pdf") { return "&#128213;"; }
    if (type && type.indexOf("image/") === 0) { return "&#128444;"; }
    return "&#128196;";
  }

  // Build a chip for one attachment (thumbnail or icon, name, size, optional Remove or Download).
  function attachmentChip(file, index, options) {
    const isImage = file.type && file.type.indexOf("image/") === 0;
    const preview = isImage ? '<img src="' + escapeHTML(file.dataUrl) + '" alt="Preview of ' + escapeHTML(file.name) + '">' : '<span aria-hidden="true">' + fileIcon(file.type) + "</span>";
    let action = "";
    if (options && options.removable) {
      action = '<button type="button" class="btn btn-ghost btn-sm" data-remove-file="' + index + '">Remove</button>';
    }
    if (options && options.downloadable) {
      action = '<a class="btn btn-ghost btn-sm" download="' + escapeHTML(file.name) + '" href="' + escapeHTML(file.dataUrl) + '">Download</a>';
    }
    return '<div class="file-chip">' + preview + "<div><strong>" + escapeHTML(file.name) + '</strong><br><span class="muted">' + formatBytes(file.size) + "</span></div>" + action + "</div>";
  }

  // Close the open modal and give focus back to the element that opened it.
  function closeModal() {
    const root = document.getElementById("modal-root");
    root.innerHTML = "";
    if (modalKeyHandler) {
      document.removeEventListener("keydown", modalKeyHandler);
      modalKeyHandler = null;
    }
    if (lastFocused && lastFocused.focus) {
      lastFocused.focus();
    }
  }

  // Open a modal with a title, trusted HTML body and buttons [{ label, kind, onClick }].
  function openModal(options) {
    const root = document.getElementById("modal-root");
    lastFocused = document.activeElement;
    root.innerHTML = '<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<h2 id="modal-title">' + escapeHTML(options.title) + '</h2><div class="modal-body">' + options.bodyHTML + '</div><div class="modal-actions" id="modal-actions"></div></div></div>';
    const modal = root.querySelector(".modal");
    const actions = document.getElementById("modal-actions");

    options.buttons.forEach(function (config) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-" + (config.kind || "secondary");
      button.textContent = config.label;
      button.addEventListener("click", function () {
        if (!config.onClick) {
          closeModal();
          return;
        }
        const result = config.onClick(modal);
        if (result !== false) {
          closeModal();
        }
      });
      actions.appendChild(button);
    });

    document.getElementById("modal-backdrop").addEventListener("click", function (event) {
      if (event.target.id === "modal-backdrop") {
        closeModal();
      }
    });

    modalKeyHandler = function (event) {
      if (event.key === "Escape") {
        closeModal();
        return;
      }
      if (event.key === "Tab") {
        const focusable = modal.querySelectorAll("button, input, select, textarea, a[href]");
        if (focusable.length === 0) { return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", modalKeyHandler);

    const firstField = modal.querySelector("input, select, textarea");
    if (firstField) { firstField.focus(); } else { actions.querySelector("button").focus(); }
    return modal;
  }

  // Ask a yes/no question in a modal and run onConfirm when the user agrees.
  function confirmModal(title, message, confirmLabel, onConfirm) {
    openModal({
      title: title,
      bodyHTML: "<p>" + escapeHTML(message) + "</p>",
      buttons: [
        { label: "Cancel", kind: "secondary" },
        { label: confirmLabel, kind: "danger", onClick: function () { onConfirm(); } }
      ]
    });
  }

  // Ask for a written reason or note (minimum length) and pass it to onSubmit.
  function reasonModal(options) {
    openModal({
      title: options.title,
      bodyHTML: '<div class="field"><label for="modal-text">' + escapeHTML(options.label) + '</label><textarea id="modal-text" maxlength="500"></textarea>' +
        '<span class="error-text" id="modal-error"></span></div>',
      buttons: [
        { label: "Cancel", kind: "secondary" },
        {
          label: options.confirmLabel, kind: options.kind || "primary",
          onClick: function (modal) {
            const text = modal.querySelector("#modal-text").value.trim();
            if (text.length < options.minLength) {
              modal.querySelector("#modal-error").textContent = "Please write at least " + options.minLength + " characters.";
              return false;
            }
            closeModal();
            options.onSubmit(text);
            return false;
          }
        }
      ]
    });
  }

  return {
    escapeHTML: escapeHTML, formatDateTime: formatDateTime, formatDate: formatDate, formatDuration: formatDuration, formatBytes: formatBytes,
    showToast: showToast, statusBadge: statusBadge, priorityBadge: priorityBadge, roleBadge: roleBadge, slaBadge: slaBadge,
    stateBanner: stateBanner, stepper: stepper, breadcrumb: breadcrumb, skeleton: skeleton, emptyState: emptyState,
    attachmentChip: attachmentChip, openModal: openModal, closeModal: closeModal, confirmModal: confirmModal, reasonModal: reasonModal
  };
})();
