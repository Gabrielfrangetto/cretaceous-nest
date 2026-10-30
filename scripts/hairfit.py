# Each face's own copy of a hairstyle. Every face and tone was painted afresh, and so was the figure
# the hair was painted on, so their ears and skulls sit a pixel or three apart: the hair cut round one
# ear shows skin beside another, or covers its rim. Each drawing's head is matched to the faceless body's
# by the skull (its outline behind the face) and its ear to the ear the hair was painted round (the
# figure scripts/hairbody.py --ref saved), and the hair moved by the one about the skull and by the other
# about the ear, blending between them; then brought a little over the ear's rim, and kept inside the
# head's own outline (the hair painted on the skull, not standing out from it).
# Saved as sprites/player/hair/<sex>-<face>-<build>[-<tone>]-<style>.webp (js/art.js takes it when there).
# Usage: python3 scripts/hairfit.py male crop refs/   (Pillow, numpy, scipy)
import json, sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage

sex, style, refdir = sys.argv[1:4]
info = json.load(open('sprites/player/bodies.json'))
PAD = 64

def ink(a):
    # (dark lines, and the outline against nothing)
    al = a[..., 3] > 128
    dark = (a[..., :3].max(2) < 95) & al
    return ndimage.binary_dilation(dark | (al & ~ndimage.binary_erosion(al, iterations=2)), iterations=1)

def best_shift(src, dst, win, reach, lines_only=False):
    # (the shift of src that lays its ink best on dst's, inside win: both inks alike, or (lines_only)
    # as much of src's lines landing on dst's ink as can, dst's other lines not counting against it)
    y0, y1, x0, x1 = win
    t = dst[y0:y1, x0:x1]
    best = (-1, 0, 0)
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            s = src[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
            sc = (s & t).sum() / max(1, s.sum() if lines_only else (s | t).sum())
            # (the nearer of two as good)
            sc -= 0.002 * (abs(dx) + abs(dy))
            if sc > best[0]: best = (sc, dx, dy)
    return best

def hug_ear(hair, body, ear, dx, dy, grow=2):
    # Round the ear the hair comes a few pixels further, over the ear's rim, with a dark edge drawn
    # smooth along its new outline: as hair falls a little over the ear, and more than any drawing's ear
    # is off the one it was painted round, so no skin shows between them and no second line beside it.
    hm = hair[..., 3] > 128
    H, W = hm.shape
    yy, xx = np.nonzero(ear)
    notch = np.zeros_like(hm)
    notch[np.clip(np.round(yy + dy[yy, xx]).astype(int), 0, H - 1), np.clip(np.round(xx + dx[yy, xx]).astype(int), 0, W - 1)] = True
    notch = ndimage.binary_closing(notch, iterations=2) & ~hm
    # (behind and over the ear only: in front of it the hair's edge meets the face, as painted)
    nx = np.nonzero(notch)[1]
    if len(nx): notch[:, int(nx.min() + (nx.max() - nx.min()) * 0.6):] = False
    grown = ndimage.binary_closing(hm | (ndimage.binary_dilation(hm, iterations=grow) & notch & (body[..., 3] > 128)), iterations=2)
    zone = ndimage.binary_dilation(notch, iterations=grow + 2)
    # (how far each pixel is inside the new outline, in pixels: negative outside)
    sd = ndimage.distance_transform_edt(grown) - ndimage.distance_transform_edt(~grown)
    sd = ndimage.gaussian_filter(sd.astype(np.float32), 1.0)
    lum = hair[..., :3].mean(2)
    inner = hm & (lum >= 100)
    _, (iy, ix) = ndimage.distance_transform_edt(~inner, return_indices=True)
    fill = hair[iy, ix, :3]
    rimcol = np.median(hair[hm & (lum < 70), :3], axis=0) if (hm & (lum < 70)).any() else np.array([40, 40, 40], np.float32)
    # (the edge: dark for its outermost pixel and a half, fading into the hair)
    t = np.clip(2.0 - sd, 0, 1)[..., None]
    col = fill * (1 - t) + rimcol * t
    # (blended in over a couple of pixels where the change ends, so no seam shows)
    wz = ndimage.gaussian_filter(zone.astype(np.float32), 1.5)[..., None]
    na = np.clip(sd + 0.5, 0, 1)[..., None] * 255
    out = hair.copy()
    out[..., :3] = hair[..., :3] * (1 - wz) + col * wz
    out[..., 3:] = hair[..., 3:] * (1 - wz) + na * wz
    return out, notch

def follow_outline(hair, body, box, ear, ink=2.5, reach=7):
    # The hair as painted stands out a little from the skull, like a cap, or (on a drawing whose skull
    # is a little bigger) falls short of its edge, leaving skin between. Laid on a drawing it keeps to
    # that drawing's own outline: nothing of it outside the head or over the head's ink line (its
    # outermost ink pixels), which frames it as it frames the skin, and any skin left between it and
    # that line, up to reach pixels, covered; its own dark rim along the line taken for the hair's colour,
    # so the line isn't doubled.
    ba = body[..., 3] / 255
    out_ = ba < 0.5
    near = ndimage.distance_transform_edt(~out_)
    line = ~out_ & (near <= ink)
    hm = hair[..., 3] > 128
    lum = hair[..., :3].mean(2)
    inner = hm & (lum >= 100)
    _, (iy, ix) = ndimage.distance_transform_edt(~inner, return_indices=True)
    out = hair.copy()
    # (skin between the hair and the line: where, going in toward the head's middle from it, hair
    # comes within reach; only above the ear, as below it the head's edge is the jaw's)
    hx0, hy0, hx1, hy1 = box
    cx, cy = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    band = ~out_ & ~line & (near <= ink + reach) & ~hm
    band[int(cy + (hy1 - hy0) * 0.1):] = False
    # (nor about the ear, which the hair was just fitted round)
    band &= ~ndimage.binary_dilation(ear, iterations=5)
    ys, xs = np.nonzero(band)
    fill = np.zeros_like(hm)
    if len(ys):
        v = np.stack([cx - xs, cy - ys], 1).astype(np.float32)
        v /= np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-3)
        hit = np.zeros(len(ys), bool)
        for t in range(1, reach + 1):
            py = np.clip(np.round(ys + v[:, 1] * t).astype(int), 0, hm.shape[0] - 1)
            px = np.clip(np.round(xs + v[:, 0] * t).astype(int), 0, hm.shape[1] - 1)
            hit |= hm[py, px]
        fill[ys[hit], xs[hit]] = True
    fill = ndimage.binary_closing(fill, iterations=1) & band
    grown = hm | fill
    out[fill, :3] = hair[iy[fill], ix[fill], :3]
    out[fill, 3] = 255
    # (dark hair pixels within reach of the line: the hair's own colour)
    swap = hm & (lum < 100) & (ndimage.distance_transform_edt(~line) <= 4)
    out[swap, :3] = hair[iy[swap], ix[swap], :3]
    soft = ndimage.gaussian_filter((~line & ~out_).astype(np.float32), 0.6)
    out[..., 3] = np.where(grown, out[..., 3], 0) * np.where(line | out_, 0, soft)
    # (crumbs the cut left, a few pixels cut off from the rest: gone)
    lab, n = ndimage.label(out[..., 3] > 20)
    if n > 1:
        sizes = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
        out[..., 3] *= np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= 40])
    return out

