# Cleans the edge of a cut-out picture: the pixels only partly the figure take the colour of the
# nearest pixel wholly the figure (on these drawings, the dark ink line), so no white of the sheet it
# was cut from shows round it on a dark background (its softness, how much of each pixel it covers, kept).
# As a script: cleans every picture named, in place.
# Usage: python3 scripts/defringe.py sprites/player/*.webp sprites/player/hair/*.webp
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

def clean(img):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    al = a[..., 3] / 255
    solid = al > 0.9
    if not solid.any(): return img
    # (each pixel's nearest wholly-figure pixel)
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    edge = (al > 0) & ~solid
    a[..., :3][edge] = a[..., :3][iy[edge], ix[edge]]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

if __name__ == '__main__':
    for path in sys.argv[1:]:
        clean(Image.open(path)).save(path, 'WEBP', quality=90, method=6)
        print(path)
