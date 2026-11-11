import { expect, mock, type TestBody, test } from 'claude-code/testing'
import { NODE, run, STEP } from './helpers'

type On = Parameters<TestBody>[1]

// What the engine does when via's turn.step hook is skipped: the request goes to the model.
function fallback(on: On) {
  let requests = 0
  on('turn.step', async function* (_, e) {
    requests += 1
    yield { kind: 'text', index: 0, text: 'API fallback' }
    return { turnId: e.turnId, index: e.index, answer: 'API fallback', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  return () => requests
}

// Captured 2026-10-28 from relay/relay.mjs over codex-acp 2.3.1-preview.8, trimmed
// (copied from tests/children.test.ts).
const ROOT = '01a18155-81d4-7ba0-8246-5cba1d8adb3b'
const CHILD = `${ROOT}:subagent:01a18155-8b4f-7403-bb8f-f472976c48cd`
const MODEL = {
  configOptions: [{ currentValue: 'gpt-6-luna', type: 'select', id: 'model', name: 'Model', category: 'model', options: [] }],
}
const CAPTURED = [
  { relay: 'session', sessionId: ROOT, cwd: '/repo' },
  { relay: 'steered' },
  { sessionId: ROOT, update: { sessionId: CHILD, title: 'List acp', capabilities: {}, sessionUpdate: 'subagent_update' } },
  { sessionId: CHILD, update: { ...MODEL, sessionUpdate: 'config_option_update' } },
  { sessionId: ROOT, update: { sessionId: CHILD, state: { state: 'running' }, sessionUpdate: 'subagent_update' } },
  { sessionId: CHILD, update: { content: { text: 'steps.ts', type: 'text' }, messageId: 'm1', sessionUpdate: 'agent_message_chunk' } },
  { sessionId: ROOT, update: { sessionId: CHILD, state: { stopReason: 'end_turn', state: 'idle' }, sessionUpdate: 'subagent_update' } },
]

// A parent's run pauses at its Agent call; its next step supplies the child's answer, so the nested agent sits
// on its empty queue until then (from #24's fixture).
async function nestedChild($: Parameters<TestBody>[0], on: On, failure?: string, refused?: 'state') {
  const clock = mock.clock(on)
  mock.env(on, { HOME: '/home/u' })
  on('agent.list', () => ({ value: [{ id: 'a1', description: 'parent', type: 'via:codex', status: 'running' }] }))
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('agent.spawn', (_, e) => ({ agentId: 'n1', model: e.model ?? 'codex' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', () => ({ value: NODE }))
  const line = (events: unknown[]) => `${events.map((e) => JSON.stringify(e)).join('\n')}\n`
  on('process.spawn', async function* () {
    yield { stream: 'stdout', text: line(CAPTURED.slice(0, 5)) }
    yield {
      stream: 'stdout',
      text: line([
        CAPTURED[5],
        failure
          ? {
              sessionId: ROOT,
              update: {
                sessionId: CHILD,
                state: { state: 'idle', stopReason: 'error', error: { message: failure } },
                sessionUpdate: 'subagent_update',
              },
            }
          : CAPTURED[6],
        { relay: 'done', stopReason: 'end_turn' },
      ]),
    }
    return { value: { code: 0, signal: null } }
  })
  const requests = fallback(on)
  if (refused === 'state') on('state.get', { key: 'handbacks', id: 'n1' }, () => ({ deny: 'state unavailable' }))
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'List acp' })
  const parent = await run($)
  const tool = parent.chunks.find((c) => c.kind === 'tool')
  expect(tool?.kind === 'tool' && tool.name).toBe('Agent')
  await $.agent.spawn({
    tool_use_id: tool?.kind === 'tool' ? tool.id : '',
    subagentType: 'via:codex',
    prompt: 'List acp',
    description: 'List acp',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'codex',
    parentAgentId: 'a1',
    background: true,
    fork: false,
  })
  await $.turn.start({ turnId: 'nested', agentId: 'n1', text: 'List acp' })
  return { clock, requests, finish: () => run($, { ...STEP, index: 1 }) }
}

test('a failed nested child keeps its partial text and ends with the failure, never a signature', async ($, on) => {
  const child = await nestedChild($, on, 'Authentication required')
  const pending = run($, { ...STEP, turnId: 'nested', agentId: 'n1', model: 'gpt-6-luna' })
  await child.clock.settle()
  await child.finish()
  const { chunks, result } = await pending
  expect(result.answer).toBe('steps.ts\n\nThe codex subagent failed: Authentication required')
  expect(
    chunks
      .filter((c) => c.kind === 'text')
      .map((c) => (c.kind === 'text' ? c.text : ''))
      .join(''),
  ).toBe(result.answer)
  expect(result.stopReason).toBe('end_turn')
  expect(child.requests()).toBe(0)
})

test("a nested step whose hook throws ends in via, never as a model request with the harness's model", async ($, on) => {
  const child = await nestedChild($, on, undefined, 'state')
  const { result } = await run($, { ...STEP, turnId: 'nested', agentId: 'n1' })
  expect(result.answer).toBe('The codex subagent failed: via could not render its next step.')
  expect(result.stopReason).toBe('end_turn')
  expect(result.toolUses).toEqual([])
  expect(child.requests()).toBe(0)
})
