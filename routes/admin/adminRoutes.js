const express = require('express');
const router = express.Router();
const authMiddleware = require("../../middleware/authcheck")
const adminController = require("../../controllers/adminController");
const authorize = require("../../middleware/authorizeRoles")





router.get('/dashboard',authMiddleware, authorize("admin"),adminController.getDashboard);
router.get("/daily-prices",authMiddleware,authorize("admin"),adminController.getdailyPrices);
router.post("/daily-prices", authMiddleware, authorize("admin"),adminController.setDailyPrice);
router.get("/daily-prices/:id/edit", authMiddleware,authorize("admin"), adminController.editDailyPricePage);
router.post("/daily-prices/:id/update", authMiddleware, authorize("admin"),adminController.updateDailyPrice);
router.get("/users",authMiddleware,authorize("admin"),adminController.getUsers);
router.post("/users/add",authMiddleware,authorize("admin"),adminController.addUser);
router.get("/users/search",authMiddleware,authorize("admin"),adminController.searchUsers)

router.get("/payments",authMiddleware,authorize("admin"), adminController.getPaymentsPage);
router.get("/orders",authMiddleware,authorize("admin"), adminController.getOrdersPage);
router.post("/orders/create",authMiddleware,authorize("admin"),adminController.createOrders)
router.get("/orders/:id", authMiddleware,authorize("admin"), adminController.getOrderById);
router.post("/orders/:id/update", authMiddleware, authorize("admin"),adminController.updateOrder);
router.post("/orders/:id/delete", authMiddleware,authorize("admin"), adminController.deleteOrder);
router.get("/users/:id", authMiddleware,authorize("admin"),adminController.getUserDetailsPage);
router.post("/users/:id/toggle-block",authMiddleware,authorize("admin"),adminController.toggleBlockUser);


router.get("/logout", adminController.logout);






module.exports = router;
