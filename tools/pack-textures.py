# Packs ambientCG 1K-JPG material zips (CC0, ambientcg.com) into the small
# maps the game inlines: assets/tex/<slot>_c.jpg (colour, made grey and
# evened out so the level's own colours tint it), _n.jpg (OpenGL normal map)
# and _r.jpg (roughness).
#   python3 tools/pack-textures.py <folder with the unzipped sets>
import sys, os
from PIL import Image, ImageOps, ImageStat

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tex')
# slot: (set, colour contrast, colour brightness)
SLOTS = {
    'floor': ('Concrete034', 1.4, 0.88),
    'wall': ('Concrete014', 1.0, 0.84),
    'ramp': ('Metal009', 0.7, 0.9),  # brushed, no seams: reads as one sheet down a long ramp
    'paint': ('Metal009', 1.2, 0.92),
    'plate': ('DiamondPlate008A', 1.8, 0.86),
}

def find(set_, kind):
    d = os.path.join(SRC, set_)
    return os.path.join(d, next(f for f in os.listdir(d) if f.endswith('_' + kind + '.jpg')))

os.makedirs(OUT, exist_ok=True)
for slot, (set_, contrast, bright) in SLOTS.items():
    g = ImageOps.grayscale(Image.open(find(set_, 'Color'))).resize((512, 512), Image.LANCZOS)
    mean = ImageStat.Stat(g).mean[0]
    # spread around the mean, then move the mean to the target brightness
    g = g.point(lambda v: max(0, min(255, round(bright * 255 + (v - mean) * contrast))))
    g.convert('RGB').save(os.path.join(OUT, slot + '_c.jpg'), quality=82, optimize=True)
    Image.open(find(set_, 'NormalGL')).convert('RGB').resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, slot + '_n.jpg'), quality=88, optimize=True)
    ImageOps.grayscale(Image.open(find(set_, 'Roughness'))).resize((256, 256), Image.LANCZOS).convert('RGB').save(os.path.join(OUT, slot + '_r.jpg'), quality=85, optimize=True)
    print(slot, set_)
