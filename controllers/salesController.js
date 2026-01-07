const Order = require("../models/order");
const DailyPrice = require("../models/dailyPrices");
const User = require("../models/user");
const Payment = require("../models/payment")
const { calculateTodayBill } =
  require("../utils/billCalculator");



const updateUserBalanceFromLedger = async (shopId) => {

  const orders = await Order.find({ shop: shopId })
    .sort({ deliveryDate: 1 })
    .lean();


  const dates = orders.map(o => o.deliveryDate);

  const prices = await DailyPrice.find({
    priceDateStr: { $in: dates }
  }).lean();

  const priceMap = {};
  prices.forEach(p => {
    priceMap[p.priceDateStr] = p.pricePerBox;
  });


  const orderIds = orders.map(o => o._id);

  const payments = await Payment.find({
    order: { $in: orderIds }
  }).lean();

  const paymentMap = {};
  payments.forEach(p => {
    const id = p.order.toString();
    paymentMap[id] = (paymentMap[id] || 0) + p.paidAmount;
  });

  let runningBalance = 0;

  for (const o of orders) {
    const pricePerBox = priceMap[o.deliveryDate] || 0;
    const discountPerBox = o.discountPerBox || 0;

    const bill =
      o.boxes * pricePerBox -
      o.boxes * discountPerBox;

    const paid = paymentMap[o._id.toString()] || 0;

    runningBalance += bill - paid;
  }

  await User.findByIdAndUpdate(shopId, {
    balance: runningBalance
  });
};



const getTodayOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";

    const today = new Date().toISOString().slice(0, 10);

    const priceDoc = await DailyPrice.findOne({
      priceDateStr: today
    }).lean();

    const pricePerBox = priceDoc?.pricePerBox || 0;
    let orders = await Order.find({
      deliveryDate: today,
      paymentStatus: { $ne: "PAID" }
    })
      .populate("shop", "name phone location")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();   
    for (let o of orders) {
      const bill = await calculateTodayBill({ orderId: o._id });

      o.totalAmount = bill.totalAmount;
      o.paidToday = bill.paidToday;
      o.remainingToday = bill.remainingToday;
    }


    if (search) {
      const r = new RegExp(search, "i");
      orders = orders.filter(o =>
        r.test(o.shop.name) ||
        r.test(o.shop.phone) ||
        r.test(o.shop.location || "")
      );
    }

    const totalOrders = await Order.countDocuments({
      deliveryDate: today,
      paymentStatus: { $ne: "PAID" }
    });

    res.render("salesman/todayCollections", {
      title: "Today Collections",
      user: req.user,
      orders,
      pricePerBox,
      page,
      totalPages: Math.ceil(totalOrders / limit),
      search,
      active: "today"
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("error/500");
  }
};



// payment logic


const collectPayment = async (req, res) => {
  try {
    const { shopId, orderId, paidAmount, method, note } = req.body;

    const bill = await calculateTodayBill({ orderId });
    if (!bill) {
      return res.json({ success: false, message: "Bill not found" });
    }

    const paid = Number(paidAmount);
    if (paid <= 0) {
      return res.json({ success: false, message: "Invalid amount" });
    }

    await Payment.create({
      shop: shopId,
      order: orderId,
      billAmount: bill.totalAmount,
      paidAmount: paid,
      finalAmount: paid,
      method,
      note,
      collectedBy: req.user.id
    });


    const remaining =
      bill.totalAmount - (bill.paidToday + paid);

    const status =
      remaining <= 0 ? "PAID" :
        "PARTIAL";

    await Order.findByIdAndUpdate(orderId, {
      paymentStatus: status
    });


    await updateUserBalanceFromLedger(shopId);

    return res.json({ success: true });

  } catch (err) {
    console.error("Collect Payment Error:", err);
    return render("error/500")
  }
};








