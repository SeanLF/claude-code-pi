import { expect, mock, type TestBody, test } from 'claude-code/testing'
import { relayEvents } from '../../hooks/acp/events'
import { agy } from '../../hooks/adapters/agy'
import type { AgentRecord } from '../../hooks/record'
import { agentStore, ROOT, runTurn } from '../helpers'

type TestOn = Parameters<TestBody>[1]
type Spawn = { argv: string[]; input: string | undefined; env?: Record<string, string> }

const SID = '784551ca-bc91-4918-b567-918d86773b8a'
const update = (u: Record<string, unknown>) => ({ sessionId: SID, update: u })
const text = (sessionUpdate: string, t: string) => update({ content: { text: t, type: 'text' }, sessionUpdate })
// Captured from relay/relay.mjs over `agy acp --sandbox` (agy 1.5.7, gemini-3.8-flash, thought_level
// medium, 2026-11-12), trimmed: paths shortened to /w, rawInput dropped. agy sends no message ids, a
// command's output with its own header, and usage only with the prompt's end.
const CAPTURED = [
  { relay: 'session', sessionId: SID, cwd: '/w' },
  { relay: 'model', name: 'gemini-3.8-flash' },
  { relay: 'steered' },
  text('user_message_chunk', 'Change the word one in a.txt to two, then run: cat a.txt. Reply with only its output.\n'),
  update({ title: 'Modify And View File Content', sessionUpdate: 'session_info_update' }),
  text('agent_thought_chunk', 'Inspecting `a.txt` to confirm its initial contents are as expected is essential.\n\n\n'),
  update({
    toolCallId: 'call_6441692960902954804',
    title: 'File a.txt',
    kind: 'edit',
    status: 'in_progress',
    locations: [{ path: '/w/a.txt' }],
    sessionUpdate: 'tool_call',
  }),
  update({
    toolCallId: 'call_6441692960902954804',
    kind: 'edit',
    status: 'completed',
    title: 'File a.txt',
    content: [{ path: '/w/a.txt', oldText: 'one\n\n', newText: 'two\n\n', type: 'diff' }],
    locations: [{ path: '/w/a.txt' }],
    rawOutput: {},
    sessionUpdate: 'tool_call_update',
  }),
  update({
    toolCallId: 'call_11720483526496352900',
    title: 'cat a.txt',
    kind: 'execute',
    status: 'in_progress',
    sessionUpdate: 'tool_call',
  }),
  update({
    toolCallId: 'call_11720483526496352900',
    kind: 'execute',
    status: 'completed',
    title: 'cat a.txt',
    content: [
      {
        content: {
          text: 'Created At: 2026-11-12T21:09:41-05:00\nCompleted At: 2026-11-12T21:09:41-05:00\nCommand exited with code 0.\n\nCommand output:\ntwo\r\n',
          type: 'text',
        },
        type: 'content',
      },
    ],
    sessionUpdate: 'tool_call_update',
  }),
  text('agent_message_chunk', 'two'),
  {
    relay: 'prompt_done',
    stopReason: 'end_turn',
    usage: { inputTokens: 38229, outputTokens: 396, cachedReadTokens: 0, cachedWriteTokens: 0, thoughtTokens: 169, totalTokens: 38625 },
  },
  { relay: 'done', stopReason: 'end_turn' },
]
// Captured the same way: `sleep 63` outlasted the 10 s agy chose to wait, went to the background, and
// agy ended its turn. The call never ends here: agy holds its end for the next prompt.
const BACKGROUND = [
  { relay: 'session', sessionId: SID, cwd: '/w' },
  { relay: 'model', name: 'gemini-3.8-flash' },
  { relay: 'steered' },
  update({
    toolCallId: 'call_17337065234406006923',
    title: 'sleep 63',
    kind: 'execute',
    status: 'in_progress',
    sessionUpdate: 'tool_call',
  }),
  text('agent_message_chunk', 'Started '),
  text('agent_message_chunk', '`sleep 63` in the background. Waiting for it to finish.'),
  {
    relay: 'prompt_done',
    stopReason: 'end_turn',
    usage: { inputTokens: 18518, outputTokens: 56, cachedReadTokens: 0, cachedWriteTokens: 0, thoughtTokens: 0, totalTokens: 18574 },
  },
  { relay: 'done', stopReason: 'end_turn' },
]
const lines = (events: unknown[]) => `${events.map((e) => JSON.stringify(e)).join('\n')}\n`
const AGENT = { id: 'a1', description: 'x', type: 'via:agy', status: 'running' } as const

