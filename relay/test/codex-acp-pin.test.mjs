// The install folder is via's cache key: a lock bumped without it keeps every existing install on the old
// codex-acp (2.5.0 was locked in #40 while installs stayed on 2.3.1-preview.9).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test("codex-acp's install folder names the version its lock installs", () => {
  const lock = JSON.parse(read('relay/codex-acp/package-lock.json'))
  const locked = lock.packages['node_modules/@agentclientprotocol/codex-acp'].version
  const dir = read('hooks/adapters/codex.ts').match(/dir: '([^']+)'/)?.[1]
  assert.equal(dir, `codex-acp-${locked}`)
})
