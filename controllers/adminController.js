
const DailyPrice = require("../models/dailyPrices")
const User = require("../models/user")
const Order = require("../models/order")
const Payment = require("../models/payment");
const { calculateTodayBill } =
  require("../utils/billCalculator");


const getDashboard = async (req, res) => {
  try {
    const user = req.user;

  
    const todayISO = new Date().toISOString().slice(0, 10);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().slice(0, 10);

   
    const todayPriceDoc = await DailyPrice.findOne({
      priceDateStr: todayISO
    }).lean();

    const todayPricePerBox = todayPriceDoc?.pricePerBox || 0;

 
    const todayOrders = await Order.find({
      deliveryDate: todayISO
    }).lean();

    const boxesToday = todayOrders.reduce(
      (sum, o) => sum + o.boxes,
      0
    );

  
    let todayTotalBill = 0;

    for (const o of todayOrders) {
      const discount = o.discountPerBox || 0;
      todayTotalBill +=
        o.boxes * todayPricePerBox -
        o.boxes * discount;
    }

    const startOfToday = new Date(todayISO);
    const endOfToday = new Date(todayISO);
    endOfToday.setHours(23, 59, 59, 999);

    const paymentsTodayAgg = await Payment.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startOfToday,
            $lte: endOfToday
          }
        }
      },
      {
        $group: {
          _id: null,
          totalPaid: { $sum: "$paidAmount" }
        }
      }
    ]);

    const amountCollectedToday =
      paymentsTodayAgg[0]?.totalPaid || 0;

    
    const pendingAmountToday =
      Math.max(todayTotalBill - amountCollectedToday, 0);

    
    const page = parseInt(req.query.page || "1");
    const limit = 3;
    const skip = (page - 1) * limit;

    const filter = { deliveryDate: tomorrowISO };

    const totalOrders = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .populate("shop", "name location phone")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const totalPages = Math.ceil(totalOrders / limit) || 1;

    
const last7Days = [];
const collectedArr = [];
const pendingArr = [];

for (let i = 6; i >= 0; i--) {
  const d = new Date();
  d.setDate(d.getDate() - i);

  const dayISO = d.toISOString().slice(0, 10);
  last7Days.push(dayISO);

 
  const priceDoc = await DailyPrice.findOne({ priceDateStr: dayISO }).lean();
  const price = priceDoc?.pricePerBox || 0;


  const orders = await Order.find({ deliveryDate: dayISO }).lean();

  let totalBill = 0;
  for (const o of orders) {
    totalBill += o.boxes * price - o.boxes * (o.discountPerBox || 0);
  }

 
  const start = new Date(dayISO);
  const end = new Date(dayISO);
  end.setHours(23, 59, 59, 999);

  const paymentsAgg = await Payment.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    },
    {
      $group: {
        _id: null,
        paid: { $sum: "$paidAmount" }
      }
    }
  ]);

  const collected = paymentsAgg[0]?.paid || 0;
  const pending = Math.max(totalBill - collected, 0);

  collectedArr.push(collected);
  pendingArr.push(pending);
}


   
    res.render("admin/dashboard", {
      title: "Dashboard",
      user,

      todayPricePerBox,
      todayDate: new Date().toDateString(),

      boxesToday,
      amountCollectedToday,
      pendingAmountToday,

      tomorrowOrders: orders,
      tomorrowISO,
      page,
      totalPages,
        chartLabels: last7Days,
  chartCollected: collectedArr,
  chartPending: pendingArr
    });

  } catch (err) {
    console.log("Dashboard Error:", err);
    return res.status(500).render("error/500");
  }
};



const getPaymentsPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    const { from, to } = req.query;

    /* ================= DATE FILTER ================= */
    const dateFilter = {};

    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        dateFilter.createdAt.$lte = end;
      }
    }

    const totalPayments = await Payment.aggregate([
      { $match: dateFilter },
      { $count: "count" }
    ]);

    const total = totalPayments[0]?.count || 0;
    const totalPages = Math.ceil(total / limit) || 1;

   
    const payments = await Payment.aggregate([
      { $match: dateFilter },

      {
        $lookup: {
          from: "users",
          localField: "shop",
          foreignField: "_id",
          as: "shop"
        }
      },
      { $unwind: "$shop" },

      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "order"
        }
      },
      { $unwind: "$order" },

      {
        $lookup: {
          from: "users",
          localField: "collectedBy",
          foreignField: "_id",
          as: "collector"
        }
      },
      {
        $unwind: {
          path: "$collector",
          preserveNullAndEmptyArrays: true
        }
      },

      {
        $project: {
          date: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt"
            }
          },
          shopName: "$shop.name",
          orderId: "$order._id",
          amount: "$finalAmount",
          method: "$method",
          collectedBy: "$collector.name",
          note: 1
        }
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    res.render("admin/payments", {
      title: "Payments",
      user: req.user,
      payments,
      page,
      totalPages,
      from,
      to
    });

  } catch (err) {
    console.error("Payments error:", err);
    res.status(500).render("error/500");
  }
};




const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const role = req.query.role || "";

    const regex = new RegExp(search, "i");

    // 🔹 Build query
    const query = {
      role: { $ne: "admin" }
    };

    if (search) {
      query.$or = [
        { name: regex },
        { phone: regex }
      ];
    }

    if (role) {
      query.role = role;
    }

    const total = await User.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    const users = await User.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

   
    const formatted = users.map(u => ({
      originalId: u._id,
      id: u._id.toString().slice(-6).toUpperCase(),
      name: u.name,
      phone: u.phone,
      location: u.location || "-",
      role: u.role,
      balance: u.balance || 0,
      initials: u.name.substring(0, 2).toUpperCase(),
      avatar: ["yellow", "mint", "blue", "pink", "gray"][
        Math.floor(Math.random() * 5)
      ]
    }));

    res.render("admin/users", {
      title: "Users",
      user: req.user,
      users: formatted,
      page,
      totalPages,
      search,
      role
    });

  } catch (err) {
    console.log("Users page error:", err);
    res.status(500).render("error/500");
  }
};






const setDailyPrice = async (req, res) => {
  try {
    const { price, date } = req.body;
    const userId = req.user.id;

    if (!price || !date) {
      return res.status(400).send("Price and date required");
    }

    const priceDate = new Date(date);
    const dateStr = priceDate.toISOString().slice(0, 10);

    const exists = await DailyPrice.findOne({ priceDateStr: dateStr });
    if (exists) {
      return res.redirect(
        "/admin/daily-prices?error=Price already exists for this date"
      );
    }

    await DailyPrice.create({
      priceDate,
      priceDateStr: dateStr,
      pricePerBox: Number(price),
      createdBy: userId
    });

    
    const orders = await Order.find({ deliveryDate: dateStr });

    for (const order of orders) {
      const discount = Number(order.discountPerBox || 0);
      const newTotal =
        order.boxes * Math.max(Number(price) - discount, 0);

      const oldTotal = Number(order.totalAmount || 0);
      const difference = newTotal - oldTotal;

     
      await Order.updateOne(
        { _id: order._id },
        { $set: { totalAmount: newTotal } }
      );

     
      await User.findByIdAndUpdate(
        order.shop,
        { $inc: { balance: difference } }
      );
    }

    return res.redirect(
      "/admin/daily-prices?success=Daily price set successfully"
    );

  } catch (err) {
    console.error("Daily price error:", err);
    return res.status(500).render("error/500");
  }
};


const getdailyPrices = async (req, res) => {
  const user = req.user;

  const todayISO = new Date().toISOString().slice(0, 10);

  const todayPriceData = await DailyPrice.findOne({ priceDate: todayISO });

  const recent = await DailyPrice.find().sort({ priceDate: -1 }).limit(5);

 const recentPrices = recent.map(p => ({
  id: p._id,
  displayDate: new Date(p.priceDate).toDateString(),
  price: p.pricePerBox,
  editable: p.priceDateStr === todayISO
}));

  res.render("admin/dailyPrices", {
    title: "Daily Prices",
    user,
    todayISO,
    todayPrice: todayPriceData?.pricePerBox || "",
    recentPrices
  });
};

