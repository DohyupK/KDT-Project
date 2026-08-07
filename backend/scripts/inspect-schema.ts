/**
 * Inspect live table columns vs expected schema.
 */
import '../src/loadRootEnv.js'
import { query } from '../src/db/connection.js'

async function main() {
  const tables = ['analysis_lots', 'handover_history', 'judgment_lots', 'lots', 'issues']
  for (const t of tables) {
    try {
      const cols = await query<{ Field: string; Type: string; Null: string; Key: string; Default: unknown }[]>(
        `SHOW COLUMNS FROM \`${t}\``,
      )
      console.log(`=== ${t} ===`)
      for (const c of cols) {
        console.log(`  ${c.Field}\t${c.Type}\tnull=${c.Null}\tkey=${c.Key}`)
      }
    } catch (e) {
      console.log(`=== ${t} === MISSING`, e instanceof Error ? e.message : e)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
