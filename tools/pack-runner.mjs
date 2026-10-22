// Builds assets/runner2.glb from Quaternius' Universal Animation Library 1 and 2
// (CC0, quaternius.com, the Standard glTF downloads): the UAL1 mannequin with
// the clips Strafe plays, renamed, at half the triangles, quantized.
// npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
// node tools/pack-runner.mjs UAL1_Standard.glb UAL2_Standard.glb assets/runner2.glb
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const [ual1, ual2, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const doc = await io.read(ual1), src2 = await io.read(ual2);
const root = doc.getRoot(), buf = root.listBuffers()[0];
const PICK = {
  idle: [1, 'Idle_Loop'], run: [1, 'Jog_Fwd_Loop'], sprint: [1, 'Sprint_Loop'], crouch: [1, 'Crouch_Idle_Loop'], crouchRun: [1, 'Crouch_Fwd_Loop'],
  jump: [1, 'Jump_Start'], fall: [1, 'Jump_Loop'], land: [1, 'Jump_Land'], roll: [1, 'Roll'],
  slide: [2, 'Slide_Loop'], climb: [2, 'ClimbUp_1m'], vault: [2, 'NinjaJump_Start'],
};
const byName = new Map(root.listNodes().map(n => [n.getName(), n]));
const copyAcc = (a) => doc.createAccessor(a.getName()).setType(a.getType()).setArray(a.getArray().slice()).setNormalized(a.getNormalized()).setBuffer(buf);
for (const [name, [pack, clip]] of Object.entries(PICK)) {
  const from = (pack === 1 ? doc : src2).getRoot().listAnimations().find(a => a.getName() === clip);
  if (!from) throw new Error('missing ' + clip);
  const anim = doc.createAnimation(name);
  for (const ch of from.listChannels()) {
    const tgt = byName.get(ch.getTargetNode().getName()); if (!tgt) continue;
    const s = ch.getSampler();
    const ns = doc.createAnimationSampler().setInput(copyAcc(s.getInput())).setOutput(copyAcc(s.getOutput())).setInterpolation(s.getInterpolation());
    anim.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(tgt).setTargetPath(ch.getTargetPath()).setSampler(ns));
  }
}
for (const a of root.listAnimations()) if (!(a.getName() in PICK)) {
  for (const s of a.listSamplers()) { s.getInput()?.dispose(); s.getOutput()?.dispose(); s.dispose(); }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}
// drop channels that hold a bone at its rest pose the whole clip
for (const a of root.listAnimations()) for (const c of a.listChannels()) {
  const n = c.getTargetNode(), path = c.getTargetPath(), out = c.getSampler().getOutput().getArray();
  const rest = path === 'translation' ? n.getTranslation() : path === 'rotation' ? n.getRotation() : n.getScale();
  const k = rest.length, eps = path === 'translation' ? 1e-4 : 1e-3;
  let still = true;
  for (let i = 0; i < out.length && still; i++) if (Math.abs(out[i] - rest[i % k]) > eps) still = false;
  if (still) { const s = c.getSampler(); c.dispose(); s.dispose(); }
}
await MeshoptSimplifier.ready;
const ratio = Number(process.env.RATIO || 0.5);
await doc.transform(dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }), resample({ tolerance: 0.002 }), prune(), quantize());
await io.write(out, doc);
