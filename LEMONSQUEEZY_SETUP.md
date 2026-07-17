# Lemon Squeezy Setup for Audra Pro

The app side is fully wired: license activation, validation, offline grace,
Free/Pro enforcement, and the workspace activation UI. What remains are the
account-side steps that only the store owner can do (they involve identity,
payout, and tax details).

## 1. Create the store (you, ~10 min)

1. Sign up at <https://app.lemonsqueezy.com/register>.
2. Create a store (name: Audra, or your company name). Complete the
   payout + tax details when prompted — Lemon Squeezy is the merchant of
   record, so they handle VAT/sales tax worldwide.

## 2. Create the product

1. **Store → Products → New product.**
2. Name: `Audra Pro`. Pricing: **Single payment** (recommended: $49–79).
3. Under **License keys**, enable *"Generate license keys for this product"*:
   - **Activation limit: 2** (lets a producer run Audra on a laptop + desktop;
     the in-app "Deactivate this machine" button frees a slot).
   - Expiration: none (perpetual license), unless you choose the
     license+annual-updates model later.
4. Publish the product and copy the **Buy link** (looks like
   `https://<store>.lemonsqueezy.com/checkout/buy/<uuid>`).

## 3. Get the IDs the app pins validation to

Keys from *any* Lemon Squeezy store would otherwise validate, so Audra checks
the store/product IDs returned by the License API against these values:

- **Store ID**: Settings → Stores (numeric ID), or the URL when viewing the store.
- **Product ID**: the numeric ID in the product page URL.

## 4. Configure Audra

Set these when building/running the app (all read in `audra/config.py`):

| Env var | Value |
|---|---|
| `AUDRA_LS_STORE_ID` | your numeric store ID |
| `AUDRA_LS_PRODUCT_ID` | your numeric product ID |
| `AUDRA_LS_CHECKOUT_URL` | the Buy link from step 2 |
| `AUDRA_LICENSING_ENABLED` | defaults to `true` in packaged builds, `false` in dev — override for testing |

For packaged desktop builds, bake them in by setting the env vars in the
PyInstaller launch environment, or replace the defaults in `config.py`
directly before building.

## 5. Test the loop end-to-end

1. In **Store settings → enable Test mode**, make a test purchase of Audra Pro
   with Lemon Squeezy's test card (`4242 4242 4242 4242`).
2. Copy the license key from the order confirmation email / Orders page.
3. Run Audra with licensing on:
   `AUDRA_LICENSING_ENABLED=true AUDRA_LS_STORE_ID=… AUDRA_LS_PRODUCT_ID=… python3 server.py`
4. Open the workspace → **License** panel → paste the key → Activate.
   Expect: panel flips to "Pro active", PRO chips disappear from presets,
   renders drop the "Made with Audra" watermark.
5. Click "Deactivate this machine" and confirm the panel returns to Free.
6. Flip Test mode off before launch.

## How the app-side flow works (already implemented)

- `audra/licensing.py` calls the public License API
  (`api.lemonsqueezy.com/v1/licenses/activate|validate|deactivate`) — no API
  key needed, safe to ship in the client.
- Successful activation is stored in `DATA_DIR/license.json`; the app
  revalidates at most once per 24 h and stays Pro for
  `AUDRA_LICENSE_GRACE_DAYS` (default 14) without network — local-first.
- Refunded/disabled keys fail revalidation and the install degrades to Free
  (never blocks rendering).
- Keys from a different store/product are rejected at activation.