const editDailyPricePage = async (req, res) => {
  try {
    const priceId = req.params.id;

    const price = await DailyPrice.findById(priceId)
    if (!price) return res.status(404).json({ success: false, message: "Price not found" });


    res.json({ success: true, price });

  } catch (err) {
    console.log("Edit page error:", err);
    return res.status(500).render("error/500");
  }
}

const updateDailyPrice = async (req, res) => {
  try {
    const priceId = req.params.id;
    const { price, date } = req.body;

    const existing = await DailyPrice.findById(priceId);
    if (!existing) {
      return res.redirect("/admin/daily-prices?error=Price not found");
    }

    const duplicate = await DailyPrice.findOne({
      priceDateStr: date,
      _id: { $ne: priceId }
    });

    if (duplicate) {
      return res.redirect(
        "/admin/daily-prices?error=Another price already exists for this date"
      );
    }

    const oldPrice = Number(existing.pricePerBox);
    const newPrice = Number(price);
    const dateStr = date;

    const orders = await Order.find({ deliveryDate: dateStr });

    for (const order of orders) {
      const discount = Number(order.discountPerBox || 0);

      const oldBill =
        order.boxes * Math.max(oldPrice - discount, 0);

      const newBill =
        order.boxes * Math.max(newPrice - discount, 0);

      const shop = await User.findById(order.shop);
      if (shop) {
        shop.balance =
          Number(shop.balance || 0) - oldBill + newBill;
        await shop.save();
      }

      order.totalAmount = newBill;
      await order.save();
    }

    await DailyPrice.findByIdAndUpdate(priceId, {
      pricePerBox: newPrice,
      priceDate: new Date(dateStr),
      priceDateStr: dateStr
    });

    return res.redirect(
      "/admin/daily-prices?success=Price updated correctly"
    );

  } catch (err) {
    console.log("Update error:", err);
    return res.status(500).render("error/500");
  }
};


/*
adding user  in user page
*/
const addUser = async (req, res) => {
  try {
    const { name, phone, location, role } = req.body;

    if (!name || !phone || !role) {
      return res.status(400).send("all required field missing");
    }
    const exists = await User.findOne({ phone });
    if (exists) {
      return res.redirect("/admin/users?error=User with this phone already exists");
    }

    const user = await User.create({
      name,
      phone,
      location,
      role
    });
return res.redirect("/admin/users?success=User added successfully");

    

  } catch (err) {
    console.log("Add user error:", err);
    return res.status(500).send("Server Error");
  }
}

