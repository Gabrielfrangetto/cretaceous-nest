# Cuts a sheet of the player's bodies (the same picture on a pure white and a pure black background,
# the figures side by side in right-facing profile, slim to muscular) into one picture each,
# sprites/player/<sex>-<build>.webp, all on one canvas: the same size, feet on its bottom, the back of
# the head at the same place, so every build stands the same and the pieces laid on (hair, beard, eyes)
# fit each by its head; and its skin alone in grey (…-skin.webp), for the game to tint. The head of each (its box, in the canvas's pixels) goes in
# sprites/player/bodies.json, for those pieces.
# Usage: python3 scripts/bodies.py white.jpg black.jpg male [--builds slim,average,heavy,muscular]
#   [--height 520]   (needs Pillow, numpy, scipy)
import argparse, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('white')
ap.add_argument('black')
ap.add_argument('sex')
ap.add_argument('--builds', default='slim,average,heavy,muscular')
ap.add_argument('--height', type=int, default=520, help='pixels from the top of the head to the soles')
a = ap.parse_args()
builds = a.builds.split(',')

W = np.asarray(Image.open(a.white).convert('RGB')).astype(np.float32)
B = np.asarray(Image.open(a.black).convert('RGB').resize((W.shape[1], W.shape[0]), Image.LANCZOS)).astype(np.float32)
# (where the two differ, the background shows through: how much of each pixel is the figure)
alpha = np.clip(1 - (W - B).mean(2) / 255, 0, 1)
alpha[alpha < 0.04] = 0
alpha[alpha > 0.96] = 1
rgb = np.where(alpha[..., None] > 0.97, W, B / np.maximum(alpha[..., None], 1e-3))
pic = np.dstack([np.clip(rgb, 0, 255), alpha * 255])

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
    cut = pic[ys, xs].copy()
    cut[..., 3] *= ndimage.binary_dilation(m, iterations=2)
    h = ys.stop - ys.start
    # the head: about a sixth of the figure from its top, its back (left) and front (right)
    # edges taken above the jaw (lower, a heavy one's shoulders would count)
    top = cut[: int(h * 0.105), :, 3] > 128
    cols = np.where(top.any(0))[0]
    head = [int(cols[0]), 0, int(cols[-1]), int(round(h / 6.2))]
    cuts.append((cut, head, h))

# all at one scale, their heights as drawn (a heavier one isn't taller), the tallest at --height
k = a.height / max(h for _, _, h in cuts)
# (the back of the head lined up: the most of any figure's width behind it, and in front)
back = max(head[0] for _, head, _ in cuts) * k
front = max(c.shape[1] - head[0] for c, head, _ in cuts) * k
cw, ch = int(np.ceil(back + front)) + 8, a.height + 8
out = {}
path = 'sprites/player/bodies.json'
if os.path.exists(path):
    out = json.load(open(path))
for (cut, head, h), build in zip(cuts, builds):
    img = Image.fromarray(cut.astype(np.uint8))
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    x, y = int(round(4 + back - head[0] * k)), ch - 4 - img.height
    canvas = Image.new('RGBA', (cw, ch))
    canvas.paste(img, (x, y))
    canvas.save(f'sprites/player/{a.sex}-{build}.webp', 'WEBP', quality=90, method=6)
    # its skin alone, in grey (its light and shade), for the game to tint to the skin chosen: pinkish
    # and bright enough (the tunic is greyer, the shorts darker), the outline left out
    px = np.asarray(canvas).astype(np.float32)
    r, g, bl, al = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
    skin = (r - bl > 62) & (r > 172) & (g < r * 0.86) & (al > 0)
    skin = ndimage.binary_opening(skin, iterations=1)
    lum = (0.3 * r + 0.59 * g + 0.11 * bl)
    lit = np.percentile(lum[skin], 90) if skin.any() else 255
    grey = np.clip(lum / lit * 235, 0, 255)
    soft = ndimage.gaussian_filter(skin.astype(np.float32), 0.7) * (al / 255)
    Image.fromarray(np.dstack([grey, grey, grey, soft * 255]).astype(np.uint8)).save(f'sprites/player/{a.sex}-{build}-skin.webp', 'WEBP', quality=90, method=6)
    out[f'{a.sex}-{build}'] = {'w': cw, 'h': ch, 'head': [round(x + head[0] * k), round(y + head[1] * k), round(x + head[2] * k), round(y + head[3] * k)]}
    print(f'sprites/player/{a.sex}-{build}.webp', out[f'{a.sex}-{build}'])
json.dump(out, open(path, 'w'), indent=1)
