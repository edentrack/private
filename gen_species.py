#!/usr/bin/env python3
"""
EdenTrack species image generator.
Generates 8 editorial livestock portrait images via Replicate Flux 1.1 Pro
and saves them to public/species/.

Usage (from the edentrack project root):
    python3 gen_species.py

Requirements:
    pip install replicate requests
"""

import os, sys, time, requests, concurrent.futures
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

TOKEN = os.getenv("REPLICATE_API_TOKEN")
if not TOKEN:
    sys.exit("Set REPLICATE_API_TOKEN in your environment before running this script.")
OUT_DIR = Path(__file__).parent / "public" / "species"

# ── Style preamble (same for all 8) ──────────────────────────────────────────

PREAMBLE = (
    "Editorial studio livestock portrait, single animal centered on a seamless "
    "warm cream backdrop (#f5f0e8 — same warm putty / oat tone throughout, no "
    "gradients, no patterns), soft directional light from upper-left with a "
    "gentle natural shadow falling lower-right, shot on a 50mm lens at eye-level, "
    "shallow depth of field with the animal in razor-sharp focus, calm "
    "documentary mood, neutral color grade — slightly desaturated earth tones, "
    "no filter look, no neon, no harsh rim light. Composition: animal occupies "
    "~70% of the frame with breathing room on all sides. Square 1:1 crop. "
    "Photorealistic, no illustration, no painting, no 3D render, no cartoon. "
)

# ── Per-species subject lines ─────────────────────────────────────────────────

SUBJECTS = {
    "layer": (
        "Subject: A single mature brown layer hen (Lohmann Brown or ISA Brown), "
        "russet-and-mahogany plumage with lighter neck hackles, prominent upright "
        "red comb and red wattle, standing in profile turned slightly to camera, "
        "one foot lifted mid-step, head alert, dark amber eye catching the light."
    ),
    "broiler": (
        "Subject: A single mature white-feathered broiler chicken (Cobb 500 or "
        "Ross 308 build), plump and full-breasted, standing in a relaxed pose "
        "with both feet on the cream surface, head slightly turned to camera-left "
        "showing the small red comb and yellow beak in profile, clean white "
        "plumage with subtle warm highlights, yellow legs."
    ),
    "tilapia": (
        "Subject: A single fresh adult Nile tilapia (Oreochromis niloticus) lying "
        "on its right side on the cream surface, head to camera-left, clean "
        "intact silvery body with the characteristic 7-8 dark vertical bars, "
        "spiny dorsal fin extended, clear unclouded eye, fins fanned, water "
        "droplets just dried — looks alive, not dead. NOT on ice, NOT on a plate."
    ),
    "catfish": (
        "Subject: A single fresh adult channel catfish (Ictalurus punctatus), "
        "elongated dark olive-grey body lying on its right side on the cream "
        "surface, head to camera-left, prominent long whiskers (barbels) clearly "
        "visible — four pairs around the wide flat mouth, smooth scaleless skin "
        "with subtle highlights, clear eye, paler cream-grey belly visible, "
        "forked tail. NOT on ice."
    ),
    "clarias": (
        "Subject: A single fresh adult African catfish (Clarias gariepinus), "
        "elongated almost eel-like body lying on its right side on the cream "
        "surface, head to camera-left, broad flat head with four pairs of long "
        "sensory barbels, dark mottled grey-brown back, paler underside, the "
        "characteristic continuous dorsal fin running almost the full length of "
        "the body, no scales, smooth wet-looking skin. NOT on ice."
    ),
    "other-fish": (
        "Subject: A single fresh adult common carp (Cyprinus carpio) — the most "
        "universally recognised generic fish — lying on its right side on the "
        "cream surface, head to camera-left, large bronze-gold scales with subtle "
        "darker edges, two pairs of short whiskers at the corners of the mouth, "
        "forked tail, clear eye. Calm everyday fish, not a koi, not exotic."
    ),
    "meat-rabbit": (
        "Subject: A single mature New Zealand White meat rabbit, sitting in a "
        "relaxed loaf pose facing camera-right, pure white short fur, alert "
        "upright pink-tinged ears, dark pink eye catching the light, soft fur "
        "texture sharp in focus, full healthy body shape — clearly a meat-line "
        "breed (broad shoulders, deep loin), not a pet bunny."
    ),
    "breeder-rabbit": (
        "Subject: A single mature Californian doe rabbit (white body with dark "
        "points on nose, ears, feet, and tail), sitting upright on her haunches "
        "in an alert breeder-doe pose facing camera, ears tall and forward, dark "
        "eyes wide and attentive, healthy round-bellied appearance suggesting "
        "she is a strong breeding line, soft fur sharp in focus."
    ),
}

