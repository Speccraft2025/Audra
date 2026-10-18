# ── saas_auth.py — Entitlement Resolution for Audra v2 ──
import os
from functools import wraps
from flask import request, g
from audra import config

# Read configurations from environment variables
AUTH_ENABLED = os.environ.get("SAAS_AUTH_ENABLED", "false").lower() == "true"
JWT_SECRET = os.environ.get("SAAS_JWT_SECRET", "default_secret_please_change")


def resolve_tier(req) -> str:
    """
    Determines the entitlement tier for a request. Never blocks - an
    unauthenticated or invalid request simply resolves to Free, matching the
    subscription model (degrade to Free, don't deny service).

    Resolution order:
    - SAAS mode (SAAS_AUTH_ENABLED=true, Phase 3 cloud): per-request Bearer
      token or license_key param, validated against Lemon Squeezy.
    - Desktop licensing (LICENSING_ENABLED, default in packaged builds): the
      machine-local Lemon Squeezy activation decides the tier.
    - Neither (dev): everything is Pro.
    """
    from audra import licensing

    if AUTH_ENABLED:
        auth_header = req.headers.get("Authorization")
        license_key = req.args.get("license_key") or req.form.get("license_key")

        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            # Replace this with your standard JWT decoding logic
            if token == JWT_SECRET:
                return config.TIER_PRO

        elif license_key:
            valid, _err = licensing.validate_key_remote(license_key)
            if valid:
                return config.TIER_PRO

        return config.TIER_FREE

    if config.LICENSING_ENABLED:
        return licensing.current_tier()

    return config.TIER_PRO


def attach_tier(f):
    """
    Flask decorator that resolves the caller's entitlement tier and stashes it
    on flask.g.audra_tier for the view to read. Route/engine logic is
    responsible for enforcing tier restrictions (preset access, watermark,
    render caps) - this decorator only resolves who the caller is.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        g.audra_tier = resolve_tier(request)
        return f(*args, **kwargs)
    return decorated_function

# ── STRIPE WEBHOOK HANDLER STUB ──
# You can mount this in server.py to listen to customer subscription state changes
def process_stripe_webhook(payload, signature_header):
    """
    Verifies Stripe webhook signature and updates customer database limits.
    """
    stripe_webhook_secret = os.environ.get("SAAS_STRIPE_WEBHOOK_SECRET")
    if not stripe_webhook_secret:
        return {"status": "error", "message": "Webhook secret not configured."}, 500

    # Example structure for event evaluation
    try:
        # In actual deployment:
        # event = stripe.Webhook.construct_event(payload, signature_header, stripe_webhook_secret)
        event = payload # Placeholder parsing
        event_type = event.get("type")
        
        if event_type == "customer.subscription.created":
            # Upgrade limits in your Database (e.g. Firebase Firestore)
            customer_email = event["data"]["object"]["customer_details"]["email"]
            print(f"💳 Stripe Upgrade Activated for: {customer_email}")
            
        elif event_type == "customer.subscription.deleted":
            # Revoke engine access
            customer_email = event["data"]["object"]["customer_details"]["email"]
            print(f"🔒 Stripe Subscription cancelled for: {customer_email}")
            
        return {"status": "success", "event": event_type}, 200
    except Exception as e:
        return {"status": "error", "message": str(e)}, 400
