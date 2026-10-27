# A skin tone painted afresh (not as an edit) on a sheet of the bodies on plain white, or with real
# transparency: each figure cut
# by its outline (the white reaching in from the edges is the background) and fitted onto the body of
# its build already cut (scripts/bodies.py): as tall, feet on the same ground, the back of the head at
# the same place. Saved as sprites/player/<sex>-<build>-<tone>.webp.
# Usage: python3 scripts/bodytone.py sheet.jpg male brown [--builds slim,average,heavy,muscular]
import argparse, json
import numpy as np
from PIL import Image
from scipy import ndimage
from defringe import clean
from chroma import keyed

ap = argparse.ArgumentParser()
ap.add_argument('sheet')
ap.add_argument('sex')
ap.add_argument('tone')
ap.add_argument('--builds', default='slim,average,heavy,muscular')
a = ap.parse_args()
builds = a.builds.split(',')

src = Image.open(a.sheet)
src = keyed(src) or src
if src.mode in ('RGBA', 'LA', 'P') and np.asarray(src.convert('RGBA'))[..., 3].min() < 250:
    # (a sheet with real transparency: its own alpha and colours)
    px = np.asarray(src.convert('RGBA')).astype(np.float32)
    rgb, alpha = px[..., :3], px[..., 3] / 255
else:
    W = np.asarray(Image.open(a.sheet).convert('RGB')).astype(np.float32)
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
    # (at the rim, how far from white each pixel is: its share of the figure)
    rim = back & ndimage.binary_dilation(~back, iterations=2)
    alpha = np.where(back, 0.0, 1.0)
    alpha[rim] = np.clip((255 - W[rim].min(1)) / 70, 0, 1)
    rgb = np.where(alpha[..., None] > 0.97, W, (W - 255 * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 1e-3))
pic = np.dstack([np.clip(rgb, 0, 255), alpha * 255])

figs, n = ndimage.label(alpha > 0.3)
boxes = ndimage.find_objects(figs)
sizes = ndimage.sum(np.ones_like(alpha), figs, range(1, n + 1))
keep = sorted([i for i in range(n) if sizes[i] > sizes.max() * 0.2], key=lambda i: boxes[i][1].start)
assert len(keep) == len(builds), f'{len(keep)} figures found, {len(builds)} builds named'

info = json.load(open('sprites/player/bodies.json'))
for i, build in zip(keep, builds):
    ys, xs = boxes[i]
    cut = pic[ys, xs].copy()
    cut[..., 3] *= ndimage.binary_dilation(figs[ys, xs] == i + 1, iterations=2)
    # (the body already cut: its height on the canvas, and the back of its head)
    base = Image.open(f'sprites/player/{a.sex}-{build}.webp')
    bb = base.getbbox()
    box = info[f'{a.sex}-{build}']
    h = cut.shape[0]
    top = cut[: int(h * 0.105), :, 3] > 128
    headback = np.where(top.any(0))[0][0]
    k = (bb[3] - bb[1]) / h
    img = Image.fromarray(cut.astype(np.uint8))
    img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    canvas = Image.new('RGBA', base.size)
    canvas.paste(img, (round(box['head'][0] - headback * k), bb[3] - img.height))
    clean(canvas).save(f'sprites/player/{a.sex}-{build}-{a.tone}.webp', 'WEBP', quality=90, method=6)
    print(f'sprites/player/{a.sex}-{build}-{a.tone}.webp')
