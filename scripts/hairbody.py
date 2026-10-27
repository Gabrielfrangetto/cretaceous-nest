# Cuts a hairstyle painted on every build (a sheet of the bodies, as scripts/bodies.py's, now with
# hair painted in neutral grey, on plain white) and fits each build's hair onto the body of that build
# already cut: the figure (its hair left out) laid over the body where the two match best, from the
# shoulders down, and the hair moved with it, nothing stretched. sprites/player/hair/<sex>-<build>-
# <style>.webp, on the body's canvas with PAD pixels more above it (as js/art.js HAIR_PAD), in grey
# for the game to colour.
# Usage: python3 scripts/hairbody.py sheet.jpg male crop   (Pillow, numpy, scipy)
import argparse, json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('sheet')
ap.add_argument('sex')
ap.add_argument('style')
ap.add_argument('--builds', default='slim,average,heavy,muscular')
a = ap.parse_args()
builds = a.builds.split(',')
PAD = 64

W = np.asarray(Image.open(a.sheet).convert('RGB')).astype(np.float32)
# (the figures: all but the white reaching in from the sheet's edges)
pale = W.min(2) > 232
lab, _ = ndimage.label(pale)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
back = np.isin(lab, list(edge))
# (and white closed in by the figure, between an arm and the body, a hand and a leg: big enough not to
# be a highlight, and white right through, as no paint is)
sizes_w = ndimage.sum(np.ones(pale.shape), lab, range(1, lab.max() + 1))
for j in range(1, lab.max() + 1):
    if j in edge or sizes_w[j - 1] < 60: continue
    if W[lab == j].min(1).mean() > 244: back |= lab == j
rim = back & ndimage.binary_dilation(~back, iterations=2)
alpha = np.where(back, 0.0, 1.0)
alpha[rim] = np.clip((255 - W[rim].min(1)) / 70, 0, 1)
# (the hair: no colour, not dark; and the ink round it)
mx, mn = W.max(2), W.min(2)
sat = (mx - mn) / np.maximum(mx, 1)
# (the skin and the tunic are well coloured, above 0.35; the grey of the hair, painted a little warm in
# places, below 0.25, its highlights near white)
grey = (sat < 0.25) & (mx > 60) & (mx < 240) & (alpha > 0.5)
# (only about the head: the white closed in between the legs is no hair)
ink_rows = np.where((alpha > 0.5).any(1))[0]
grey[ink_rows[0] + int((ink_rows[-1] - ink_rows[0]) * 0.35):] = False
grey = ndimage.binary_opening(grey, iterations=1)
lab2, n2 = ndimage.label(grey)
sizes2 = ndimage.sum(np.ones_like(alpha), lab2, range(1, n2 + 1))
grey = np.isin(lab2, [i + 1 for i in range(n2) if sizes2[i] > 150])
dark = (mx < 90) & (alpha > 0.3)
hair = ndimage.binary_closing(grey | (dark & ndimage.binary_dilation(grey, iterations=4)), iterations=3)
# (no holes in it: a strand's ink or a warmer touch inside the hair is hair)
hair = ndimage.binary_fill_holes(hair) & ~back
# (the ink on the hair's outer edge, where it meets the white: a little more of it)
hair |= ndimage.binary_dilation(hair, iterations=2) & back & (alpha > 0)
lum = W @ np.float32([0.3, 0.59, 0.11])
hairpic = np.dstack([lum, lum, lum, alpha * 255 * hair])

figs, n = ndimage.label(alpha > 0.3)
boxes = ndimage.find_objects(figs)
sizes = ndimage.sum(np.ones_like(alpha), figs, range(1, n + 1))
keep = sorted([i for i in range(n) if sizes[i] > sizes.max() * 0.2], key=lambda i: boxes[i][1].start)
assert len(keep) == len(builds), f'{len(keep)} figures found, {len(builds)} builds named'

