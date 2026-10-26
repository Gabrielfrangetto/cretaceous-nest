# Cuts the hairstyles of a sheet (the same bald head drawn several times side by side, each with a
# hairstyle painted in neutral grey; on a pure white and a pure black background) and fits each onto
# every body of that sex (scripts/bodies.py): sprites/player/hair/<sex>-<build>-<style>.webp, on the
# body's own canvas with PAD pixels more above it, in grey for the game to colour. The hair is told from the skin by having no colour;
# the ink beside it comes with it. Fitted by the skull's top, the ear and the nose (the ears marked by
# hand, on the sheet and in bodies.json).
# Usage: python3 scripts/hair.py white.jpg black.jpg male crop,curly,ponytail,undercut --ears '152,467;637,465;...'   (Pillow, numpy, scipy)
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
ap.add_argument('--ears', required=True, help='the middle of each head\'s ear on the sheet, x,y;x,y;... (marked by hand: an ear\'s line seldom closes, so it is not found)')
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
ears = [tuple(map(float, e.split(','))) for e in a.ears.split(';')]
assert len(ears) == len(styles), 'one ear for each head'
heads = []
for i, ear in zip(figs, ears):
    yy, xx = np.where((lab == i + 1) & hair)
    heads.append((nose(i), ear, i))
# (the skull's top: the first head's hair top, its hair short enough to be the skull; as high above
# its ear on every head, as they are all the same head)
_, ear1, i1 = heads[0]
top_over_ear = ear1[1] - np.where(((lab == i1 + 1) & hair).any(1))[0].min()
# (and the back of the skull: the first head's hair at its furthest back, as far behind the ear on every head)
back_of_ear = ear1[0] - np.where(((lab == i1 + 1) & hair).any(0))[0].min()

info = json.load(open('sprites/player/bodies.json'))
os.makedirs('sprites/player/hair', exist_ok=True)
for build in builds:
    name = f'{a.sex}-{build}'
    bx0, by0, bx1, by1 = info[name]['head']
    base = Image.open(f'sprites/player/{name}.webp')
    ba = np.asarray(base)[..., 3]
    band = ba[by0 + int((by1 - by0) * 0.45):by0 + int((by1 - by0) * 0.6)] > 128
    bnose = int(np.where(band.any(0))[0].max())
    # fitted by three points: the top of the skull, the middle of the ear and the tip of the nose, each
    # head's onto the body's (marked: bodies.json ear); across by ear to nose, up by top to ear
    ex0, ey0, ex1, ey1 = info[name]['ear']
    bear = ((ex0 + ex1) / 2, (ey0 + ey1) / 2)
    # (the hair cut away over the body's ear, so it shows in front, as drawn)
    earmask = np.zeros((ba.shape[0] + PAD, ba.shape[1]), bool)
    yy, xx = np.mgrid[0:earmask.shape[0], 0:earmask.shape[1]]
    earmask |= (((xx - bear[0]) / ((ex1 - ex0) / 2 + 1)) ** 2 + ((yy - PAD - bear[1]) / ((ey1 - ey0) / 2 + 1)) ** 2) <= 1
    for (nx, ear, i), style in zip(heads, styles):
        kx = (bnose - bear[0]) / (nx - ear[0])
        ky = (bear[1] - by0) / top_over_ear
        # (this head's hair alone, not a neighbour's reaching into the window)
        own = pic.copy()
        own[..., 3] *= ndimage.binary_dilation(lab == i + 1, iterations=2)
        span = nx - ear[0]
        x0, y0, x1, y1 = int(ear[0] - span * 1.6), int(ear[1] - top_over_ear * 1.4), int(nx + span * 0.3), int(ear[1] + top_over_ear * 1.6)
        x0, y0 = max(0, x0), max(0, y0)
        # (in two parts, split at the ear: behind it stretched so the hair's back meets the back of the
        # body's head, in front so its front meets the nose)
        kb = (bear[0] - bx0) / back_of_ear
        ex = int(round(ear[0]))
        canvas = Image.new('RGBA', (base.width, base.height + PAD))
        h = max(1, round((y1 - y0) * ky))
        # (the part behind the ear a little longer, under the other, so no seam shows where they meet)
        for lo, hi, k, at in ((x0, ex + 3, kb, bear[0] - (ear[0] - x0) * kb), (ex, x1, kx, bear[0] + (ex - ear[0]) * kx)):
            part = Image.fromarray(np.clip(own[y0:y1, lo:hi], 0, 255).astype(np.uint8))
            part = part.resize((max(1, round(part.width * k)), h), Image.LANCZOS)
            canvas.alpha_composite(part, (round(at), PAD + round(bear[1] - (ear[1] - y0) * ky)))
        c = np.asarray(canvas).copy()
        c[..., 3][earmask] = 0
        Image.fromarray(c).save(f'sprites/player/hair/{name}-{style}.webp', 'WEBP', quality=90, method=6)
    print(name, 'scale %.3f x %.3f' % ((bnose - bear[0]) / (heads[0][0] - heads[0][1][0]), (bear[1] - by0) / top_over_ear))
