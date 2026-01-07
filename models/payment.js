const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    billAmount: {
      type: Number,
      required: true,
    },
    paidAmount: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
   finalAmount: {
  type: Number,
  required: true,
  default: function () {
    return this.paidAmount;
  }
},
    method: {
      type: String,
      enum: ["COD", "ONLINE"],
      required: true,
    },
    note: String,
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
