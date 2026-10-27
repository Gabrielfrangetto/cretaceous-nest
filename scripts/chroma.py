# Takes a green screen out: a sheet drawn on flat chroma green becomes the same picture with real
# transparency. How much of each pixel is the figure: how far it is from being the green, by how much its
# green stands above its red and blue; the green left in the edge pixels (spill) taken out, so no green
# fringe shows round the figure.
# keyed(img) -> an RGBA image, or None when the sheet's corners aren't green
import numpy as np
from PIL import Image

def keyed(img):
    px = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w = px.shape[:2]
    corners = np.concatenate([px[:8, :8], px[:8, -8:], px[-8:, :8], px[-8:, -8:]]).reshape(-1, 3)
    bg = np.median(corners, 0)
    if not (bg[1] > 150 and bg[1] - max(bg[0], bg[2]) > 80): return None
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    # (greenness: green over the most of red and blue; the background's is full, the figure's none)
    spill = g - np.maximum(r, b)
    full = bg[1] - max(bg[0], bg[2])
    # (linear in the greenness, as a mix of ink and green is: a softer ramp would eat the dark outline,
    # whose edge pixels are half green)
    alpha = np.clip(1 - (spill - 12) / (full - 12 - 24), 0, 1)
    # (spill: green no higher than the most of red and blue, where there is any)
    g2 = np.where(spill > 0, np.maximum(r, b), g)
    out = np.dstack([r, g2, b, alpha * 255])
    # (a pixel partly the figure: its colour without the green mixed in, kept dark and clean)
    part = (alpha > 0) & (alpha < 1)
    a = np.maximum(alpha[..., None], 1e-3)
    mixed = (np.dstack([r, g2, b]) - bg * (1 - alpha[..., None])) / a
    out[..., :3][part] = np.clip(mixed[part], 0, 255)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
