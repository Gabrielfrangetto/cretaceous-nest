# Turns a generated strip of a biome's edge (its ground dense along the bottom, thinning out upwards,
# on a pure white and on a pure black background) into the picture laid along the side of a hex where
# that biome meets other land (images/terrain/<biome>-edge.webp). Its colours are moved as its ground's
# picture's were (scripts/texture.py): where it is dense, its average becomes the biome's colour, so it
# runs on from the ground's picture with no seam.
# Usage: python3 scripts/edge.py white.jpg black.jpg forest [--contrast 1.2] [--width 1000]
# (needs Pillow, numpy)
import argparse, re
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('white')
ap.add_argument('black')
ap.add_argument('biome')
ap.add_argument('--color')
ap.add_argument('--contrast', type=float, default=1.0)
ap.add_argument('--width', type=int, default=1600)
a = ap.parse_args()

W = np.asarray(Image.open(a.white).convert('RGB')).astype(np.float32)
B = np.asarray(Image.open(a.black).convert('RGB')).astype(np.float32)
alpha = np.clip(1 - (W - B).mean(2) / 255, 0, 1)
alpha[alpha < 0.04] = 0
rgb = np.where(alpha[..., None] > 0.97, W, B / np.maximum(alpha[..., None], 1e-3))

# the same move of colours as its ground's picture (texture.py): its dense part's average to the biome's
dense_rows = (alpha > 0.5).mean(1) >= 0.92
mean = rgb[dense_rows].reshape(-1, 3)[alpha[dense_rows].reshape(-1) > 0.5].mean(0)
target = a.color or re.search(rf"\b{a.biome}:\s*\{{[^}}]*?color: '(#[0-9a-fA-F]{{6}})'", open('js/config.js').read()).group(1)
want = np.float32([int(target[i:i + 2], 16) for i in (1, 3, 5)])
# (scaled, as texture.py does, so the strip's dense part is the same colour as the ground's picture's densest)
rgb = np.clip(want + (rgb * (want / mean) - want) * a.contrast, 0, 255)

# cut to the rows with trees, and say where it is dense (where the hex's side goes)
rows = np.where((alpha > 0.5).mean(1) > 0.01)[0]
top = max(0, rows.min() - 8)
cover = (alpha > 0.5).mean(1)
dense = int(np.argmax(cover >= 0.92))
pic = np.dstack([rgb, alpha * 255])[top:].astype(np.uint8)
img = Image.fromarray(pic)
img = img.resize((a.width, round(img.height * a.width / img.width)), Image.LANCZOS)
path = f'images/terrain/{a.biome}-edge.webp'
img.save(path, 'WEBP', quality=80, method=6)
print(f'{path}: {img.width}×{img.height}; dense from {(dense - top) / (pic.shape[0]):.2f} of its height down')
