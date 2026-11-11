import type { TurnStepChunk, TurnUsage } from 'claude-code'
import type { Choice } from '../types'
import type { Adapter, Usage } from './adapter'
import type { Inbox } from './steer'
import { undeliveredNotice } from './steer'

export type Totals = { -readonly [K in keyof Usage]: Usage[K] }
type Push = (k: 'text' | 'thinking', text: string) => TurnStepChunk

export type Finished = { signed: string; usage: TurnUsage | null; chunks: TurnStepChunk[] }

export function finish(args: {
  readonly adapter: Adapter
  readonly choice: Choice
  readonly notices: readonly string[]
  readonly stopped: 'limit' | undefined
  readonly timeoutMinutes: number
  readonly report: string
  readonly answeredBy: string
  readonly failure: string
  readonly restate: boolean // the answer was said before the run's last call, so not in the last step
  readonly steered: number
  readonly inbox: Inbox | undefined
  readonly total: Totals
  readonly push: Push
}): Finished {
  const name = args.adapter.name
  const chunks: TurnStepChunk[] = []
  let report = args.report
  if (args.restate && !args.failure && report.trim()) chunks.push(args.push('text', report.trim()))
  if (args.stopped === 'limit') {
    const partial = report.trim()
    const notice = `${name} ran past ${args.timeoutMinutes} minutes and was stopped.`
    report = partial ? `${partial}\n\n${notice}` : notice
    chunks.push(args.push('text', partial ? `\n\n${notice}` : notice))
  }
  if (args.failure) {
    report = args.failure
    chunks.push(args.push('text', `\n${args.failure}`))
  }
  if (args.notices.length > 0 && !args.failure) {
    const said = args.notices.join('\n')
    report = `${report.trim()}\n\n${said}`
    chunks.push(args.push('text', `\n\n${said}`))
  }
  const undelivered = undeliveredNotice(args.inbox, args.steered, name)
  if (undelivered) {
    const partial = report.trim()
    report = partial ? `${partial}\n\n${undelivered}` : undelivered
    chunks.push(args.push('text', `\n\n${undelivered}`))
  }
  const requested = !args.failure && !args.answeredBy ? args.adapter.model(args.choice) : undefined
  const named = args.failure ? '' : args.answeredBy || requested || ''
  const usage: TurnUsage | null = named
    ? {
        model: named,
        input_tokens: args.total.input,
        output_tokens: args.total.output,
        cache_read_input_tokens: args.total.cacheRead,
        cache_creation_input_tokens: args.total.cacheWrite,
      }
    : null
  const answer = report.trim()
  // A genuine answer is always signed; an unknown model is said, never guessed.
  const signedBy = args.stopped === undefined && !args.failure
  const by = named === '' ? 'model not reported' : requested === named ? `${named} (requested)` : named
  const line = `\n\n— answered by ${name}, ${by}`
  const signed = signedBy ? `${answer}${line}` : answer
  if (signedBy) chunks.push(args.push('text', line))
  return { signed, usage, chunks }
}
