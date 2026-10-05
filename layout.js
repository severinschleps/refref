// Pure layout math, shared by the renderer (script tag) and test.js (require).

// Circular pile: items sit on a ring centred at 0,0, each taking arc proportional to its size.
// Radius is the smallest one where every neighbour pair overlaps by (1 - overlap) of their average size.
function pile(sizes, overlap = 0.85) {
  const n = sizes.length, sum = sizes.reduce((a, b) => a + b, 0)
  let acc = 0
  const A = sizes.map(d => (acc += d) - d / 2).map(c => -Math.PI / 2 + 2 * Math.PI * c / sum)
  let r = 0
  for (let i = 0; n > 1 && i < n; i++) {
    const j = (i + 1) % n, da = (A[j] - A[i] + 2 * Math.PI) % (2 * Math.PI)
    r = Math.max(r, overlap * (sizes[i] + sizes[j]) / 4 / Math.sin(da / 2))
  }
  return A.map(a => ({ x: r * Math.cos(a), y: r * Math.sin(a), a }))
}

// Row packing into a roughly square block; returns item centres.
function grid(rects, gap = 16) {
  const area = rects.reduce((a, r) => a + (r.w + gap) * (r.h + gap), 0)
  const maxW = Math.max(Math.sqrt(area) * 1.3, ...rects.map(r => r.w))
  let x = 0, y = 0, rowH = 0
  return rects.map(r => {
    if (x > 0 && x + r.w > maxW) { x = 0; y += rowH + gap; rowH = 0 }
    const p = { x: x + r.w / 2, y: y + r.h / 2 }
    x += r.w + gap; rowH = Math.max(rowH, r.h)
    return p
  })
}

if (typeof module !== 'undefined') module.exports = { pile, grid }
