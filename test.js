const assert = require('assert')
const { pile, grid } = require('./layout')
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

const one = pile([100])[0]
assert(Math.abs(one.x) < 1e-9 && Math.abs(one.y) < 1e-9, 'single item sits at centre')

const ring = pile([100, 100, 100, 100])
ring.forEach((p, i) => assert(Math.abs(dist(p, ring[(i + 1) % 4]) - 85) < 1e-9, 'equal sizes: neighbours 85% apart'))
assert(Math.abs(ring.reduce((s, p) => s + p.x + p.y, 0)) < 1e-9, 'ring centred on origin')
assert(ring.every((p, i) => !i || p.a > ring[i - 1].a), 'angles increase')

const sizes = [300, 50, 120, 80, 200], mix = pile(sizes)
mix.forEach((p, i) => { const j = (i + 1) % 5; assert(dist(p, mix[j]) >= 0.85 * (sizes[i] + sizes[j]) / 2 - 1e-9, 'mixed sizes never overlap more than 15%') })

const rects = [{ w: 200, h: 100 }, { w: 50, h: 300 }, { w: 120, h: 120 }, { w: 400, h: 80 }, { w: 90, h: 60 }]
const g = grid(rects)
for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
  const a = rects[i], b = rects[j]
  assert(Math.abs(g[i].x - g[j].x) >= (a.w + b.w) / 2 || Math.abs(g[i].y - g[j].y) >= (a.h + b.h) / 2, `grid items ${i},${j} overlap`)
}
console.log('ok')
