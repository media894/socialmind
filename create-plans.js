/**
 * SocialMind AI – PayPal Subscription Plan Creator
 *
 * Run this ONCE to generate your Pro and Enterprise plan IDs.
 * After running, copy the printed IDs into your backend/.env file.
 *
 * Usage:
 *   npm install axios          (first time only)
 *   node create-plans.js
 */
require('dotenv').config({ path: '../backend/.env' });
const axios = require('axios');

// ─── CREDENTIALS ────────────────────────────────────────────────────────────
// These are read from environment variables so you don't hard-code secrets.
// Either export them in your shell, or paste directly here for a one-off run.

const CLIENT_ID = 'AXi74LLniZjjxQN4vn4wOiWN9nUxO5fJ4cxUZs-eWcU_DmRXN9KqUDBdNqktcxsbwg-k-4s7pmP7HSS2' || 'YOUR_CLIENT_ID_HERE';
const SECRET    = 'EAAlw97dkeaeeAdTRCMoOoJOtlNwbeTwVpLqwsraiFdeolOrs854YRjkJ9cKAguSzYBIbi-bdWCdAkUi'
               || process.env.PAYPAL_SECRET
               || 'YOUR_SECRET_HERE';

// Change to 'https://api-m.sandbox.paypal.com' for sandbox testing
const BASE_URL  = process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await axios.post(
    `${BASE_URL}/v1/oauth2/token`,
    'grant_type=client_credentials',
    {
      auth: { username: CLIENT_ID, password: SECRET },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  return res.data.access_token;
}

async function createProduct(token) {
  const res = await axios.post(
    `${BASE_URL}/v1/catalogs/products`,
    {
      name: 'SocialMind AI Video Platform',
      description: 'AI-powered social media video generation platform',
      type: 'SERVICE',
      category: 'SOFTWARE',
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log('✅ Product created:', res.data.id);
  return res.data.id;
}

async function createPlan(token, productId, name, price) {
  const res = await axios.post(
    `${BASE_URL}/v1/billing/plans`,
    {
      product_id: productId,
      name,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0, // 0 = renews forever
          pricing_scheme: {
            fixed_price: { value: price, currency_code: 'USD' },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  console.log(`✅ ${name} Plan ID: ${res.data.id}`);
  return res.data.id;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE' || SECRET === 'YOUR_SECRET_HERE') {
    console.error(
      '❌  Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET before running.\n' +
      '    Either export them as environment variables or edit this file directly.'
    );
    process.exit(1);
  }

  console.log(`\n🔗 Using PayPal base URL: ${BASE_URL}\n`);

  const token     = await getAccessToken();
  const productId = await createProduct(token);
  const proId     = await createPlan(token, productId, 'SocialMind Pro',        '20');
  const entId     = await createPlan(token, productId, 'SocialMind Enterprise', '50');

  console.log(`
╔══════════════════════════════════════════════════════════╗
║              SAVE THESE IDs IN backend/.env              ║
╠══════════════════════════════════════════════════════════╣
║  PAYPAL_PRO_PLAN_ID=${proId.padEnd(35)}║
║  PAYPAL_ENTERPRISE_PLAN_ID=${entId.padEnd(29)}║
╚══════════════════════════════════════════════════════════╝
`);
}

main().catch((err) => {
  console.error('❌ Error:', err.response?.data || err.message);
  process.exit(1);
});
