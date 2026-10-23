# Makes a standing sprite's idle anew from its drawing (sprites/hires/): it breathes, the body sinking and
# rising with the head a moment behind and the tail swaying, while the feet stay planted. How much each
# point moves is set by how far it is from the ground *along the body*: a leg bends evenly from its foot
# to its hip, and everything farther (body, arms, hands, fingers and claws) moves as one, so nothing
# hanging from the body is stretched. Writes its motion (scripts/motion/, which scars and gear follow;
# its first frame is the drawing itself) and the animated sprite.
# --edge first cleans the drawing's rim: a cut from a light background leaves light pixels outside its
# dark outline, which are turned back into the outline's soft edge.
# Usage: python3 scripts/idle.py adult/rex-m [--edge] [--leg 230 --neck 640 --rump 380] [--preview PATH]
#   (how far up from the ground the legs bend, where the neck starts and where the tail starts, in px of
#   the sprite, which is 480 tall; each defaults to a share of the sprite's size)
# then python3 scripts/sheets.py, node scripts/version.js, node --test  (needs Pillow, numpy, scipy, opencv)
import argparse, json, os
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('name')
ap.add_argument('--edge', action='store_true')
for k in ('leg', 'neck', 'rump'):
    ap.add_argument('--' + k, type=float)
ap.add_argument('--frames', type=int, default=24)
ap.add_argument('--preview', help='only write a look at it here (PATH.png, how much each point moves; PATH.gif, the idle), nothing in the game')
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
body = f0[..., 3] > 128
ys, xs = np.where(body)
top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
H, W = bottom - top, right - left
leg = a.leg if a.leg is not None else 0.5 * H
neck = a.neck if a.neck is not None else left + 0.72 * W
rump = a.rump if a.rump is not None else left + 0.42 * W

smooth = lambda v: (lambda c: c * c * (3 - 2 * c))(np.clip(v, 0, 1))

# parts drawn in front of a leg (scripts/motion/fronts.json), like a folded wing over the far leg, move
# with the body and slide over the leg, rather than being reached through it
fronts = json.load(open('scripts/motion/fronts.json')).get(a.name, []) if os.path.exists('scripts/motion/fronts.json') else []
front = np.zeros(body.shape, np.uint8)
for poly in fronts:
    cv2.fillPoly(front, [np.int32(poly)], 1)
front = (front > 0) & body
walk = body & ~front

# how far each point of the body is from the ground, going through the body (grown out from where the
# feet touch the ground, a step at a time, square and cross steps in turn for rounder distances)
# (each foot is a piece of the body's lowest quarter whose bottom is near the ground, a foot drawn
# farther away a little higher; its sole is where it stands)
far = np.full(body.shape, np.inf, np.float32)
row = np.arange(body.shape[0])[:, None]
pieces, n = ndimage.label(walk & (row > bottom - 0.25 * H))
reached = np.zeros_like(walk)
for i in range(1, n + 1):
    py = np.where(pieces == i)[0]
    if py.max() >= bottom - 0.08 * H:
        reached |= (pieces == i) & (row >= py.max() - 0.025 * H)
far[reached] = 0
square, cross = np.ones((3, 3), np.uint8), cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
for i in range(1, body.size):
    grown = (cv2.dilate(reached.astype(np.uint8), square if i % 2 else cross) > 0) & walk & ~reached
    if not grown.any():
        break
    far[grown] = i
    reached |= grown
far[body & ~reached] = 10 * H   # (a part that does not reach the ground, or in front of one, moves with the body)
# out of the body, each point moves as the nearest point of it, so its edges move with it
_, (iy, ix) = ndimage.distance_transform_edt(~body, return_indices=True)
far = far[iy, ix]
# (1 at the hip and anything past it along the body, 0 at the toes)
sway = cv2.GaussianBlur(smooth(far / leg).astype(np.float32), (0, 0), 1.2)
# the head: the part in front of the neck, above its jaw; the tail: the part behind the rump
jaw = ys[xs >= right - 0.12 * W].max()
head_w = lambda x, y: smooth((x - neck) / (right - neck)) * (1 - smooth((y - jaw) / (0.06 * H)))
tail_w = lambda x: smooth((rump - x) / (rump - left)) ** 1.3


