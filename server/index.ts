import { buildServer } from './app.js'

const port = Number(process.env.PORT ?? 3001)
const app = await buildServer()
let closing: Promise<void> | undefined
const close = () => {
  closing ??= app.close().catch((error) => {
    app.log.error(error)
    process.exitCode = 1
  })
}
process.once('SIGTERM', close)
process.once('SIGINT', close)

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
