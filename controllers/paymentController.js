const crypto = require("crypto");
const Payment = require("../models/payment");
const User = require("../models/user");
const Order = require("../models/order");
const razorpay = require("../utils/razorpay");
const DailyPrice = require("../models/dailyPrices");
const { calculateTodayBill ,recalcShopBalance} = require("../utils/billCalculator");


const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    const order = await razorpay.orders.create({
      amount: Number(amount) * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`
    });

    res.json({ success: true, order });
  } catch (err) {
    console.error("Razorpay order error:", err);
    res.render("error/500").json({ success: false });
  }
};

/* ================= VERIFY PAYMENT ================= */
const verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
      paidAmount
    } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.json({ success: false });

    const bill = await calculateTodayBill({ orderId });
    if (!bill) return res.json({ success: false });

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.json({ success: false });
    }

   
await Payment.create({
  shop: order.shop,
  order: order._id,
  billAmount: bill.totalAmount,
  paidAmount: Number(paidAmount),
  finalAmount: Number(paidAmount),
  method: "ONLINE",
  note: "Razorpay"
});


const shopUser = await User.findById(order.shop);
if (shopUser) {
  shopUser.balance -= Number(paidAmount);
  await shopUser.save();
}

const updatedBill = await calculateTodayBill({ orderId });

const status =
  updatedBill.remainingToday <= 0 ? "PAID" : "PARTIAL";

await Order.findByIdAndUpdate(orderId, {
  paymentStatus: status
});

res.json({ success: true });

  } catch (err) {
    console.error("Verify error:", err);
    res.json({ success: false });
  }
};

const getOrderPaymentModal = async (req, res) => {
  try {
    const bill = await calculateTodayBill({
      orderId: req.params.id
    });

    if (!bill) return res.send("Order not found");

    res.render("shops/partials/paymentModal", bill);
  } catch (err) {
    console.error("Payment modal error:", err);
    res.render("error/404");
  }
};

module.exports = {
  createRazorpayOrder,
  verifyRazorpayPayment,
  getOrderPaymentModal
};

