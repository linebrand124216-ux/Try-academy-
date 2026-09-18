# Live Robotics Class — Registration & Payment Page

A single-page flow: intro video → "what brought you here" → personal details
→ ₦50,000 consent → Paystack payment → automatic confirmation email. A "no"
answer routes to a short "why not" page instead.

## Files

- `index.html` — the whole front end (video, questions, form, payment UI).
- `netlify/functions/verify-payment.js` — verifies the Paystack payment
  server-side and sends the confirmation email. This can't live in the HTML
  file because it needs your secret keys, which must never reach the browser.
- `netlify.toml` — tells Netlify where the function lives.

## Before you deploy

### 1. Add your video
In `index.html`, find:
```js
const VIDEO_EMBED_URL = "";
```
Set it to your video's **embed** URL, e.g. a YouTube link like
`https://www.youtube.com/embed/XXXXXXXXXXX`. Until you do, the page shows a
placeholder box instead of a broken video.

### 2. Firebase (stores registrations)
Use an existing Firebase project or create a new one, then enable **Firestore
Database**. In `index.html`, replace:
```js
const FIREBASE_CONFIG = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};
```
with the config object from Project Settings → your web app. This config is
meant to be public — Firebase security comes from Firestore rules, not from
hiding it.

A starting Firestore rule set for the `liveClassRegistrations` collection:
```
match /liveClassRegistrations/{docId} {
  allow create: if true;
  allow update: if request.resource.data.diff(resource.data).affectedKeys()
                  .hasOnly(['status', 'paidAt', 'paystackReference', 'consent', 'declineReason']);
  allow read, delete: if false;
}
```
This lets visitors create and update their own registration as they move
through the page, but no one can read the list of registrants from the
browser — you'll view them from the Firebase console.

### 3. Paystack (payment)
In `index.html`, replace:
```js
const PAYSTACK_PUBLIC_KEY = "pk_test_REPLACE_ME";
```
with your **public** key (starts with `pk_`) — safe to expose client-side.

Then, in the **Netlify dashboard** (not in any file) → Site settings →
Environment variables, add:
```
PAYSTACK_SECRET_KEY = sk_live_xxxxxxxx   (or sk_test_ while testing)
```
This is the key the function uses to double-check the payment really went
through before treating it as confirmed. Never put the secret key in
`index.html` — anything in that file is visible to every visitor.

### 4. Gmail (confirmation email)
This sends the confirmation email through your own Gmail account, using an
App Password rather than your normal password.

1. Turn on 2-Step Verification on your Google account, if it isn't already:
   myaccount.google.com/security → "2-Step Verification".
2. On the same Security page, find "App passwords" → create one (choose
   "Mail" as the app). Copy the 16-character password it gives you — it's
   shown only once.
3. In Netlify's environment variables, add both:
```
GMAIL_USER = youraddress@gmail.com
GMAIL_APP_PASSWORD = the 16-character app password (no spaces)
```
Never put either value directly in `index.html` or `verify-payment.js` —
they belong only in Netlify's environment variables.

This function depends on the `nodemailer` package, listed in `package.json`
at the project root — Netlify installs it automatically when it deploys.
Gmail's free sending limit is 500 emails/day, far more than this needs.

Want to switch to a proper email API later (e.g. once you have a domain)?
Only the "2. Send the confirmation email" block inside `verify-payment.js`
needs to change — everything else stays the same.

### 5. Price
The amount is set in two places and must match exactly, or payments will
fail verification:
- `index.html` → `const PRICE_NGN = 50000;`
- `netlify/functions/verify-payment.js` → `const EXPECTED_AMOUNT_KOBO = 50000 * 100;`

## Deploying
Use GitHub + "Import from Git," not Netlify's plain drag-and-drop dropzone.
Drag-and-drop only publishes static files — it's known to skip serverless
functions, which would leave payment verification and the confirmation
email silently not working.

1. Create a new GitHub repo and upload this whole folder to it (GitHub's
   web "Add file → Upload files" works fine — no Git commands needed),
   keeping the `netlify/functions/` structure intact.
2. In Netlify: **Add new site → Import an existing project → Deploy with
   GitHub**, and pick that repo.
3. Leave the build command blank and the publish directory as `.` —
   there's no build step; Netlify just needs to see `netlify.toml` to
   find the function.
4. Once it's deployed, add `PAYSTACK_SECRET_KEY`, `GMAIL_USER`, and
   `GMAIL_APP_PASSWORD` under Site settings → Environment variables, then
   redeploy so the function picks them up.

## How it decides a payment is real
The browser's Paystack popup only *claims* success — it's not proof, since
anyone could fake that callback. `verify-payment.js` re-checks the payment
directly with Paystack using your secret key, and only then does the page
show the confirmation screen and send the email. This is a lightweight setup
appropriate for a course registration flow, not a high-security payment
system — good enough here, but worth knowing if you ever build something
where fraud risk is higher.

## Where registrant data ends up
Every visitor who completes the details step gets a document in Firestore's
`liveClassRegistrations` collection — including people who say "no" (with
their reason) and people who abandon the page after entering their details.
That's useful for following up with anyone who didn't convert.
