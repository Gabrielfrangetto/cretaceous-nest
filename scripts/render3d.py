# Renders a 3D model (a .glb, rigged or not) as the game's painted-looking sprites: an orthographic
# camera (no perspective, as a drawing), the model's own painted texture as its colour and shade (the
# generators paint the light in; --lit toon lights it here instead, from the top left, in a
# few flat bands (toon) and a dark ink line round it, on a transparent background. One picture, or a strip of an
# animation's frames side by side.
# Run with Blender's Python module (pip install bpy):
#   python scripts/render3d.py model.glb out.png [--view side|front|three|back] [--height 528]
#     [--anim walk --frames 8] [--rim 1.7] [--lines 0] [--samples 16]
import argparse, math, sys
import bpy
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument('model')
ap.add_argument('out')
ap.add_argument('--view', default='side', help='side (facing right, as the dinosaurs), three (three-quarter, turned right), front, back, or a yaw in degrees')
ap.add_argument('--height', type=int, default=528, help='pixels the model stands tall')
ap.add_argument('--anim', help='the animation to render (its name, or part of it); its frames side by side')
ap.add_argument('--frames', type=int, default=8)
ap.add_argument('--lines', type=float, default=0, help='lines inside the figure too (where parts overlap), this thick in pixels; none by default, as a generated mesh draws them broken')
ap.add_argument('--samples', type=int, default=48)
ap.add_argument('--ss', type=int, default=2, help='rendered this many times as big, then made smaller: smooth lines')
ap.add_argument('--rim', type=float, default=1.7, help='the outline round the whole figure, pixels (of the picture as saved)')
ap.add_argument('--light', type=float, default=1.12, help='the colours made this much brighter')
ap.add_argument('--sat', type=float, default=0.88, help='and this saturated')
ap.add_argument('--lit', default='flat', choices=['toon', 'flat', 'delight'], help="toon: lit here in bands; flat: the texture as painted, unlit (its own light baked in); delight: the light the generator baked into the texture taken out first, then lit here")
ap.add_argument('--ink', default='#2a2420')
a = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
# (a colour as Blender takes it: linear, not as the screen shows it)
rgb = lambda h: tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (1, 3, 5))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a.model)
sc = bpy.context.scene
arm = next((o for o in sc.objects if o.type == 'ARMATURE'), None)
# (with a skeleton, only what it moves is the model: generators leave helpers in the file, as a sphere)
meshes = [o for o in sc.objects if o.type == 'MESH' and (not arm or o.parent == arm or any(m.type == 'ARMATURE' for m in o.modifiers))]
for o in sc.objects:
    if o.type == 'MESH' and o not in meshes: o.hide_render = True

# the animation, if asked: its frames, spread over its length
frames = [sc.frame_current]
if a.anim and arm:
    acts = [x for x in bpy.data.actions if a.anim.lower() in x.name.lower()]
    if not acts: sys.exit(f'no animation like {a.anim!r}: {[x.name for x in bpy.data.actions]}')
    act = acts[0]
    arm.animation_data_create(); arm.animation_data.action = act
    f0, f1 = act.frame_range
    frames = [round(f0 + (f1 - f0) * i / a.frames) for i in range(a.frames)]

# (delight: each colour texture's broad light and shade, baked in by the generator, divided out: its
# brightness smoothed within each island of the texture, over a few dozen pixels, is taken as the light)
if a.lit == 'delight':
    import numpy as np
    from scipy import ndimage
    for im in bpy.data.images:
        if 'normal' in im.name.lower() or im.size[0] == 0 or not any(t in im.name.lower() for t in ('base', 'color', 'albedo', 'diffuse')): continue
        w, h = im.size
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
        lum = px[..., :3] @ np.float32([0.3, 0.59, 0.11])
        mask = (lum > 0.03).astype(np.float32)
        r = max(4, w / 80)
        light = ndimage.gaussian_filter(lum * mask, r) / np.maximum(ndimage.gaussian_filter(mask, r), 1e-3)
        level = np.median(lum[mask > 0])
        px[..., :3] = np.clip(px[..., :3] * (level / np.maximum(light, 0.04))[..., None], 0, 1)
        im.pixels[:] = px.ravel()
        im.update()

