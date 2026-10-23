# Makes a standing sprite's idle anew from its drawing (sprites/hires/): it breathes, the body sinking and
# rising with the head a moment behind and the tail swaying, while the feet stay planted and each leg
# stretches evenly from foot to hip (so nothing slides over anything else). Writes its motion
# (scripts/motion/, which scars and gear follow) and the animated sprite.
# --edge first cleans the drawing's rim: a cut from a light background leaves light pixels outside its
# dark outline, which are turned back into the outline's soft edge.
# Usage: python3 scripts/idle.py adult/rex-m [--edge] [--hip 250 --ankle 430 --neck 640 --rump 380]
#   (where the legs start and stop bending, where the neck starts and the tail starts, in px of the
#   sprite, which is 480 tall; each defaults to a share of the sprite's size)
# then python3 scripts/sheets.py, node scripts/version.js, node --test  (needs Pillow, numpy, scipy, opencv)
import argparse, json
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('name')
ap.add_argument('--edge', action='store_true')
for k in ('hip', 'ankle', 'neck', 'rump'):
    ap.add_argument('--' + k, type=float)
ap.add_argument('--frames', type=int, default=24)
ap.add_argument('--body', type=float, default=4, help='how far the body sinks, px')
ap.add_argument('--head', type=float, default=4, help='how much more the head moves, px')
ap.add_argument('--tail', type=float, default=6, help='how far the tail tip sways, px')
a = ap.parse_args()

hires_path, sprite = f'sprites/hires/{a.name}.webp', f'sprites/{a.name}.webp'
hires = np.asarray(Image.open(hires_path).convert('RGBA')).astype(np.float32)


def premultiplied(img):
    pm = img.astype(np.float32).copy()
    pm[..., :3] *= pm[..., 3:4] / 255
    return pm


def unpremultiply(r):
    al = r[..., 3:4] / 255
    r[..., :3] = np.where(al > 0, r[..., :3] / np.maximum(al, 1e-6), 0)
    return np.clip(r, 0, 255)


if a.edge:
    # (seen over white, each pixel near the outside is ink blended with the background: how dark it is
    # says how much ink it holds, so it becomes ink at that strength; inside the rim nothing changes)
    al = hires[..., 3] / 255
    over_white = hires[..., :3] * al[..., None] + 255 * (1 - al[..., None])
    lum = over_white @ np.float32([0.299, 0.587, 0.114])
    outside = al < 0.02
    depth = ndimage.distance_transform_edt(~outside)
    rim = (depth > 0) & (depth <= 3.5)
    inky = (lum < 70) & (al > 0.9) & (depth <= 10)
    ink = np.median(hires[inky][:, :3], axis=0) if inky.any() else np.float32([28, 24, 22])
    ink_lum = float(ink @ np.float32([0.299, 0.587, 0.114]))
    strength = np.clip((255 - lum) / (255 - ink_lum), 0, 1)
    # (only where it is lighter than the ink: the outline itself and anything darker stay as drawn)
    fix = rim & (lum > ink_lum + 8)
    hires[fix, :3] = ink
    hires[fix, 3] = np.minimum(hires[fix, 3], strength[fix] * 255)
    hires[outside] = 0
    Image.fromarray(hires.astype(np.uint8)).save(hires_path, 'WEBP', quality=92, method=6)
    print(f'{hires_path}: {int(fix.sum())} rim pixels turned back into the outline\'s edge (ink {ink.round().astype(int).tolist()})')

# the sprite: the drawing at its size
sw, sh = Image.open(sprite).size
f0 = unpremultiply(cv2.resize(premultiplied(hires), (sw, sh), interpolation=cv2.INTER_AREA))
ys, xs = np.where(f0[..., 3] > 128)
top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
H, W = bottom - top, right - left
hip = a.hip if a.hip is not None else top + 0.52 * H
ankle = a.ankle if a.ankle is not None else top + 0.88 * H
neck = a.neck if a.neck is not None else left + 0.72 * W
rump = a.rump if a.rump is not None else left + 0.42 * W

smooth = lambda v: (lambda c: c * c * (3 - 2 * c))(np.clip(v, 0, 1))


def moves(x, y, t):
    """where the skin at (x, y) of the first frame is at time t (0..1), as (dx, dy)"""
    breath = (1 - np.cos(2 * np.pi * t)) / 2
    late = (1 - np.cos(2 * np.pi * (t - 0.08))) / 2
    legs = 1 - smooth((y - hip) / (ankle - hip))           # 1 at the hip and above, 0 at the ankle and below
    head = smooth((x - neck) / (right - neck)) * (1 - smooth((y - hip + 0.15 * H) / (0.15 * H)))
    tail = smooth((rump - x) / (rump - left)) ** 1.3
    # (it sinks as it breathes out rather than rising, so a head drawn against the top is never cut off)
    dy = a.body * breath * legs + a.head * late * head + a.tail * np.sin(2 * np.pi * (t - 0.12)) * tail
    return np.zeros_like(dy), dy


# the motion, on the grid scripts/sheets.py and the game read (a point every step px, from step/2)
step = 16
gx, gy = np.arange(step // 2, sw, step, dtype=np.float32), np.arange(step // 2, sh, step, dtype=np.float32)
GX, GY = np.meshgrid(gx, gy)
d = [np.stack(moves(GX, GY, k / a.frames), -1).round(3).tolist() for k in range(a.frames)]
json.dump({'step': step, 'gw': len(gx), 'gh': len(gy), 'frames': a.frames, 'd': d}, open(f'scripts/motion/{a.name}.json', 'w'))

# the frames: each pixel taken from where its skin was
X, Y = np.meshgrid(np.arange(sw, dtype=np.float32), np.arange(sh, dtype=np.float32))
src = premultiplied(f0)
frames = []
for k in range(a.frames):
    dx, dy = moves(X, Y, k / a.frames)
    r = cv2.remap(src, (X - dx).astype(np.float32), (Y - dy).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    frames.append(Image.fromarray(unpremultiply(r).astype(np.uint8)))
src_js = open('js/sheets.js').read()
ms = json.loads(src_js[src_js.index('{'):src_js.rindex('}') + 1]).get(sprite, {}).get('ms', 95)
frames[0].save(sprite, 'WEBP', save_all=True, append_images=frames[1:], duration=ms, loop=0, quality=90, method=6)
print(f'{sprite}: {a.frames} frames of {ms} ms; legs bend from y {hip:.0f} to {ankle:.0f}, head from x {neck:.0f}, tail from x {rump:.0f}')
