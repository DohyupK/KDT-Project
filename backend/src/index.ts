import 'dotenv/config'
import { createApp } from './app.js'

const port = Number(process.env.PORT || 3001)
const app = createApp()

app.listen(port, () => {
  console.log(`[backend] listening on http://127.0.0.1:${port}`)
  console.log(`[backend] AI_SERVICE_URL=${process.env.AI_SERVICE_URL || 'http://127.0.0.1:8800'}`)
  console.log(`[backend] CHAT_STORE=${process.env.CHAT_STORE || 'mariadb'}`)
})