# the look: each material's colour (its texture, or its colour) lit in flat bands, with a little of it
# always showing (the shade is never black)
for mat in {s.material for o in meshes for s in o.material_slots if s.material}:
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None) or nt.nodes.new('ShaderNodeOutputMaterial')
    color = None
    if bsdf:
        inp = bsdf.inputs['Base Color']
        color = inp.links[0].from_socket if inp.links else None
        base = tuple(inp.default_value)
    # (its colour a little brighter and calmer than the generator painted it)
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = a.sat; hsv.inputs['Value'].default_value = a.light
    if color: nt.links.new(color, hsv.inputs['Color'])
    elif bsdf: hsv.inputs['Color'].default_value = base
    # (lit and shaded in two flat bands; the shade warm, never black)
    toon = nt.nodes.new('ShaderNodeBsdfToon'); toon.inputs['Size'].default_value = 0.62; toon.inputs['Smooth'].default_value = 0.02
    warm = nt.nodes.new('ShaderNodeMix'); warm.data_type = 'RGBA'; warm.blend_type = 'MULTIPLY'
    warm.inputs['Factor'].default_value = 1.0; warm.inputs[7].default_value = (1.0, 0.78, 0.7, 1)
    nt.links.new(hsv.outputs[0], warm.inputs[6])
    glow = nt.nodes.new('ShaderNodeEmission'); glow.inputs['Strength'].default_value = 0.55
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(hsv.outputs[0], toon.inputs['Color'])
    # (its fine relief, the normal map: the face, the folds, the muscles)
    if bsdf and bsdf.inputs['Normal'].links: nt.links.new(bsdf.inputs['Normal'].links[0].from_socket, toon.inputs['Normal'])
    nt.links.new(warm.outputs[2], glow.inputs['Color'])
    nt.links.new(toon.outputs[0], add.inputs[0]); nt.links.new(glow.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    if a.lit == 'flat':
        flat = nt.nodes.new('ShaderNodeEmission'); flat.inputs['Strength'].default_value = 1.0
        nt.links.new(hsv.outputs[0], flat.inputs['Color']); nt.links.new(flat.outputs[0], out.inputs['Surface'])

# the light: from the top left of the picture, and a little in front
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 2.6; sun.data.angle = 0.05
sc.collection.objects.link(sun)
world = bpy.data.worlds.new('w'); sc.world = world
world.use_nodes = True; world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0

# the camera: orthographic, round the model by the view asked
yaw = {'side': 0, 'three': 45, 'front': 90, 'back': -90}.get(a.view)
yaw = float(a.view) if yaw is None else yaw
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
cam.data.type = 'ORTHO'
sc.collection.objects.link(cam); sc.camera = cam

def bounds():
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        e = o.evaluated_get(dg)
        m = e.to_mesh()
        pts += [e.matrix_world @ v.co for v in m.vertices]
        e.to_mesh_clear()
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])
r = math.radians(yaw)
# (glTF models face -Y: from -X it faces right; turned by yaw towards the front)
d = Vector((-math.cos(r), -math.sin(r), 0))
side = d.cross(Vector((0, 0, 1))).normalized()
# (the box round the model as the camera sees it, in every frame drawn, so all frames stand on the same
# ground, at one size: across the picture, and up)
lo_x = lo_z = 1e9; hi_x = hi_z = -1e9; mid3 = Vector((0, 0, 0)); n = 0
for f in frames:
    sc.frame_set(f)
    l, h = bounds()
    mid3 += (l + h) / 2; n += 1
    for p in [Vector((x, y, z)) for x in (l.x, h.x) for y in (l.y, h.y) for z in (l.z, h.z)]:
        lo_x = min(lo_x, p.dot(side)); hi_x = max(hi_x, p.dot(side)); lo_z = min(lo_z, p.z); hi_z = max(hi_z, p.z)
mid3 /= n
tall, across = hi_z - lo_z, hi_x - lo_x
mid = side * ((lo_x + hi_x) / 2) + Vector((0, 0, (lo_z + hi_z) / 2)) + d * mid3.dot(d)
cam.location = mid + d * (tall * 4)
cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_end = tall * 20
pad = 1.06
cam.data.ortho_scale = max(tall, across) * pad
sun.rotation_euler = (math.radians(50), 0, math.radians(yaw - 55))

ren = sc.render
ren.engine = 'CYCLES'
sc.cycles.samples = a.samples
# (no denoising: it smears the painted detail; enough samples instead)
sc.cycles.use_denoising = False
ren.film_transparent = True
k = a.height / tall * a.ss
ren.resolution_y = round(tall * pad * k)
ren.resolution_x = round(across * pad * k)
ren.use_freestyle = a.lines > 0
ren.line_thickness_mode = 'ABSOLUTE'
ren.line_thickness = a.lines * a.ss
ls = sc.view_layers[0].freestyle_settings.linesets[0] if sc.view_layers[0].freestyle_settings.linesets else sc.view_layers[0].freestyle_settings.linesets.new('ink')
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('ink')
ls.select_by_visibility = True
ls.select_silhouette = ls.select_border = True
ls.select_crease = False
# (only the outline, and where one part passes in front of another: a generated mesh is full of creases)
ls.select_contour = True
ls.linestyle.color = rgb(a.ink)
ls.linestyle.thickness = a.lines * a.ss
sc.view_settings.view_transform = 'Standard'

import os, tempfile
from PIL import Image
tmp = tempfile.mkdtemp()
shots = []
for i, f in enumerate(frames):
    sc.frame_set(f)
    ren.filepath = os.path.join(tmp, f'{i:03d}.png')
    bpy.ops.render.render(write_still=True)
    shots.append(Image.open(ren.filepath).convert('RGBA'))
# (cut to the model: the same box for every frame)
box = None
for s in shots:
    b = s.getbbox()
    if b: box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
from PIL import ImageFilter
pad_px = int(a.rim * a.ss) + 2
box = (box[0] - pad_px, box[1] - pad_px, box[2] + pad_px, box[3] + pad_px)
shots = [s.crop(box) for s in shots]
# (an ink line all round the figure, as thick everywhere and unbroken, under it; then made smaller)
def inked(s):
    al = s.getchannel('A').point(lambda v: 255 if v > 90 else 0)
    size = int(a.rim * a.ss) * 2 + 1
    rim = al.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.GaussianBlur(a.ss * 0.3))
    ink = Image.new('RGBA', s.size, tuple(int(h, 16) for h in (a.ink[1:3], a.ink[3:5], a.ink[5:7])) + (0,))
    ink.putalpha(rim)
    ink.alpha_composite(s)
    return ink.resize((round(s.width / a.ss), round(s.height / a.ss)), Image.LANCZOS)
shots = [inked(s) for s in shots]
sheet = Image.new('RGBA', (shots[0].width * len(shots), shots[0].height))
for i, s in enumerate(shots): sheet.paste(s, (i * shots[0].width, 0))
sheet.save(a.out)
print(a.out, sheet.size, f'{len(shots)} frame(s)')
