const assert = require('assert')
const { pack, grid } = require('./layout')

const noOverlap = (rects, P, gap, what) => {
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    const a = rects[i], b = rects[j]
    assert(Math.abs(P[i].x - P[j].x) >= (a.w + b.w) / 2 + gap - 1e-6 || Math.abs(P[i].y - P[j].y) >= (a.h + b.h) / 2 + gap - 1e-6, `${what}: items ${i},${j} overlap`)
  }
}

// deterministic pseudo-random rects
let seed = 7
const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647
const rects = Array.from({ length: 30 }, () => ({ w: 80 + rnd() * 320, h: 80 + rnd() * 320 }))
  .sort((a, b) => b.w * b.h - a.w * a.h)

for (const aspect of [1, 16 / 9, 0.6]) {
  const gap = 12, P = pack(rects, gap, aspect)
  assert.deepStrictEqual(P[0], { x: 0, y: 0 }, 'first item at centre')
  noOverlap(rects, P, gap, `pack aspect ${aspect}`)
  const x0 = Math.min(...P.map((p, i) => p.x - rects[i].w / 2)), x1 = Math.max(...P.map((p, i) => p.x + rects[i].w / 2))
  const y0 = Math.min(...P.map((p, i) => p.y - rects[i].h / 2)), y1 = Math.max(...P.map((p, i) => p.y + rects[i].h / 2))
  const fill = rects.reduce((s, r) => s + r.w * r.h, 0) / ((x1 - x0) * (y1 - y0))
  assert(fill > 0.6, `pack aspect ${aspect}: too loose, fill ${fill.toFixed(2)}`)
  const shape = (x1 - x0) / (y1 - y0)
  assert(shape / aspect > 0.6 && shape / aspect < 1.7, `pack aspect ${aspect}: shape ${shape.toFixed(2)} ignores view`)
  console.log(`pack aspect ${aspect.toFixed(2)}: fill ${fill.toFixed(2)}, shape ${shape.toFixed(2)}`)
}

const g = grid(rects)
noOverlap(rects, g, 0, 'grid')
console.log('ok')
