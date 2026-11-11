import { expect, test } from 'claude-code/testing'
import { createRecord, type Records, recordOf, updateRecord } from '../hooks/record'

function memory() {
  const held = new Map<string, unknown>()
  const $ = {
    store: {
      get: async (key: string) => held.get(key),
      set: async (key: string, value: unknown) => {
        held.set(key, value)
      },
      delete: async (key: string) => {
        held.delete(key)
      },
      keys: async () => [...held.keys()],
    },
  }
  return { held, $ }
}

test('the store keeps the newest 200 agents, oldest dropped first', async () => {
  const { held, $ } = memory()
  const w: Records = { records: new Map() }
  for (let i = 0; i < 201; i += 1) void createRecord(w, $, `a${i}`, { harness: 'pi', handback: false, mode: 'default' })
  await w.writing
  const ids = held.get('agent-ids') as string[]
  expect(ids).toHaveLength(200)
  expect(ids[0]).toBe('a1')
  expect(held.has('agent:a0')).toBe(false)
  expect(held.has('agent:a200')).toBe(true)
})

test('a new process reads the record another process wrote, with its latest changes', async () => {
  const { $ } = memory()
  const old: Records = { records: new Map() }
  await createRecord(old, $, 'a1', { harness: 'codex', handback: true, mode: 'auto' })
  await updateRecord(old, $, 'a1', { report: 'done', handedBack: true })
  const fresh: Records = { records: new Map() }
  expect(await recordOf(fresh, $, 'a1')).toEqual({ harness: 'codex', handback: true, mode: 'auto', report: 'done', handedBack: true })
})

test('a store that refuses leaves the record in memory, and the step goes on', async () => {
  const $ = {
    store: {
      get: async () => {
        throw new Error('no store')
      },
      set: async () => {
        throw new Error('no store')
      },
      delete: async () => undefined,
      keys: async () => [],
    },
  }
  const w: Records = { records: new Map() }
  await createRecord(w, $, 'a1', { harness: 'pi', handback: false, mode: 'default' })
  expect(await recordOf(w, $, 'a1')).toMatchObject({ harness: 'pi' })
  expect(await recordOf(w, $, 'a2')).toBeUndefined()
})
