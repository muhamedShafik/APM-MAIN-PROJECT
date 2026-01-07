const express = require("express");
const router = express.Router();
const authMiddleware = require("../../middleware/authcheck");
const salesController = require("../../controllers/salesController");
const adminController = require("../../controllers/adminController");
const authorize = require("../../middleware/authorizeRoles")

router.get("/today-collections", authMiddleware,authorize("salesman"), salesController.getTodayOrders);
router.get("/take-Order", authMiddleware, authorize("salesman"),salesController.getTakeOrdersPage)
router.get("/logout", adminController.logout);
router.post("/collect-payment", authMiddleware,authorize("salesman"), salesController.collectPayment);



router.post("/orders/:id/update", authMiddleware,authorize("salesman"), salesController.updateSalesOrder);

router.post("/orders/:id/delete",authMiddleware,authorize("salesman"),salesController.deleteSalesOrder);
router.get("/shops/search", authMiddleware,authorize("salesman"), salesController.searchShops);
router.post("/orders/create", authMiddleware, authorize("salesman"),salesController.createSalesOrder);
router.get("/shopbalance",authMiddleware,authorize("salesman"),salesController.getShopBalancePage);
router.get("/shopbalance", authMiddleware,authorize("salesman"), salesController.shopDetailsPage);
router.get("/shop/:id/payments", authMiddleware,authorize("salesman"), salesController.shopDetailsPage);
router.get("/shop/:id/summary", authMiddleware,authorize("salesman"), salesController.shopDetailsPage);
router.post("/shop/:id/toggle-block",authMiddleware,authorize("salesman"),salesController.toggleBlockShop);







module.exports = router;
