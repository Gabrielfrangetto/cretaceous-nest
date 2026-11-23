# Starts a sprite that has no drawing yet, from a pair of the same image on a pure white and a pure
# black background (docs/ART.md): the pair gives the exact soft edge (the matte as scripts/redraw.py
# makes it), cropped to the animal, saved as its drawing (sprites/hires/) and as a still sprite 480 px
# tall for scripts/idle.py to animate.
# Usage: python3 scripts/newsprite.py white.jpg black.jpg adult/bary-m
# then python3 scripts/idle.py adult/bary-m, python3 scripts/sheets.py, node scripts/version.js,
# node --test; and the sprite named in js/art.js (ADULT_SPRITES or JUVENILE_SPRITES)
import sys
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
# (a hole in the body that is real background stays clear; specks of noise inside the body are filled)
holes, nh = ndimage.label(ndimage.binary_fill_holes(body) & ~body)
fill = np.zeros_like(body)
for i in range(1, nh + 1):
    h = holes == i
    if a[h].mean() > 0.2 or h.sum() < 30:
        fill |= h
a = np.where(ndimage.binary_erosion(body | fill, iterations=3), 1, a)
a = np.where(a > 0.97, 1, a)
lab, n = ndimage.label(a > 0.03)
if n > 1:
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    a = np.where(np.isin(lab, 1 + np.where(sizes >= 200)[0]), a, 0)
c = np.where(a[..., None] > 0.97, W, B / np.maximum(a[..., None], 1e-3))
img = np.dstack([np.clip(c, 0, 255), a * 255]).astype(np.uint8)

# cropped to the animal, 2 px round it
ys, xs = np.nonzero(a > 0.03)
img = Image.fromarray(img[max(0, ys.min() - 2):ys.max() + 3, max(0, xs.min() - 2):xs.max() + 3])
img.save(f'sprites/hires/{name}.webp', 'WEBP', quality=92, method=6)
h = 480
img.resize((round(img.width * h / img.height), h), Image.LANCZOS).save(f'sprites/{name}.webp', 'WEBP', quality=90)
print(f'sprites/hires/{name}.webp {img.size}; sprites/{name}.webp {h} px tall')
