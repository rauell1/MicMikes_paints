"""
Wall segmentation script using local HuggingFace transformers (no API calls needed).
Runs nvidia/segformer-b5-finetuned-ade-640-640 on CPU locally.
Downloads model once (~120MB), caches in ~/.cache/huggingface/
"""

import os
import io
import requests
from PIL import Image, ImageFilter
import numpy as np
import torch
from transformers import SegformerImageProcessor, SegformerForSemanticSegmentation

# ADE20K wall class index
ADE20K_WALL_INDEX = 0  # 'wall' is class 0 in ADE20K-150

os.makedirs("api/masks", exist_ok=True)

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

print("Loading SegFormer-B5 model (downloads ~120MB on first run)...")
processor = SegformerImageProcessor.from_pretrained("nvidia/segformer-b5-finetuned-ade-640-640")
model = SegformerForSemanticSegmentation.from_pretrained("nvidia/segformer-b5-finetuned-ade-640-640")
model.eval()
print("Model loaded.\n")


def segment_image(room):
    room_id = room["id"]
    room_name = room["name"]
    img_url = room["url"]
    print(f"--- {room_name} ---")

    # Download image
    resp = requests.get(img_url, timeout=30)
    if resp.status_code != 200:
        print(f"  Failed to download image: HTTP {resp.status_code}")
        return False

    orig_img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    orig_w, orig_h = orig_img.size
    print(f"  Image size: {orig_w}x{orig_h}")

    # Run segmentation
    print("  Running segmentation...")
    inputs = processor(images=orig_img, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)

    # Upsample logits to original size
    upsampled = torch.nn.functional.interpolate(
        outputs.logits,
        size=(orig_h, orig_w),
        mode="bilinear",
        align_corners=False
    )
    seg_map = upsampled.argmax(dim=1).squeeze().numpy()  # shape: (H, W)

    # Extract wall pixels (class 0) — binary mask
    wall_mask_np = (seg_map == ADE20K_WALL_INDEX).astype(np.uint8) * 255

    # Count wall pixels as sanity check
    wall_pct = wall_mask_np.sum() / 255 / (orig_w * orig_h) * 100
    print(f"  Wall coverage: {wall_pct:.1f}% of image")

    if wall_pct < 1.0:
        print(f"  WARNING: Very little wall detected ({wall_pct:.1f}%). Check the room photo.")

    # Convert to PIL
    wall_mask_img = Image.fromarray(wall_mask_np, mode="L")

    # Save raw mask
    raw_path = f"api/masks/{room_id}_mask_raw.png"
    wall_mask_img.save(raw_path)
    print(f"  Saved raw mask -> {raw_path}")

    # Feather edges to avoid hard paint lines
    feathered = wall_mask_img.filter(ImageFilter.GaussianBlur(radius=3))
    final_path = f"api/masks/{room_id}_mask.png"
    feathered.save(final_path)
    print(f"  Saved feathered mask -> {final_path}")
    return True


for room in ROOMS:
    try:
        ok = segment_image(room)
        if ok:
            print(f"  Done: {room['name']}\n")
        else:
            print(f"  FAILED: {room['name']}\n")
    except Exception as e:
        print(f"  ERROR on {room['name']}: {e}\n")

print("All rooms processed.")
