const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const { MongoStore } = require('connect-mongo');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
require('dotenv').config();

const app = express();
connectDB();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    mongoUrl: 'mongodb+srv://muhammedshafik9544_db_user:YiPFY86veoIqtzCb@apm.vka3grm.mongodb.net/APM?retryWrites=true&w=majority',
    collectionName: 'sessions',
    ttl: 24 * 60 * 60
  }),
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    secure: false 
  }
}));



app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


const authRoutes = require('./routes/authRoutes');
app.use('/auth', authRoutes);
app.use('/admin', require('./routes/admin/adminRoutes'));
app.use('/sales', require('./routes/salesman/salesRoutes.js'));
app.use('/shop', require('./routes/shops/shopRoutes.js'));


const paymentRoutes = require("./routes/paymentRoutes");
app.use("/payment", paymentRoutes);

app.use((req, res, next) => {
  res.locals.razorpayKey = process.env.RAZORPAY_KEY_ID;
  next();
});
require("dotenv").config();


app.get('/', (req, res) => {
  res.redirect('auth/login');
});


app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});
app.use((req, res) => {
  res.status(404).render("error/404", { url: req.originalUrl });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(` APM running on http://localhost:${PORT}`);
  
});