# ── Generation ────────────────────────────────────────────────────────────────

def start_prediction(name: str, subject: str) -> dict:
    """POST to Replicate and return the prediction object."""
    prompt = PREAMBLE + subject
    resp = requests.post(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "Prefer": "wait",          # wait up to 60s for the result in one request
        },
        json={
            "input": {
                "prompt": prompt,
                "aspect_ratio": "1:1",
                "output_format": "jpg",
                "output_quality": 90,
                "safety_tolerance": 3,
            }
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def poll_prediction(pred: dict, timeout: int = 120) -> str:
    """Poll a prediction until it completes; return the output URL."""
    pred_id = pred["id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = requests.get(
            f"https://api.replicate.com/v1/predictions/{pred_id}",
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        status = data.get("status")
        if status == "succeeded":
            output = data.get("output")
            if isinstance(output, list):
                return output[0]
            return str(output)
        if status in ("failed", "canceled"):
            raise RuntimeError(f"Prediction {pred_id} {status}: {data.get('error')}")
        time.sleep(2)
    raise TimeoutError(f"Prediction {pred_id} timed out after {timeout}s")


def generate_one(name: str, subject: str) -> tuple[str, bool]:
    out_path = OUT_DIR / f"{name}.jpg"
    try:
        print(f"  [{name}] ⏳ Starting...")
        pred = start_prediction(name, subject)
        # "Prefer: wait" usually returns a completed prediction immediately.
        # If it's still processing, fall through to polling.
        status = pred.get("status")
        if status == "succeeded":
            output = pred.get("output")
            url = output[0] if isinstance(output, list) else str(output)
        else:
            url = poll_prediction(pred)

        print(f"  [{name}] ⬇  Downloading...")
        img_resp = requests.get(url, timeout=60)
        img_resp.raise_for_status()
        out_path.write_bytes(img_resp.content)
        size_kb = len(img_resp.content) // 1024
        print(f"  [{name}] ✅ Saved → public/species/{name}.jpg  ({size_kb} KB)")
        return name, True
    except Exception as exc:
        print(f"  [{name}] ❌ FAILED: {exc}")
        return name, False


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", metavar="SPECIES", help="Regenerate a single species (e.g. --only catfish)")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # ── Single-species mode ───────────────────────────────────────────────────
    if args.only:
        key = args.only.lower()
        if key not in SUBJECTS:
            print(f"⛔  Unknown species '{key}'. Valid: {', '.join(SUBJECTS)}")
            sys.exit(1)
        print(f"\n🎨  Regenerating {key} only")
        name, ok = generate_one(key, SUBJECTS[key])
        sys.exit(0 if ok else 1)

    print(f"\n🎨  EdenTrack species image generator")
    print(f"    Model  : Flux 1.1 Pro (black-forest-labs/flux-1.1-pro)")
    print(f"    Output : {OUT_DIR}")
    print(f"    Images : {len(SUBJECTS)}\n")

    # ── VALIDATION: generate Layer hen first ─────────────────────────────────
    print("Step 1/2 — Validation shot (Layer hen)")
    name, ok = generate_one("layer", SUBJECTS["layer"])
    if not ok:
        print("\n⛔  Layer hen failed — check token and retry.")
        sys.exit(1)

    print(f"\n  Layer hen saved. Open public/species/layer.jpg to verify the look.")
    print(f"  If the style is off, edit PREAMBLE in this script and re-run.\n")

    # ── BATCH: remaining 7 in parallel ───────────────────────────────────────
    remaining = {k: v for k, v in SUBJECTS.items() if k != "layer"}
    print(f"Step 2/2 — Batch generation ({len(remaining)} images in parallel)\n")
    start = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
        futures = {pool.submit(generate_one, n, s): n for n, s in remaining.items()}
        results = {"layer": True}
        for fut in concurrent.futures.as_completed(futures):
            n, ok = fut.result()
            results[n] = ok

    elapsed = time.time() - start
    passed = [k for k, v in results.items() if v]
    failed = [k for k, v in results.items() if not v]

    print(f"\n{'─'*50}")
    print(f"Done in {elapsed:.0f}s")
    print(f"✅ {len(passed)} succeeded: {', '.join(sorted(passed))}")
    if failed:
        print(f"❌ {len(failed)} failed:    {', '.join(sorted(failed))}")
        print(f"\nRe-run to retry failed images — successful ones won't be regenerated.")
    else:
        print(f"\n🎉  All 8 images saved to public/species/")
        print(f"    The modal picks them up automatically — no code changes needed.")


if __name__ == "__main__":
    main()
