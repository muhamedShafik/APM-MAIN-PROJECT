const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
   shop:{
    type : mongoose.Schema.Types.ObjectId,
    ref: "User",
    required : true
   },
   boxes:{
    type: Number,
    required :true
   },
   discountPerBox:{
    type:Number,
    default:0
   },
   deliveryDate:{
    type: String,
    required :true
   },
   totalAmount: {
  type: Number,
  default: 0
},

paymentStatus: {
  type: String,
  enum: ["UNPAID", "PARTIAL", "PAID"],
  default: "UNPAID"
}


},{timestamps:true});
module.exports =mongoose.model("Order",orderSchema)