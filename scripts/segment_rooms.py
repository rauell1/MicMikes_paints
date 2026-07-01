"""
Wall segmentation using local HuggingFace transformers (no API calls).
Runs nvidia/segformer-b5-finetuned-ade-640-640 on CPU.

v2 improvements:
- Multi-class subtraction: explicitly removes ceiling, floor, furniture,
  books, stairs etc. from the wall mask (not just wall argmax)
- Margin test: wall must beat the runner-up class by a confidence margin
- Edge-aware feathering: blur radius reduced, edges eroded before blur so
  feather stays INSIDE the wall region instead of bleeding onto neighbours
- Per-room CLI arg, timestamped backups, coverage sanity checks,
  end-of-run metrics table

Usage:
  python scripts/segment_rooms.py             # all rooms
  python scripts/segment_rooms.py <room-id>   # one room (uuid or name prefix)
"""

import os
import io
import sys
import shutil
import datetime
import requests
from PIL import Image, ImageFilter
import numpy as np
from scipy import ndimage
import torch
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation

# ── ADE20K-150 class indices (segformer ade640 label map) ──────────────
WALL = 0
# Classes that commonly border/overlap walls and must never be painted.
SUBTRACT_CLASSES = {
    3:  "floor",
    5:  "ceiling",
    4:  "tree",          # indoor plants sometimes land here
    6:  "road",          # rare mislabel on pale floors
    7:  "bed",
    8:  "windowpane",
    10: "cabinet",
    14: "door",
    15: "table",
    18: "curtain",
    19: "chair",
    23: "sofa",
    24: "shelf",
    27: "mirror",
    30: "armchair",
    33: "desk",
    35: "wardrobe",
    39: "cushion",
    53: "stairs",
    59: "stairway",
    62: "bookcase",
    67: "book",
    97:  "ottoman",
    121: "step",         # stair treads
}

