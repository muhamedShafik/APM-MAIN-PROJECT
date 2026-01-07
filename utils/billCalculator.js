const Order = require("../models/order");
const Payment = require("../models/payment");
const DailyPrice = require("../models/dailyPrices");
const User = require("../models/user");

async function calculateTodayBill({ shopId, orderId = null }) {

  const order = orderId
    ? await Order.findById(orderId).lean()
    : await Order.findOne({
        shop: shopId,
        deliveryDate: new Date().toISOString().slice(0, 10)
      }).lean();

  if (!order) return null;


  const priceDoc = await DailyPrice.findOne({
    priceDateStr: order.deliveryDate
  }).lean();

  const pricePerBox = Number(priceDoc?.pricePerBox || 0);
  const discountPerBox = Number(order.discountPerBox || 0);
  const boxes = Number(order.boxes || 0);

  const grossTotal = boxes * pricePerBox;
  const discountTotal = boxes * discountPerBox;
  const totalAmount = Math.max(grossTotal - discountTotal, 0);

  
  const paymentsAgg = await Payment.aggregate([
    { $match: { order: order._id } },
    { $group: { _id: null, totalPaid: { $sum: "$paidAmount" } } }
  ]);

  const paidToday = Number(paymentsAgg[0]?.totalPaid || 0);
  const remainingToday = totalAmount - paidToday;


  const shopPaymentsAgg = await Payment.aggregate([
    { $match: { shop: order.shop } },
    {
      $group: {
        _id: null,
        totalBill: { $sum: "$billAmount" },
        totalPaid: { $sum: "$paidAmount" }
      }
    }
  ]);

  const shopOutstanding =
    (shopPaymentsAgg[0]?.totalBill || 0) -
    (shopPaymentsAgg[0]?.totalPaid || 0);

  return {
    todayDate: new Date().toDateString(),
    orderId: order._id,

    boxes,
    pricePerBox,
    discountPerBox,

    grossTotal,
    discountTotal,
    totalAmount,

    paidToday,
    remainingToday: Math.max(remainingToday, 0),

    shopOutstanding,
    isFullyPaid: remainingToday <= 0
  };
}
const recalcShopBalance = async (shopId) => {
  const today = new Date().toISOString().slice(0, 10);

  /* ---------- TOTAL BILL (PAST DAYS ONLY) ---------- */
  const orders = await Order.aggregate([
    {
      $match: {
        shop: shopId,
        deliveryDate: { $lt: today } // 🔥 ONLY past days
      }
    },
    {
      $lookup: {
        from: "daily_prices",
        localField: "deliveryDate",
        foreignField: "priceDateStr",
        as: "price"
      }
    },
    {
      $addFields: {
        pricePerBox: {
          $ifNull: [{ $arrayElemAt: ["$price.pricePerBox", 0] }, 0]
        },
        discountPerBox: { $ifNull: ["$discountPerBox", 0] },
        billAmount: {
          $subtract: [
            { $multiply: ["$boxes", "$pricePerBox"] },
            { $multiply: ["$boxes", "$discountPerBox"] }
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        totalBill: { $sum: "$billAmount" }
      }
    }
  ]);

  /* ---------- TOTAL PAYMENTS ---------- */
  const payments = await Payment.aggregate([
    { $match: { shop: shopId } },
    {
      $group: {
        _id: null,
        totalPaid: { $sum: "$paidAmount" }
      }
    }
  ]);

  const totalBill = orders[0]?.totalBill || 0;
  const totalPaid = payments[0]?.totalPaid || 0;

  const balance = totalBill - totalPaid;

  await User.findByIdAndUpdate(shopId, { balance });
};



module.exports = { calculateTodayBill ,recalcShopBalance} ;

