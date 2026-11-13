import type { ProcessSpawnRequest, ProcessSpawnResult } from 'claude-code'
import type { Choice } from '../types'

export type { Ask, Mode, Norm, Usage } from './acp/norm'

import type { Mode, Norm } from './acp/norm'

export type Adapter = {
  readonly name: string
  readonly bin: string
  readonly about: string // the agent type's one-line description starts with it
  // How the harness lists the models this person can use, in its own order. preferred: the harness's
  // configured default, from a file under home, put first when its list does not lead with it.
  readonly catalogue: {
    readonly argv: readonly string[]
    ids(stdout: string): string[]
    readonly preferred?: { readonly file: string; pick(text: string): string | undefined }
  }
  readonly readOnly: 'enforced' | 'none'
  readonly tools?: readonly string[] // the only values a tools line may take; absent: a free tool list
  readonly thinking: readonly string[]
  // true: a message reaches a running agent at its next step. queued: it runs when the agent's current
  // prompt ends, and `interrupt:` still stops the current step.
  readonly steer: boolean | 'queued'
  readonly defaultModel: boolean // takes the plugin's defaultModel setting
  readonly models?: string
  // A folder that voids read-only when found in the working folder or any folder above it, unless
  // it holds only the `harmless` entries: the harness loads code from it before any permission applies.
  // own: the person's own ~/<folder> is their config, not a project's, and does not count.
  readonly unsafeReadOnly?: { readonly folder: string; readonly harmless: readonly string[]; readonly why: string; readonly own?: boolean }
  // What a read-only run runs first, and the environment its output requires: when the harness cannot
  // prove it, turn.ts refuses the run. env returns undefined when the output does not prove it.
  readonly readOnlyGuard?: {
    readonly argv: readonly string[]
    env(stdout: string): Record<string, string> | undefined
    readonly why: string
  }
  // Runs behind relay/relay.mjs, which needs Node 22.18 or later. install: an ACP adapter via installs
  // once from a lockfile it ships, into ~/.claude/via/acp/<dir>; start then gets its entry point, or
  // 'latest' when the person chose to fetch the newest one instead.
  readonly relay?: {
    readonly install?: { readonly dir: string; readonly package: string; readonly files: readonly string[]; readonly entry: string }
  }
  start(c: {
    choice: Choice
    prompt: string
    session?: string
    agentId: string
    root: string
    inbox?: string
    guard?: Readonly<Record<string, string>>
    mode: Mode
    installed?: string
  }): ProcessSpawnRequest
  // A parser per run: message boundaries can depend on earlier lines, and session is what the run asked to resume.
  events(session: string | undefined): (line: string) => Norm[]
  model(choice: Choice): string | undefined // a real model name when the stream names none, never a pattern
  // A known failure in plain words; sessionLost forgets the saved session so the next message starts fresh.
  failure?(exit: ProcessSpawnResult, stderr: string): { message: string; sessionLost?: boolean } | undefined
}

export type PromptAdapter = Pick<Adapter, 'name' | 'readOnly' | 'thinking' | 'tools'>
export type HelpAdapter = PromptAdapter & Pick<Adapter, 'bin' | 'about' | 'steer' | 'defaultModel' | 'models'>