def padded(img):
    c = Image.new('RGBA', (img.width, img.height + PAD))
    c.paste(img, (0, PAD))
    return np.asarray(c).astype(np.float32)

for build in ['slim', 'average', 'heavy', 'muscular']:
    name = f'{sex}-{build}'
    hp = f'sprites/player/hair/{name}-{style}.webp'
    if not os.path.exists(hp): continue
    hair = np.asarray(Image.open(hp)).astype(np.float32)
    ref = np.asarray(Image.open(f'{refdir}/{name}-{style}.png')).astype(np.float32)
    base = padded(Image.open(f'sprites/player/{name}.webp'))
    x0, y0, x1, y1 = info[name]['head']
    y0, y1 = y0 + PAD, y1 + PAD
    H, W = hair.shape[:2]
    # (the ear the hair was cut round: the notch in the hair, behind the face)
    hm = hair[..., 3] > 128
    notch = ndimage.binary_closing(hm, iterations=8) & ~hm
    notch[:, (x0 + x1) // 2:] = False
    lab, n = ndimage.label(notch)
    ear = lab == (np.argmax(ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))) + 1) if n else np.zeros_like(hm)
    ey, ex = [v.mean() for v in np.nonzero(ear)] if ear.any() else ((y0 + y1) / 2, x0 + (x1 - x0) * 0.3)
    eys, exs = np.nonzero(ear) if ear.any() else ([int(ey)], [int(ex)])
    ewin = (max(0, min(eys) - 8), min(H, max(eys) + 10), max(0, min(exs) - 10), min(W, max(exs) + 8))
    swin = (max(0, y0 - 8), int(ey) - 4, max(0, x0 - 10), (x0 + x1) // 2)
    # (the ear's own lines in the figure the hair was painted on: its ink, but not the hair's)
    ref_ink, base_ink = ink(ref) & ~ndimage.binary_dilation(hm, iterations=2), ink(base)
    sigma = max(6.0, (max(eys) - min(eys)) * 0.8)
    for f in sorted(glob.glob(f'sprites/player/{sex}-*-{build}.webp') + glob.glob(f'sprites/player/{sex}-*-{build}-*.webp')):
        key = os.path.basename(f)[:-5]
        v = padded(Image.open(f))
        v_ink = ink(v)
        # (how far this drawing's skull and ear are from where the hair was laid: the hair to move as much)
        _, sdx, sdy = best_shift(base_ink, v_ink, swin, 4)
        _, edx, edy = best_shift(ref_ink, v_ink, ewin, 3, lines_only=True)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        w = np.exp(-((yy - ey) ** 2 + (xx - ex) ** 2) / (2 * sigma ** 2))
        dx = w * edx + (1 - w) * sdx
        dy = w * edy + (1 - w) * sdy
        # (each pixel of the moved hair taken from where it came from)
        moved = np.dstack([ndimage.map_coordinates(hair[..., c], [yy - dy, xx - dx], order=1, mode='constant') for c in range(4)])
        moved, notch = hug_ear(moved, v, ear, dx, dy)
        moved = follow_outline(moved, v, (x0, y0, x1, y1), notch)
        Image.fromarray(np.clip(moved, 0, 255).astype(np.uint8)).save(f'sprites/player/hair/{key}-{style}.webp', 'WEBP', quality=90, method=6)
        print(key, 'skull', (sdx, sdy), 'ear', (edx, edy))
