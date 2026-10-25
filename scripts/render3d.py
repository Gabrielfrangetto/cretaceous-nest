# Renders a 3D model (a .glb, rigged or not) as the game's painted-looking sprites: an orthographic
# camera (no perspective, as a drawing), the light from the top left as on every sprite, shading in a
# few flat bands (toon) and a dark outline, on a transparent background. One picture, or a strip of an
# animation's frames side by side.
# Run with Blender's Python module (pip install bpy):
#   python scripts/render3d.py model.glb out.png [--view side|front|three|back] [--height 528]
#     [--anim walk --frames 8] [--outline 2.5] [--samples 16]
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
ap.add_argument('--outline', type=float, default=1.6, help='outline thickness, pixels')
ap.add_argument('--samples', type=int, default=16)
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
    toon = nt.nodes.new('ShaderNodeBsdfToon'); toon.inputs['Size'].default_value = 0.75; toon.inputs['Smooth'].default_value = 0.04
    glow = nt.nodes.new('ShaderNodeEmission'); glow.inputs['Strength'].default_value = 0.42
    add = nt.nodes.new('ShaderNodeAddShader')
    for n in (toon, glow):
        if color: nt.links.new(color, n.inputs['Color'])
        elif bsdf: n.inputs['Color'].default_value = base
    nt.links.new(toon.outputs[0], add.inputs[0]); nt.links.new(glow.outputs[0], add.inputs[1])
    nt.links.new(add.outputs[0], out.inputs['Surface'])

# the light: from the top left of the picture, and a little in front
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.2; sun.data.angle = 0.05
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
sc.cycles.use_denoising = True
ren.film_transparent = True
k = a.height / tall
ren.resolution_y = round(tall * pad * k)
ren.resolution_x = round(across * pad * k)
ren.use_freestyle = True
ren.line_thickness_mode = 'ABSOLUTE'
ren.line_thickness = a.outline
ls = sc.view_layers[0].freestyle_settings.linesets[0] if sc.view_layers[0].freestyle_settings.linesets else sc.view_layers[0].freestyle_settings.linesets.new('ink')
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('ink')
ls.select_by_visibility = True
ls.select_silhouette = ls.select_border = True
ls.select_crease = False
# (only the outline, and where one part passes in front of another: a generated mesh is full of creases)
ls.select_contour = True
ls.linestyle.color = rgb(a.ink)
ls.linestyle.thickness = a.outline
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
shots = [s.crop(box) for s in shots]
sheet = Image.new('RGBA', (shots[0].width * len(shots), shots[0].height))
for i, s in enumerate(shots): sheet.paste(s, (i * shots[0].width, 0))
sheet.save(a.out)
print(a.out, sheet.size, f'{len(shots)} frame(s)')
