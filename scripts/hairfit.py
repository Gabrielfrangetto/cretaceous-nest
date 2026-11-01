# Each face's own copy of a hairstyle. The figure the hair was painted on (scripts/hairbody.py --ref)
# was laid on the body by its shoulders, but its head was drawn a few percent bigger: the hair is first
# scaled and moved, as one, so that figure's head lies on the bald head's outline. The skulls of a
# build's faces and tones lie within a pixel of each other, so the hair stays there, the same on all of
# them; only about the ear, which sits a pixel or three apart from one drawing to the next, it is moved
# with that drawing's ear and brought a pixel over its rim, and it is kept to that head's own outline
# (painted on the skull, not standing out from it), any skin left between them covered.
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
    # (never thinner than painted: a thin lock behind the ear kept whole)
    out[..., 3:] = np.maximum(hair[..., 3:], hair[..., 3:] * (1 - wz) + na * wz)
    return out, notch

def follow_outline(hair, body, box, ear, ink=2.0, reach=7):
    # The hair as painted stands out a little from the skull, like a cap, or (on a drawing whose skull
    # is a little bigger) falls short of its edge, leaving skin between. Laid on a drawing it keeps to
    # that drawing's own outline: cut to its silhouette, any skin left between it and the edge (up to
    # reach pixels, above the ear and never over it) covered, and its outermost ink pixels drawn in the
    # hair's own dark rim, so the head's edge is a line where it's hair as where it's skin.
    ba = body[..., 3] / 255
    out_ = ba < 0.5
    near = ndimage.distance_transform_edt(~out_)
    hm = hair[..., 3] > 128
    lum = hair[..., :3].mean(2)
    inner = hm & (lum >= 100)
    _, (iy, ix) = ndimage.distance_transform_edt(~inner, return_indices=True)
    out = hair.copy()
    # (skin between the hair and the edge: where, going in toward the head's middle from it, hair
    # comes within reach)
    hx0, hy0, hx1, hy1 = box
    cx, cy = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    band = ~out_ & (near <= ink + reach) & ~hm
    band[int(cy + (hy1 - hy0) * 0.1):] = False
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
    out[fill, :3] = hair[iy[fill], ix[fill], :3]
    out[fill, 3] = 255
    # (cut to the head's silhouette, soft as its own edge is)
    out[..., 3] = np.where(hm | fill, out[..., 3], 0) * ba
    # (its outermost pixels the hair's dark rim; further in, its own colour where its old rim was)
    got = out[..., 3] > 20
    rimc = hair[hm & (lum < 70), :3]
    rimcol = np.median(rimc, axis=0) if len(rimc) else np.array([40, 40, 40], np.float32)
    edge = got & (near <= ink)
    inside = got & (near > ink) & (near <= ink + 4) & (lum < 100)
    out[inside, :3] = hair[iy[inside], ix[inside], :3]
    out[edge, :3] = rimcol
    # (crumbs, a few pixels cut off from the rest: gone)
    lab, n = ndimage.label(out[..., 3] > 20)
    if n > 1:
        sizes = ndimage.sum(np.ones(lab.shape), lab, range(1, n + 1))
        out[..., 3] *= np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= 40])
    return out

def by_head(hair, ref, base, box):
    # The figure the hair was painted on was laid on the body by its shoulders, but its head was drawn
    # a few percent bigger than the bald body's: the hair, sized for that head, stands out from this one
    # and is cut short at its edge. The hair (and its figure) scaled and moved, as one, so that the
    # figure's head, hair and all, covers the bald head's outline above the jaw as closely as can be: the
    # hair's outer edge on the skull's, every lock where it was against the ear.
    x0, y0, x1, y1 = box
    y0, y1 = y0 + PAD, y1 + PAD
    H, W = hair.shape[:2]
    top = max(0, y0 - 10)
    rows = slice(top, y1 - (y1 - y0) // 4)
    cols = slice(max(0, x0 - 12), x1 + 4)
    tgt = base[..., 3][rows, cols] > 128
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    src = ref[..., 3] / 255
    best = (-1, 1, 0, 0)
    for k in np.arange(0.88, 1.0001, 0.01):
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                # (output pixel p from source c + (p - c - d) / k)
                m = ndimage.affine_transform(src, [1 / k, 1 / k], offset=[cy - (cy + dy) / k, cx - (cx + dx) / k], order=0)
                a = m[rows, cols] > 0.5
                sc = (a & tgt).sum() / max(1, (a | tgt).sum())
                if sc > best[0]: best = (sc, k, dx, dy)
    _, k, dx, dy = best
    move = lambda img: np.dstack([ndimage.affine_transform(img[..., c], [1 / k, 1 / k], offset=[cy - (cy + dy) / k, cx - (cx + dx) / k], order=1) for c in range(4)])
    print('head fit', round(k, 3), dx, dy, 'iou %.3f' % best[0])
    return move(hair), move(ref)

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
    hair, ref = by_head(hair, ref, padded(Image.open(f'sprites/player/{name}.webp')), info[name]['head'])
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
    # (the ear's own lines in the figure the hair was painted on: its ink, but not the hair's)
    ref_ink = ink(ref) & ~ndimage.binary_dilation(hm, iterations=2)
    for f in sorted(glob.glob(f'sprites/player/{sex}-*-{build}.webp') + glob.glob(f'sprites/player/{sex}-*-{build}-*.webp')):
        key = os.path.basename(f)[:-5]
        v = padded(Image.open(f))
        v_ink = ink(v)
        # (the hair stays where it is, the same on every face, as their skulls lie within a pixel of each
        # other; only the hole for the ear follows this drawing's ear, a pixel or three off the painted one)
        _, edx, edy = best_shift(ref_ink, v_ink, ewin, 4, lines_only=True)
        # (the hair about the ear moved with it, fading out a few pixels from it: the rest stays put)
        d = ndimage.distance_transform_edt(~ear)
        w = np.exp(-(d ** 2) / (2 * 5.0 ** 2))
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        moved = np.dstack([ndimage.map_coordinates(hair[..., c], [yy - w * edy, xx - w * edx], order=1, mode='constant') for c in range(4)])
        hole = np.zeros_like(ear)
        ys_, xs_ = np.nonzero(ear)
        hole[np.clip(ys_ + edy, 0, H - 1), np.clip(xs_ + edx, 0, W - 1)] = True
        moved, _ = hug_ear(moved, v, hole, np.zeros((H, W)), np.zeros((H, W)), grow=1)
        moved = follow_outline(moved, v, (x0, y0, x1, y1), hole)
        Image.fromarray(np.clip(moved, 0, 255).astype(np.uint8)).save(f'sprites/player/hair/{key}-{style}.webp', 'WEBP', quality=90, method=6)
        print(key, 'ear', (edx, edy))