// search bar in user.js
const searchUsers = async (req, res) => {
  try {
    const q = req.query.q || "";
    const regex = new RegExp(q, "i");

    let filter = {
      role: "shop",
      $or: [{ name: regex }, { phone: regex }]
    };

    const users = await User.find(filter);

    res.json(users);

  } catch (err) {
    console.log("Search error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
const getUserDetailsPage = async (req, res) => {
  try {
    const admin = req.user;
    const userId = req.params.id;

    const tab = req.query.tab || "summary";
    const page = parseInt(req.query.page || "1");
    const limit = 8;
    const skip = (page - 1) * limit;

    const { from, to } = req.query;

    const viewedUser = await User.findById(userId);
    if (!viewedUser) {
      return res.redirect("/admin/users?error=User not found");
    }

  if (viewedUser.role === "salesman") {
      const paymentFilter = { collectedBy: viewedUser._id };

      if (from || to) {
        paymentFilter.createdAt = {};
        if (from) paymentFilter.createdAt.$gte = new Date(from);
        if (to) paymentFilter.createdAt.$lte = new Date(to);
      }

      const totalPayments = await Payment.countDocuments(paymentFilter);

      const paymentsRaw = await Payment.find(paymentFilter)
        .populate("shop", "name location")
        .populate("order")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const collections = [];

      for (const p of paymentsRaw) {
        if (!p.order) continue;

        const bill = await calculateTodayBill({ orderId: p.order._id });
        if (!bill) continue;

        collections.push({
          date: p.createdAt.toISOString().slice(0, 10),
          shop: p.shop?.name || "N/A",
          boxes: p.order.boxes,
          pricePerBox: bill.pricePerBox,
          total: bill.totalAmount,
          collected: p.paidAmount
        });
      }

      return res.render("admin/userDetails", {
        user: admin,
        viewedUser,
        tab: "salesman",
        collections,
        page,
        totalPages: Math.ceil(totalPayments / limit),
        from,
        to
      });
    }



    const orderFilter = { shop: viewedUser._id };
    if (from || to) {
      orderFilter.deliveryDate = {};
      if (from) orderFilter.deliveryDate.$gte = from;
      if (to) orderFilter.deliveryDate.$lte = to;
    }

    const ordersRaw = await Order.find(orderFilter).sort({ deliveryDate: -1 });

   

    let totalBoxes = 0;
    let totalAmount = 0;
    let totalPaid = 0;

    for (const order of ordersRaw) {
      totalBoxes += order.boxes;

      const bill = await calculateTodayBill({ orderId: order._id });
      if (!bill) continue;

      totalAmount += bill.totalAmount;
      totalPaid += bill.paidToday;
    }

    const summary = {
      boxes: totalBoxes,
      amount: totalAmount,
      paid: totalPaid,
      balance: totalAmount - totalPaid
    };

   

    let orders = [];
    let payments = [];
    let totalPages = 1;

    if (tab === "orders") {
  const totalOrders = ordersRaw.length;
  totalPages = Math.ceil(totalOrders / limit);

  const pageOrders = ordersRaw.slice(skip, skip + limit);

  for (const o of pageOrders) {
    const bill = await calculateTodayBill({ orderId: o._id });
    if (!bill) continue;

    orders.push({
      date: o.deliveryDate,
      boxes: o.boxes,

    
      pricePerBox: bill.pricePerBox,
      discountPerBox: o.discountPerBox || 0,

      total: bill.totalAmount,
      paid: bill.paidToday,

      status:
        bill.paidToday === 0
          ? "Pending"
          : bill.paidToday < bill.totalAmount
          ? "Partial"
          : "Paid"
    });
  }
}



  if (tab === "payments") {
  const paymentsRaw = await Payment.find({ shop: viewedUser._id })
    .populate("order") 
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
const totalPayments = await Payment.countDocuments({ shop: viewedUser._id });
totalPages = Math.ceil(totalPayments / limit);


  payments = [];
let runningBalance = summary.balance;
  for (const p of paymentsRaw) {
    if (!p.order) continue;

 
    const bill = await calculateTodayBill({ orderId: p.order._id });
    if (!bill) continue;

    payments.push({
      date: p.createdAt.toISOString().slice(0, 10),
      boxes: p.order.boxes,
      pricePerBox: bill.pricePerBox,
      total: bill.totalAmount,
      paid: p.paidAmount,
 balance: runningBalance, 
      method: p.method,
      note: p.note || "-"
    });
    runningBalance += p.paidAmount;
  }
}

    res.render("admin/userDetails", {
      user: admin,
      viewedUser,
      tab,
      summary,
      orders,
      payments,
      page,
      totalPages,
      from,
      to
    });

  } catch (err) {
    console.error("User details page error:", err);
    res.status(500).render("error/500");
  }
};

// create orders in orders page



const createOrders = async (req, res) => {
  try {
    const { shop, deliveryDate, boxes, discountPerBox } = req.body;

    if (!shop || !deliveryDate || !boxes) {
      return res.redirect("/admin/orders?error=Missing fields");
    }

    const boxCount = Number(boxes);
    const discount = Number(discountPerBox || 0);

    const exists = await Order.findOne({ shop, deliveryDate });
    if (exists) {
      return res.redirect("/admin/orders?error=Order already exists");
    }

    // 🔹 Find daily price (use dateStr if possible)
    const priceDoc = await DailyPrice.findOne({
      priceDateStr: deliveryDate
    });

    let totalAmount = 0;

    if (priceDoc) {
      totalAmount =
        boxCount * Math.max(priceDoc.pricePerBox - discount, 0);
    }

    
    const order = await Order.create({
      shop,
      deliveryDate,
      boxes: boxCount,
      discountPerBox: discount,
      totalAmount
    });

   
    if (totalAmount > 0) {
      await User.findByIdAndUpdate(
        shop,
        { $inc: { balance: totalAmount } }
      );
    }

    return res.redirect("/admin/orders?success=Order created");

  } catch (err) {
    console.error("Create Order Error:", err);
    return res.redirect("/admin/orders?error=Create failed");
  }
};



const isTomorrowOrder = (deliveryDate) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  return deliveryDate === tomorrowISO;
};

const getOrdersPage = async (req, res) => {
  try {
    const user = req.user;

    const selectedDate =
      req.query.date ||
      new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    
    const page = parseInt(req.query.page || "1");
    const limit = 3;
    const skip = (page - 1) * limit;


    const shops = await User.find({ role: "shop" }).select("name _id");

  
    const filter = { deliveryDate: selectedDate };

    const totalOrders = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .populate("shop", "name phone location")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

   
    const ordersForDate = orders.map(o => ({
      ...o,
      editable: isTomorrowOrder(o.deliveryDate)
    }));

    const totalPages = Math.ceil(totalOrders / limit) || 1;

    res.render("admin/orders", {
      title: "Orders",
      user,
      shops,
      deliveryDateValue: selectedDate,
      ordersForDate,
      page,
      totalPages
    });

  } catch (err) {
    console.log("Get Orders Error:", err);
    res.status(500).render("error/500");
  }
};


const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

const updateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.redirect("/admin/orders?error=Order not found");
    }

    if (!isTomorrowOrder(order.deliveryDate)) {
      return res.redirect(
        "/admin/orders?error=Only tomorrow orders allowed"
      );
    }

    const oldTotal = Number(order.totalAmount || 0);

    const newBoxes = Number(req.body.boxes) || 0;
    const newDiscount = Number(req.body.discountPerBox) || 0;
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
      `/admin/orders?date=${deliveryDate}&success=Order updated correctly`
    );

  } catch (err) {
    console.error("Update Order Error:", err);
    return res.status(500).render("error/500");
  }
};