// const recordPayment = async (req, res) => {
//   try {
//     const {
//       orderId,
//       shopId,
//       billAmount,
//       paidAmount,
//       method,
//       note
//     } = req.body;

//     const finalBill = Number(billAmount);
//     const paid = Number(paidAmount);

//     if (paid > finalBill) {
//       return res.status(400).json({ message: "Invalid payment amount" });
//     }

//     const remaining = Math.max(finalBill - paid, 0);

//     await Payment.create({
//       shop: shopId,
//       order: orderId,
//       billAmount: finalBill,
//       paidAmount: paid,
//       finalAmount: finalBill,
//       method,
//       note,
//       collectedBy: req.user.id
//     });



//     const status =
//       remaining === 0 ? "PAID" :
//       paid > 0 ? "PARTIAL" : "UNPAID";

//     await Order.findByIdAndUpdate(orderId, {
//       paymentStatus: status
//     });

//     res.json({ success: true });

//   } catch (err) {
//     console.log("Payment Error:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

const getTakeOrdersPage = async (req, res) => {
  try {
    const user = req.user;


    const page = parseInt(req.query.page || "1");
    const limit = 4;
    const skip = (page - 1) * limit;


    const selectedDate =
      req.query.date ||
      new Date(Date.now() + 86400000).toISOString().slice(0, 10);


    const totalOrders = await Order.countDocuments({
      deliveryDate: selectedDate
    });


    const ordersForDate = await Order.find({
      deliveryDate: selectedDate
    })
      .populate("shop", "name location")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalOrders / limit) || 1;

    res.render("salesman/takeOrder", {
      title: "Take Orders",
      user: req.user,
      ordersForDate,
      deliveryDateValue: selectedDate,
      page,
      totalPages,
      active: "orders"
    });

  } catch (err) {
    console.log("Take order error:", err);
    res.status(500).render("error/500");
  }
};

const updateSalesOrder = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.redirect("/sales/take-Order?error=Order not found");
    }

    if (!isEditableOrder(order.deliveryDate)) {
      return res.redirect("/sales/take-Order?error=Past orders cannot be edited");
    }


    const oldTotal = Number(order.totalAmount || 0);

    const newBoxes = Number(req.body.boxes) || 0;
    const newDiscount = Number(req.body.discountPerBox || 0);
    const deliveryDate = req.body.deliveryDate;

    const priceDoc = await DailyPrice.findOne({
      priceDate: new Date(deliveryDate)
    });

    const pricePerBox = Number(priceDoc?.pricePerBox || 0);

    const newTotal =
      newBoxes * Math.max(pricePerBox - newDiscount, 0);

    const shop = await User.findById(order.shop);
    if (shop) {
      shop.balance =
        Number(shop.balance || 0) - oldTotal + newTotal;
      await shop.save();
    }


    order.boxes = newBoxes;
    order.discountPerBox = newDiscount;
    order.deliveryDate = deliveryDate;
    order.totalAmount = newTotal;
    await order.save();

    return res.redirect(
      `/sales/take-Order?date=${deliveryDate}&success=Order updated`
    );

  } catch (err) {
    console.log("Update Order Error:", err);
    return res.redirect("/sales/take-Order?error=Update failed");
  }
};

const deleteSalesOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.redirect("/sales/take-Order?error=Order not found");
    }

    if (!isEditableOrder(order.deliveryDate)) {
      return res.redirect(
        "/sales/take-Order?error=Past orders cannot be deleted"
      );
    }

    const billAmount = Number(order.totalAmount || 0);


    const shop = await User.findById(order.shop);
    if (shop) {
      shop.balance = Number(shop.balance || 0) - billAmount;
      await shop.save();
    }

    await Order.findByIdAndDelete(order._id);

    return res.redirect("/sales/take-Order?success=Order deleted");

  } catch (err) {
    console.log("Delete Order Error:", err);
    return res.redirect("/sales/take-Order?error=Delete failed");
  }
};



