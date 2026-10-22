# Guesses where each scar goes on every animated drawing (js/sheets.js), from its outline on the first
# frame, and writes them to js/scar-guess.js: a drawing with no places set in tools/anchors.html has its
# scars there, and the tool starts from them. The drawings face right: the head is the far right of
# the body, the tail the far left, the trunk the thickest part between, the legs what reaches the ground.
# Run after scripts/sheets.py: python3 scripts/guess-scars.py (needs Pillow, numpy)
import json, re, sys
import numpy as np
from PIL import Image

src = open('js/sheets.js').read()
sheets = json.loads(src[src.index('{'):src.rindex('}') + 1])


def runs(col):
    # the solid stretches of a column, top to bottom: [(start, end)]
    d = np.diff(np.concatenate([[0], col.astype(int), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def guess(a):
    H, W = a.shape
    ys, xs = np.nonzero(a)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    cols = [runs(a[:, x]) for x in range(W)]
    # (the trunk: of the middle of the body, a column with belly under it, not a leg, its topmost thick
    # run the thickest)
    def top(x, least=0.08):
        rs = [r for r in cols[x] if r[1] - r[0] >= least * bh]
        return rs[0] if rs else None
    span = range(int(x0 + 0.3 * bw), int(x0 + 0.75 * bw))
    mid = [x for x in span if top(x) and top(x)[1] < y1 - 0.12 * bh] or [x for x in span if top(x)]
    tx = max(mid, key=lambda x: top(x)[1] - top(x)[0])
    t0, t1 = top(tx)
    ty, thick = (t0 + t1) / 2, t1 - t0
    # (the legs: columns solid down to the ground, below the trunk; the hind one the leftmost, its thigh
    # up by the belly, as wide as the leg is there)
    ground = [x for x in range(x0, x1 + 1) if cols[x] and cols[x][-1][1] >= y1 - 0.04 * bh and cols[x][-1][0] > ty]
    groups = []
    for x in ground:
        if groups and x - groups[-1][-1] <= 3: groups[-1].append(x)
        else: groups.append([x])
    groups = [g for g in groups if len(g) >= 0.015 * bw]
    hind = groups[0] if groups else [tx]
    fx = (hind[0] + hind[-1]) / 2
    lx = fx + 0.5 * (tx - fx)
    ly = ty + 0.45 * (t1 - ty)
    leg_w = 0.4 * thick
    # (the head: the far right of the body; the face a little back and down from its middle)
    hx0 = int(x1 - 0.12 * bw)
    hy = [y for x in range(hx0, x1 + 1) for r in cols[x][:1] for y in range(r[0], r[1])]
    hy0, hy1 = min(hy), max(hy)
    head_h = hy1 - hy0
    hx, hyc = x1 - 0.1 * bw, (hy0 + hy1) / 2 + 0.15 * head_h
    # (the neck: between the trunk and the head, the middle of its topmost run)
    nx = int(tx + 0.7 * (hx - tx))
    nr = top(nx, 0.05) or (t0, t1)
    # (the tail: a quarter of the way in from its tip)
    kx = int(x0 + 0.22 * bw)
    kr = top(kx, 0.01) or (t0, t1)
    # the tail's slope there, for its scar to lie along it
    kx2 = int(x0 + 0.32 * bw)
    kr2 = top(kx2, 0.01) or kr
    slope = np.degrees(np.arctan2(((kr2[0] + kr2[1]) - (kr[0] + kr[1])) / 2, kx2 - kx))
    place = lambda x, y, w, r=0: {'x': round(x / W, 3), 'y': round(y / H, 3), 'w': round(w / W, 3), 'r': int(round(r))}
    return {
        'head': place(hx, hyc, 0.55 * head_h),
        'neck': place(nx, (nr[0] + nr[1]) / 2, 0.5 * (nr[1] - nr[0])),
        'body': place(tx, ty, 0.5 * thick),
        'legs': place(lx, ly, leg_w),
        'tail': place(kx, (kr[0] + kr[1]) / 2, 1.2 * (kr[1] - kr[0]), slope),
    }


out = {}
for key, s in sheets.items():
    if key.endswith('-walk.webp'):
        continue
    img = Image.open(s['sheet']).convert('RGBA').crop((0, 0, s['w'], s['h']))
    a = np.asarray(img)[..., 3] > 128
    try:
        out[key] = guess(a)
    except (ValueError, IndexError) as e:
        print('no guess for', key, e, file=sys.stderr)

with open('js/scar-guess.js', 'w') as f:
    f.write('// Made by scripts/guess-scars.py: where each scar goes on each animated drawing (its sprite path),\n'
            '// guessed from its outline, until set in tools/anchors.html: { part: { x, y, w, r } }\n')
    f.write('export const SCAR_GUESS = ' + json.dumps(out, indent=1) + ';\n')
print(len(out), 'drawings guessed')