const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.redirect("/admin/orders?error=Order not found");
    }

    if (!isTomorrowOrder(order.deliveryDate)) {
      return res.redirect(
        "/admin/orders?error=Only tomorrow orders can be deleted"
      );
    }

    const billAmount = Number(order.totalAmount || 0);

    const shop = await User.findById(order.shop);
    if (shop) {
      shop.balance = Number(shop.balance || 0) - billAmount;
      await shop.save();
    }

  
    await Order.findByIdAndDelete(order._id);

    return res.redirect(
      "/admin/orders?date=" + order.deliveryDate + "&success=Order deleted"
    );

  } catch (err) {
    console.log("Delete Order Error:", err);
    return res.status(500).render("error/500");
  }
};


const logout = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.clearCookie("token");
    res.redirect("/auth/login");

  });
};
const toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.redirect("/admin/users?error=User not found");
    }

    user.blocked = !user.blocked;
    await user.save();

    const msg = user.blocked ? "User blocked" : "User unblocked";
    res.redirect(`/admin/users/${user._id}?success=${msg}`);
  } catch (err) {
    console.error("Block user error:", err);
    res.redirect("/admin/users?error=Action failed");
  }
};


module.exports = {
  logout,
  getDashboard,
  getdailyPrices,
  setDailyPrice,
  editDailyPricePage,
  updateDailyPrice,
  getUsers,
  addUser,
  searchUsers,
  getUserDetailsPage,
  getPaymentsPage,
  getOrdersPage,
  createOrders,
  deleteOrder, updateOrder,
  getOrderById,
  toggleBlockUser
}



