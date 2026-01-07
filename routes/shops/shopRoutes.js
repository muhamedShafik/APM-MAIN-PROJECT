
const express = require("express");
const router = express.Router();
const shopController = require("../../controllers/shopController")
const authMiddleware= require("../../middleware/authcheck")
const paymentController =require("../../controllers/paymentController")
const adminController =require("../../controllers/adminController")
const authorize = require("../../middleware/authorizeRoles")



router.get("/dashboard",authMiddleware,authorize("shop"),shopController.getShopDashboard);
router.get("/orders", authMiddleware,authorize("shop"), shopController.getPlaceOrderPage);
router.post("/orders/create", authMiddleware, authorize("shop"), shopController.createOrder);
router.post("/orders/:id/update", authMiddleware,authorize("shop"),  shopController.updateOrder);
router.post("/orders/:id/delete", authMiddleware,authorize("shop"),  shopController.deleteOrder);
router.get("/transactions",authMiddleware,authorize("shop"), shopController.getShopTransactions)
router.get("/todayBill",authMiddleware,authorize("shop"), shopController.getTodayBillPage)

router.get("/logout", adminController.logout);



module.exports = router; 