require("dotenv").config();
const readline = require("readline/promises");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { purgeAllParticipantData } = require("./eraseService");

const PHRASE = "DELETE ALL PARTICIPANT DATA";

(async () => {
  await connectDB();
  const dbName = mongoose.connection.name;

  console.log(`\nThis permanently deletes every farmer/buyer account and all listings,`);
  console.log(`transactions, conversations, messages and deals in database '${dbName}'.`);
  console.log("Admin accounts are kept.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type "${PHRASE}" to continue: `);
  rl.close();

  if (answer.trim() !== PHRASE) {
    console.log("Cancelled. Nothing was deleted.");
    await mongoose.connection.close();
    process.exit(0);
  }

  const result = await purgeAllParticipantData();
  console.log("\n[FairBloom] Purged:", JSON.stringify(result));
  console.log(
    "[FairBloom] Backup files still contain the old data. Delete them too (backups/ folder)."
  );

  await mongoose.connection.close();
  process.exit(0);
})();