const createSalesOrder = async (req, res) => {
  try {
    const { shop, boxes, discountPerBox, deliveryDate } = req.body;

    if (!shop || !boxes || !deliveryDate) {
      return res.redirect("/sales/take-Order?error=Missing required fields");
    }

    const exists = await Order.findOne({ shop, deliveryDate });
    if (exists) {
      return res.redirect(
        "/sales/take-Order?error=Order already exists for this shop and date"
      );
    }

    const priceDoc = await DailyPrice.findOne({
      priceDate: new Date(deliveryDate)
    });

    const boxCount = Number(boxes) || 0;
    const discount = Number(discountPerBox || 0);

    let totalAmount = 0;

    if (priceDoc) {
      const pricePerBox = Number(priceDoc.pricePerBox) || 0;
      totalAmount = boxCount * Math.max(pricePerBox - discount, 0);


      await User.findByIdAndUpdate(shop, {
        $inc: { balance: totalAmount }
      });
    }

    await Order.create({
      shop,
      boxes: boxCount,
      discountPerBox: discount,
      deliveryDate,
      totalAmount
    });

    return res.redirect("/sales/take-Order?success=Order created");

  } catch (err) {
    console.log("Create order error:", err);
    return res.redirect("/sales/take-Order?error=Server error");
  }
};


const searchShops = async (req, res) => {
  try {
    const q = req.query.q || "";
    const regex = new RegExp(q, "i");

    const shops = await User.find({
      role: "shop",
      $or: [{ name: regex }, { phone: regex }]
    }).select("_id name phone");

    res.json(shops);
  } catch {
    res.json([]);
  }
};

const isEditableOrder = (deliveryDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orderDate = new Date(deliveryDate);
  orderDate.setHours(0, 0, 0, 0);

  return orderDate > today;
};





const getShopBalancePage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";


    const regex = new RegExp(search, "i");

    const query = {
      role: "shop",
      $or: [
        { name: regex },
        { phone: regex },
        { location: regex }
      ]
    };


    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;


    const shops = await User.find(query)
      .select("name phone location balance")
      .sort({ balance: -1 })
      .skip(skip)
      .limit(limit);


    const balances = shops.map(s => ({
      id: s._id,
      name: s.name,
      phone: s.phone,
      location: s.location || "-",
      balance: s.balance || 0
    }));

    res.render("salesman/shopBalance", {
      title: "Shop Balance",
      user: req.user,
      balances,
      page,
      totalPages,
      search,
      active: "balance"
    });

  } catch (err) {
    console.log("Shop balance error:", err);
    res.status(500).render("error/500");
  }
};

const getShop = async (id) => {
  return await User.findById(id)
    .select("name phone location balance");
};







const toggleBlockShop = async (req, res) => {
  try {
    const shopId = req.params.id;

    const shop = await User.findById(shopId);
    if (!shop) {
      return res.redirect("/sales/shopbalance?error=Shop not found");
    }

    shop.blocked = !shop.blocked;
    await shop.save();


    return res.redirect(`/sales/shop/${shopId}/summary`);

  } catch (err) {
    console.error("Toggle block error:", err);
    return res.redirect("/sales/shopbalance?error=Action failed");
  }
};



