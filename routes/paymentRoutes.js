const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const authMiddleware =require("../middleware/authcheck")

// TEMP: no authMiddleware for testing
router.post("/razorpay/order",authMiddleware, paymentController.createRazorpayOrder);
router.post("/razorpay/verify", authMiddleware,paymentController.verifyRazorpayPayment);
router.get( "/order/:id",authMiddleware,paymentController.getOrderPaymentModal);


module.exports = router;