def field(x, y):
    """how much the body, the head and the tail move each point (x, y), from 0 to 1"""
    xi, yi = np.clip(np.round(x).astype(int), 0, body.shape[1] - 1), np.clip(np.round(y).astype(int), 0, body.shape[0] - 1)
    s = sway[yi, xi]
    return s, head_w(x, y) * s, tail_w(x) * s


def moves(x, y, t, w=None):
    """where the skin at (x, y) of the first frame is at time t (0..1), as (dx, dy); 0 at t = 0"""
    s, h, tl = w if w is not None else field(x, y)
    at = lambda t: (a.body * (1 - np.cos(2 * np.pi * t)) / 2 * s
                    + a.head * (1 - np.cos(2 * np.pi * (t - 0.08))) / 2 * h
                    + a.tail * np.sin(2 * np.pi * (t - 0.12)) * tl)
    # (it sinks as it breathes out rather than rising, so a head drawn against the top is never cut off)
    dy = at(t) - at(0)
    return np.zeros_like(dy), dy


if a.preview:
    X, Y = np.meshgrid(np.arange(sw, dtype=np.float32), np.arange(sh, dtype=np.float32))
    pw = field(X, Y)
    # (red: how much the body moves it, green: the head, blue: the tail; over the drawing, faded)
    look = np.dstack([pw[0], pw[1], pw[2]]) * 255 * 0.6 + f0[..., :3] * 0.4 * (f0[..., 3:4] / 255)
    Image.fromarray(np.clip(look, 0, 255).astype(np.uint8)).save(a.preview + '.png')
    src = premultiplied(f0)
    out = []
    for k in range(a.frames):
        dx, dy = moves(X, Y, k / a.frames, pw)
        r = unpremultiply(cv2.remap(src, (X - dx).astype(np.float32), (Y - dy).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0))
        bg = np.float32([34, 48, 34]) * (1 - r[..., 3:4] / 255) + r[..., :3] * (r[..., 3:4] / 255)
        out.append(Image.fromarray(bg.astype(np.uint8)))
    out[0].save(a.preview + '.gif', save_all=True, append_images=out[1:], duration=95, loop=0)
    print(f'{a.preview}.png, .gif: legs bend up to {leg:.0f} px along them, head from x {neck:.0f} above y {jaw}, tail from x {rump:.0f}')
    raise SystemExit

# the motion, on the grid scripts/sheets.py and the game read (a point every step px, from step/2)
step = 16
gx, gy = np.arange(step // 2, sw, step, dtype=np.float32), np.arange(step // 2, sh, step, dtype=np.float32)
GX, GY = np.meshgrid(gx, gy)
gw_ = field(GX, GY)
d = [np.stack(moves(GX, GY, k / a.frames, gw_), -1).round(3).tolist() for k in range(a.frames)]
json.dump({'step': step, 'gw': len(gx), 'gh': len(gy), 'frames': a.frames, 'd': d}, open(f'scripts/motion/{a.name}.json', 'w'))

# the frames: each pixel taken from where its skin was
X, Y = np.meshgrid(np.arange(sw, dtype=np.float32), np.arange(sh, dtype=np.float32))
src = premultiplied(f0)
frames, pw = [], field(X, Y)
for k in range(a.frames):
    dx, dy = moves(X, Y, k / a.frames, pw)
    r = cv2.remap(src, (X - dx).astype(np.float32), (Y - dy).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    frames.append(Image.fromarray(unpremultiply(r).astype(np.uint8)))
src_js = open('js/sheets.js').read()
ms = json.loads(src_js[src_js.index('{'):src_js.rindex('}') + 1]).get(sprite, {}).get('ms', 95)
frames[0].save(sprite, 'WEBP', save_all=True, append_images=frames[1:], duration=ms, loop=0, quality=90, method=6)
print(f'{sprite}: {a.frames} frames of {ms} ms; legs bend up to {leg:.0f} px along them, head from x {neck:.0f} above y {jaw}, tail from x {rump:.0f}')
