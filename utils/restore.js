require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const {
  createBackup,
  saveBackupToDisk,
  parseBackup,
  restoreBackup,
  reapplyErasures,
} = require("./backupService");

(async () => {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Usage: npm run restore -- <path-to-backup-file>");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseBackup(fs.readFileSync(path.resolve(fileArg)));
  } catch (err) {
    console.error("[FairBloom] Can't use that file:", err.message);
    process.exit(1);
  }
  const { backup, warnings } = parsed;

  await connectDB();
  const dbName = mongoose.connection.name;

  console.log(`\nBackup made : ${backup.createdAt.toISOString()} (from database '${backup.database}')`);
  console.log("Contains    :", JSON.stringify(backup.counts));
  warnings.forEach((w) => console.warn("WARNING     :", w));
  console.log(`\nThis will REPLACE ALL DATA in database '${dbName}'.`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`Type the database name (${dbName}) to continue: `);
  rl.close();

  if (answer.trim() !== dbName) {
    console.log("Cancelled. Nothing was changed.");
    await mongoose.connection.close();
    process.exit(0);
  }

  // Safety net: save what's there now, so even a mistaken restore can be undone.
  const snapshot = await createBackup();
  const saved = saveBackupToDisk(snapshot, "pre-restore");
  console.log("Saved current data first:", saved.file);

  try {
    await restoreBackup(backup, snapshot);
  } catch (err) {
    console.error("\n[FairBloom] Restore FAILED:", err.message);
    console.error(
      err.rollbackFailed
        ? `Automatic rollback also failed. Restore manually from: ${saved.file}`
        : "The previous data was put back automatically."
    );
    process.exit(1);
  }

  const reapplied = await reapplyErasures(snapshot.data.erasures);
  console.log("\n[FairBloom] Restore complete.");
  if (reapplied) console.log(`[FairBloom] Re-applied ${reapplied} earlier participant erasure(s).`);
  console.log("[FairBloom] Restart the server so connected apps and sockets reconnect cleanly.");

  await mongoose.connection.close();
  process.exit(0);
})();