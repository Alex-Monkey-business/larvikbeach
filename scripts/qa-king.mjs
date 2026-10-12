// King of the beach i basen. Alt skjer i én transaksjon som rulles tilbake.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const sql = readFileSync(new URL('./qa-king.sql', import.meta.url), 'utf8')
try {
  const out = execFileSync('docker', ['exec', '-i', 'supabase_db_larvikbeach', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
  process.stdout.write(out)
  console.log('✓ qa-king: rotasjon, ny runde, rettet resultat, fem og seks')
} catch (e) {
  console.error(e.stderr || e.message)
  process.exit(1)
}
