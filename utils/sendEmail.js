const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE ?? "true") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
  });
  return transporter;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendOtpEmail(to, name, otp, expiryMinutes) {
  const t = getTransporter();

  if (!t) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email is not configured");
    }
    // Development only: show the code in the terminal instead of emailing it.
    console.log(`[FairBloom] (DEV) SMTP not configured. OTP for ${to}: ${otp}`);
    return;
  }

  await t.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to,
    subject: "Your FairBloom verification code",
    text:
      `Hi ${name},\n\nYour FairBloom verification code is: ${otp}\n\n` +
      `It expires in ${expiryMinutes} minutes. If you didn't sign up, you can ignore this email.`,
    html:
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>Your FairBloom verification code is:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${otp}</p>` +
      `<p>It expires in ${expiryMinutes} minutes. If you didn't sign up, you can ignore this email.</p>`,
  });
}

/** Create the pooled connection at startup so the first signup is not slow. */
const warmUpEmail = () => void getTransporter();

module.exports = { sendOtpEmail, warmUpEmail };