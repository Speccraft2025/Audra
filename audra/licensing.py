# ── licensing.py — Lemon Squeezy license activation for Audra desktop ──
#
# Talks to the Lemon Squeezy License API (no API key required — these are the
# public license endpoints meant to be called from distributed apps):
#   POST /v1/licenses/activate    {license_key, instance_name}
#   POST /v1/licenses/validate    {license_key, instance_id}
#   POST /v1/licenses/deactivate  {license_key, instance_id}
#
# Activation state persists in DATA_DIR/license.json so the app stays Pro
# offline. A successful validation refreshes `last_validated`; if the network
# is unreachable, the cached activation is trusted for LICENSE_GRACE_DAYS.

import json
import os
import platform
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from audra import config

_LS_API = "https://api.lemonsqueezy.com/v1/licenses"
_HTTP_TIMEOUT_SECONDS = 8
_REVALIDATE_INTERVAL_SECONDS = 24 * 3600

_lock = threading.Lock()
_state_cache = None  # in-memory copy of license.json


# ── persistence ──────────────────────────────────────────────────────────────

def _load_state():
    global _state_cache
    if _state_cache is not None:
        return _state_cache
    try:
        with open(config.LICENSE_FILE, "r") as f:
            _state_cache = json.load(f)
    except (OSError, ValueError):
        _state_cache = {}
    return _state_cache


def _save_state(state):
    global _state_cache
    _state_cache = state
    tmp_path = config.LICENSE_FILE + ".tmp"
    with open(tmp_path, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp_path, config.LICENSE_FILE)


def _clear_state():
    global _state_cache
    _state_cache = {}
    try:
        os.remove(config.LICENSE_FILE)
    except OSError:
        pass


# ── Lemon Squeezy API ────────────────────────────────────────────────────────

def _post(endpoint, payload):
    """
    POST to the LS License API. Returns (data, error_string) — exactly one is
    None. Network failures return a distinct 'offline' error so callers can
    apply the grace period instead of downgrading a paying user.
    """
    body = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(
        f"{_LS_API}/{endpoint}",
        data=body,
        headers={"Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_HTTP_TIMEOUT_SECONDS) as resp:
            return json.loads(resp.read().decode()), None
    except urllib.error.HTTPError as e:
        # LS returns structured JSON errors (e.g. 404 unknown key,
        # 400 activation limit reached) — surface its message.
        try:
            detail = json.loads(e.read().decode()).get("error", str(e))
        except ValueError:
            detail = str(e)
        return None, str(detail)
    except (urllib.error.URLError, socket.timeout, OSError):
        return None, "offline"


def _matches_product(meta):
    """Reject keys issued by another store/product when IDs are configured."""
    if config.LS_STORE_ID and str(meta.get("store_id")) != str(config.LS_STORE_ID):
        return False
    if config.LS_PRODUCT_ID and str(meta.get("product_id")) != str(config.LS_PRODUCT_ID):
        return False
    return True


def validate_key_remote(license_key, instance_id=None):
    """
    Stateless validation against LS — used by the SaaS request path and by
    periodic desktop revalidation. Returns (is_valid, error_string).
    error 'offline' means unreachable, not invalid.
    """
    payload = {"license_key": license_key}
    if instance_id:
        payload["instance_id"] = instance_id
    data, err = _post("validate", payload)
    if err:
        return False, err
    if not data.get("valid"):
        return False, data.get("error") or "License key is not valid."
    if not _matches_product(data.get("meta", {})):
        return False, "This license key belongs to a different product."
    status = (data.get("license_key") or {}).get("status")
    if status in ("expired", "disabled"):
        return False, f"License key is {status}."
    return True, None


# ── public desktop API ───────────────────────────────────────────────────────

def activate(license_key):
    """
    Activate a key for this machine. Returns (ok, message). On success the
    activation is persisted and current_tier() resolves to Pro.
    """
    license_key = (license_key or "").strip()
    if not license_key:
        return False, "Enter a license key."

    instance_name = f"{platform.node() or 'audra-desktop'} ({platform.system()})"
    data, err = _post("activate", {
        "license_key": license_key,
        "instance_name": instance_name[:190],
    })
    if err == "offline":
        return False, "Could not reach the license server. Check your connection and try again."
    if err:
        return False, err
    if not data.get("activated"):
        return False, data.get("error") or "Activation failed."
    if not _matches_product(data.get("meta", {})):
        return False, "This license key belongs to a different product."

    with _lock:
        _save_state({
            "license_key": license_key,
            "instance_id": (data.get("instance") or {}).get("id"),
            "activated_at": time.time(),
            "last_validated": time.time(),
            "key_status": (data.get("license_key") or {}).get("status", "active"),
        })
    return True, "License activated — Pro unlocked."


def deactivate():
    """Release this machine's activation slot. Returns (ok, message)."""
    with _lock:
        state = dict(_load_state())
    if not state.get("license_key"):
        return False, "No license is active on this machine."

    _post("deactivate", {
        "license_key": state["license_key"],
        "instance_id": state.get("instance_id") or "",
    })
    # Clear locally even if the API call failed — the user asked to detach,
    # and a dangling remote slot can be freed from the LS customer portal.
    with _lock:
        _clear_state()
    return True, "License deactivated. This machine is now on the Free tier."


def _revalidate_if_stale(state):
    """Refresh remote validation at most once per interval; honor grace offline."""
    last = state.get("last_validated", 0)
    if time.time() - last < _REVALIDATE_INTERVAL_SECONDS:
        return state

    ok, err = validate_key_remote(state["license_key"], state.get("instance_id"))
    with _lock:
        state = dict(_load_state())
        if ok:
            state["last_validated"] = time.time()
            state["key_status"] = "active"
            _save_state(state)
        elif err == "offline":
            pass  # keep cached state; grace window applies below
        else:
            # Definitive rejection (refunded, disabled, deactivated remotely).
            state["key_status"] = "invalid"
            _save_state(state)
    return state


def current_tier():
    """Resolve this machine's tier from the persisted activation."""
    with _lock:
        state = dict(_load_state())
    if not state.get("license_key"):
        return config.TIER_FREE

    state = _revalidate_if_stale(state)

    if state.get("key_status") == "invalid":
        return config.TIER_FREE
    grace_seconds = config.LICENSE_GRACE_DAYS * 24 * 3600
    if time.time() - state.get("last_validated", 0) > grace_seconds:
        return config.TIER_FREE
    return config.TIER_PRO


def status():
    """Summary for the /license/status endpoint and the workspace UI."""
    with _lock:
        state = dict(_load_state())
    # When desktop licensing is off (dev), the engine treats everyone as Pro;
    # report that so the UI hides the activation panel instead of nagging.
    tier = current_tier() if config.LICENSING_ENABLED else config.TIER_PRO
    key = state.get("license_key", "")
    return {
        "enforced": config.LICENSING_ENABLED,
        "tier": tier,
        "licensed": bool(key) and tier == config.TIER_PRO,
        "key_hint": f"…{key[-6:]}" if key else None,
        "checkout_url": config.LS_CHECKOUT_URL or None,
        "free_presets": sorted(config.FREE_TIER_PRESETS),
        "free_render_cap": config.FREE_TIER_RENDER_CAP,
    }
