// notifications.js - create notifications, pick recipients, mark read and show toasts.
window.AQRP = window.AQRP || {};

AQRP.notifications = (function () {
  // Ids of notifications that were already shown as a toast in this open tab.
  let seenIds = {};

  // Send one notification to every valid user in the list, except the person who did the action.
  function notifyUsers(userIds, actorId, ticket, type, message) {
    const validIds = AQRP.storage.getUsers().map(function (user) { return user.id; });
    const sentTo = [];
    const list = AQRP.storage.getNotifications();
    userIds.forEach(function (userId) {
      const isEmpty = !userId;
      const isActor = actorId !== null && userId === actorId;
      const isDuplicate = sentTo.indexOf(userId) !== -1;
      const isKnown = validIds.indexOf(userId) !== -1;
      if (isEmpty || isActor || isDuplicate || !isKnown) {
        return;
      }
      sentTo.push(userId);
      list.push({
        id: AQRP.storage.makeId("n"), userId: userId, ticketId: ticket.id, type: type,
        message: message, isRead: false, createdAt: Date.now()
      });
    });
    if (sentTo.length > 0) {
      AQRP.storage.saveNotifications(list);
    }
    return sentTo.length;
  }

  // Get all notifications of one user, newest first.
  function getForUser(userId) {
    return AQRP.storage.getNotifications().filter(function (item) {
      return item.userId === userId;
    }).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  // Count the unread notifications of one user.
  function unreadCount(userId) {
    return getForUser(userId).filter(function (item) { return !item.isRead; }).length;
  }

  // Get the newest few notifications of one user.
  function getLatest(userId, count) {
    return getForUser(userId).slice(0, count);
  }

  // Mark one notification as read.
  function markRead(notificationId) {
    const list = AQRP.storage.getNotifications();
    list.forEach(function (item) {
      if (item.id === notificationId) {
        item.isRead = true;
      }
    });
    AQRP.storage.saveNotifications(list);
  }

  // Mark every notification of one user as read.
  function markAllRead(userId) {
    const list = AQRP.storage.getNotifications();
    list.forEach(function (item) {
      if (item.userId === userId) {
        item.isRead = true;
      }
    });
    AQRP.storage.saveNotifications(list);
  }

  // Delete the already-read notifications of one user.
  function clearRead(userId) {
    const remaining = AQRP.storage.getNotifications().filter(function (item) {
      return !(item.userId === userId && item.isRead);
    });
    AQRP.storage.saveNotifications(remaining);
  }

  // Remember all current notifications as seen so only new ones create toasts.
  function startToastTracking(userId) {
    seenIds = {};
    getForUser(userId).forEach(function (item) {
      seenIds[item.id] = true;
    });
  }

  // Show a toast for each new unread notification; returns how many were new.
  function checkForToasts(userId) {
    const fresh = getForUser(userId).filter(function (item) {
      return !item.isRead && !seenIds[item.id];
    });
    fresh.forEach(function (item, index) {
      seenIds[item.id] = true;
      if (index < 3) {
        AQRP.ui.showToast(item.message, "info");
      }
    });
    if (fresh.length > 3) {
      AQRP.ui.showToast("You have " + (fresh.length - 3) + " more new notifications.", "info");
    }
    return fresh.length;
  }

  // Build the HTML of one notification button for the dropdown and the full page.
  function itemHTML(item) {
    const safe = AQRP.ui.escapeHTML;
    return '<button type="button" class="notif ' + (item.isRead ? "" : "unread") + '" data-notif-id="' + safe(item.id) + '" data-ticket-id="' + safe(item.ticketId) + '">' +
      safe(item.message) + "<small>" + safe(item.type) + " - " + safe(AQRP.ui.formatDateTime(item.createdAt)) + "</small></button>";
  }

  return {
    notifyUsers: notifyUsers, getForUser: getForUser, unreadCount: unreadCount, getLatest: getLatest, markRead: markRead,
    markAllRead: markAllRead, clearRead: clearRead, startToastTracking: startToastTracking, checkForToasts: checkForToasts, itemHTML: itemHTML
  };
})();
