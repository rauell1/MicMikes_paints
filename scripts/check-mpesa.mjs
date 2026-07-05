// scripts/check-mpesa.mjs
// Verifies the configured Daraja credentials actually authenticate and (in
// sandbox) accept an STK push. Prints only non-secret outcomes — never the
// token, keys, or passkey. Run with: node --env-file=<pulled-env> scripts/check-mpesa.mjs
//
// Safe by design: if MPESA_ENVIRONMENT=production it verifies OAuth only and
// does NOT initiate a live STK push (which could trigger a real charge).

const env = process.env.MPESA_ENVIRONMENT ?? "(unset)";
const isProd = env === "production";
const base = isProd ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

const need = ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY"];
const missing = need.filter((k) => !process.env[k]);

console.log(`MPESA_ENVIRONMENT   = ${env}  → base ${base}`);
console.log(`MPESA_SHORTCODE     = ${process.env.MPESA_SHORTCODE ?? "(unset)"}`);
console.log(`MPESA_CALLBACK_URL  = ${process.env.MPESA_CALLBACK_URL ?? "(unset)"}`);
console.log(`Present creds        : ${need.filter((k) => process.env[k]).join(", ") || "none"}`);
if (missing.length) {
  console.log(`MISSING              : ${missing.join(", ")}`);
  process.exit(1);
}

function eatTimestamp() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function main() {
  // 1) OAuth — validates consumer key/secret against the chosen base.
  const creds = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString("base64");
  const authRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  if (!authRes.ok) {
    console.log(`\n❌ OAuth FAILED (${authRes.status}): ${(await authRes.text()).slice(0, 200)}`);
    console.log("   → consumer key/secret are not valid for this environment.");
    process.exit(2);
  }
  const { access_token } = await authRes.json();
  console.log(`\n✅ OAuth OK — access token received (len ${String(access_token).length}).`);

  if (isProd) {
    console.log("\n⚠ MPESA_ENVIRONMENT=production — skipping live STK push to avoid a real charge.");
    console.log("  OAuth verified against production. Set MPESA_ENVIRONMENT=sandbox to test STK end-to-end.");
    return;
  }

  // 2) STK push — sandbox only. Test MSISDN 254708374149, KES 1.
  const timestamp = eatTimestamp();
  const shortCode = process.env.MPESA_SHORTCODE;
  const password = Buffer.from(`${shortCode}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");
  const callback = process.env.MPESA_CALLBACK_URL ?? "https://mic-mikes-paints.vercel.app/api/mpesa/callback";

  const stkRes = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${access_token}` },
    body: JSON.stringify({
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: 1,
      PartyA: "254708374149",
      PartyB: shortCode,
      PhoneNumber: "254708374149",
      CallBackURL: callback,
      AccountReference: "MicMikes-CHECK",
      TransactionDesc: "Daraja sandbox connectivity check",
    }),
  });
  const data = await stkRes.json().catch(() => ({}));
  if (stkRes.ok && data.ResponseCode === "0") {
    console.log(`\n✅ STK Push ACCEPTED by sandbox.`);
    console.log(`   CheckoutRequestID: ${data.CheckoutRequestID}`);
    console.log(`   CustomerMessage:   ${data.CustomerMessage}`);
    console.log("\n→ Daraja sandbox is working with the configured envs.");
  } else {
    console.log(`\n❌ STK Push REJECTED (${stkRes.status}): ${JSON.stringify(data).slice(0, 300)}`);
    console.log("   → shortcode/passkey likely mismatched for sandbox, or callback URL rejected.");
    process.exit(3);
  }
}

main().catch((e) => { console.error("check failed:", e.message); process.exit(1); });
