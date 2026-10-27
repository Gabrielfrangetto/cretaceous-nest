# Cuts a sheet of the player's bodies (the same picture on a pure white and a pure black background,
# the figures side by side in right-facing profile, slim to muscular) into one picture each,
# sprites/player/<sex>-<build>.webp, all on one canvas: the same size, feet on its bottom, the back of
# the head at the same place, so every build stands the same and the pieces laid on (hair, beard, eyes)
# fit each by its head; and the same in other skin tones painted (--tone). The head of each (its box, in the canvas's pixels) goes in
# sprites/player/bodies.json, for those pieces.
# A sheet with real transparency (a PNG or WebP with alpha) needs no black one: pass - for it.
# Usage: python3 scripts/bodies.py white.jpg black.jpg male [--tone tan tan.jpg ...] [--builds slim,average,heavy,muscular]
#   [--height 520]   (needs Pillow, numpy, scipy)
import argparse, json, os
import numpy as np
from PIL import Image
from scipy import ndimage
from defringe import clean

ap = argparse.ArgumentParser()
ap.add_argument('white')
ap.add_argument('black')
ap.add_argument('sex')
ap.add_argument('--builds', default='slim,average,heavy,muscular')
ap.add_argument('--tone', nargs=2, action='append', default=[], metavar=('NAME', 'IMAGE'), help='the same sheet with another skin tone painted, on pure black: cut by the outline of the first, saved as <sex>-<build>-<NAME>.webp')
ap.add_argument('--height', type=int, default=520, help='pixels from the top of the head to the soles')
a = ap.parse_args()
builds = a.builds.split(',')

src = Image.open(a.white)
if a.black == '-' and src.mode in ('RGBA', 'LA', 'P'):
    # (a sheet with real transparency: its own alpha, its own colours)
    px = np.asarray(src.convert('RGBA')).astype(np.float32)
    W, alpha = px[..., :3], px[..., 3] / 255
    rgb = W
else:
    W = np.asarray(src.convert('RGB')).astype(np.float32)
    B = np.asarray(Image.open(a.black).convert('RGB').resize((W.shape[1], W.shape[0]), Image.LANCZOS)).astype(np.float32)
    # (where the two differ, the background shows through: how much of each pixel is the figure)
    alpha = np.clip(1 - (W - B).mean(2) / 255, 0, 1)
    alpha[alpha < 0.04] = 0
    alpha[alpha > 0.96] = 1
    rgb = np.where(alpha[..., None] > 0.97, W, B / np.maximum(alpha[..., None], 1e-3))
pic = np.dstack([np.clip(rgb, 0, 255), alpha * 255])
# (each other tone: its colours, from a sheet on black, so a pixel partly figure is its colour times how
# much it is the figure; the outline is the first sheet's)
tones = [('', pic)]
for name, path in a.tone:
    T = np.asarray(Image.open(path).convert('RGB').resize((W.shape[1], W.shape[0]), Image.LANCZOS)).astype(np.float32)
    trgb = np.where(alpha[..., None] > 0.97, T, T / np.maximum(alpha[..., None], 1e-3))
    tones.append((f'-{name}', np.dstack([np.clip(trgb, 0, 255), alpha * 255])))

# the figures: the widest pieces, left to right
lab, n = ndimage.label(ndimage.binary_closing(alpha > 0.3, iterations=3))
boxes = ndimage.find_objects(lab)
sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
figs = sorted([i for i in range(n) if sizes[i] > sizes.max() * 0.2], key=lambda i: boxes[i][1].start)
assert len(figs) == len(builds), f'{len(figs)} figures found, {len(builds)} builds named'

cuts = []
for i in figs:
    ys, xs = boxes[i]
    m = lab[ys, xs] == i + 1
    keep = ndimage.binary_dilation(m, iterations=2)
    cut = pic[ys, xs].copy()
    cut[..., 3] *= keep
    others = [(suffix, p[ys, xs].copy()) for suffix, p in tones[1:]]
    for _, o in others: o[..., 3] *= keep
    h = ys.stop - ys.start
    # the head: about a sixth of the figure from its top, its back (left) and front (right)
    # edges taken above the jaw (lower, a heavy one's shoulders would count)
    top = cut[: int(h * 0.105), :, 3] > 128
    cols = np.where(top.any(0))[0]
    head = [int(cols[0]), 0, int(cols[-1]), int(round(h / 6.2))]
    cuts.append((cut, head, h, others))

# all at one scale, their heights as drawn (a heavier one isn't taller), the tallest at --height
k = a.height / max(c[2] for c in cuts)
# (the back of the head lined up: the most of any figure's width behind it, and in front)
back = max(c[1][0] for c in cuts) * k
front = max(c[0].shape[1] - c[1][0] for c in cuts) * k
cw, ch = int(np.ceil(back + front)) + 8, a.height + 8
out = {}
path = 'sprites/player/bodies.json'
if os.path.exists(path):
    out = json.load(open(path))
for (cut, head, h, others), build in zip(cuts, builds):
    img = Image.fromarray(cut.astype(np.uint8))
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    x, y = int(round(4 + back - head[0] * k)), ch - 4 - img.height
    canvas = Image.new('RGBA', (cw, ch))
    canvas.paste(img, (x, y))
    clean(canvas).save(f'sprites/player/{a.sex}-{build}.webp', 'WEBP', quality=90, method=6)
    for suffix, o in others:
        oi = Image.fromarray(o.astype(np.uint8)).resize(img.size, Image.LANCZOS)
        oc = Image.new('RGBA', (cw, ch)); oc.paste(oi, (x, y))
        clean(oc).save(f'sprites/player/{a.sex}-{build}{suffix}.webp', 'WEBP', quality=90, method=6)
    out[f'{a.sex}-{build}'] = {'w': cw, 'h': ch, 'head': [round(x + head[0] * k), round(y + head[1] * k), round(x + head[2] * k), round(y + head[3] * k)]}
    print(f'sprites/player/{a.sex}-{build}.webp', out[f'{a.sex}-{build}'])
json.dump(out, open(path, 'w'), indent=1)
