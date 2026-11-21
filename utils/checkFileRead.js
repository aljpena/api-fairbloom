require("dotenv").config();
const mongoose = require("mongoose");
const File = require("../models/File");

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.DB_NAME });
  const f = await File.findOne({ kind: "listing" }).select("+data");
  console.log("found:", !!f, "| hydrated data present:", !!(f && f.data), "| bytes:", f && f.data && f.data.length);
  await mongoose.connection.close();
  process.exit(0);
})();