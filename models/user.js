// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true ,required: true},
  role: { type: String, enum: ['admin', 'salesman', 'shop'], required: true },
  location:{type:String},
  balance :{type :Number,default:0},
  blocked: {
  type: Boolean,
  default: false
}


  
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
