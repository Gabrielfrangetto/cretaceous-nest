# Cuts the separate plants of a generated sheet (the same picture on a pure white and on a pure black
# background) into one picture of them all (images/terrain/<biome>-plants.webp) and a list of where each
# is in it (…-plants.json: [x, y, w, h] each, in its pixels), for the map to stand them up in its hexes.
# Each piece is one tree, or a clump of them touching; specks are left out.
# Usage: python3 scripts/plants.py white.jpg black.jpg forest [--big 72]   (needs Pillow, numpy, scipy)
# When the generator gave a black sheet that doesn't match the white one, pass - for black: the plants
# are cut from the white sheet alone (good for plants with a dark outline): the white reaching in from
# the edges is the background, faded out over a pixel or two at the plants' rims.
import argparse, json
import numpy as np
from PIL import Image
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument('white')
ap.add_argument('black')
ap.add_argument('biome')
ap.add_argument('--big', type=int, default=72, help='how many pixels across the median single plant is kept at')
ap.add_argument('--skip', nargs='*', default=[], help='x,y points (white sheet pixels) of pieces to leave out')
ap.add_argument('--only', nargs='*', default=[], help='x,y points of the only pieces to keep')
ap.add_argument('--tint', help='a colour (#rrggbb) the pieces are moved to, by their average')
ap.add_argument('--min', type=float, default=0.01, help='pieces smaller than this share of the biggest are left out (loose leaves)')
a = ap.parse_args()

W = np.asarray(Image.open(a.white).convert('RGB')).astype(np.float32)
# (a black sheet of another size, drawn again rather than only its background changed, doesn't line up
# pixel for pixel: the plants are cut from the white one, and the black one only tells, for each patch of
# white closed in by a plant, whether it is a gap to see through (black there) or white paint, as bone)
Bimg = None if a.black == '-' else Image.open(a.black).convert('RGB')
if Bimg is not None and Bimg.size != (W.shape[1], W.shape[0]):
    pale = W.min(2) > 225
    lab, count = ndimage.label(pale)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    Bs = np.asarray(Bimg.resize((W.shape[1], W.shape[0]), Image.LANCZOS)).astype(np.float32).max(2)
    bright = ndimage.mean(Bs, lab, np.arange(1, count + 1))
    holes = [i + 1 for i in range(count) if (i + 1) in edge or bright[i] < 90]
    back = np.isin(lab, holes)
    rim = back & ndimage.binary_dilation(~back, iterations=2)
    alpha = np.where(back, 0.0, 1.0)
    alpha[rim] = np.clip((255 - W[rim].min(1)) / 60, 0, 1)
    a_ = np.maximum(alpha[..., None], 1e-3)
    rgb = np.where(alpha[..., None] > 0.97, W, (W - 255 * (1 - alpha[..., None])) / a_)
elif a.black == '-':
    # (the background: near-white reaching in from the sheet's edges)
    pale = W.min(2) > 225
    lab, _ = ndimage.label(pale)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    back = np.isin(lab, list(edge))
    # (at a plant's rim, how far from white each pixel is: its share of plant)
    rim = back & ndimage.binary_dilation(~back, iterations=2)
    alpha = np.where(back, 0.0, 1.0)
    alpha[rim] = np.clip((255 - W[rim].min(1)) / 60, 0, 1)
    a_ = np.maximum(alpha[..., None], 1e-3)
    rgb = np.where(alpha[..., None] > 0.97, W, (W - 255 * (1 - alpha[..., None])) / a_)
else:
    # (a black sheet made smaller than the white is stretched to it: the same picture, the same framing)
    B = np.asarray(Image.open(a.black).convert('RGB').resize((W.shape[1], W.shape[0]), Image.LANCZOS)).astype(np.float32)
    alpha = np.clip(1 - (W - B).mean(2) / 255, 0, 1)
    alpha[alpha < 0.05] = 0
    alpha[alpha > 0.95] = 1
    rgb = np.where(alpha[..., None] > 0.97, W, B / np.maximum(alpha[..., None], 1e-3))
pic = np.dstack([np.clip(rgb, 0, 255), alpha * 255])

pieces, n = ndimage.label(ndimage.binary_closing(alpha > 0.4, iterations=2))
boxes = [b for b in ndimage.find_objects(pieces)]
sizes = ndimage.sum(np.ones_like(alpha), pieces, range(1, n + 1))
keep = [i for i in range(n) if sizes[i] > sizes.max() * a.min]
# (the pieces asked to be left out: the ones at these points, or nearest them)
def at(xy):
    x, y = map(int, xy.split(','))
    return min(keep, key=lambda i: 0 if pieces[min(y, pieces.shape[0] - 1), min(x, pieces.shape[1] - 1)] == i + 1 else 1 + ((boxes[i][0].start + boxes[i][0].stop) / 2 - y) ** 2 + ((boxes[i][1].start + boxes[i][1].stop) / 2 - x) ** 2)
if a.only:
    keep = sorted({at(xy) for xy in a.only})
for xy in a.skip:
    keep.remove(at(xy))
# (tinted: the paint of the pieces kept moved, channel by channel, so their average is the colour)
if a.tint:
    want = np.float32([int(a.tint[i:i + 2], 16) for i in (1, 3, 5)])
    solid = np.isin(pieces, [i + 1 for i in keep]) & (alpha > 0.5)
    pic[..., :3] = np.clip(pic[..., :3] * (want / np.maximum(pic[..., :3][solid].mean(0), 1)), 0, 255)
# (the median single plant: pieces about as wide as tall, the smaller half of them by area)
widths = sorted(max(boxes[i][0].stop - boxes[i][0].start, boxes[i][1].stop - boxes[i][1].start) for i in keep)
scale = a.big / widths[len(widths) // 2]

cuts = []
for i in keep:
    ys, xs = boxes[i]
    pad = 4
    y0, y1, x0, x1 = max(0, ys.start - pad), min(alpha.shape[0], ys.stop + pad), max(0, xs.start - pad), min(alpha.shape[1], xs.stop + pad)
    cut = pic[y0:y1, x0:x1].copy()
    cut[..., 3] *= (pieces[y0:y1, x0:x1] == i + 1) | (ndimage.binary_dilation(pieces[y0:y1, x0:x1] == i + 1, iterations=3))
    img = Image.fromarray(cut.astype(np.uint8))
    cuts.append(img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS))

# laid in rows, biggest first
cuts.sort(key=lambda c: -c.height)
row_w, x, y, row_h, places = 1024, 0, 0, 0, []
for c in cuts:
    if x + c.width > row_w:
        x, y, row_h = 0, y + row_h + 2, 0
    places.append([x, y, c.width, c.height])
    x += c.width + 2
    row_h = max(row_h, c.height)
sheet = Image.new('RGBA', (row_w, y + row_h))
for c, (px, py, _, _) in zip(cuts, places):
    sheet.paste(c, (px, py))
sheet.save(f'images/terrain/{a.biome}-plants.webp', 'WEBP', quality=86, method=6)
json.dump({'big': a.big, 'pieces': places}, open(f'images/terrain/{a.biome}-plants.json', 'w'))
print(f'images/terrain/{a.biome}-plants.webp: {len(cuts)} pieces, {sheet.width}×{sheet.height}')
