// Builds the game into app/index.html for the desktop app, with Three.js
// inlined so it runs offline (the browser build loads it from a CDN).
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const three = require.resolve('three/build/three.min.js');
const out = path.join(__dirname, 'app', 'index.html');
execFileSync(process.execPath, [path.join(__dirname, '..', 'build.js'), three, out], { stdio: 'inherit' });
const tag = '<script src="' + three + '"></script>';
let html = fs.readFileSync(out, 'utf8');
if (!html.includes(tag)) throw new Error('three.js script tag not found');
const lib = fs.readFileSync(three, 'utf8');
html = html.replace(tag, () => '<script>' + lib + '</script>');
// fonts too: swap the Google Fonts links for the same faces, embedded
const fonts = [['Barlow Condensed', 'barlow-condensed', [[500], [600], [700], [700, 'italic'], [800, 'italic']]], ['Barlow', 'barlow', [[400], [500], [600]]]];
let css = '';
for (const [family, pkg, faces] of fonts) for (const [w, style = 'normal'] of faces) {
  const f = require.resolve('@fontsource/' + pkg + '/files/' + pkg + '-latin-' + w + '-' + style + '.woff2');
  css += "@font-face{font-family:'" + family + "';font-style:" + style + ';font-weight:' + w + ';font-display:swap;src:url(data:font/woff2;base64,' + fs.readFileSync(f).toString('base64') + ") format('woff2')}\n";
}
const links = /<link rel="preconnect"[^>]*>\s*<link rel="preconnect"[^>]*>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/;
if (!links.test(html)) throw new Error('font links not found');
html = html.replace(links, () => '<style>' + css + '</style>');
// the claude.ai host wraps the page in a UTF-8 document; a file loaded on
// its own needs to say so, or every · and ° shows up as Â· and Â°
if (!/<meta charset/i.test(html)) html = '<meta charset="utf-8">\n' + html;
if (!/^<!doctype/i.test(html)) html = '<!doctype html>\n' + html;
fs.writeFileSync(out, html);
fs.copyFileSync(path.join(__dirname, 'icon.png'), path.join(__dirname, 'app', 'icon.png'));
console.log('inlined three.js:', out, html.length, 'bytes');
