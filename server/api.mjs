// Neon Function behind the website (Neon project "refref", eu-central-1):
//   POST /feedback  {message, email?}  ← the feedback box on docs/index.html
//   GET  /downloads                    ← {total} for the site's download counter (cached 10 min)
//   GET  /report?key=REPORT_KEY        ← weekly email: downloads per version/platform + new feedback
// Tables: feedback(id, created_at, message, email), download_snapshots(taken_at, counts jsonb).
// Deploy: bundle with esbuild (--bundle --platform=node --format=esm --external:pg-native) to index.mjs,
// zip it, and deploy as slug "api" with env REPORT_KEY (kept in the local, gitignored .env).
import pg from 'pg'

const REPO = 'severinschleps/refref'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 })
pool.on('error', () => {}) // idle clients get dropped on scale-to-zero; the next query reconnects

export default {
  async fetch(req) {
    // Any origin: the site's domain may change, and CORS doesn't stop non-browser clients anyway.
    const url = new URL(req.url), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
    if (req.method === 'POST' && url.pathname === '/feedback') return feedback(req, h)
    if (req.method === 'GET' && url.pathname === '/downloads') return downloads(h)
    if (req.method === 'GET' && url.pathname === '/report') return report(url)
    return new Response('not found', { status: 404 })
  },
}

async function feedback(req, h) {
  const b = await req.json().catch(() => ({}))
  if (b.website) return Response.json({ ok: true }, { headers: h }) // honeypot: only bots fill the hidden field
  const message = String(b.message ?? '').trim().slice(0, 4000), email = String(b.email ?? '').trim().slice(0, 200) || null
  if (!message) return Response.json({ error: 'empty' }, { status: 400, headers: h })
  // ponytail: one global hourly cap, not per-IP limits; add those if spam ever hits the cap
  const { rows: [{ n }] } = await pool.query("SELECT count(*)::int n FROM feedback WHERE created_at > now() - interval '1 hour'")
  if (n >= 60) return Response.json({ error: 'busy' }, { status: 429, headers: h })
  await pool.query('INSERT INTO feedback (message, email) VALUES ($1, $2)', [message, email])
  return Response.json({ ok: true }, { headers: h })
}

// Download counts per "tag · file" from GitHub releases.
async function releaseCounts() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers: { 'user-agent': 'refref-api' } })
  if (!r.ok) throw new Error('GitHub API ' + r.status)
  const counts = {}
  for (const rel of await r.json()) for (const a of rel.assets) counts[`${rel.tag_name} · ${a.name}`] = a.download_count
  return counts
}

// ponytail: in-memory cache per isolate; GitHub allows 60 unauthenticated calls/hour, this makes at most 6.
let cached = { at: 0, total: null }
async function downloads(h) {
  if (Date.now() - cached.at > 600e3) {
    try { cached = { at: Date.now(), total: Object.values(await releaseCounts()).reduce((a, b) => a + b, 0) } }
    catch { cached.at = Date.now() - 540e3 } // GitHub down: keep the old number, retry in a minute
  }
  return Response.json({ total: cached.total }, { headers: h })
}

async function report(url) {
  if (!process.env.REPORT_KEY || url.searchParams.get('key') !== process.env.REPORT_KEY) return new Response('forbidden', { status: 403 })
  const counts = await releaseCounts().catch(() => null)
  if (!counts) return new Response('GitHub API unavailable', { status: 502 })

  // Compare with the newest snapshot that is at least 6 days old, so a retried run doesn't zero the week.
  const { rows: [prev] } = await pool.query("SELECT taken_at, counts FROM download_snapshots WHERE taken_at < now() - interval '6 days' ORDER BY taken_at DESC LIMIT 1")
  await pool.query('INSERT INTO download_snapshots (counts) VALUES ($1)', [counts])
  const since = prev?.taken_at ?? new Date(0), old = prev?.counts ?? {}
  const { rows: fb } = await pool.query('SELECT created_at, message, email FROM feedback WHERE created_at > $1 ORDER BY created_at', [since])

  const day = d => d.toISOString().slice(0, 10), keys = Object.keys(counts).sort().reverse()
  const total = keys.reduce((s, k) => s + counts[k], 0), week = keys.reduce((s, k) => s + counts[k] - (old[k] ?? 0), 0)
  const lines = [
    `RefRef report, ${day(new Date())}`,
    '',
    `Downloads ${prev ? 'since ' + day(since) : 'since launch'}: ${week}  (all time: ${total})`,
    ...keys.map(k => `  ${k}: +${counts[k] - (old[k] ?? 0)}  (${counts[k]} total)`),
    '',
    `New feedback: ${fb.length}`,
    ...fb.flatMap(f => ['', `  ${f.created_at.toISOString().slice(0, 16).replace('T', ' ')} UTC${f.email ? ' · ' + f.email : ''}`, ...f.message.split('\n').map(l => '  ' + l)]),
  ]
  return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
