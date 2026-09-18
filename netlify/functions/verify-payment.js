// Netlify Function: verify-payment
//
// Called by the browser after Paystack's popup reports a successful charge.
// This function re-checks the payment with Paystack directly (using the
// SECRET key, which never touches the browser) before trusting it, then
// sends the "payment received" email through your own Gmail account.
//
// Required environment variables (set these in the Netlify dashboard —
// Site settings > Environment variables — never in this file):
//   PAYSTACK_SECRET_KEY   e.g. sk_live_xxxxxxxx or sk_test_xxxxxxxx
//   GMAIL_USER            your full Gmail address, e.g. you@gmail.com
//   GMAIL_APP_PASSWORD    a 16-character App Password (not your regular
//                          Gmail password) — generate one at
//                          myaccount.google.com/security under
//                          "2-Step Verification" > "App passwords"
//
// This function needs the "nodemailer" package (declared in package.json
// at the project root) — Netlify installs it automatically during deploy.

const nodemailer = require("nodemailer");

const EXPECTED_AMOUNT_KOBO = 50000 * 100; // ₦50,000 — keep in sync with index.html's PRICE_NGN

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let reference, registrant;
  try {
    ({ reference, registrant } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ verified: false, message: "Bad request body" }) };
  }

  if (!reference || !registrant || !registrant.email) {
    return { statusCode: 400, body: JSON.stringify({ verified: false, message: "Missing reference or registrant details" }) };
  }

  try {
    // 1. Verify the transaction with Paystack.
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    const verifyData = await verifyRes.json();

    const paidOk =
      verifyRes.ok &&
      verifyData?.data?.status === "success" &&
      verifyData?.data?.amount === EXPECTED_AMOUNT_KOBO;

    if (!paidOk) {
      return { statusCode: 400, body: JSON.stringify({ verified: false, message: "Payment could not be verified" }) };
    }

    // 2. Send the confirmation email through Gmail.
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });

      await transporter.sendMail({
        from: `"Gezmo Boy Robotics Class" <${process.env.GMAIL_USER}>`,
        to: registrant.email,
        subject: "Payment received — your spot is confirmed",
        html: `
          <p>Hi ${escapeHtml(registrant.name || "there")},</p>
          <p>We've received your payment of ₦50,000 for the live robotics class. Your spot is confirmed.</p>
          <p>Sessions run live on Zoom every <strong>Monday, Wednesday and Friday</strong> for three weeks. Your Zoom link and everything else you need will be sent to this email before the first session.</p>
          <p>Talk soon,<br/>Gezmo Boy</p>
        `
      });
    } catch (emailErr) {
      // Payment is genuinely verified even if the email failed to send —
      // don't tell the registrant their payment failed. Log it so it can be
      // followed up manually.
      console.error("Payment verified but email failed:", emailErr);
    }

    return { statusCode: 200, body: JSON.stringify({ verified: true }) };
  } catch (err) {
    console.error("verify-payment error:", err);
    return { statusCode: 500, body: JSON.stringify({ verified: false, message: "Server error" }) };
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