MASKS_DIR = "api/masks"
BACKUP_DIR = "api/masks/backups"
os.makedirs(MASKS_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

ROOMS = [
    {
        "id": "026feade-527d-42aa-a6fb-49055c05551d",
        "name": "Nairobi Classic",
        "url": "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "a7417cd8-8977-4a06-9d19-f158fe8ec952",
        "name": "Mombasa Suite",
        "url": "https://images.pexels.com/photos/271816/pexels-photo-271816.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "10e15faf-1ccf-4c81-9db7-3a467164edab",
        "name": "Karen Bedroom",
        "url": "https://images.pexels.com/photos/6186819/pexels-photo-6186819.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "ee963068-197b-42c3-ad77-63f3fdf8c7db",
        "name": "Coastal Kitchen",
        "url": "https://images.pexels.com/photos/7040696/pexels-photo-7040696.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "b91aeb30-b245-4cf0-affc-5a04c8b0c2fd",
        "name": "Nairobi Living Room",
        "url": "https://images.pexels.com/photos/8146213/pexels-photo-8146213.jpeg?auto=compress&cs=tinysrgb&w=1600"
    }
]

# Wall-confidence margin: wall logit must beat runner-up by this much
# (in softmax probability space) or the pixel is dropped.
WALL_MARGIN = 0.05

COVERAGE_MIN, COVERAGE_MAX = 5.0, 70.0


def load_image(room):
    cache = f"scripts/scratch/original_rooms/{room['id']}.jpg"
    if os.path.exists(cache):
        return Image.open(cache).convert("RGB")
    resp = requests.get(room["url"], timeout=30)
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    img.save(cache)
    return img


def backup_existing(room_id):
    src = f"{MASKS_DIR}/{room_id}_mask.png"
    if os.path.exists(src):
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        dst = f"{BACKUP_DIR}/{room_id}_mask_{stamp}.png"
        shutil.copy2(src, dst)
        return dst
    return None


def segment_room(room, processor, model):
    room_id, name = room["id"], room["name"]
    print(f"--- {name} ---")

    orig_img = load_image(room)
    orig_w, orig_h = orig_img.size
    print(f"  Image size: {orig_w}x{orig_h}")

    inputs = processor(images=orig_img, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)

    logits = torch.nn.functional.interpolate(
        outputs.logits, size=(orig_h, orig_w), mode="bilinear", align_corners=False
    )[0]  # (150, H, W)

    probs = torch.softmax(logits, dim=0)
    seg_map = probs.argmax(dim=0).numpy()
    wall_prob = probs[WALL].numpy().copy()

    # Runner-up probability at each pixel (best non-wall class).
    # copy() is critical: probs.numpy() shares storage with the tensor,
    # so writing -1 into it would corrupt wall_prob too.
    probs_np = probs.numpy().copy()
    probs_np[WALL] = -1.0
    runner_up = probs_np.max(axis=0)

    # Explicitly subtract competing classes (kills blur-bleed onto books,
    # stairs, ceiling even where argmax was ambiguous)
    subtract = np.isin(seg_map, list(SUBTRACT_CLASSES.keys()))

    # The margin test exists to tighten wall/object boundaries, so apply
    # it only within ~12px of a subtracted object. Elsewhere (open wall,
    # wall seen through glass balustrades) plain argmax wins — otherwise
    # low-confidence interior pixels punch blotchy holes in the wall.
    boundary_zone = ndimage.binary_dilation(subtract, iterations=max(6, orig_w // 130))
    margin_ok = (wall_prob - runner_up) >= WALL_MARGIN
    wall = (seg_map == WALL) & ~subtract & (margin_ok | ~boundary_zone)

    # Reclaim wall seen through glass balustrades: those pixels argmax to
    # "stairway"/"railing" but wall remains a strong runner-up. Wood treads
    # are unaffected — their wall probability is near zero.
    GLASSY = np.isin(seg_map, [38, 59])  # railing, stairway
    reclaim = GLASSY & (wall_prob >= 0.30)
    if reclaim.any():
        print(f"  Reclaimed wall-behind-glass: {reclaim.sum() / (orig_w * orig_h) * 100:.1f}% of image")
        wall = wall | reclaim

    # Report which subtract classes were present (debugging aid)
    present = {SUBTRACT_CLASSES[c] for c in np.unique(seg_map) if c in SUBTRACT_CLASSES}
    if present:
        print(f"  Subtracted neighbours: {', '.join(sorted(present))}")

    # ── Hole refill ────────────────────────────────────────────────────
    # The margin test drops ambiguous pixels, which can punch blotchy
    # holes in the middle of a wall (e.g. behind glass balustrades).
    # Refill enclosed holes — but ONLY pixels whose argmax was already
    # wall. Genuinely enclosed objects (wall clock, AC unit, artwork)
    # have a different argmax class and stay unpainted.
    enclosed = ndimage.binary_fill_holes(wall) & ~wall
    refill = enclosed & (seg_map == WALL)
    if refill.any():
        pct = refill.sum() / (orig_w * orig_h) * 100
        print(f"  Refilled enclosed ambiguous holes: {pct:.1f}% of image")
        wall = wall | refill

    mask_np = wall.astype(np.uint8) * 255
    coverage = mask_np.sum() / 255 / (orig_w * orig_h) * 100
    flag = ""
    if coverage < COVERAGE_MIN:
        flag = f"  WARNING: coverage {coverage:.1f}% < {COVERAGE_MIN}% — mask may be broken"
    elif coverage > COVERAGE_MAX:
        flag = f"  WARNING: coverage {coverage:.1f}% > {COVERAGE_MAX}% — over-segmentation likely"
    if flag:
        print(flag)
    print(f"  Wall coverage: {coverage:.1f}%")

    mask_img = Image.fromarray(mask_np, mode="L")

    raw_path = f"{MASKS_DIR}/{room_id}_mask_raw.png"
    mask_img.save(raw_path)

    # ── Edge-aware feathering ──────────────────────────────────────────
    # Problem with plain blur: it expands the mask outward, tinting
    # neighbours. Fix: close small holes, ERODE by the blur radius first,
    # then blur — the soft ramp now lives inside the wall boundary.
    close_r = max(3, orig_w // 320)          # ~5px at 1600w — gentler than before
    blur_r  = max(4, orig_w // 260)          # ~6px at 1600w

    closed = mask_img.filter(ImageFilter.MaxFilter(close_r * 2 + 1))
    closed = closed.filter(ImageFilter.MinFilter(close_r * 2 + 1))
    eroded = closed.filter(ImageFilter.MinFilter(blur_r * 2 + 1))
    feathered = eroded.filter(ImageFilter.GaussianBlur(radius=blur_r))

    backup = backup_existing(room_id)
    if backup:
        print(f"  Backed up previous mask -> {backup}")

    final_path = f"{MASKS_DIR}/{room_id}_mask.png"
    feathered.save(final_path)
    print(f"  Saved mask -> {final_path}  (close={close_r}px erode+blur={blur_r}px)")

    return {"name": name, "coverage": coverage, "warn": bool(flag)}


def main():
    target = sys.argv[1].lower() if len(sys.argv) > 1 else None
    rooms = ROOMS
    if target:
        rooms = [r for r in ROOMS
                 if r["id"].startswith(target) or target in r["name"].lower()]
        if not rooms:
            print(f"No room matches '{target}'. Available:")
            for r in ROOMS:
                print(f"  {r['id']}  {r['name']}")
            sys.exit(1)

    print("Loading SegFormer-B5 model...")
    processor = SegformerImageProcessor.from_pretrained("nvidia/segformer-b5-finetuned-ade-640-640")
    model = SegformerForSemanticSegmentation.from_pretrained("nvidia/segformer-b5-finetuned-ade-640-640")
    model.eval()

    # Verify our class indices against the model's own label map
    id2label = model.config.id2label
    mismatches = [(i, exp, id2label.get(i, "?"))
                  for i, exp in SUBTRACT_CLASSES.items()
                  if exp.split("/")[0] not in str(id2label.get(i, "")).lower()]
    if mismatches:
        print("  Label-map check (index, expected, actual):")
        for i, exp, act in mismatches:
            print(f"    {i}: expected '{exp}', model says '{act}'")
    print("Model loaded.\n")

    results = []
    for room in rooms:
        try:
            results.append(segment_room(room, processor, model))
            print()
        except Exception as e:
            print(f"  ERROR on {room['name']}: {e}\n")
            results.append({"name": room["name"], "coverage": -1, "warn": True})

    print("=" * 52)
    print(f"{'Room':<24}{'Coverage':>10}{'Status':>14}")
    print("-" * 52)
    for r in results:
        cov = f"{r['coverage']:.1f}%" if r["coverage"] >= 0 else "FAILED"
        status = "CHECK" if r["warn"] else "OK"
        print(f"{r['name']:<24}{cov:>10}{status:>14}")
    print("=" * 52)


if __name__ == "__main__":
    main()
