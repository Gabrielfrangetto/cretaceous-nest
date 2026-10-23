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
ap.add_argument('--size', type=int, default=352, help='pixels across one source tile')
ap.add_argument('--quality', type=int, default=78)
ap.add_argument('--blend', type=float, default=0.08, help='how wide the blend at the edges is, a share of the tile')
ap.add_argument('--seed', type=int, default=7)
ap.add_argument('--each', action='store_true', help='move each picture to the colour from its own average')
ap.add_argument('--thick', type=float, default=1.6, help='above 1, more of the ground the densest')
a = ap.parse_args()
MIX = 3


def tile_of(path, size):
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
    return np.asarray(Image.fromarray(out.clip(0, 255).astype(np.uint8)).resize((size, size), Image.LANCZOS)).astype(np.float32)


# (the opener ones drawn half as large again, so their clearings are bigger and repeat less often)
OPEN = 1.5
tiles = [tile_of(p, a.size if i == 0 else round(a.size * OPEN)) for i, p in enumerate(a.src)]

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
# (by scaling each channel rather than shifting it, so a clearing's brown ground stays brown beside the
# green treetops instead of turning olive like them)
# (--each: each from its own average, for pictures painted in different light that should all match)
tiles = [np.clip(want + (t * (want / (t.reshape(-1, 3).mean(0) if a.each else mean)) - want) * a.contrast, 0, 255) for t in tiles]

if len(tiles) == 1:
    # (laid as many times across as a blend's tile is wide, so it is drawn at the same size)
    out = np.tile(tiles[0], (MIX, MIX, 1))
else:
    # broad patches: smooth noise that repeats with the tile, from 0 (densest) to 1 (most open)
    n = a.size * MIX
    rng = np.random.default_rng(a.seed)
    y, x = np.mgrid[0:n, 0:n] / n * 2 * np.pi
    v = sum(amp * np.sin(fx * x + fy * y + rng.uniform(0, 2 * np.pi))
            for amp, fx, fy in [(1, 1, 2), (1, 2, -1), (0.7, 3, 1), (0.6, -1, 3), (0.4, 4, -3), (0.35, -3, -4)])
    # (as many places of each density: the noise's values spread evenly from 0 to 1, then each source
    # has its band of them, blended into the next over a narrow margin, so thick and open stand apart)
    v = np.argsort(np.argsort(v.ravel())).reshape(v.shape) / (v.size - 1)
    # (the densest the most of them: about half the ground thick, a quarter with a few clearings, the rest open)
    pos = v ** a.thick * (len(tiles) - 1)
    # In layers, the most open at the bottom and the densest on top: each denser picture is laid over the
    # ones below where its patch is, whole in its middle, and at its patch's rim only its treetops (or
    # plants), whole ones, standing over the ground of the opener ground below; so a thick forest's edge
    # is trees over a clearing, never a clearing's ground over trees
    from scipy import ndimage
    out = None
    for i in reversed(range(len(tiles))):
        k = n // tiles[i].shape[0]
        big = np.tile(tiles[i], (k, k, 1))
        if out is None:
            out = big
            continue
        wgt = np.clip(1.5 - np.abs(pos - i) * 1.1, 0, 1) * (pos <= i + 0.9)
        green = big[..., 1] - (big[..., 0] + big[..., 2]) / 2
        tall = ndimage.gaussian_filter((green - green.mean()) / (green.std() + 1e-6), 2, mode='wrap')
        crowns = np.clip((tall + 0.15) * 3, 0, 1)
        # (whole in the middle of its patch, its crowns only towards the rim, and nothing past it)
        core = np.clip((wgt - 0.55) * 4, 0, 1)
        rim = np.clip(wgt * 4, 0, 1)
        m = np.maximum(core, rim * crowns)
        m = ndimage.gaussian_filter(m, 0.8, mode='wrap')[..., None]
        out = big * m + out * (1 - m)

pic = Image.fromarray(out.clip(0, 255).astype(np.uint8))
path = f'images/terrain/{a.biome}.webp'
pic.save(path, 'WEBP', quality=a.quality, method=6)
print(f'{path}: {pic.width}×{pic.height} from {len(tiles)} picture(s), average {target} (the first was #{"".join(f"{int(v):02x}" for v in mean)})')
