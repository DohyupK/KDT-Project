/**
 * Smoke: header notif state service merge/read against live DB.
 * Run: npx tsx scripts/smoke-header-notif-state.ts
 */
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import * as headerNotifState from '../src/services/headerNotifState.service.js'
import { query } from '../src/db/connection.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

async function main() {
  const users = await query<{ user_id: string }[]>(
    'SELECT user_id FROM USERS ORDER BY id ASC LIMIT 1',
  )
  assert(users[0]?.user_id, 'no users in DB')
  const userId = users[0].user_id
  const tag = `smoke:${Date.now()}`

  const before = await headerNotifState.getHeaderNotifState(userId)
  assert(Array.isArray(before.readIds), 'readIds array')
  assert(Array.isArray(before.dismissedIds), 'dismissedIds array')

  const afterRead = await headerNotifState.markHeaderNotifsRead(userId, [
    `${tag}:a`,
    `${tag}:b`,
    `${tag}:a`,
  ])
  assert(afterRead.readIds.includes(`${tag}:a`), 'read a')
  assert(afterRead.readIds.includes(`${tag}:b`), 'read b')
  assert(afterRead.readIds.filter((id) => id === `${tag}:a`).length === 1, 'dedupe a')

  const afterDismiss = await headerNotifState.dismissHeaderNotifs(userId, [`${tag}:b`])
  assert(afterDismiss.dismissedIds.includes(`${tag}:b`), 'dismissed b')
  assert(afterDismiss.readIds.includes(`${tag}:b`), 'dismiss also marks read')

  const again = await headerNotifState.getHeaderNotifState(userId)
  assert(again.readIds.includes(`${tag}:a`), 'persisted read')
  assert(again.dismissedIds.includes(`${tag}:b`), 'persisted dismiss')

  // cleanup smoke ids
  const cleanedRead = again.readIds.filter((id) => !id.startsWith(`${tag}:`))
  const cleanedDismissed = again.dismissedIds.filter((id) => !id.startsWith(`${tag}:`))
  await query(
    `UPDATE USER_HEADER_NOTIF_STATE
     SET read_ids = ?, dismissed_ids = ?
     WHERE user_id = ?`,
    [JSON.stringify(cleanedRead), JSON.stringify(cleanedDismissed), userId],
  )

  console.log('SMOKE_OK header_notif_state', { userId, read: afterRead.readIds.length })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
