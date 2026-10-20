# Lays every frame of each animated sprite (sprites/**/*.webp) side by side in a sheet of its own
# (sprites/sheets/, same path), and lists them in js/sheets.js: the game draws a scarred dinosaur
# frame by frame from its sheet, so each scar can follow the body as it breathes and sways.
# Each sheet also carries how the drawing moves: a grid of points over the body, each followed from
# frame to frame (the patch of skin around it looked for near where it was), so whatever sits on the
# skin, a scar or a piece of equipment, moves with it.
# Run after adding or changing an animated sprite: python3 scripts/sheets.py (needs Pillow, numpy)
import base64, glob, json, os, struct
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image

STEP, R, S = 16, 8, 10   # grid spacing, patch radius, how far a point is looked for between frames


# (start: the frame the points are taken on, when not the first of these: a walk is followed from its
# idle's first frame, which scars and equipment are placed on, its feet looked for farther)
def motion(frames, start=None, S=S):
    if start is not None:
        frames = [start] + frames
    # (a big drawing is followed on a copy 240 px tall, its moves scaled back up: as close, and quicker)
    big = frames[0].shape[0] / 240
    if big > 1.2:
        size = lambda f: (round(f.shape[1] / big), 240)
        frames = [np.asarray(Image.fromarray(f.astype(np.uint8)).resize(size(f), Image.LANCZOS)).astype(np.float32) for f in frames]
    h, w = frames[0].shape[:2]
    pad = R + S
    lum = [np.pad(np.where(f[..., 3] < 60, -200.0, f[..., :3] @ [0.3, 0.59, 0.11]), pad, constant_values=-200.0) for f in frames]
    xs, ys = np.arange(STEP // 2, w, STEP), np.arange(STEP // 2, h, STEP)
    n = len(frames)
    d = np.zeros((n, len(ys), len(xs), 2))
    ok = np.zeros((len(ys), len(xs)), bool)
    for j, y in enumerate(ys):
        for i, x in enumerate(xs):
            patch = lambda k, px, py: lum[k][py + pad - R:py + pad + R + 1, px + pad - R:px + pad + R + 1]
            ref = patch(0, x, y)
            if (ref > -200).mean() < 0.5:
                continue
            ok[j, i] = True
            px, py, prev = x, y, ref
            for k in range(1, n):
                region = lum[k][py + pad - R - S:py + pad + R + S + 1, px + pad - R - S:px + pad + R + S + 1]
                win = sliding_window_view(region, ref.shape)
                # (the skin as it was on the first frame, a little of how it looked on the last against noise)
                cost = np.abs(win - ref).sum((2, 3)) + 0.2 * np.abs(win - prev).sum((2, 3))
                oy, ox = np.unravel_index(np.argmin(cost), cost.shape)
                # between pixels: the bottom of a parabola through the best and its neighbours, each way
                def sub(c0, c1, c2):
                    den = c0 - 2 * c1 + c2
                    return 0.0 if den <= 0 else max(-0.5, min(0.5, (c0 - c2) / (2 * den)))
                fx = sub(cost[oy, ox - 1], cost[oy, ox], cost[oy, ox + 1]) if 0 < ox < 2 * S else 0.0
                fy = sub(cost[oy - 1, ox], cost[oy, ox], cost[oy + 1, ox]) if 0 < oy < 2 * S else 0.0
                px, py = px + ox - S, py + oy - S
                prev = patch(k, px, py)
                d[k, j, i] = (px + fx - x, py + fy - y)
    # (a lone point that went its own way follows its neighbours; points off the body, the nearest on it)
    for k in range(1, n):
        f = d[k].copy()
        for j in range(len(ys)):
            for i in range(len(xs)):
                if not ok[j, i]:
                    continue
                nb = [d[k, b, a] for b in range(j - 1, j + 2) for a in range(i - 1, i + 2) if 0 <= b < len(ys) and 0 <= a < len(xs) and ok[b, a]]
                f[j, i] = np.median(nb, 0)
        d[k] = f
    if ok.any():
        idx = np.argwhere(ok)
        for j in range(len(ys)):
            for i in range(len(xs)):
                if not ok[j, i]:
                    b, a = idx[np.argmin(((idx - (j, i)) ** 2).sum(1))]
                    d[:, j, i] = d[:, b, a]
    if start is not None:
        d = d[1:]
    step = STEP
    if big > 1.2:
        d *= big
        step = STEP * big
    # (in quarter pixels, or coarser for a walk, whose feet travel far)
    unit = max(0.25, float(np.ceil(np.abs(d).max() / 127 * 4) / 4))
    raw = np.clip(np.round(d / unit), -127, 127).astype(np.int8).tobytes()
    return {'step': step, 'gw': len(xs), 'gh': len(ys), 'unit': unit, 'moves': base64.b64encode(raw).decode()}


COLS = 6

def durations(path):
    b = open(path, 'rb').read()
    i, out = 12, []
    while i < len(b):
        cid, size = b[i:i + 4], struct.unpack('<I', b[i + 4:i + 8])[0]
        if cid == b'ANMF':
            out.append(int.from_bytes(b[i + 8 + 12:i + 8 + 15], 'little'))
        i += 8 + size + (size & 1)
    return out

sheets = {}
for path in sorted(glob.glob('sprites/**/*.webp', recursive=True)):
    if path.startswith('sprites/sheets/') or path.startswith('sprites/gear/'):
        continue
    im = Image.open(path)
    n = getattr(im, 'n_frames', 1)
    if n < 2:
        continue
    ms = durations(path)
    w, h = im.size
    rows = (n + COLS - 1) // COLS
    sheet = Image.new('RGBA', (w * COLS, h * rows))
    frames = []
    for k in range(n):
        im.seek(k)
        fr = im.convert('RGBA')
        frames.append(np.asarray(fr).astype(np.float32))
        sheet.paste(fr, ((k % COLS) * w, (k // COLS) * h))
    out = 'sprites/sheets/' + path[len('sprites/'):]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out, 'WEBP', quality=88, method=6)
    walk = path.endswith('-walk.webp')
    idle = None
    if walk:
        base = Image.open(path.replace('-walk.webp', '.webp'))
        base.seek(0)
        idle = np.asarray(base.convert('RGBA')).astype(np.float32)
    sheets[path] = {'sheet': out, 'w': w, 'h': h, 'frames': n, 'cols': COLS, 'ms': round(sum(ms) / len(ms)) if ms else 95, **motion(frames, idle, 28 if walk else S)}
    print(f'{out}: {n} frames, {os.path.getsize(out) // 1024} KB')

with open('js/sheets.js', 'w') as f:
    f.write('// Made by scripts/sheets.py: each animated sprite\'s frames laid out in a sheet (cols to a row,\n')
    f.write('// each frame w × h, ms each), so a scarred dinosaur can be drawn frame by frame; and how it moves:\n')
    f.write('// a grid of points step px apart (gw × gh), each point\'s offset from frame 0, x then y, in units of\n')
    f.write('// unit px, per frame (int8, base64)\n')
    f.write('export const SHEETS = ' + json.dumps(sheets, indent=1).replace('\n ', '\n  ') + ';\n')
