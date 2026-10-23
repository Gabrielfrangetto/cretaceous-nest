# Turns a generated top-down texture into one of the map's ground textures (images/terrain/<biome>.webp):
# a generator's 2×2 preview is cut back to one tile, its edges are blended so it repeats with no seam,
# and its colours are moved to its biome's colour (config.js BIOMES, or --color), so the map looks the
# same from afar, where it is drawn flat, as close up.
# Usage: python3 scripts/texture.py forest.jpg forest [--color #5f8f4e] [--contrast 1.2] [--size 512]
# (needs Pillow, numpy)
import argparse, re
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('biome')
ap.add_argument('--color')
ap.add_argument('--contrast', type=float, default=1.2)
ap.add_argument('--size', type=int, default=512)
ap.add_argument('--blend', type=float, default=0.08, help='how wide the blend at the edges is, a share of the tile')
a = ap.parse_args()

img = np.asarray(Image.open(a.src).convert('RGB')).astype(np.float32)
h, w = img.shape[:2]
lum = img @ np.float32([0.299, 0.587, 0.114])
# (a 2×2 preview repeats at half its size: then one quarter of it is the tile)
diff = lambda dx, dy: np.abs(lum[:h - dy, :w - dx] - lum[dy:, dx:]).mean()
if diff(w // 2, 0) < diff(1, 0) * 1.8 and diff(0, h // 2) < diff(0, 1) * 1.8:
    img = img[:h // 2, :w // 2]
    h, w = img.shape[:2]
    print(f'a 2×2 preview: one tile of {w}×{h} kept')

# no seam: near each edge the tile fades into a copy of itself moved by half, whose edges are its middle
moved = np.roll(img, (h // 2, w // 2), (0, 1))
band = max(4, int(min(h, w) * a.blend))
ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / band, 0, 1)
k = np.minimum.outer(ramp(h), ramp(w))[..., None]
k = k * k * (3 - 2 * k)
tile = img * k + moved * (1 - k)

# its colours moved to the biome's: the same average, its light and shade a little stronger or weaker
if a.color:
    target = a.color
else:
    src = open('js/config.js').read()
    m = re.search(rf"\b{a.biome}:\s*\{{[^}}]*?color: '(#[0-9a-fA-F]{{6}})'", src)
    if not m:
        raise SystemExit(f'no colour for {a.biome} in js/config.js: pass --color')
    target = m.group(1)
want = np.float32([int(target[i:i + 2], 16) for i in (1, 3, 5)])
mean = tile.reshape(-1, 3).mean(0)
out = np.clip(want + (tile - mean) * a.contrast, 0, 255)

pic = Image.fromarray(out.astype(np.uint8)).resize((a.size, a.size), Image.LANCZOS)
path = f'images/terrain/{a.biome}.webp'
pic.save(path, 'WEBP', quality=88, method=6)
print(f'{path}: {a.size}×{a.size}, average {target} (was #{"".join(f"{int(v):02x}" for v in mean)})')
