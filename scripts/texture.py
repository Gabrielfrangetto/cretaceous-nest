# Turns generated top-down textures into one of the map's ground textures (images/terrain/<biome>.webp):
# a generator's 2×2 preview is cut back to one tile, its edges are blended so it repeats with no seam,
# and its colours are moved to its biome's colour (config.js BIOMES, or --color), so the map looks the
# same from afar, where it is drawn flat, as close up.
# Given several (from the densest to the most open), they are blended in broad patches, so the ground
# is thick in places and opens into clearings in others, with no hex in sight: a tile three times as
# wide (MIX), its patches repeating no sooner than that. Their colours move together, from the first's.
# Usage: python3 scripts/texture.py forest dense.jpg [mid.jpg open.jpg] [--color #5f8f4e] [--contrast 1.2]
# (needs Pillow, numpy)
import argparse, re
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('biome')
ap.add_argument('src', nargs='+')
ap.add_argument('--color')
ap.add_argument('--contrast', type=float, default=1.2)
ap.add_argument('--size', type=int, default=512, help='pixels across one source tile')
ap.add_argument('--blend', type=float, default=0.08, help='how wide the blend at the edges is, a share of the tile')
ap.add_argument('--seed', type=int, default=7)
a = ap.parse_args()
MIX = 3


def tile_of(path):
    img = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    h, w = img.shape[:2]
    lum = img @ np.float32([0.299, 0.587, 0.114])
    # (a 2×2 preview repeats at half its size, one way at least: then one quarter of it is the tile)
    diff = lambda dx, dy: np.abs(lum[:h - dy, :w - dx] - lum[dy:, dx:]).mean()
    if min(diff(w // 2, 0) / diff(1, 0), diff(0, h // 2) / diff(0, 1)) < 1.8:
        img = img[:h // 2, :w // 2]
        h, w = img.shape[:2]
    # no seam: near each edge the tile fades into a copy of itself moved by half, whose edges are its middle
    moved = np.roll(img, (h // 2, w // 2), (0, 1))
    band = max(4, int(min(h, w) * a.blend))
    ramp = lambda n: np.clip(np.minimum(np.arange(n), np.arange(n)[::-1]) / band, 0, 1)
    k = np.minimum.outer(ramp(h), ramp(w))[..., None]
    k = k * k * (3 - 2 * k)
    out = img * k + moved * (1 - k)
    return np.asarray(Image.fromarray(out.clip(0, 255).astype(np.uint8)).resize((a.size, a.size), Image.LANCZOS)).astype(np.float32)


tiles = [tile_of(p) for p in a.src]

# its colours moved to the biome's: the first's average becomes it, its light and shade a little stronger
if a.color:
    target = a.color
else:
    m = re.search(rf"\b{a.biome}:\s*\{{[^}}]*?color: '(#[0-9a-fA-F]{{6}})'", open('js/config.js').read())
    if not m:
        raise SystemExit(f'no colour for {a.biome} in js/config.js: pass --color')
    target = m.group(1)
want = np.float32([int(target[i:i + 2], 16) for i in (1, 3, 5)])
mean = tiles[0].reshape(-1, 3).mean(0)
tiles = [np.clip(want + (t - mean) * a.contrast, 0, 255) for t in tiles]

if len(tiles) == 1:
    out = tiles[0]
else:
    # broad patches: smooth noise that repeats with the tile, from 0 (densest) to 1 (most open)
    n = a.size * MIX
    rng = np.random.default_rng(a.seed)
    y, x = np.mgrid[0:n, 0:n] / n * 2 * np.pi
    v = sum(amp * np.sin(fx * x + fy * y + rng.uniform(0, 2 * np.pi))
            for amp, fx, fy in [(1, 1, 2), (1, 2, -1), (0.7, 3, 1), (0.6, -1, 3), (0.4, 4, -3), (0.35, -3, -4)])
    v = (v - v.min()) / (v.max() - v.min())
    # (each source has its band of the noise, blended smoothly into the next)
    pos = v * (len(tiles) - 1)
    out = np.zeros((n, n, 3), np.float32)
    weight = np.zeros((n, n, 1), np.float32)
    for i, t in enumerate(tiles):
        wgt = np.clip(1 - np.abs(pos - i) * 1.6, 0, 1)[..., None] ** 1.5
        out += np.tile(t, (MIX, MIX, 1)) * wgt
        weight += wgt
    out /= np.maximum(weight, 1e-6)

pic = Image.fromarray(out.clip(0, 255).astype(np.uint8))
path = f'images/terrain/{a.biome}.webp'
pic.save(path, 'WEBP', quality=86, method=6)
print(f'{path}: {pic.width}×{pic.height} from {len(tiles)} picture(s), average {target} (the first was #{"".join(f"{int(v):02x}" for v in mean)})')
