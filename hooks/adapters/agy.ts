import { relayEvents, sessionLost } from '../acp/events'
import { isRecord } from '../acp/json'
import { type AcpSpec, acpStart } from '../acp/spec'
import type { Adapter, Norm } from '../adapter'

// agy runs with the person's own tool permission (always-proceed, request-review or strict in its
// settings): its default mode asks only where that setting says to, and the question reaches the person,
// except in bypass (approved) and dontAsk (denied). Its plan mode is not read-only (it ran a command that
// wrote a file, tested live on 1.4.7), so via refuses plan mode and tools: read before readOnly is used.
// A second session/prompt ends the running turn rather than steering it (tested live on 1.5.7), and
// _session/steering is not a method it has: messages wait in the relay for the prompt to end.
// It loads an unknown session id as a new, empty session (1.5.7), so a load that replays nothing is lost.
export const AGY: AcpSpec = {
  name: 'agy',
  // --sandbox confines the commands agy runs (credentials such as ~/.kube are refused by the OS, tested
  // live); it does not stop agy's own file edits.
  command: ['agy', 'acp', '--sandbox'],
  loadReplays: true,
  modes: { readOnly: { policy: 'deny' }, bypassPermissions: { policy: 'allow' }, dontAsk: { policy: 'deny' }, default: { policy: 'ask' } },
  thinking: 'thought_level',
}

export const agy = {
  name: 'agy',
  bin: 'agy',
  about:
    'Antigravity CLI agent: Gemini, Claude and GPT-OSS models through a Google account, own tools (edits files, runs sandboxed commands; no read-only mode).',
  // One `id<TAB>name` per line; agy says it is fetching on stderr. Its session takes these ids too: a
  // Gemini one with an effort suffix (gemini-3.8-flash-low) sets the model and its thought_level.
  catalogue: { argv: ['agy', 'models'], ids: (stdout: string) => stdout.split('\n').map((line) => line.split('\t')[0]?.trim() ?? '') },
  readOnly: 'none',
  // The levels Gemini offers; agy refuses one for a model that has none (its Claude models), and the run says so.
  thinking: ['low', 'medium', 'high'],
  steer: 'queued',
  defaultModel: false,
  relay: {},
  // The prompt goes as text: a leading / is not run as a command over ACP (tested live on 1.5.7).
  start: ({ choice, prompt, session, root, inbox, mode }) =>
    acpStart(AGY, { root, prompt, readOnly: false, mode, inbox, session, model: choice.model, thinking: choice.thinking }),
  // A command that outlasts its wait (WaitMsBeforeAsync, which agy picks) goes to the background and agy
  // ends its turn without it. Its process outlives agy, and the relay hears nothing more of it (1.5.7).
  events: () => {
    const read = relayEvents()
    const running = new Map<string, string>()
    return (line): Norm[] => {
      const out = read(line)
      for (const n of out) {
        if (n.k === 'call' && n.kind === 'execute') running.set(n.id, n.title)
        else if (n.k === 'called') running.delete(n.id)
      }
      if (running.size === 0 || !line.includes('"prompt_done"')) return out
      let done: unknown
      try {
        done = JSON.parse(line)
      } catch {
        return out
      }
      if (!isRecord(done) || done.relay !== 'prompt_done' || done.stopReason !== 'end_turn') return out
      const left = [...running.values()].map((title) => `\`${title}\``).join(', ')
      running.clear()
      return [
        ...out,
        {
          k: 'notice',
          t: `agy ended its turn with ${left} still running in the background: via did not wait for it, it keeps running after this run, and agy never saw how it ended.`,
        },
      ]
    }
  },
  // The relay names the model the session runs on.
  model: () => undefined,
  failure: (_exit, stderr) =>
    sessionLost(stderr)
      ? {
          message:
            "agy could not find this agent's earlier session, so this message did not run. Send it again to start a new agy session.",
          sessionLost: true,
        }
      : undefined,
} as const satisfies Adapter
