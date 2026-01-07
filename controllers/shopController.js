const mongoose = require("mongoose");
const Order = require("../models/order");
const Payment = require("../models/payment");
const User = require("../models/user");
const DailyPrice = require("../models/dailyPrices");
const razorpay = require("../utils/razorpay")
const { calculateTodayBill } = require("../utils/billCalculator")

const isEditableOrder = (deliveryDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orderDate = new Date(deliveryDate);
  orderDate.setHours(0, 0, 0, 0);

  return orderDate > today;
};



const getShopDashboard = async (req, res) => {
  try {
    const shopId = req.user.id;

    const from = req.query.from || "";
    const to = req.query.to || "";

    const page = parseInt(req.query.page || 1);
    const limit = 5;
    const skip = (page - 1) * limit;

    
    const orderQuery = { shop: shopId };

    if (from && to) {
      orderQuery.deliveryDate = {
        $gte: from,
        $lte: to
      };
    }

    const totalOrders = await Order.countDocuments(orderQuery);
    const totalPages = Math.ceil(totalOrders / limit) || 1;

    const orders = await Order.find(orderQuery)
      .sort({ deliveryDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

   
    const shopUser = await User.findById(shopId).select("balance");
    const outstanding = shopUser?.balance || 0;

   
    const deliveryDates = orders.map(o => o.deliveryDate);

    const prices = await DailyPrice.find({
      priceDate: { $in: deliveryDates }
    }).lean();

    const priceMap = {};
    prices.forEach(p => {
      const d = p.priceDate.toISOString().slice(0, 10);
      priceMap[d] = p.pricePerBox;
    });

   
    const orderIds = orders.map(o => o._id);

    const payments = await Payment.find({
      order: { $in: orderIds }
    }).lean();

    const paymentMap = {};
    payments.forEach(p => {
      paymentMap[p.order.toString()] = p;
    });

    const orderList = orders.map(o => {
  const price = priceMap[o.deliveryDate] || 0;
  const discount = o.discountPerBox || 0;

  const effectivePrice = Math.max(price - discount, 0);
  const total = effectivePrice * o.boxes;

  const payment = paymentMap[o._id.toString()];


  const isPaid =
    outstanding <= 0 || o.paymentStatus === "PAID";

  return {
    _id: o._id,
    deliveryDate: o.deliveryDate,
    boxes: o.boxes,
    pricePerBox: price,
    discountPerBox: discount,
    effectivePrice,
    total,
    editable: isEditableOrder(o.deliveryDate),
    paid: isPaid,
    paidAmount: payment?.finalAmount || 0
  };
});


    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toLocaleDateString("en-CA");

    const tomorrowBoxesAgg = await Order.aggregate([
      {
        $match: {
          shop: new mongoose.Types.ObjectId(shopId),
          deliveryDate: tomorrow
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$boxes" }
        }
      }
    ]);

    const tomorrowBoxes = tomorrowBoxesAgg[0]?.total || 0;

    const todayPrice =
      priceMap[new Date().toISOString().slice(0, 10)] || 0;


    res.render("shops/dashboard", {
      title: "Shop Dashboard",
      user: req.user,
      razorpayKey: process.env.RAZORPAY_KEY_ID,
      summary: {
        tomorrowBoxes,
        todayPrice,
        outstanding
      },
      orders: orderList,
      page,
      totalPages,
      from,
      to
    });

  } catch (err) {
    console.error("Shop dashboard error:", err);
    res.status(500).render("error/500");
  }
};




const getPlaceOrderPage = async (req, res) => {
  try {
    const shopId = req.user.id;

    const from = req.query.from || "";
    const to = req.query.to || "";

    const page = parseInt(req.query.page || 1);
    const limit = 5;
    const skip = (page - 1) * limit;



    const orderQuery = { shop: shopId };

    if (from && to) {
      orderQuery.deliveryDate = {
        $gte: from,
        $lte: to
      };
    }

    const totalOrders = await Order.countDocuments(orderQuery);
    const totalPages = Math.ceil(totalOrders / limit) || 1;

    const orders = await Order.find(orderQuery)
      .sort({ deliveryDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean();



    const deliveryDates = orders.map(o => o.deliveryDate);

    const prices = await DailyPrice.find({
      priceDate: { $in: deliveryDates }
    }).lean();

    const priceMap = {};
    prices.forEach(p => {
      const d = p.priceDate.toISOString().slice(0, 10);
      priceMap[d] = p.pricePerBox;
    });


const orderList = orders.map(o => {
  const price = priceMap[o.deliveryDate] || 0;
  const discount = o.discountPerBox || 0;

  const effectivePrice = Math.max(price - discount, 0);
  const total = o.boxes * effectivePrice;

  return {
    _id: o._id,
    deliveryDate: o.deliveryDate,
    boxes: o.boxes,
    pricePerBox: price,
    discountPerBox: discount,
    total,
    editable: isEditableOrder(o.deliveryDate)
  };
});


    res.render("shops/placeOrder", {
      title: "Place Order",
      user: req.user,
      orders: orderList,
      page,
      totalPages,
      from,
      to,
      error: req.query.error,
      success: req.query.success
    });

  } catch (err) {
    console.error("Place order page error:", err);
    res.status(500).render("error/500");
  }
};

/* ================= CREATE ORDER ================= */

const createOrder = async (req, res) => {
  try {
    const shopId = req.user.id;
    const { deliveryDate, boxes } = req.body;

    if (!deliveryDate || !boxes) {
      return res.redirect("/shop/orders?error=Missing fields");
    }

    const exists = await Order.findOne({ shop: shopId, deliveryDate });
    if (exists) {
      return res.redirect("/shop/orders?error=Order already exists");
    }

    const priceDoc = await DailyPrice.findOne({
      priceDate: new Date(deliveryDate)
    });

    const boxCount = Number(boxes) || 0;
    let totalAmount = 0;

    if (priceDoc) {
      const pricePerBox = Number(priceDoc.pricePerBox) || 0;
      totalAmount = boxCount * pricePerBox;

     
      await User.findByIdAndUpdate(shopId, {
        $inc: { balance: totalAmount }
      });
    }

    await Order.create({
      shop: shopId,
      deliveryDate,
      boxes: boxCount,
      totalAmount
    });

    return res.redirect("/shop/orders?success=Order created");

  } catch (err) {
    console.error("Create order error:", err);
    return res.redirect("/shop/orders?error=Create failed");
  }
};

/* ================= UPDATE ORDER ================= */

const updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order || !isEditableOrder(order.deliveryDate)) {
      return res.redirect("/shop/orders?error=Cannot edit this order");
    }

   
    const oldTotal = Number(order.totalAmount || 0);

    const newBoxes = Number(req.body.boxes) || 0;

   
    const priceDoc = await DailyPrice.findOne({
      priceDate: new Date(order.deliveryDate)
    });

    const pricePerBox = Number(priceDoc?.pricePerBox || 0);

    const newTotal = newBoxes * pricePerBox;

   
    const shop = await User.findById(order.shop);
    if (shop) {
      shop.balance =
        Number(shop.balance || 0) - oldTotal + newTotal;
      await shop.save();
    }

    
    order.boxes = newBoxes;
    order.totalAmount = newTotal;
    await order.save();

    return res.redirect("/shop/orders?success=Order updated");

  } catch (err) {
    console.error("Update order error:", err);
    return res.redirect("/shop/orders?error=Update failed");
  }
};

/* ================= DELETE ORDER ================= */

const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order || !isEditableOrder(order.deliveryDate)) {
      return res.redirect("/shop/orders?error=Cannot delete this order");
    }

    const billAmount = Number(order.totalAmount || 0);

  
    const shop = await User.findById(order.shop);
    if (shop) {
      shop.balance = Number(shop.balance || 0) - billAmount;
      await shop.save();
    }

    await Order.findByIdAndDelete(order._id);

    return res.redirect("/shop/orders?success=Order deleted");

  } catch (err) {
    console.error("Delete order error:", err);
    return res.redirect("/shop/orders?error=Delete failed");
  }
};

