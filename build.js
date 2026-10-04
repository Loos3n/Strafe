// Inlines src/*.js into one self-contained page: node build.js [threeSrc] [outFile]
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const three = process.argv[2] || 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const out = process.argv[3] || path.join(__dirname, 'dist', 'index.html');
let html = src('index.template.html');
for (const [k, f] of [['__PHYSICS__', 'physics.js'], ['__AUDIO__', 'audio.js'], ['__MAP__', 'map.js'], ['__GAME__', 'game.js']]) html = html.split(k).join(src(f));
html = html.replace('__THREE_SRC__', three);
// three.js loaders and the models, inlined so the page stays one file
const vendor = ['GLTFLoader.js', 'SkeletonUtils.js'].map(f => fs.readFileSync(path.join(__dirname, 'vendor', f), 'utf8')).join('\n');
const assets = {};
for (const f of fs.readdirSync(path.join(__dirname, 'assets')).filter(f => f.endsWith('.glb'))) assets[f.replace('.glb', '')] = fs.readFileSync(path.join(__dirname, 'assets', f)).toString('base64');
html = html.split('__VENDOR__').join(vendor).split('__ASSETS__').join('window.STRAFE_ASSETS = ' + JSON.stringify(assets) + ';');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, html.length, 'bytes');
