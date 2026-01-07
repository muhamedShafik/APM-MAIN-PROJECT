// // routes/authRoutes.js
// const express = require('express');
// const router = express.Router();
// const {postSendOtp,postVerifyOtp,resendOtp} = require('../controllers/authController');

// router.post('/auth/send-otp',postSendOtp);
// router.post('/auth/verify-otp',postVerifyOtp);

// router.post('/auth/resend-otp',resendOtp);

// router.get('/login', (req, res) => {
//   res.render('loginpage', { title: 'APM - Login' });
// });
// router.get('/verify-otp', (req, res) => {
//   res.render('verify-otp', { title: 'APM - Login' });
// });

// module.exports = router;
// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { postSendOtp, postVerifyOtp, resendOtp, refreshToken, logout } = require('../controllers/authController');
const authMiddleware =require("../middleware/authcheck")


router.post('/send-otp', postSendOtp);
router.post('/verify-otp', postVerifyOtp);
router.get('/resend-otp', resendOtp);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);  

router.get('/login', (req, res) => {
  res.render('loginpage', { title: 'APM - Login' });
});
router.get('/verify-otp', (req, res) => {
  res.render('verify-otp', { title: 'APM - Login' });
});

module.exports = router;

