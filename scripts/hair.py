# Cuts the hairstyles of a sheet (the same bald head drawn several times side by side, each with a
# hairstyle painted in neutral grey; on a pure white and a pure black background) and fits each onto
# every body of that sex (scripts/bodies.py): sprites/player/hair/<sex>-<build>-<style>.webp, on the
# body's own canvas with PAD pixels more above it, in grey for the game to colour. The hair is told from the skin by having no colour;
# the ink beside it comes with it. Fitted by the first head, its hair short enough to be the skull: its
# back and top go to the back and top of the body's head, its nose to the body's nose.
# Usage: python3 scripts/hair.py white.jpg black.jpg male crop,curly,ponytail,undercut   (Pillow, numpy, scipy)
import argparse, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('white')
ap.add_argument('black')
ap.add_argument('sex')
ap.add_argument('styles')
ap.add_argument('--builds', default='slim,average,heavy,muscular')
a = ap.parse_args()
styles, builds = a.styles.split(','), a.builds.split(',')
PAD = 64   # (as js/art.js HAIR_PAD)

W = np.asarray(Image.open(a.white).convert('RGB')).astype(np.float32)
B = np.asarray(Image.open(a.black).convert('RGB').resize((W.shape[1], W.shape[0]), Image.LANCZOS)).astype(np.float32)
al = np.clip(1 - (W - B).mean(2) / 255, 0, 1)
al[al < 0.05] = 0
al[al > 0.95] = 1
rgb = np.where(al[..., None] > 0.97, W, B / np.maximum(al[..., None], 1e-3))
mx, mn = rgb.max(2), rgb.min(2)
sat = (mx - mn) / np.maximum(mx, 1)
grey = ndimage.binary_opening((sat < 0.13) & (mx > 55) & (al > 0.5), iterations=1)
dark = (mx < 70) & (al > 0.5)
hair = ndimage.binary_closing(grey | (dark & ndimage.binary_dilation(grey, iterations=4)), iterations=2) & (al > 0.1)
# (made grey through and through: the ink dark grey, the hair its own grey)
lum = rgb @ np.float32([0.3, 0.59, 0.11])
pic = np.dstack([lum, lum, lum, al * 255 * hair])

lab, n = ndimage.label(al > 0.3)
boxes = ndimage.find_objects(lab)
sizes = ndimage.sum(np.ones_like(al), lab, range(1, n + 1))
figs = sorted([i for i in range(n) if sizes[i] > sizes.max() * 0.2], key=lambda i: boxes[i][1].start)
assert len(figs) == len(styles), f'{len(figs)} heads found, {len(styles)} styles named'
def nose(i):
    ys, xs = boxes[i]
    m = lab[ys, xs] == i + 1
    band = m[int(m.shape[0] * 0.4):int(m.shape[0] * 0.55)]
    return xs.start + int(np.where(band.any(0))[0].max())
heads = []
for i in figs:
    yy, xx = np.where((lab == i + 1) & hair)
    heads.append((nose(i), xx.min(), yy.min(), i))
nose1, back1, top1, _ = heads[0]
face = nose1 - back1

info = json.load(open('sprites/player/bodies.json'))
os.makedirs('sprites/player/hair', exist_ok=True)
for build in builds:
    name = f'{a.sex}-{build}'
    bx0, by0, bx1, by1 = info[name]['head']
    base = Image.open(f'sprites/player/{name}.webp')
    ba = np.asarray(base)[..., 3]
    band = ba[by0 + int((by1 - by0) * 0.45):by0 + int((by1 - by0) * 0.6)] > 128
    bnose = int(np.where(band.any(0))[0].max())
    k = (bnose - bx0) / face
    for (nx, _, _, i), style in zip(heads, styles):
        x0, y0, x1, y1 = nx - face * 2, top1 - face // 2, nx + face // 3, top1 + face * 2
        # (this head's hair alone, not a neighbour's reaching into the window)
        own = pic.copy()
        own[..., 3] *= ndimage.binary_dilation(lab == i + 1, iterations=2)
        cut = Image.fromarray(np.clip(own[max(0, y0):y1, max(0, x0):x1], 0, 255).astype(np.uint8))
        cut = cut.resize((max(1, round(cut.width * k)), max(1, round(cut.height * k))), Image.LANCZOS)
        # (room above the body's canvas, PAD pixels, for hair standing up off the head)
        canvas = Image.new('RGBA', (base.width, base.height + PAD))
        canvas.alpha_composite(cut, (round(bnose - (nx - max(0, x0)) * k), PAD + round(by0 - (top1 - max(0, y0)) * k)))
        canvas.save(f'sprites/player/hair/{name}-{style}.webp', 'WEBP', quality=90, method=6)
    print(name, 'scale %.3f' % k)