const shopDetailsPage = async (req, res) => {
  try {
    const shopId = req.params.id;
    const activeTab = req.query.tab || "summary";

    const shop = await User.findById(shopId).select(
      "name phone location balance blocked"
    );

    if (!shop) {
      return res.status(404).send("Shop not found");
    }


    const ordersAgg = await Order.aggregate([
      { $match: { shop: shop._id } },

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
          discountPerBox: { $ifNull: ["$discountPerBox", 0] },

          billAmount: {
            $subtract: [
              {
                $multiply: [
                  "$boxes",
                  { $ifNull: [{ $arrayElemAt: ["$price.pricePerBox", 0] }, 0] }
                ]
              },
              {
                $multiply: ["$boxes", { $ifNull: ["$discountPerBox", 0] }]
              }
            ]
          }
        }
      },

      {
        $group: {
          _id: null,
          totalBoxes: { $sum: "$boxes" },
          totalAmount: { $sum: "$billAmount" }
        }
      }
    ]);

    const paymentsAgg = await Payment.aggregate([
      { $match: { shop: shop._id } },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: "$finalAmount" }
        }
      }
    ]);

    const summary = {
      totalBoxes: ordersAgg[0]?.totalBoxes || 0,
      totalAmount: ordersAgg[0]?.totalAmount || 0,
      totalPaid: paymentsAgg[0]?.totalPaid || 0,
      balance:
        (ordersAgg[0]?.totalAmount || 0) -
        (paymentsAgg[0]?.totalPaid || 0)
    };

    /* ================= ORDERS ================= */

    const orders = await Order.aggregate([
      { $match: { shop: shop._id } },

      {
        $lookup: {
          from: "daily_prices",
          localField: "deliveryDate",
          foreignField: "priceDateStr",
          as: "price"
        }
      },

      {
        $lookup: {
          from: "payments",
          localField: "_id",
          foreignField: "order",
          as: "payments"
        }
      },

      {
        $addFields: {
          pricePerBox: {
            $ifNull: [{ $arrayElemAt: ["$price.pricePerBox", 0] }, 0]
          },

          discountPerBox: { $ifNull: ["$discountPerBox", 0] },

          billAmount: {
            $let: {
              vars: {
                price: {
                  $ifNull: [{ $arrayElemAt: ["$price.pricePerBox", 0] }, 0]
                },
                discount: { $ifNull: ["$discountPerBox", 0] }
              },
              in: {
                $subtract: [
                  { $multiply: ["$boxes", "$$price"] },
                  { $multiply: ["$boxes", "$$discount"] }
                ]
              }
            }
          },

          paidAmount: {
            $sum: {
              $map: {
                input: "$payments",
                as: "p",
                in: "$$p.finalAmount"
              }
            }
          }
        }
      }
      ,

      { $sort: { deliveryDate: -1 } }
    ]);

    /* ================= PAYMENTS (WITH RUNNING BALANCE) ================= */
const page = parseInt(req.query.page || 1);
const limit = 5;                 // or any number you want
const skip = (page - 1) * limit;
let totalPages = 1;
let transactions = [];

    if (activeTab === "payments") {

      


  const paymentsRaw = await Payment.find({ shop: shop._id })
    .populate("order")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalPayments = await Payment.countDocuments({ shop: shop._id });
  totalPages = Math.ceil(totalPayments / limit);

  let runningBalance = summary.balance;
  transactions = [];

  for (const p of paymentsRaw) {
    if (!p.order) continue;

    const bill = await calculateTodayBill({ orderId: p.order._id });
    if (!bill) continue;

    transactions.push({
      date: p.createdAt.toISOString().slice(0, 10),
      boxes: p.order.boxes,
      pricePerBox: bill.pricePerBox,
      total: bill.totalAmount,
      paid: p.paidAmount,
      balance: runningBalance,
      method: p.method,
      note: p.note || "-"
    });

    runningBalance -= p.paidAmount;
  }
}

    /* ================= RENDER ================= */

    res.render("salesman/shopDetails", {
      title: "Shop Details",
      user: req.user,
      shop,
      summary,
      orders,
         transactions,
     
      activeTab
    });

  } catch (err) {
    console.error("Shop details error:", err);
    res.status(500).render("error/500");
  }
};




module.exports = {
  toggleBlockShop,

  shopDetailsPage,

  getShopBalancePage,
  getTodayOrders,
  collectPayment,

  getTakeOrdersPage,
  updateSalesOrder,
  deleteSalesOrder,
  searchShops,
  createSalesOrder
};

