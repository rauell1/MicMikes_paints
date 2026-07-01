"""
Clips the Nairobi Living Room AI mask using the known polygon boundaries,
preventing ceiling, floor, and dark panels from being painted.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOM_ID = "b91aeb30-b245-4cf0-affc-5a04c8b0c2fd"
RAW_MASK = f"api/masks/{ROOM_ID}_mask_raw.png"
OUT_MASK  = f"api/masks/{ROOM_ID}_mask.png"

# Known safe wall polygons for Nairobi Living Room (from DB wall_mask)
# These are the 3 actual wall regions: left strip, right strip, back wall upper
POLYGONS = [
    [(0,    0.15), (0.26, 0.15), (0.26, 0.60), (0,    0.60)],  # left wall
    [(0.74, 0.15), (1,    0.15), (1,    0.60), (0.74, 0.60)],  # right wall
    [(0.26, 0.15), (0.74, 0.15), (0.74, 0.52), (0.26, 0.52)],  # back wall centre
]

raw = Image.open(RAW_MASK).convert("L")
w, h = raw.size
print(f"Mask size: {w}x{h}")

# Build polygon clip mask
clip = Image.new("L", (w, h), 0)
draw = ImageDraw.Draw(clip)
for poly in POLYGONS:
    px_poly = [(int(x * w), int(y * h)) for x, y in poly]
    draw.polygon(px_poly, fill=255)

# Intersect: only keep AI wall pixels that fall inside the polygon regions
ai_np   = np.array(raw)
clip_np = np.array(clip)
combined = np.minimum(ai_np, clip_np)  # AND operation

result = Image.fromarray(combined.astype(np.uint8), mode="L")

# Re-apply feathering
feathered = result.filter(ImageFilter.GaussianBlur(radius=12))
feathered.save(OUT_MASK)
print(f"Saved clipped mask -> {OUT_MASK}")
