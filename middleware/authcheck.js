const jwt = require("jsonwebtoken");
const RefreshToken = require("../models/refreshToken");
const User = require("../models/user");

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const authMiddleware = async (req, res, next) => {
  try {
    if (!req.session || !req.session.token) {
      return res.redirect("/auth/login");
    }

    const token = req.session.token;

    try {
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);


      const user = await User.findById(decoded.id);
      if (!user) {
        req.session.destroy(() => {
          return res.redirect("/auth/login");
        });
        return;
      }

     
      if (user.blocked) {
        req.session.destroy(() => {
          return res.render("blocked", {
            adminPhone: process.env.ADMIN_PHONE || "919876543210"
          });
        });
        return;
      }

    
      req.user = {
        id: user._id,
        name: user.name,
        role: user.role,
        phone: user.phone
      };

      res.locals.user = req.user;
      next();

    } catch (tokenErr) {
  
      if (
        tokenErr.name === "TokenExpiredError" ||
        tokenErr.name === "JsonWebTokenError"
      ) {
        const refreshToken = req.session.refreshToken;
        if (!refreshToken) {
          req.session.destroy(() => {
            return res.redirect("/auth/login");
          });
          return;
        }

        try {
          const refreshDecoded = jwt.verify(
            refreshToken,
            JWT_REFRESH_SECRET
          );

          const storedToken = await RefreshToken.findOne({
            token: refreshToken
          });

          if (!storedToken || new Date() > storedToken.expiresAt) {
            if (storedToken) {
              await RefreshToken.deleteOne({ token: refreshToken });
            }
            req.session.destroy(() => {
              return res.redirect("/auth/login");
            });
            return;
          }

          const user = await User.findById(refreshDecoded.id);
          if (!user) {
            req.session.destroy(() => {
              return res.redirect("/auth/login");
            });
            return;
          }

         
          if (user.blocked) {
            req.session.destroy(() => {
              return res.render("blocked", {
                adminPhone: process.env.ADMIN_PHONE || "919876543210"
              });
            });
            return;
          }

          const newAccessToken = jwt.sign(
            {
              id: user._id,
              role: user.role,
              phone: user.phone,
              name: user.name
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
          );

          req.session.token = newAccessToken;

          req.user = {
            id: user._id,
            name: user.name,
            role: user.role,
            phone: user.phone
          };

          res.locals.user = req.user;
          next();

        } catch (refreshErr) {
          req.session.destroy(() => {
            return res.redirect("/auth/login");
          });
        }
      } else {
        throw tokenErr;
      }
    }
  } catch (err) {
    req.session.destroy(() => {
      return res.redirect("/auth/login");
    });
  }
};

module.exports = authMiddleware;

