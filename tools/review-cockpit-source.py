"""Inspect the original Sketchfab glTF in Blender; never export game assets.

blender --background --python tools/review-cockpit-source.py -- source/scene.gltf test/output/source-review
The workbench renders compare geometry/camera placement, not lighting quality.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
args.output.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(args.source.resolve()))
source = json.loads(args.source.read_text())
report = {'source': args.source.name, 'texture_images': len(source.get('images', [])), 'source_materials': {}}
for material in source['materials']:
    if material['name'] in ('Material.014', 'Material.008', 'Material.048'):
        report['source_materials'][material['name']] = material['pbrMetallicRoughness']

# Match the game's uniform scale/orientation only. Do not stretch the shell,
# move seats or recolour source materials. Ignore the same off-scene duplicates.
transform = Matrix(((-1.7, 0, 0, 0), (0, -1.7, 0, -1.53),
                    (0, 0, 1.7, .14 - 2.22 * 1.7), (0, 0, 0, 1)))
for obj in list(bpy.data.objects):
    if obj.type != 'MESH':
        continue
    obj.data.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    vertices = obj.data.vertices
    if max(v.co.x for v in vertices) > 3 or min(-v.co.y for v in vertices) < -3:
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    if obj.name == 'Body.020_Material.008_0':
        report['source_frame_y_bounds'] = [min(v.co.z for v in vertices), max(v.co.z for v in vertices)]
    obj.data.transform(transform)
for material in bpy.data.materials:
    if material.use_nodes:
        principled = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if principled:
            material.diffuse_color = principled.inputs['Base Color'].default_value

scene = bpy.context.scene
camera = bpy.data.objects.new('Source inspection camera', bpy.data.cameras.new('Source inspection camera'))
scene.collection.objects.link(camera)
camera.rotation_euler = Vector((0, math.cos(math.radians(14)), -math.sin(math.radians(14)))).to_track_quat('-Z', 'Y').to_euler()
camera.data.sensor_fit = 'VERTICAL'
camera.data.sensor_height = 36
camera.data.lens = 36 / (2 * math.tan(math.radians(29)))
scene.camera = camera
scene.render.engine = 'BLENDER_WORKBENCH'
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = 'BOTH'
scene.world = bpy.data.worlds.new('Inspection background')
scene.display.shading.background_type = 'WORLD'
scene.world.color = (.55, .65, .75)
scene.render.resolution_x, scene.render.resolution_y = 1200, 750
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
for name, eye in [('previous-eye', (.1647, 2.2288, .947)), ('fitted-eye', (.24, 2.155, .95))]:
    x, y, z = eye
    camera.location = (-1.7 * x, 1.7 * (z - .9), .14 + 1.7 * (y - 2.22))
    scene.render.filepath = str((args.output / f'source-{name}.png').resolve())
    bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str((args.output / 'source-inspection.blend').resolve()))
(args.output / 'source-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
