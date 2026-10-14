# Turns a generated dinosaur image into a game sprite: removes the plain background, crops,
# scales to 240 px tall and saves a PNG. Cross-platform twin of scripts/cutout.ps1 (needs Pillow).
# The background colour is read from the image corners, so white, dark grey or chroma green all work.
# Usage: python scripts/cutout.py image.png sprites/rex-f.png [--flip] [--height 240] [--tol 60]
# --flip mirrors images drawn facing left; the game expects sprites facing right.
# --tol is how far (RGB distance) a colour may be from the background and still count as background.
import argparse
from collections import deque
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out')
ap.add_argument('--height', type=int, default=240)
ap.add_argument('--flip', action='store_true')
ap.add_argument('--tol', type=float, default=60)
a = ap.parse_args()

im = Image.open(a.src).convert('RGBA')
w, h = im.size
px = im.load()

# background = the median of the opaque pixels in the four corner patches; an image that is
# already transparent there keeps its own alpha and only gets cropped and scaled
samples = [px[x, y][:3] for cx, cy in ((0, 0), (w - 8, 0), (0, h - 8), (w - 8, h - 8))
           for x in range(cx, cx + 8) for y in range(cy, cy + 8) if px[x, y][3] >= 40]
bg_col = tuple(sorted(s[k] for s in samples)[len(samples) // 2] for k in range(3)) if len(samples) > 128 else None
dist = lambda c: sum((c[k] - bg_col[k]) ** 2 for k in range(3)) ** .5 if bg_col else 999

bg = bytearray(w * h)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        q.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        q.append((x, y))
while q:
    x, y = q.popleft()
    i = y * w + x
    if bg[i]:
        continue
    c = px[x, y]
    if c[3] >= 40 and dist(c) > a.tol:
        continue
    bg[i] = 1
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx]:
            q.append((nx, ny))

box = [w, h, -1, -1]
for y in range(h):
    for x in range(w):
        i = y * w + x
        if bg[i]:
            px[x, y] = (0, 0, 0, 0)
            continue
        edge = (x > 0 and bg[i - 1]) or (x < w - 1 and bg[i + 1]) or (y > 0 and bg[i - w]) or (y < h - 1 and bg[i + w])
        r, g, b, al = px[x, y]
        if edge and al == 255 and bg_col:
            # soften the rim: pixels blended with the backdrop get partial alpha, and the backdrop is taken back out
            al_f = min(1.0, max(0.15, dist((r, g, b)) / (a.tol * 2.5)))
            un = lambda c, k: max(0, min(255, round((c - bg_col[k] * (1 - al_f)) / al_f)))
            px[x, y] = (un(r, 0), un(g, 1), un(b, 2), round(al_f * 255))
        box = [min(box[0], x), min(box[1], y), max(box[2], x), max(box[3], y)]

pad = 6
crop = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad + 1), min(h, box[3] + pad + 1)))
s = a.height / crop.height
out = crop.resize((max(1, round(crop.width * s)), a.height), Image.LANCZOS)
if a.flip:
    out = out.transpose(Image.FLIP_LEFT_RIGHT)
out.save(a.out, optimize=True)
print(f'{a.out}: {w}x{h}, background {bg_col or "already transparent"} -> crop {crop.width}x{crop.height} -> {out.width}x{out.height}')
