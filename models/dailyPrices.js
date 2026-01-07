// models/User.js
const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema({
  priceDate: { type: Date, required: true },
  priceDateStr: { type: String, required: true }, // 👈 ADD THIS
  pricePerBox: { type: Number, required: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
});

module.exports = mongoose.model('daily_prices', priceSchema);