const getShopTransactions = async (req, res) => {
  try {
    const shopId = req.user.id;

    const from = req.query.from || "";
    const to = req.query.to || "";

    const page = parseInt(req.query.page || 1);
    const limit = 6;

    /* ================= FETCH ORDERS ================= */
    const orderQuery = { shop: shopId };

    if (from && to) {
      orderQuery.deliveryDate = { $gte: from, $lte: to };
    }

    const orders = await Order.find(orderQuery)
      .sort({ deliveryDate: 1 }) // OLD → NEW
      .lean();

    /* ================= FETCH PRICES ================= */
    const deliveryDates = orders.map(o => o.deliveryDate);

    const prices = await DailyPrice.find({
      priceDateStr: { $in: deliveryDates }
    }).lean();

    const priceMap = {};
    prices.forEach(p => {
      priceMap[p.priceDateStr] = p.pricePerBox;
    });

    /* ================= FETCH PAYMENTS ================= */
    const orderIds = orders.map(o => o._id);

    const payments = await Payment.find({
      order: { $in: orderIds }
    })
      .populate("order")
      .sort({ createdAt: 1 }) 
      .lean();


    const ledger = [];

    
    for (const o of orders) {
      const pricePerBox = priceMap[o.deliveryDate] || 0;
      const discountPerBox = o.discountPerBox || 0;

      const billAmount =
        o.boxes * pricePerBox -
        o.boxes * discountPerBox;

      ledger.push({
        date: o.deliveryDate,
        sortTime: new Date(o.deliveryDate + "T00:00:00"),
        orderId: `TBOX-${o._id.toString().slice(-4).toUpperCase()}`,
        boxes: o.boxes,
        total: billAmount,
        paid: 0,
        type: "BILL",
        paymentMethod: "-"
      });
    }

  
    for (const p of payments) {
      ledger.push({
        date: p.createdAt.toISOString().slice(0, 10),
        sortTime: p.createdAt,
        orderId: p.order
          ? `TBOX-${p.order._id.toString().slice(-4).toUpperCase()}`
          : "-",
        boxes: "-",
        total: 0,
        paid: p.paidAmount,
        type: "PAYMENT",
        paymentMethod: p.method
      });
    }

 
    ledger.sort((a, b) => new Date(a.sortTime) - new Date(b.sortTime));

    
    let runningBalance = 0;

    for (const row of ledger) {
      if (row.type === "BILL") {
        runningBalance += row.total;
      } else {
        runningBalance -= row.paid;
      }

      row.balance = runningBalance;
    }

    
    await User.findByIdAndUpdate(shopId, {
      balance: runningBalance
    });

    ledger.sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime));

    
    const totalRecords = ledger.length;
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const start = (page - 1) * limit;
    const end = start + limit;

    const transactions = ledger.slice(start, end);

    res.render("shops/transaction", {
      title: "Transactions",
      user: req.user,
      transactions,
      page,
      totalPages,
      from,
      to
    });

  } catch (err) {
    console.error("Transactions page error:", err);
    res.status(500).render("error/500");
  }
};




const getTodayBillPage = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const order = await Order.findOne({
      shop: req.user.id,
      deliveryDate: today
    });

    if (!order) {
      return res.render("shops/todayBill", {
        title: "Today's Bill",
        user: req.user,
        todayDate: new Date().toDateString(),
        boxes: 0,
        pricePerBox: 0,
        discountPerBox: 0,
        totalAmount: 0,
        paidToday: 0,
        remainingToday: 0,
        shopOutstanding: req.user.balance || 0,
        isFullyPaid: true,
        orderId: null
      });
    }

    
    const bill = await calculateTodayBill({
      shopId: req.user.id
    });

    if (!bill) {
      return res.redirect("/shop/dashboard");
    }

    
    res.render("shops/todayBill", {
      title: "Today's Bill",
      user: req.user,
      ...bill  
    });

  } catch (err) {
    console.error("Today bill error:", err);
    res.status(500).render("error/500");
  }
};


/* ================= EXPORT ================= */

module.exports = {
  getTodayBillPage,
  getShopDashboard,
  getPlaceOrderPage,
  createOrder,
  updateOrder,
  deleteOrder,
  getShopTransactions
};


