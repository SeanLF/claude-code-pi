import type { EngineInterface, MatchedHook } from 'claude-code'
import { unhidden } from './acp/text'
import type { Ask } from './adapter'
import type { World } from './world'

// interrupt: what an `interrupt:` message asked for; the harness aborts its step, and the core runs it next.
export type Inbox = { name: string; path: string; lines: string[]; interrupt?: string }

const INTERRUPT = /^interrupt:[ \t]*/i

export const steerDelivered = (name: string) => `Delivered to the running ${name} agent; ${name} reads it at its next step.`
export const interruptDelivered = (name: string) =>
  `Interrupting the running ${name} agent: it stops its current step, then takes this message.`

export async function openInbox(
  $: Pick<EngineInterface, 'env' | 'fs'>,
  name: string,
  agentId: string,
  inboxes: Map<string, Inbox>,
): Promise<Inbox | undefined> {
  // Not $TMPDIR: on Linux it can be the shared /tmp, where another user could plant the
  // folder and write steers or a symlink (fs.write follows links). No usable home: no steering.
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  if (!home) return undefined
  const inbox: Inbox = { name, path: `${home}/.claude/via/inbox/${name}-${agentId}.jsonl`, lines: [] }
  const opened = await $.fs.write(inbox.path, '').then(
    () => true,
    () => false,
  )
  if (!opened) return undefined
  inboxes.set(agentId, inbox)
  return inbox
}

export async function closeInbox(
  $: Pick<EngineInterface, 'fs'>,
  inbox: Inbox,
  agentId: string,
  inboxes: Map<string, Inbox>,
): Promise<void> {
  inboxes.delete(agentId)
  await $.fs.write(inbox.path, '').catch(() => {})
}

// Steers are JSON strings; an interrupt line is an object the harness acts on, never a message it reports.
export function undeliveredSteers(inbox: Inbox | undefined, steered: number): string[] {
  const steers = (inbox?.lines ?? [])
    .map((line) => JSON.parse(line) as unknown)
    .filter((value): value is string => typeof value === 'string')
  // The first user message the harness reports is the prompt; each later one is a steer it took.
  return steers.slice(Math.max(0, steered - 1))
}

export function undeliveredNotice(inbox: Inbox | undefined, steered: number, name: string): string | undefined {
  const steers = [...undeliveredSteers(inbox, steered), ...(inbox?.interrupt === undefined ? [] : [inbox.interrupt])]
  if (steers.length === 0) return undefined
  return `Not delivered before ${name} finished (send again as a follow-up):\n${steers.join('\n')}`
}

type SendHook = MatchedHook<'tool.call', { tool: 'SendMessage' }>

export async function sendMessage(w: World, $: Parameters<SendHook>[0], e: Parameters<SendHook>[1], next: Parameters<SendHook>[2]) {
  const to = typeof e.to === 'string' ? e.to : undefined
  const message = typeof e.message === 'string' ? e.message : undefined
  let inbox = to === undefined || message === undefined ? undefined : w.inboxes.get(to)
  if (inbox === undefined && to !== undefined) {
    const named = (await $.agent.list()).find((a) => a.name === to)
    inbox = named === undefined ? undefined : w.inboxes.get(named.id)
  }
  // An idle-notice subscription is the engine's to keep, so the call goes on to it.
  if (inbox === undefined || message === undefined || e.notify_when_idle) return next(e)
  const interrupted = await steer($, inbox, message)
  return { result: { success: true, message: interrupted ? interruptDelivered(inbox.name) : steerDelivered(inbox.name) } }
}

// A message for a running harness, into its inbox: a steer, or with `interrupt:` an interrupt, whose
// message runs next. True for an interrupt.
export async function steer($: Pick<EngineInterface, 'fs'>, inbox: Inbox, message: string): Promise<boolean> {
  const asked = INTERRUPT.test(message) ? message.replace(INTERRUPT, '') : undefined
  const lines = [...inbox.lines, JSON.stringify(asked === undefined ? message : { interrupt: asked })]
  // Taken before the write: a typed message and a SendMessage at once would otherwise drop one another.
  inbox.lines = lines
  await $.fs.write(inbox.path, lines.map((line) => `${line}\n`).join(''))
  if (asked === undefined) return false
  inbox.interrupt = inbox.interrupt === undefined ? asked : `${inbox.interrupt}\n\n${asked}`
  return true
}

// What the person typed into an agent's view while it ran, from the attachment Claude Code delivers at
// the agent's next step ("The user sent a new message while you were working: ..."); '' when the framing
// is not that one, never a guess: other deliveries share the attachment.
export function typed(content: readonly unknown[]): string {
  const text = content
    .map((block) =>
      typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text'
        ? String((block as { text?: unknown }).text ?? '')
        : '',
    )
    .join('')
  return (
    /^<system-reminder>\nThe user sent a new message while you were working:\n([\s\S]*?)\n\nThis is how Claude Code/
      .exec(text)?.[1]
      ?.trim() ?? ''
  )
}

const VERB: Record<string, string> = { execute: 'run', edit: 'edit', delete: 'delete', move: 'move', fetch: 'fetch', read: 'read' }
// The whole command, as it will run: line breaks shown, never clipped, and control, bidirectional and
// zero-width characters dropped, so what the dialog shows cannot be disguised.
const shown = (text: string) => unhidden(text.replace(/\r?\n/g, ' ⏎ ')).trim()

// A harness waiting on the person's permission: notify them, ask in Claude Code's own dialog with the
// harness's own option names, and write the chosen option to the inbox. A dismissed dialog, a -p run
// (no one to ask), free text or an AFK auto-resolve is a deny. An answer that arrives after its run
// ended writes nothing: that inbox is no longer the live one.
export async function answerAsk(
  $: Pick<EngineInterface, 'ui' | 'fs'>,
  inboxes: Map<string, Inbox>,
  agentId: string,
  inbox: Inbox | undefined,
  ask: Ask,
  name: string,
): Promise<void> {
  if (inbox === undefined) return
  // Only this once: an "always" option can amend the harness's own rules, which outlive via's run.
  const allow = ask.options.filter((o) => o.kind === 'allow_once')
  const deny = ask.options.find((o) => o.kind === 'reject_once') ?? ask.options.find((o) => o.kind === 'reject_always')
  const choices = new Map<string, string | null>()
  for (const option of [...allow.slice(0, 1), ...(deny ? [deny] : [])]) {
    const label = shown(option.name) || option.kind
    if (!choices.has(label)) choices.set(label, option.optionId)
  }
  if (choices.size < 2) choices.set('Deny', deny?.optionId ?? null)
  const what = shown(ask.command ?? ask.title) || 'a tool'
  const question = `${name} wants to ${VERB[ask.kind] ?? 'use'} ${ask.command ? `\`${what}\`` : what}. Allow it?`
  void $.ui.notify(`${name} needs your answer`).catch(() => {})
  const picked = await $.ui.ask(question, [...choices.keys()]).catch(() => undefined)
  const optionId = picked !== undefined && choices.has(picked) ? (choices.get(picked) ?? null) : (deny?.optionId ?? null)
  if (inboxes.get(agentId) !== inbox) return
  inbox.lines = [...inbox.lines, JSON.stringify({ answer: ask.id, optionId })]
  await $.fs.write(inbox.path, inbox.lines.map((line) => `${line}\n`).join('')).catch(() => {})
}
