# Lays every frame of each animated sprite (sprites/**/*.webp) side by side in a sheet of its own
# (sprites/sheets/, same path), and lists them in js/sheets.js: the game draws a scarred dinosaur
# frame by frame from its sheet, so each scar can follow the body as it breathes and sways.
# Run after adding or changing an animated sprite: python3 scripts/sheets.py (needs Pillow)
import glob, json, os, struct
from PIL import Image

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
    if path.startswith('sprites/sheets/') or path.startswith('sprites/gear/') or path.endswith('-walk.webp'):
        continue
    im = Image.open(path)
    n = getattr(im, 'n_frames', 1)
    if n < 2:
        continue
    ms = durations(path)
    w, h = im.size
    rows = (n + COLS - 1) // COLS
    sheet = Image.new('RGBA', (w * COLS, h * rows))
    for k in range(n):
        im.seek(k)
        sheet.paste(im.convert('RGBA'), ((k % COLS) * w, (k // COLS) * h))
    out = 'sprites/sheets/' + path[len('sprites/'):]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out, 'WEBP', quality=88, method=6)
    sheets[path] = {'sheet': out, 'w': w, 'h': h, 'frames': n, 'cols': COLS, 'ms': round(sum(ms) / len(ms)) if ms else 95}
    print(f'{out}: {n} frames, {os.path.getsize(out) // 1024} KB')

with open('js/sheets.js', 'w') as f:
    f.write('// Made by scripts/sheets.py: each animated sprite\'s frames laid out in a sheet (cols to a row,\n')
    f.write('// each frame w × h, ms each), so a scarred dinosaur can be drawn frame by frame\n')
    f.write('export const SHEETS = ' + json.dumps(sheets, indent=1).replace('\n ', '\n  ') + ';\n')