function arrange(
  on: TestOn,
  spawns: Spawn[],
  out: { stdout?: string; stderr?: string; code?: number; record?: Partial<AgentRecord> } = { stdout: lines(CAPTURED) },
) {
  mock.clock(on)
  mock.env(on, { HOME: '/home/u' })
  on('agent.list', () => ({ value: [AGENT] }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e, next) => next(e))
  on('session.messages', () => ({ value: [] }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '24.11.0\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.write', () => ({ value: undefined }))
  const records = agentStore(on, { a1: { harness: 'agy', mode: 'default', ...out.record } })
  on('process.spawn', async function* (_, e) {
    spawns.push({ argv: [...e.argv], input: e.input, env: e.env })
    if (out.stdout) yield { stream: 'stdout' as const, text: out.stdout }
    if (out.stderr) yield { stream: 'stderr' as const, text: out.stderr }
    return { value: { code: out.code ?? 0, signal: null } }
  })
  return records
}

test('an agy agent runs `agy acp --sandbox` behind the relay; a prompt starting with / or -- goes as text on stdin', async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: '/model --help @README.md' })
  await runTurn($)
  expect(spawns[0]?.argv).toEqual(['node', `${ROOT}/relay/relay.mjs`, '--', 'agy', 'acp', '--sandbox'])
  expect(spawns[0]?.input).toBe('/model --help @README.md')
})

test('the answer is signed with the session model; edits, commands and thinking show as agy reported them', async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go' })
  const { chunks, result, calls } = await runTurn($)
  expect(result.answer).toBe('two\n\n— answered by agy, gemini-3.8-flash')
  const inputs = chunks.flatMap((c) => (c.kind === 'input' ? [JSON.parse(c.json) as unknown] : []))
  expect(inputs).toEqual([
    { kind: 'edit', title: 'File a.txt', path: '/w/a.txt' },
    { kind: 'execute', title: 'cat a.txt' },
  ])
  expect(JSON.stringify(calls[0])).toContain('- one')
  expect(JSON.stringify(calls[0])).toContain('+ two')
  expect(JSON.stringify(calls[1])).toContain('Command output:\\ntwo')
  expect(chunks.some((c) => c.kind === 'thinking' && c.text.includes('Inspecting'))).toBe(true)
})

test("usage is the prompt's own count: agy reports no context, and its output includes the thinking", async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go' })
  const { result } = await runTurn($)
  expect(result.usage).toEqual({
    model: 'gemini-3.8-flash',
    input_tokens: 38229,
    output_tokens: 396,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  })
})

test('with no message ids, text before a tool and text after it are two messages: only the last is the answer', () => {
  const read = relayEvents()
  const norms = [
    { relay: 'steered' },
    text('agent_message_chunk', 'Checking the file now.'),
    update({ toolCallId: 'c1', title: 'cat seed', kind: 'execute', status: 'in_progress', sessionUpdate: 'tool_call' }),
    text('agent_message_chunk', 'zebra-41'),
  ].flatMap((e) => read(JSON.stringify(e)))
  expect(norms.filter((n) => n.k === 'message')).toHaveLength(2)
})

test('a command agy sent to the background and ended its turn without is said with the answer', async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns, { stdout: lines(BACKGROUND) })
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go' })
  const { result } = await runTurn($)
  expect(result.answer).toContain('`sleep 63` in the background. Waiting for it to finish.')
  expect(result.answer).toContain('agy sent `sleep 63` to the background and ended its turn before it finished')
  expect(result.answer).toContain('— answered by agy, gemini-3.8-flash')
})

