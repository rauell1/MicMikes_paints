import os
import io
import time
import base64
import requests
from PIL import Image, ImageFilter
import numpy as np

# Create the masks directory inside api/
os.makedirs("api/masks", exist_ok=True)

# The 5 room images from the database
ROOMS = [
    {
        "id": "nairobi_classic",
        "url": "https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "mombasa_suite",
        "url": "https://images.pexels.com/photos/271816/pexels-photo-271816.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "karen_bedroom",
        "url": "https://images.pexels.com/photos/6186819/pexels-photo-6186819.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "coastal_kitchen",
        "url": "https://images.pexels.com/photos/7040696/pexels-photo-7040696.jpeg?auto=compress&cs=tinysrgb&w=1600"
    },
    {
        "id": "nairobi_living",
        "url": "https://images.pexels.com/photos/8146213/pexels-photo-8146213.jpeg?auto=compress&cs=tinysrgb&w=1600"
    }
]

# Hugging Face Serverless Inference API URL
HF_API_URL = "https://api-inference.huggingface.co/models/nvidia/segformer-b5-finetuned-ade-640-640"

# Optional token, if rate limited, can be passed.
HF_TOKEN = os.environ.get("HF_TOKEN", "")

headers = {}
if HF_TOKEN:
    headers["Authorization"] = f"Bearer {HF_TOKEN}"

def segment_image(img_url, room_id):
    print(f"Processing room {room_id} from {img_url}...")
    
    # Download original image
    resp = requests.get(img_url)
    if resp.status_code != 200:
        print(f"Failed to download image for {room_id}: HTTP {resp.status_code}")
        return False
        
    img_data = resp.content
    orig_img = Image.open(io.BytesIO(img_data))
    orig_w, orig_h = orig_img.size
    print(f"Original image size: {orig_w}x{orig_h}")
    
    # Send to Hugging Face
    print("Calling Hugging Face SegFormer-B5 API...")
    for attempt in range(5):
        hf_resp = requests.post(HF_API_URL, headers=headers, data=img_data)
        if hf_resp.status_code == 200:
            result = hf_resp.json()
            break
        elif hf_resp.status_code == 503:
            # Model is loading, wait and retry
            print(f"Model is loading (503), retrying in 15 seconds... (attempt {attempt+1}/5)")
            time.sleep(15)
        else:
            print(f"HF API returned error {hf_resp.status_code}: {hf_resp.text}")
            return False
    else:
        print("HF API failed after max retries due to 503 loading status.")
        return False

    # Extract wall mask
    print("Extracting wall masks...")
    wall_masks = []
    
    # HF response is list of objects: [{"score": 0.9, "label": "wall", "mask": "base64..."}, ...]
    if not isinstance(result, list):
        print(f"Unexpected response format: {result}")
        return False

    for item in result:
        label = item.get("label", "").lower()
        # Segmenter labels on ADE20K are: 'wall', 'painting' (which might be inside wall, but let's keep wall)
        if "wall" in label:
            mask_b64 = item.get("mask")
            if mask_b64:
                mask_bytes = base64.b64decode(mask_b64)
                mask_img = Image.open(io.BytesIO(mask_bytes)).convert("L")
                wall_masks.append(mask_img)
                print(f"Found mask segment: {label} with score {item.get('score')}")

    if not wall_masks:
        print("No wall segments found in Hugging Face output!")
        # Print available labels for debugging
        labels = [item.get("label") for item in result]
        print(f"Available labels in image: {labels}")
        return False
        
    # Combine wall masks if multiple segments found
    combined_mask = Image.new("L", wall_masks[0].size, 0)
    for w_mask in wall_masks:
        combined_mask = Image.max(combined_mask, w_mask)
        
    # Resize mask to original image dimensions
    combined_mask = combined_mask.resize((orig_w, orig_h), Image.Resampling.NEAREST)
    
    # Save raw mask
    raw_mask_path = f"api/masks/{room_id}_mask_raw.png"
    combined_mask.save(raw_mask_path)
    print(f"Saved raw mask to {raw_mask_path}")
    
    # Post-process: apply a small blur/feathering to mask edges to prevent jagged paint lines
    # Dilate/Erode could be done, but a Gaussian blur of 2-3px is a standard way to feather edges
    feathered_mask = combined_mask.filter(ImageFilter.GaussianBlur(radius=2))
    
    mask_path = f"api/masks/{room_id}_mask.png"
    feathered_mask.save(mask_path)
    print(f"Saved feathered mask to {mask_path}")
    return True

for room in ROOMS:
    success = False
    for attempt in range(3):
        try:
            success = segment_image(room["url"], room["id"])
            if success:
                break
        except Exception as e:
            print(f"Error on {room['id']} attempt {attempt+1}: {e}")
            time.sleep(5)
    if not success:
        print(f"ERROR: Could not segment {room['id']}")
    else:
        print(f"Successfully processed {room['id']}\n")
