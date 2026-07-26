/**
 * Debug helper: run `tsc -b` and append NDJSON to the session log.
 * #region agent log
 */
import { execSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOG_PATH = resolve('.cursor/debug-022cab.log')
const sessionId = '022cab'

function log(payload) {
  appendFileSync(
    LOG_PATH,
    `${JSON.stringify({ sessionId, timestamp: Date.now(), ...payload })}\n`,
  )
}

try {
  execSync('npx tsc -b --pretty false', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  log({
    hypothesisId: 'A',
    location: 'scripts/debug-tsc-build.mjs',
    message: 'tsc -b succeeded',
    data: { ok: true },
    runId: process.env.DEBUG_RUN_ID ?? 'verify',
  })
  console.log('tsc -b: OK')
} catch (error) {
  const stdout = error.stdout?.toString?.() ?? ''
  const stderr = error.stderr?.toString?.() ?? ''
  const combined = `${stdout}\n${stderr}`.trim()
  const lines = combined.split('\n').filter(Boolean)
  log({
    hypothesisId: 'A',
    location: 'scripts/debug-tsc-build.mjs',
    message: 'tsc -b failed',
    data: {
      ok: false,
      errorCount: lines.filter((l) => l.includes('error TS')).length,
      sample: lines.slice(0, 8),
    },
    runId: process.env.DEBUG_RUN_ID ?? 'verify',
  })
  console.error(combined)
  process.exit(1)
}
// #endregion
