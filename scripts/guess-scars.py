# Guesses where each scar goes on every animated drawing (js/sheets.js), from its outline on the first
# frame, and writes them to js/scar-guess.js: a drawing with no places set in tools/anchors.html has its
# scars there, and the tool starts from them. The drawings face right: the head is the far right of
# the body, the tail the far left, the trunk the thickest part between, the legs what reaches the ground.
# Run after scripts/sheets.py: python3 scripts/guess-scars.py (needs Pillow, numpy)
import json, re, sys
import numpy as np
from PIL import Image, ImageFilter

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
    mid = [x for x in span if top(x) and top(x)[1] < y1 - 0.3 * bh] or [x for x in span if top(x)]
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
        'neck': place(nx, nr[0] + min(0.5 * (nr[1] - nr[0]), 0.5 * head_h), min(0.5 * (nr[1] - nr[0]), 0.6 * head_h)),
        'body': place(tx, ty - 0.15 * thick, 0.45 * thick),
        'legs': place(lx, ly, leg_w),
        'tail': place(kx, (kr[0] + kr[1]) / 2, 1.2 * (kr[1] - kr[0]), slope),
    }


# Horn, beak and claw: keratin over bone, where no scar goes. Found as the drawing's grey patches, each a
# stretch closed in by its ink lines, of little colour (KERATIN_GREY, the spread of its red, green and blue),
# neither ink nor pale, and small against the body (KERATIN_SMALL): a beak, a cheek horn, a claw; a grey
# animal's whole flank is too big to be one. Marked as circles over it, as the anchors tool's brush paints.
KERATIN_GREY, KERATIN_SMALL = 22, 0.03
def keratin(rgba):
    from PIL import ImageDraw
    a = rgba[..., 3] > 200
    H, W = a.shape
    rgb = rgba[..., :3]
    lum = rgb @ [0.3, 0.59, 0.11]
    spread = rgb.max(-1) - rgb.min(-1)
    ink = a & (lum < 255 * 0.13) & (spread < 45)
    # (the lines thickened a pixel first, so halving the picture doesn't open a gap in a thin one)
    thick = np.asarray(Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))) > 0
    open_ = a & ~thick
    D = 2
    sm = open_[::D, ::D]; h, w = sm.shape
    lab = np.zeros((h, w), int); n = 0; out = []
    body = sm.sum()
    ys_, xs_ = np.nonzero(a); bx0, bx1, by0, by1 = xs_.min(), xs_.max(), ys_.min(), ys_.max()
    bw, bh = bx1 - bx0, by1 - by0
    for y0 in range(h):
        for x0 in range(w):
            if not sm[y0, x0] or lab[y0, x0]: continue
            n += 1; st = [(y0, x0)]; lab[y0, x0] = n; pts = []
            while st:
                y, x = st.pop(); pts.append((y, x))
                for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= yy < h and 0 <= xx < w and sm[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st.append((yy, xx))
            if len(pts) > KERATIN_SMALL * body or len(pts) < 6: continue
            ys = np.array([p[0] for p in pts]) * D; xs = np.array([p[1] for p in pts]) * D
            sp, lm = spread[ys, xs].mean(), lum[ys, xs].mean()
            # (where keratin is: on the head, the far right (a beak, a horn); at the feet, the bottom (the
            # claws); or a small dark point anywhere (a hand's claw, a spike); not a grey feather or arm)
            head = xs.mean() > bx1 - 0.2 * bw and ys.mean() < by0 + 0.6 * bh
            feet = ys.mean() > by1 - 0.08 * bh and len(pts) < 0.004 * body
            point = sp < 12 and lm < 140 and len(pts) < 0.002 * body
            if sp < KERATIN_GREY and 45 < lm < 205 and (head or feet or point):
                out.append((ys, xs))
    circles = []
    d = max(3, int(0.008 * W))
    for ys, xs in out:
        m = np.zeros((H, W), bool); m[ys, xs] = True
        m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        for y in range(0, H, d):
            for x in range(0, W, d):
                if m[y, x]: circles.append([round(x / W, 4), round(y / H, 4), round(0.8 * d / W, 4)])
    return circles


out = {}
for key, s in sheets.items():
    if key.endswith('-walk.webp'):
        continue
    img = Image.open(s['sheet']).convert('RGBA').crop((0, 0, s['w'], s['h']))
    a = np.asarray(img)[..., 3] > 128
    try:
        out[key] = guess(a)
        no = keratin(np.asarray(img).astype(float))
        if no: out[key]['noScar'] = no
    except (ValueError, IndexError) as e:
        print('no guess for', key, e, file=sys.stderr)

with open('js/scar-guess.js', 'w') as f:
    f.write('// Made by scripts/guess-scars.py: where each scar goes on each animated drawing (its sprite path),\n'
            '// guessed from its outline, until set in tools/anchors.html: { part: { x, y, w, r } }, and noScar: its\n'
            '// horn, beak and claws, where no scar goes (circles [x, y, r], as painted in the tool)\n')
    f.write('export const SCAR_GUESS = ' + json.dumps(out, indent=1) + ';\n')
print(len(out), 'drawings guessed')
