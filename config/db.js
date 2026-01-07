const mongoose = require("mongoose")
 const connectDB =async()=>{
    try {
        await mongoose.connect("mongodb://localhost:27017/APM")
    console.log("mongdb connoected")

    } catch (error) {
        console.log(error,"db connection error")
    }
 }
 module.exports = connectDB