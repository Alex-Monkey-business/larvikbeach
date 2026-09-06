// Blindskriving mot basen: `npm run check:writes`, kjøres også i build.
//
// En update/delete/upsert som RLS filtrerer bort treffer null rader og svarer
// «ok» uten feil. Uten `.select()` kan koden ikke skille «lagret» fra «nektet».
// Derfor er den forbudt her. Trenger du unntaket, skriv `// blindskriving: <grunn>`
// på linjen over kallet. (Arvet fra BenchBoss, der det kostet en time.)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const DIRS = [join(ROOT, 'src'), join(ROOT, 'supabase', 'functions')]
const SKRIV = ['update', 'delete', 'upsert']
const UNNTAK = /\/\/\s*blindskriving:/

function files(dir) {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : (/\.(ts|tsx|js|mjs)$/.test(n) ? [p] : [])
  })
}

// Finn slutten på parentesuttrykket som starter ved i (som peker på '(').
function closeParen(s, i) {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '"' || c === "'" || c === '`') { j = skipString(s, j) - 1; continue }
    if (c === '(') depth++
    if (c === ')') { depth--; if (depth === 0) return j }
  }
  return s.length
}
function skipString(s, i) {
  const q = s[i]
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue }
    if (s[j] === q) return j + 1
  }
  return s.length
}

const hits = []
for (const dir of DIRS) {
  for (const f of files(dir)) {
    const src = readFileSync(f, 'utf8')
    const re = new RegExp(`\\.(${SKRIV.join('|')})\\s*\\(`, 'g')
    let m
    while ((m = re.exec(src))) {
      // Bare Supabase-kjeder: må stå etter .from(...) på samme statement.
      const stmtStart = Math.max(src.lastIndexOf('\n\n', m.index), 0)
      const before = src.slice(stmtStart, m.index)
      if (!/\.from\(/.test(before)) continue
      const end = closeParen(src, m.index + m[0].length - 1)
      // Resten av kjeden fram til statementet slutter.
      let k = end + 1
      let chain = ''
      while (k < src.length) {
        const c = src[k]
        if (c === '.' ) { const e = closeParen(src, src.indexOf('(', k)); chain += src.slice(k, e + 1); k = e + 1; continue }
        if (/\s/.test(c)) { k++; continue }
        break
      }
      if (/\.select\s*\(/.test(chain)) continue
      const lineNo = src.slice(0, m.index).split('\n').length
      const prevLine = src.split('\n')[lineNo - 2] ?? ''
      if (UNNTAK.test(prevLine)) continue
      hits.push(`${relative(ROOT, f)}:${lineNo}  .${m[1]}(…) uten .select()`)
    }
  }
}

if (hits.length) {
  console.error('Blindskriving funnet:\n  ' + hits.join('\n  '))
  process.exit(1)
}
console.log('check:writes ok')