// Captured the same way, trimmed: a steer sent while `sleep 8` ran. agy ends the first prompt at once,
// then finishes the command and takes the steer under the second prompt.
const STEERED = [
  { relay: 'session', sessionId: SID, cwd: '/w' },
  { relay: 'steered' },
  update({ toolCallId: 'call_5761160114661650974', title: 'sleep 8', kind: 'execute', status: 'in_progress', sessionUpdate: 'tool_call' }),
  { relay: 'prompt_done', stopReason: 'end_turn', usage: { inputTokens: 9151, outputTokens: 39, totalTokens: 9190 } },
  update({
    toolCallId: 'call_5761160114661650974',
    title: 'sleep 8',
    kind: 'execute',
    status: 'completed',
    sessionUpdate: 'tool_call_update',
  }),
  text('agent_message_chunk', 'STEERED\nDONE'),
  { relay: 'steered' },
  { relay: 'prompt_done', stopReason: 'end_turn', usage: { inputTokens: 18859, outputTokens: 43, totalTokens: 18902 } },
  { relay: 'done', stopReason: 'end_turn' },
]

test('a command still running when a steer ends the first prompt raises no background notice', () => {
  const read = agy.events()
  expect(STEERED.flatMap((e) => read(JSON.stringify(e))).some((n) => n.k === 'notice')).toBe(false)
})

test("model and thinking lines become the relay's model and agy's thought_level", async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'model: gemini-3.8-flash\nthinking: low\ngo' })
  await runTurn($)
  expect(spawns[0]?.env?.RELAY_MODEL).toBe('gemini-3.8-flash')
  expect(JSON.parse(spawns[0]?.env?.RELAY_CONFIG ?? '{}')).toEqual({ thought_level: 'low' })
})

test("a thinking level agy's ACP lacks is refused", async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'thinking: max\ngo' })
  const { result } = await runTurn($)
  expect(spawns).toHaveLength(0)
  expect(result.answer).toContain('thinking must be one of low, medium, high')
})

test("agy's own questions reach the person, and a message to it running steers it with a second prompt", async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go' })
  await runTurn($)
  expect(spawns[0]?.env?.RELAY_POLICY).toBe('ask')
  expect(spawns[0]?.env?.RELAY_INBOX).toBe('/home/u/.claude/via/inbox/agy-a1.jsonl')
  expect(spawns[0]?.env?.RELAY_STEER).toBe('prompt')
})

test('bypass mode approves what agy asks, and dontAsk denies it', async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns, { stdout: lines(CAPTURED), record: { mode: 'bypassPermissions' } })
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go' })
  await runTurn($)
  expect(spawns[0]?.env?.RELAY_POLICY).toBe('allow')
  expect(spawns[0]?.env?.RELAY_AGENT_MODE).toBeUndefined()
})

test('a follow-up loads the saved session, which agy must replay to count as found', async ($, on) => {
  const spawns: Spawn[] = []
  const records = arrange(on, spawns, { stdout: lines(CAPTURED), record: { session: SID } })
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go on' })
  await runTurn($)
  expect(spawns[0]?.env).toMatchObject({ RELAY_SESSION: SID, RELAY_LOAD_REPLAYS: '1' })
  expect(records.record('a1')?.session).toBe(SID)
})

test('a new run asks for no replay', async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go' })
  await runTurn($)
  expect(spawns[0]?.env?.RELAY_LOAD_REPLAYS).toBeUndefined()
})

test('a lost session fails in plain words and is forgotten, rather than answering from a fresh one', async ($, on) => {
  const spawns: Spawn[] = []
  const records = arrange(on, spawns, {
    stdout: lines([{ relay: 'session_lost', message: 'the agent replayed no history for it' }]),
    stderr: 'acp relay: session lost: the agent replayed no history for it\n',
    code: 1,
    record: { session: '00000000-0000-0000-0000-000000000000' },
  })
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'go' })
  const { result } = await runTurn($)
  expect(result.answer).toContain("agy could not find this agent's earlier session, so this message did not run")
  expect(records.record('a1')?.session).toBe('')
})

test('a tools line is refused: agy has no read-only mode', async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns)
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'tools: read\nlook around' })
  const { result } = await runTurn($)
  expect(spawns).toHaveLength(0)
  expect(result.answer).toContain('agy cannot enforce read-only tools, so a tools line is refused.')
})

test('plan mode refuses agy, which has no read-only mode via can enforce', async ($, on) => {
  const spawns: Spawn[] = []
  arrange(on, spawns, { stdout: lines(CAPTURED), record: { mode: 'plan' } })
  await $.turn.start({ turnId: 't1', agentId: 'a1', text: 'look around' })
  const { result } = await runTurn($)
  expect(spawns).toHaveLength(0)
  expect(result.answer).toContain('agy cannot run in plan mode')
})
