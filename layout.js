// Pure layout math, shared by the renderer (script tag) and test.js (require).

// Magnet pack: rects are placed one by one, each at the free spot (touching a placed rect, `gap` apart)
// that keeps the bounding box smallest for the view's aspect, nearest the centre on ties.
// Returns centres; the first rect sits at 0,0.
// ponytail: greedy O(n³), fine to a few hundred images; swap for a maxrects packer beyond that.
function pack(rects, gap = 0, aspect = 1) {
  const out = [], bb = { x0: 0, y0: 0, x1: 0, y1: 0 }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const free = (x, y, w, h) => out.every(p => Math.abs(p.x - x) >= (p.w + w) / 2 + gap - 1e-6 || Math.abs(p.y - y) >= (p.h + h) / 2 + gap - 1e-6)
  for (const { w, h } of rects) {
    let best = { x: 0, y: 0, score: Infinity }
    for (const p of out) {
      const dx = (p.w + w) / 2 + gap, dy = (p.h + h) / 2 + gap
      const ys = [p.y, p.y - (p.h - h) / 2, p.y + (p.h - h) / 2, clamp(0, p.y - (p.h + h) / 2, p.y + (p.h + h) / 2)]
      const xs = [p.x, p.x - (p.w - w) / 2, p.x + (p.w - w) / 2, clamp(0, p.x - (p.w + w) / 2, p.x + (p.w + w) / 2)]
      const cands = [...ys.flatMap(y => [[p.x + dx, y], [p.x - dx, y]]), ...xs.flatMap(x => [[x, p.y + dy], [x, p.y - dy]])]
      for (const [x, y] of cands) {
        const bw = Math.max(bb.x1, x + w / 2) - Math.min(bb.x0, x - w / 2)
        const bh = Math.max(bb.y1, y + h / 2) - Math.min(bb.y0, y - h / 2)
        const score = Math.max(bw, bh * aspect) + 0.25 * Math.hypot(x, y * aspect)
        if (score < best.score && free(x, y, w, h)) best = { x, y, score }
      }
    }
    out.push({ x: best.x, y: best.y, w, h })
    if (out.length === 1) Object.assign(bb, { x0: -w / 2, x1: w / 2, y0: -h / 2, y1: h / 2 })
    else Object.assign(bb, { x0: Math.min(bb.x0, best.x - w / 2), x1: Math.max(bb.x1, best.x + w / 2), y0: Math.min(bb.y0, best.y - h / 2), y1: Math.max(bb.y1, best.y + h / 2) })
  }
  return out.map(({ x, y }) => ({ x, y }))
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

if (typeof module !== 'undefined') module.exports = { pack, grid }
