// Inlines src/*.js into one self-contained page: node build.js [threeSrc] [outFile]
const fs = require('fs'), path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const three = process.argv[2] || 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const out = process.argv[3] || path.join(__dirname, 'dist', 'index.html');
let html = src('index.template.html');
for (const [k, f] of [['__PHYSICS__', 'physics.js'], ['__AUDIO__', 'audio.js'], ['__MAP__', 'map.js'], ['__TUTORIAL__', 'tutorial.js'], ['__GAME__', 'game.js']]) html = html.split(k).join(src(f));
html = html.replace('__THREE_SRC__', three);
// STRAFE_WEB=1 (the server build): the page can be installed as a phone app,
// with the manifest, icons and offline worker served next to it from server/static
const web = process.env.STRAFE_WEB === '1' ? [
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Strafe">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  "<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));</script>",
].join('\n') : '';
html = html.replace('<!--__WEB_APP__-->\n', web ? web + '\n' : '');
// three.js loaders and the models, inlined so the page stays one file
const vendor = ['GLTFLoader.js', 'SkeletonUtils.js'].map(f => fs.readFileSync(path.join(__dirname, 'vendor', f), 'utf8')).join('\n');
const assets = {};
for (const f of fs.readdirSync(path.join(__dirname, 'assets')).filter(f => f.endsWith('.glb'))) assets[f.replace('.glb', '')] = fs.readFileSync(path.join(__dirname, 'assets', f)).toString('base64');
// surface textures (assets/tex, see tools/pack-textures.py) as data URLs
const texDir = path.join(__dirname, 'assets', 'tex'), tex = {};
if (fs.existsSync(texDir)) for (const f of fs.readdirSync(texDir).filter(f => f.endsWith('.jpg'))) tex[f.replace('.jpg', '')] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(texDir, f)).toString('base64');
html = html.split('__VENDOR__').join(vendor).split('__ASSETS__').join('window.STRAFE_ASSETS = ' + JSON.stringify(assets) + ';\nwindow.STRAFE_TEX = ' + JSON.stringify(tex) + ';');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log('wrote', out, html.length, 'bytes');
