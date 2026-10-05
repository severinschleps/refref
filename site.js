// Builds the website into _site/: docs/ plus the live app in _site/app/, wired to the browser shim instead of preload.js.
const fs = require('fs')
fs.rmSync('_site', { recursive: true, force: true })
fs.cpSync('docs', '_site', { recursive: true })
for (const f of ['app.js', 'layout.js', 'style.css']) fs.copyFileSync(f, '_site/app/' + f)
const html = fs.readFileSync('index.html', 'utf8').replace('<script src="layout.js">', '<script src="web-api.js"></script>\n<script src="layout.js">')
if (!html.includes('web-api.js')) throw new Error('site.js: could not inject web-api.js into index.html')
fs.writeFileSync('_site/app/index.html', html)
