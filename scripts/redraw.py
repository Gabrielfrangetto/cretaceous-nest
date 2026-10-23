# Puts a new drawing in place of an animated sprite's old one, from a pair of the same image on a pure
# white and a pure black background (docs/ART.md): the pair gives the exact soft edge, the new drawing is
# fitted onto the old one's place (so its scars and gear stay where they were), and its idle is made
# with the same stored motion (scripts/motion/).
# Usage: python3 scripts/redraw.py white.jpg black.jpg juvenile/raptor-m  (needs Pillow, numpy, scipy, opencv)
# then python3 scripts/sheets.py, node scripts/version.js, node --test
import json, sys
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

white, black, name = sys.argv[1:4]
W = np.asarray(Image.open(white).convert('RGB')).astype(np.float32)
B = np.asarray(Image.open(black).convert('RGB')).astype(np.float32)
if W.shape != B.shape:
    sys.exit('the white and the black image are not the same size')

# the matte: on white W = a*c + (1-a)*255, on black B = a*c
a = np.clip(1 - (W - B).mean(2) / 255, 0, 1)
a = np.where(a < 0.03, 0, a)
body = a > 0.5
# (a hole in the body that is real background, like a neck curled round, stays clear; specks of noise
# inside the body are filled)
holes, nh = ndimage.label(ndimage.binary_fill_holes(body) & ~body)
fill = np.zeros_like(body)
for i in range(1, nh + 1):
    h = holes == i
    if a[h].mean() > 0.2 or h.sum() < 30:
        fill |= h
solid = body | fill
a = np.where(ndimage.binary_erosion(solid, iterations=3), 1, a)
a = np.where(a > 0.97, 1, a)
lab, n = ndimage.label(a > 0.03)
if n > 1:
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    a = np.where(np.isin(lab, 1 + np.where(sizes >= 200)[0]), a, 0)
c = np.where(a[..., None] > 0.97, W, B / np.maximum(a[..., None], 1e-3))
new = np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.float32)


def unpremultiply(r):
    al = r[..., 3:4] / 255
    r[..., :3] = np.where(al > 0, r[..., :3] / np.maximum(al, 1e-6), 0)
    return np.clip(r, 0, 255)


def premultiplied(img):
    pm = img.astype(np.float32).copy()
    pm[..., :3] *= pm[..., 3:4] / 255
    return pm


old = np.asarray(Image.open(f'sprites/hires/{name}.webp').convert('RGBA')).astype(np.float32)
oh, ow = old.shape[:2]


def place(s, tx, ty):
    r = cv2.warpAffine(premultiplied(new), np.float32([[s, 0, tx], [0, s, ty]]), (ow, oh),
                       flags=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC, borderValue=0)
    return unpremultiply(np.clip(r, 0, 255))


def bbox(al, t=128):
    ys, xs = np.where(al > t)
    return xs.min(), ys.min(), xs.max(), ys.max()


# fitted onto the old drawing: by their outlines, then the shift that overlaps them best, over a few sizes
nb, ob = bbox(new[..., 3]), bbox(old[..., 3])
s0 = ((ob[3] - ob[1]) / (nb[3] - nb[1]) + (ob[2] - ob[0]) / (nb[2] - nb[0])) / 2
oa = (old[..., 3] / 255).astype(np.float32)
best = None
for s in s0 * np.linspace(0.96, 1.04, 17):
    tx, ty = ob[0] - nb[0] * s, ob[1] - nb[1] * s
    m = np.eye(2, 3, dtype=np.float32)
    try:
        _, m = cv2.findTransformECC(oa, (place(s, tx, ty)[..., 3] / 255).astype(np.float32), m, cv2.MOTION_TRANSLATION,
                                    (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5), None, 5)
    except cv2.error:
        pass
    tx, ty = tx - m[0, 2], ty - m[1, 2]
    na = place(s, tx, ty)[..., 3] / 255
    iou = np.minimum(na, oa).sum() / np.maximum(na, oa).sum()
    if best is None or iou > best[0]:
        best = (iou, s, tx, ty)
iou, s, tx, ty = best
# (all of it inside the canvas: shrunk just enough, then slid in, 2 px from each side)
x0, y0, x1, y1 = [float(v) for v in bbox(new[..., 3], 8)]
s2 = min(s, (ow - 4) / (x1 - x0 + 1), (oh - 4) / (y1 - y0 + 1))
tx, ty, s = tx + (s - s2) * (x0 + x1) / 2, ty + (s - s2) * (y0 + y1) / 2, s2
tx = min(max(tx, 2 - x0 * s), ow - 3 - x1 * s)
ty = min(max(ty, 2 - y0 * s), oh - 3 - y1 * s)
hires = place(s, tx, ty).astype(np.uint8)
Image.fromarray(hires).save(f'sprites/hires/{name}.webp', 'WEBP', quality=92, method=6)

# the idle: the drawing at the sprite's size, each frame moved as the stored motion says
sprite = f'sprites/{name}.webp'
sw, sh = Image.open(sprite).size
src = open('js/sheets.js').read()
ms = json.loads(src[src.index('{'):src.rindex('}') + 1])[sprite]['ms']
f0 = unpremultiply(cv2.resize(premultiplied(hires), (sw, sh), interpolation=cv2.INTER_AREA))
motion = json.load(open(f'scripts/motion/{name}.json'))
X, Y = np.meshgrid(np.arange(sw, dtype=np.float32), np.arange(sh, dtype=np.float32))


def frame(k):
    d = np.array(motion['d'][k], np.float32)
    st = motion['step']
    # (grid point i sits at st/2 + i*st)
    grow = lambda g: np.pad(cv2.resize(g, None, fx=st, fy=st, interpolation=cv2.INTER_LINEAR),
                            ((0, max(0, sh - g.shape[0] * st)), (0, max(0, sw - g.shape[1] * st))), mode='edge')[:sh, :sw]
    r = cv2.remap(premultiplied(f0), X - grow(d[..., 0]), Y - grow(d[..., 1]), cv2.INTER_LINEAR,
                  borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    return Image.fromarray(unpremultiply(r).astype(np.uint8))


frames = [frame(k) for k in range(motion['frames'])]
frames[0].save(sprite, 'WEBP', save_all=True, append_images=frames[1:], duration=ms, loop=0, quality=90, method=6)
print(f'{name}: fitted at {s:.3f}x, outline overlap with the old drawing {iou:.3f}; {len(frames)} frames of {ms} ms')
