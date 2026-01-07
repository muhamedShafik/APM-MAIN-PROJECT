// controllers/authController.js
require('dotenv').config();
const jwt = require('jsonwebtoken');
const User = require("../models/user");
const RefreshToken = require("../models/refreshToken");
const generateOtp = require('../services/otpServices');
const twilio = require("twilio")

const ADMIN_PHONE = process.env.ADMIN_PHONE;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;


const resendOtp = async (req, res) => {
  console.log("resend otp");
  try {
    const userId = req.session.loginUserId;
    if (!userId) {
       return res.redirect("/auth/login?error=User not found");
    
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send('User not found');
    }

    const { otp, expires } = generateOtp();
    console.log('New OTP:', otp);

    req.session.otp = otp;
    req.session.otpExpires = expires;

    const account_sid = process.env.TWILIO_ACCOUNT_SID;
    const auth_token = process.env.TWILIO_AUTH_TOKEN;
    const client = twilio(account_sid, auth_token);

    const toNumber = user.phone.startsWith('+') ? user.phone : `+91${user.phone}`;

    const message = await client.messages.create({
      body: otp,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: toNumber
    });

    

   
    res.redirect("/auth/verify-otp?success=OTP resent");
  } catch (error) {
    console.error('resendOtp error:', error);
   res.redirect("/auth/verify-otp?error=Failed to resend OTP");
  
  }
};

const postSendOtp = async (req, res) => {
    try {
        const { phone } = req.body;


   
        const user = await User.findOne({ phone: phone });
        
        if (!user) {
            return res.redirect("/auth/login?error=User not found");
        }
     if (user.blocked) {
  return res.render("blocked", {
    adminPhone: ADMIN_PHONE || "919876543210"
  });
}
        
        const { otp, expires } = generateOtp();
        console.log(otp)

        req.session.loginUserId = user._id.toString();
        req.session.otp = otp;
        req.session.otpExpires = expires;
      
       
        


        console.log(`OTP for ${user.role} (${user.phone}):`, otp);
        const account_sid = process.env.TWILIO_ACCOUNT_SID
        const auth_token = process.env.TWILIO_AUTH_TOKEN
        const client = twilio(account_sid, auth_token)
        async function createMessage() {
            const message = await client.messages.create({
                body: otp,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: `+91${phone}`,
            });


            // console.log(message.body);
        }
        createMessage()


        res.redirect("/auth/verify-otp")
       
    } catch (err) {
        console.error(err);
        res.redirect("/auth/login?error=Failed to send OTP");
    }
};
// const postSendOtp = async (req, res) => {
//     try {
//         const { phone } = req.body;

  
//         const user = await User.findOne({ phone: phone });
//         console.log(user);
//         if (!user) {
//             return res.redirect("/auth/login?error=User not found");
//       }

// if (user.blocked) {
//   return res.render("blocked", {
//     adminPhone: ADMIN_PHONE || "919876543210"
//   });
// }
    
//         const { otp, expires } = generateOtp();
//         console.log("Generated OTP:", otp);

      
//         req.session.loginUserId = user._id.toString();
//         req.session.otp = otp;
//         req.session.otpExpires = expires;

//         console.log("Session Data:", req.session);

       
//         console.log(`qw DEV MODE: OTP for ${user.role} (${user.phone}) = ${otp}`);
     
      
//         res.redirect("/auth/verify-otp");

//    } catch (err) {
//   console.error(err);
//   res.redirect("/auth/login?error=Failed to send OTP");
// }

// };


const postVerifyOtp = async (req, res) => {
    try {
          console.log('HIT /auth/verify-otp, body =', req.body);
        const { d1, d2, d3, d4, d5, d6 } = req.body;
        const code = `${d1}${d2}${d3}${d4}${d5}${d6}`;


        if (!req.session.otp || !req.session.loginUserId) {
            return res.redirect("/auth/login?error=Session expired");
        }
        if (Date.now() > req.session.otpExpires) {
              return res.redirect("/auth/verify-otp?error=OTP expired");
        }
        if (code !== req.session.otp) {
             return res.redirect("/auth/verify-otp?error=Invalid OTP");
        }

        const user = await User.findById(req.session.loginUserId);
        if (!user) return res.redirect("/auth/login?error=User not found");

        if (user.blocked) {
  // clear OTP session
  req.session.destroy(() => {
    return res.render("blocked", {
      adminPhone: ADMIN_PHONE || "919037135820"
    });
  });
  return;
}

        const accessToken = jwt.sign(
            { id: user._id, role: user.role, phone: user.phone,name: user.name  },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { id: user._id, type: 'refresh',name: user.name  },
            JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await RefreshToken.create({
            token: refreshToken,
            userId: user._id,
            expiresAt: expiresAt
        });
       


        req.session.token = accessToken;
        req.session.refreshToken = refreshToken;
        req.session.role = user.role;

        // 4) Clear OTP from session
        // delete req.session.otp;
        // delete req.session.otpExpires;
        // delete req.session.loginUserId;

        req.session.save(()=>{
        if (user.role === 'admin') {
            return res.redirect('/admin/dashboard');
        }
        if (user.role === 'salesman') {
            return res.redirect('/sales/today-collections');
        }
        if (user.role === 'shop') {
            return res.redirect('/shop/dashboard');
        }
})
      
    } catch (err) {
        console.error(err);
      res.redirect("/auth/verify-otp?error=Error verifying OTP");
;
    }
};



const refreshToken = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Refresh token is required' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_REFRESH_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }

        const storedToken = await RefreshToken.findOne({ token });
        if (!storedToken) {
            return res.status(401).json({ error: 'Refresh token not found' });
        }

        if (new Date() > storedToken.expiresAt) {
            await RefreshToken.deleteOne({ token });
            return res.status(401).json({ error: 'Refresh token expired' });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const newAccessToken = jwt.sign(
            { id: user._id, role: user.role, phone: user.phone },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        if (req.session) {
            req.session.token = newAccessToken;
        }

        return res.json({
            accessToken: newAccessToken,
            refreshToken: token 
        });

    } catch (err) {
        console.error('Refresh token error:', err);
        return res.status(500).json({ error: 'Error refreshing token' });
    }
};

// Logout
const logout = async (req, res) => {
    try {
        const refreshToken = req.body.refreshToken || req.session?.refreshToken;

        if (refreshToken) {
           
            await RefreshToken.deleteOne({ token: refreshToken });
        }

        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
                 return res.redirect("/auth/login?error=Logout failed");
            }
           res.redirect("/auth/login?success=Logged out");
        });
    } catch (err) {
        console.error('Logout error:', err);
       res.redirect("/auth/login?error=Logout failed"); 
    }
};

module.exports = { postSendOtp, postVerifyOtp, resendOtp, refreshToken, logout }
