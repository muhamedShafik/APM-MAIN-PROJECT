const mongoose = require("mongoose")
 const connectDB =async()=>{
    try {
        await mongoose.connect("mongodb+srv://muhammedshafik9544_db_user:YiPFY86veoIqtzCb@apm.vka3grm.mongodb.net/APM?retryWrites=true&w=majority")
    console.log("Atles mongdb connoected")

    } catch (error) {
        console.log(error,"db connection error")
    }
 }
 module.exports = connectDB

