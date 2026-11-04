const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { EJSON } = mongoose.mongo.BSON; // the driver's own bson, so the types always match

const User = require("../models/User");
const Listing = require("../models/Listing");
const Transaction = require("../models/Transaction");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Deal = require("../models/Deal");
const Erasure = require("../models/Erasure");
const { eraseUser } = require("./eraseService");

const FORMAT = "fairbloom-backup";
const VERSION = 1;

// Raw collections are used (not queries through the models), so fields hidden
// with `select: false` (password hash, OTP hash) are included for a faithful restore.
const MODELS = {
  users: User,
  listings: Listing,
  transactions: Transaction,
  conversations: Conversation,
  messages: Message,
  deals: Deal,
  erasures: Erasure,
};

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** Reads every collection into one object. Run it when the system is quiet. */
async function createBackup() {
  const data = {};
  const counts = {};
  for (const [name, Model] of Object.entries(MODELS)) {
    data[name] = await Model.collection.find({}).toArray();
    counts[name] = data[name].length;
  }
  return {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date(),
    database: mongoose.connection.name,
    counts,
    data,
  };
}

/** Backup object -> file bytes. Encrypted when BACKUP_PASSPHRASE is set. */
function serialize(backup) {
  const text = EJSON.stringify(backup); // keeps ObjectIds and Dates intact
  const pass = process.env.BACKUP_PASSPHRASE;
  if (!pass) return { buffer: Buffer.from(text, "utf8"), encrypted: false };

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(pass, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);

  const envelope = {
    format: `${FORMAT}-encrypted`,
    version: VERSION,
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
  return { buffer: Buffer.from(JSON.stringify(envelope), "utf8"), encrypted: true };
}

function saveBackupToDisk(backup, prefix = "backup") {
  const dir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, "..", "backups"));
  fs.mkdirSync(dir, { recursive: true });
  const { buffer, encrypted } = serialize(backup);
  const file = path.join(dir, `fairbloom-${prefix}-${stamp()}.json`);
  fs.writeFileSync(file, buffer, { mode: 0o600 });
  return { file, encrypted };
}

/** File bytes -> validated backup object. Throws a readable error if anything is wrong. */
function parseBackup(buffer) {
  const text = buffer.toString("utf8");

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON, so it isn't a FairBloom backup");
  }

  let plain = text;
  if (json.format === `${FORMAT}-encrypted`) {
    const pass = process.env.BACKUP_PASSPHRASE;
    if (!pass) throw new Error("This backup is encrypted. Set BACKUP_PASSPHRASE in .env first");
    try {
      const key = crypto.scryptSync(pass, Buffer.from(json.salt, "base64"), 32);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(json.iv, "base64"));
      decipher.setAuthTag(Buffer.from(json.tag, "base64"));
      plain = Buffer.concat([
        decipher.update(Buffer.from(json.data, "base64")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("Couldn't decrypt: wrong BACKUP_PASSPHRASE, or the file is damaged");
    }
  }

  const backup = EJSON.parse(plain);
  const warnings = [];

  if (!backup || backup.format !== FORMAT) throw new Error("Not a FairBloom backup file");
  if (backup.version !== VERSION) throw new Error(`Unsupported backup version: ${backup.version}`);

  for (const name of Object.keys(MODELS)) {
    const docs = backup.data && backup.data[name];
    if (!Array.isArray(docs)) throw new Error(`Backup is missing the '${name}' collection`);
    if (docs.some((d) => !d || !d._id)) throw new Error(`Backup has a malformed record in '${name}'`);
    if (!backup.counts || backup.counts[name] !== docs.length) {
      throw new Error(`Record count mismatch in '${name}' (the file may be truncated)`);
    }
  }

  if (!backup.data.users.some((u) => u.role === "admin")) {
    warnings.push("This backup has no admin account. You'd be locked out of the admin routes after restoring.");
  }

  return { backup, warnings };
}

async function writeAll(data) {
  for (const [name, Model] of Object.entries(MODELS)) {
    await Model.collection.deleteMany({});
    if (data[name].length) await Model.collection.insertMany(data[name]);
  }
}

/**
 * REPLACES everything in the database with the backup's contents.
 * If it fails partway, the previous data (snapshot) is written back.
 */
async function restoreBackup(backup, snapshot = null) {
  const rollbackPoint = snapshot || (await createBackup());

  // Makes sure collections and unique indexes exist (matters for an empty database).
  await Promise.all(Object.values(MODELS).map((M) => M.init()));

  try {
    await writeAll(backup.data);
  } catch (err) {
    try {
      await writeAll(rollbackPoint.data);
    } catch {
      err.rollbackFailed = true;
    }
    throw err;
  }
}

/**
 * Erasures recorded AFTER the backup was made aren't in the backup, so they're
 * merged back in from the pre-restore data, then every ledger entry is re-applied.
 * This keeps a restore from resurrecting people who were already erased.
 */
async function reapplyErasures(currentLedger = []) {
  for (const e of currentLedger) {
    await Erasure.updateOne({ userId: e.userId }, { $setOnInsert: e }, { upsert: true });
  }

  let reapplied = 0;
  const ledger = await Erasure.find({}).lean();
  for (const e of ledger) {
    try {
      const result = await eraseUser(e.userId, { transactions: e.transactions, skipLedger: true });
      if (result) reapplied += 1;
    } catch (err) {
      console.error("[FairBloom] Couldn't re-apply an erasure:", err.message);
    }
  }
  return reapplied;
}

module.exports = {
  createBackup,
  serialize,
  saveBackupToDisk,
  parseBackup,
  restoreBackup,
  reapplyErasures,
  stamp,
};