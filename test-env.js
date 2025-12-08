require("dotenv").config({ path: __dirname + "/.env" });
console.log("MONGODB_URI:", process.env.MONGODB_URI);