info = json.load(open('sprites/player/bodies.json'))
os.makedirs('sprites/player/hair', exist_ok=True)
for i, build in zip(keep, builds):
    name = f'{a.sex}-{build}'
    base = Image.open(f'sprites/player/{name}.webp')
    ba = np.asarray(base)[..., 3] > 128
    bb = base.getbbox()
    hy = info[name]['head'][3]
    ys, xs = boxes[i]
    own = figs[ys, xs] == i + 1
    body = own & ~hair[ys, xs]
    # (its first guess: as tall from its feet to its body's top as the body, without the hair)
    rows = np.where(body.any(1))[0]
    k0 = (bb[3] - bb[1]) / (rows[-1] - rows[0] + 1)
    best = None
    for k in k0 * np.linspace(0.94, 1.06, 13):
        m = Image.fromarray((body * 255).astype(np.uint8)).resize((max(1, round(body.shape[1] * k)), max(1, round(body.shape[0] * k))), Image.BILINEAR)
        m = np.asarray(m) > 128
        mh, mw = m.shape
        # (feet on the body's ground; across, its middle about the body's)
        cols = np.where(m.any(0))[0]
        bcols = np.where(ba.any(0))[0]
        x_guess = int((bcols[0] + bcols[-1]) / 2 - (cols[0] + cols[-1]) / 2)
        y_guess = bb[3] - mh
        for dy in range(-6, 7, 2):
            for dx in range(-8, 9, 2):
                x, y = x_guess + dx, y_guess + dy
                canvas = np.zeros_like(ba)
                sy0, sx0 = max(0, -y), max(0, -x)
                ty0, tx0 = max(0, y), max(0, x)
                hgt, wid = min(mh - sy0, ba.shape[0] - ty0), min(mw - sx0, ba.shape[1] - tx0)
                if hgt <= 0 or wid <= 0: continue
                canvas[ty0:ty0 + hgt, tx0:tx0 + wid] = m[sy0:sy0 + hgt, sx0:sx0 + wid]
                # (matched from the shoulders down: the head is where the two drawings differ)
                A, Bm = canvas[hy:], ba[hy:]
                score = (A & Bm).sum() / max(1, (A | Bm).sum())
                if best is None or score > best[0]: best = (score, k, x, y)
    score, k, x, y = best
    # (then the head itself, for its last few pixels: the face from the eyes to the chin, its hair left
    # out, onto the body's; the hair moved with it, its size a little up or down as the skull is)
    hx0, hy0, hx1, hy1 = info[name]['head']
    mid = (hy0 + hy1) // 2
    bface = ba[mid:hy1 + 4, hx0 - 6:hx1 + 6]
    fig_full = (own & (alpha[ys, xs] > 0.3))
    hbest = None
    for kk in k * np.linspace(0.92, 1.08, 9):
        m = np.asarray(Image.fromarray((body * 255).astype(np.uint8)).resize((max(1, round(body.shape[1] * kk)), max(1, round(body.shape[0] * kk))), Image.BILINEAR)) > 128
        # (keeping the head where the body match put it: scaled about the chin)
        cy = (hy1 - y) / k
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                X, Y = round(x + dx - (kk - k) * 0), round(y + dy - (kk - k) * cy)
                c = np.zeros_like(ba)
                sy0, sx0, ty0, tx0 = max(0, -Y), max(0, -X), max(0, Y), max(0, X)
                hgt, wid = min(m.shape[0] - sy0, ba.shape[0] - ty0), min(m.shape[1] - sx0, ba.shape[1] - tx0)
                if hgt <= 0 or wid <= 0: continue
                c[ty0:ty0 + hgt, tx0:tx0 + wid] = m[sy0:sy0 + hgt, sx0:sx0 + wid]
                A = c[mid:hy1 + 4, hx0 - 6:hx1 + 6]
                sc = (A & bface).sum() / max(1, (A | bface).sum())
                if hbest is None or sc > hbest[0]: hbest = (sc, kk, X, Y)
    _, k, x, y = hbest
    hp = Image.fromarray(np.clip(hairpic[ys, xs], 0, 255).astype(np.uint8))
    hp = hp.resize((max(1, round(hp.width * k)), max(1, round(hp.height * k))), Image.LANCZOS)
    canvas = Image.new('RGBA', (base.width, base.height + PAD))
    canvas.alpha_composite(hp, (x, y + PAD)) if x >= 0 and y + PAD >= 0 else canvas.paste(hp, (x, y + PAD), hp)
    canvas.save(f'sprites/player/hair/{name}-{a.style}.webp', 'WEBP', quality=90, method=6)
    print(f'{name}-{a.style}', 'body %.3f' % score, 'face %.3f' % hbest[0], 'scale %.3f' % k)
