require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { createBackup, saveBackupToDisk } = require("./backupService");

(async () => {
  try {
    await connectDB();
    const backup = await createBackup();
    const { file, encrypted } = saveBackupToDisk(backup, "backup");

    console.log("[FairBloom] Backup saved:", file);
    console.log("[FairBloom] Records:", JSON.stringify(backup.counts));
    if (!encrypted) {
      console.warn("[FairBloom] Not encrypted. Set BACKUP_PASSPHRASE in .env to encrypt backups.");
    }
    console.warn(
      "[FairBloom] This file contains personal data. Store it securely and delete it when the study ends."
    );

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error("[FairBloom] Backup failed:", err.message);
    process.exit(1);
  }
})();
