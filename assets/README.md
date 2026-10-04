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
