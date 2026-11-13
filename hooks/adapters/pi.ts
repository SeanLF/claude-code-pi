import { cap, clip, compactionOutput, diffOf, diffRows, relative, tail } from '../acp/events'
import { isRecord } from '../acp/json'
import type { Adapter, Norm } from '../adapter'
import type { PiEvent } from '../wire'

const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

// A tool list of these only is read-only. Such a run ignores the project's trust-gated .pi
// resources (-na): a project the user once trusted would otherwise load its extensions, which are
// code (tested live: a saved trust ran one, -na stopped it; -e extensions such as the inbox still load).
const READ_TOOLS = new Set(['read', 'grep', 'find', 'ls'])
const readsOnly = (tools: string) => tools.split(',').every((tool) => READ_TOOLS.has(tool.trim()))

function parse(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line)
    return isRecord(parsed) && typeof parsed.type === 'string' ? parsed : undefined
  } catch {
    return undefined
  }
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')

// pi's own tools as ACP kinds, so their rows draw and fold as Codex's do; any other tool (an extension's,
// an MCP server's) is `other`, titled with its arguments.
const KINDS: Record<string, string> = {
  read: 'read',
  edit: 'edit',
  write: 'edit',
  bash: 'execute',
  grep: 'search',
  find: 'search',
  ls: 'search',
}

function titleOf(tool: string, args: Record<string, unknown>): string {
  const path = text(args.path)
  switch (tool) {
    case 'read':
      return `Read ${path}`
    case 'edit':
      return `Edit ${path}`
    case 'write':
      return `Write ${path}`
    case 'bash':
      return text(args.command)
    case 'grep':
    case 'find':
      return [tool, text(args.pattern), path].filter(Boolean).join(' ')
    case 'ls':
      return ['ls', path].filter(Boolean).join(' ')
    default:
      return `${tool}: ${JSON.stringify(args)}`
  }
}

// What a finished tool returned: an edit as its changed lines (from the unified patch pi reports), a write
// as the lines it wrote, anything else as its text content. A command keeps the end of a long output, where
// an error usually is and where pi names a nonzero exit code. A failed write is its error: its lines never landed.
function outputOf(tool: string, args: Record<string, unknown>, result: unknown, failed: boolean, cwd: string): string {
  const r = isRecord(result) ? result : {}
  const path = relative(text(args.path), cwd)
  const patch = isRecord(r.details) ? text(r.details.patch) : ''
  const lines = patch.split('\n')
  // One file's patch: its ---/+++ header ends where the first hunk starts. A patch with no hunk falls
  // through to the text, which says what happened.
  const first = lines.findIndex((l) => l.startsWith('@@'))
  if (tool === 'edit' && first >= 0) {
    const hunks = lines.slice(first)
    return diffRows(
      path,
      hunks.filter((l) => l.startsWith('-') || l.startsWith('+')).map((l) => `${l[0]} ${l.slice(1)}`),
    )
  }
  if (tool === 'write' && !failed && typeof args.content === 'string') return diffOf(path, '', args.content)
  const said = (Array.isArray(r.content) ? r.content : []).flatMap((c) => (isRecord(c) && c.type === 'text' ? [text(c.text)] : []))
  const output = said.join('\n').trim()
  return tool === 'bash' ? tail(output, 2000) : cap(output, 2000)
}

