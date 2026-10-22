# Models

Built into the page as base64 by `build.js`. Nothing here collides: the
physics and the bot tests use the code-built level geometry in `src/map.js`.

- `city.glb`: buildings, water tower, street lights, traffic light, cars,
  dumpster, bench, hydrant, bin, box and bush from **KayKit City Builder Bits**
  by Kay Lousberg (CC0 1.0, `LICENSE-kaykit.txt`). The pack's glTF files were
  merged into one file, deduplicated and quantized with gltf-transform.
- `runner.glb`: the X Bot character from the three.js examples (a Mixamo
  character and animations, free to use in games), cut to the idle and run
  animations, simplified to about a third of its triangles and quantized.

The loaders in `vendor/` are three.js r128's `GLTFLoader.js` and
`SkeletonUtils.js` (MIT).
- `runner2.glb`: the mannequin and its moves (idle, run, sprint, crouch,
  jump, fall, slide, climb, vault and more) from Quaternius' **Universal
  Animation Library** 1 and 2 (CC0 1.0). Used for the ghost and the Cosmetics
  preview; `tools/pack-runner.mjs` rebuilds it from the pack's Standard glTF
  files. If it is missing or fails to load (or with `?runner=classic`), the
  X Bot stands in. The first-person body uses it too, its bones mapped to
  the X Bot's names (mixamoNames in game.js).
- `tex/`: surface textures for the course pieces, from **ambientCG** (CC0 1.0,
  ambientcg.com): Concrete 034 (floors and pads), Concrete 014 (walls),
  Metal 009 (ramps, drawn out along the ramp as one brushed sheet, and the red route pieces) and Diamond Plate
  008 A (blocks and lanes). `tools/pack-textures.py` turns the 1K-JPG
  downloads into a grey colour map (the level colours tint it), a normal map
  and a roughness map, at 512 px (roughness 256), about 450 KB in all.
