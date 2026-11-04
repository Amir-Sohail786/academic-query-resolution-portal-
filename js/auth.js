// auth.js - login, logout, signup, current user and role checks.
window.AQRP = window.AQRP || {};

AQRP.auth = (function () {
  // Which roles may open each route. An empty list means everyone, even when logged out.
  const ROUTE_ROLES = {
    "login": [],
    "track": [],
    "dashboard": ["student", "staff", "admin"],
    "tickets": ["student", "staff", "admin"],
    "tickets-new": ["student"],
    "ticket": ["student", "staff", "admin"],
    "notifications": ["student", "staff", "admin"],
    "admin-categories": ["admin"],
    "admin-departments": ["admin"],
    "admin-users": ["admin"]
  };

  // Check that an email looks like name@domain.ext.
  function isValidEmail(email) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  }

  // Check that a registration number has exactly 8 digits.
  function isValidRegNo(regNo) {
    const pattern = /^[0-9]{8}$/;
    return pattern.test(regNo);
  }

  // Return the logged-in user object, or null when nobody is logged in.
  function getCurrentUser() {
    const session = AQRP.storage.getSession();
    if (!session || !session.userId) {
      return null;
    }
    return AQRP.storage.getUserById(session.userId);
  }

  // Return true when somebody is logged in.
  function isLoggedIn() {
    return getCurrentUser() !== null;
  }

  // Return true when the current user has the given role.
  function hasRole(role) {
    const user = getCurrentUser();
    return user !== null && user.role === role;
  }

  // Return true when the current user is allowed to open the route key.
  function canAccess(routeKey) {
    const allowed = ROUTE_ROLES[routeKey];
    if (!allowed) {
      return false;
    }
    if (allowed.length === 0) {
      return true;
    }
    const user = getCurrentUser();
    return user !== null && allowed.indexOf(user.role) !== -1;
  }

  // Return true when the route needs a login.
  function needsLogin(routeKey) {
    const allowed = ROUTE_ROLES[routeKey];
    return Boolean(allowed) && allowed.length > 0;
  }

  // Try to log in with email and password; returns { ok, user, error }.
  function login(email, password) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (cleanEmail === "" || !password) {
      return { ok: false, user: null, error: "Please enter your email and password." };
    }
    const users = AQRP.storage.getUsers();
    const match = users.find(function (user) {
      return user.email.toLowerCase() === cleanEmail && user.password === password;
    });
    if (!match) {
      return { ok: false, user: null, error: "Wrong email or password." };
    }
    AQRP.storage.saveSession({ userId: match.id, loggedInAt: Date.now() });
    return { ok: true, user: match, error: "" };
  }

  // Log in using a demo account email (used by the quick demo buttons).
  function quickLogin(email) {
    const users = AQRP.storage.getUsers();
    const match = users.find(function (user) { return user.email === email; });
    if (!match) {
      return { ok: false, user: null, error: "Demo account not found. Try Reset demo data." };
    }
    return login(match.email, match.password);
  }

  // Log the user out by removing the saved session.
  function logout() {
    AQRP.storage.clearSession();
  }

  // Check the signup form values and return an object of error messages (empty when valid).
  function validateSignup(values) {
    const errors = {};
    const name = String(values.name || "").trim();
    const email = String(values.email || "").trim().toLowerCase();
    const regNo = String(values.registrationNumber || "").trim();
    const password = String(values.password || "");
    const confirm = String(values.confirm || "");

    if (name.length < 3) {
      errors.name = "Enter your full name (at least 3 characters).";
    }
    if (!isValidEmail(email)) {
      errors.email = "Enter a valid email address.";
    } else if (AQRP.storage.getUsers().some(function (user) { return user.email.toLowerCase() === email; })) {
      errors.email = "This email is already registered.";
    }
    if (!isValidRegNo(regNo)) {
      errors.registrationNumber = "Registration number must be exactly 8 digits.";
    }
    if (password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }
    if (confirm !== password || confirm === "") {
      errors.confirm = "Passwords do not match.";
    }
    return errors;
  }

  // Create a new student account and log in; returns { ok, errors, user }.
  function signup(values) {
    const errors = validateSignup(values);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors: errors, user: null };
    }
    const users = AQRP.storage.getUsers();
    const newUser = {
      id: AQRP.storage.makeId("u"),
      name: String(values.name).trim(),
      email: String(values.email).trim().toLowerCase(),
      password: String(values.password),
      role: "student",
      departmentId: "",
      registrationNumber: String(values.registrationNumber).trim()
    };
    users.push(newUser);
    if (!AQRP.storage.saveUsers(users)) {
      return { ok: false, errors: { form: "Could not save the account." }, user: null };
    }
    AQRP.storage.saveSession({ userId: newUser.id, loggedInAt: Date.now() });
    return { ok: true, errors: {}, user: newUser };
  }

  // Return a readable role name such as "Department Staff".
  function roleName(role) {
    if (role === "student") { return "Student"; }
    if (role === "staff") { return "Department Staff"; }
    if (role === "admin") { return "Admin"; }
    return "Guest";
  }

  return {
    isValidEmail: isValidEmail, isValidRegNo: isValidRegNo, getCurrentUser: getCurrentUser, isLoggedIn: isLoggedIn,
    hasRole: hasRole, canAccess: canAccess, needsLogin: needsLogin, login: login, quickLogin: quickLogin,
    logout: logout, validateSignup: validateSignup, signup: signup, roleName: roleName
  };
})();