export const pi = {
  name: 'pi',
  bin: 'pi',
  about: "pi CLI agent: any provider's model, own tools (edits files).",
  // A table under a header row: provider, model, then its limits, sorted by name; pi's default is in
  // its settings.
  catalogue: {
    argv: ['pi', '--list-models'],
    preferred: {
      file: '.pi/agent/settings.json',
      pick: (text: string) => {
        try {
          const s = JSON.parse(text) as { defaultProvider?: unknown; defaultModel?: unknown }
          return typeof s.defaultProvider === 'string' && typeof s.defaultModel === 'string'
            ? `${s.defaultProvider}/${s.defaultModel}`
            : undefined
        } catch {
          return undefined
        }
      },
    },
    ids: (stdout: string) =>
      stdout
        .split('\n')
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .filter((cells) => cells.length >= 2)
        .map(([provider, model]) => `${provider}/${model}`),
  },
  readOnly: 'enforced',
  thinking: THINKING,
  steer: true,
  defaultModel: true,
  start: ({ choice, prompt, agentId, root, inbox }) => ({
    argv: [
      'pi',
      '-p',
      '--mode',
      'json',
      '--session-id',
      `pi-${agentId}`,
      '-e',
      `${root}/pi-extension/inbox.ts`,
      ...(choice.model ? ['--model', choice.model] : []),
      ...(choice.tools ? ['--tools', choice.tools, ...(readsOnly(choice.tools) ? ['-na'] : [])] : []),
      ...(choice.thinking ? ['--thinking', choice.thinking] : []),
    ],
    env: { PI_INBOX: inbox ?? '' },
    input: prompt,
  }),
  events: () => {
    let cwd = ''
    // A call's arguments, for its output when it ends: a write's content is only in them.
    const args = new Map<string, Record<string, unknown>>()
    let compactions = 0
    return (line): Norm[] => {
      const raw = parse(line)
      // The session header, which is not one of pi's typed events, names the working folder.
      if (raw?.type === 'session' && typeof raw.cwd === 'string') cwd = raw.cwd.replace(/\/+$/, '')
      // The type is pi's promise about its output, not a check of it: fields stay optional-chained.
      const e = raw as PiEvent | undefined
      switch (e?.type) {
        case 'message_start':
          if (e.message?.role !== 'assistant') return []
          return [{ k: 'message' }, { k: 'model', name: `${e.message.provider}/${e.message.model}` }]
        case 'message_end': {
          if (e.message?.role === 'user') return [{ k: 'steered' }]
          if (e.message?.role !== 'assistant') return []
          const u = e.message.usage
          const usage = { input: u?.input ?? 0, cacheRead: u?.cacheRead ?? 0, cacheWrite: u?.cacheWrite ?? 0, output: u?.output ?? 0 }
          return e.message.stopReason === 'error'
            ? [
                { k: 'usage', usage },
                { k: 'error', message: e.message.errorMessage ?? 'unknown error' },
              ]
            : [{ k: 'usage', usage }]
        }
        case 'message_update': {
          const d = e.assistantMessageEvent
          if (d?.type === 'text_delta' && typeof d.delta === 'string') return [{ k: 'text', t: d.delta }]
          if (d?.type === 'thinking_delta' && typeof d.delta === 'string') return [{ k: 'thinking', t: d.delta }]
          return []
        }
        case 'tool_execution_start': {
          const given = isRecord(e.args) ? e.args : {}
          const tool = text(e.toolName)
          // A call with no id cannot be matched to its end: it stays a text line.
          if (typeof e.toolCallId !== 'string') return [{ k: 'tool', t: `\n▸ ${clip(`${tool}: ${JSON.stringify(given)}`)}\n` }]
          args.set(e.toolCallId, given)
          const path = text(given.path)
          // Only an absolute path links to its file.
          const absolute = path.startsWith('/') ? path : path && cwd ? `${cwd}/${path}` : ''
          return [
            {
              k: 'call',
              id: e.toolCallId,
              kind: KINDS[tool] ?? 'other',
              title: clip(relative(titleOf(tool, given), cwd)),
              ...(absolute ? { path: absolute } : {}),
            },
          ]
        }
        // pi compacts its own context: a row, as Claude Code shows its own compaction.
        case 'compaction_start':
          compactions += 1
          return [{ k: 'call', id: `pi-compaction-${compactions}`, kind: 'compact', title: 'conversation' }]
        case 'compaction_end': {
          const r = e.result
          const why = e.reason === 'threshold' ? undefined : e.reason
          const output = r
            ? compactionOutput({ before: r.tokensBefore, after: r.estimatedTokensAfter, why, summary: r.summary })
            : e.errorMessage || (e.aborted ? 'Stopped.' : 'pi could not compact.')
          return [{ k: 'called', id: `pi-compaction-${compactions}`, output, failed: r === undefined }]
        }
        case 'tool_execution_end': {
          if (typeof e.toolCallId !== 'string') return []
          const given = args.get(e.toolCallId) ?? {}
          args.delete(e.toolCallId)
          const failed = e.isError === true
          return [{ k: 'called', id: e.toolCallId, output: outputOf(text(e.toolName), given, e.result, failed, cwd), failed }]
        }
        default:
          return []
      }
    }
  },
  // pi names its model in the stream; a model line is a pattern, not a name to sign with.
  model: () => undefined,
  models: 'pi --list-models <search> finds patterns.',
} as const satisfies Adapter
