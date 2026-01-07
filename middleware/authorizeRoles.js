const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect("/auth/login");
    }

    if (!allowedRoles.includes(req.user.role)) {

      return res.status(403).render("error/403", {
        message: "You are not authorized to access this page"
      });
    }

    next();
  };
};

module.exports = authorizeRoles;

