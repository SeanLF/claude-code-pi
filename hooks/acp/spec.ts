import type { ProcessSpawnRequest } from 'claude-code'
import type { Mode } from './norm'

// An ACP agent as plain data: everything acpStart needs to run it behind relay/relay.mjs. Plain data
// so that another plugin could hand it over ($.acp.register): a call across plugins clones its
// arguments and refuses functions. Whatever a run needs beyond it (an install path, a guard's env, a
// generated config) the layer above passes in AcpRun.

export type Policy = 'allow' | 'deny' | 'ask'

const relayArgv = (root: string, agent: readonly string[]) => ['node', `${root}/relay/relay.mjs`, '--', ...agent]

// What the relay needs for one run.
// steer: how the agent takes a message mid-run, tested live on each (relay/checks/check.sh); none: the
// relay queues it for when the running prompt ends.
function relayEnv(c: {
  inbox?: string
  steer?: 'steering' | 'prompt'
  session?: string
  loadReplays?: boolean
  model?: string
  agentMode?: string
  policy: Policy
  config?: Record<string, string>
}) {
  return {
    RELAY_POLICY: c.policy,
    ...(c.inbox ? { RELAY_INBOX: c.inbox } : {}),
    ...(c.inbox && c.steer ? { RELAY_STEER: c.steer } : {}),
    ...(c.session ? { RELAY_SESSION: c.session } : {}),
    ...(c.session && c.loadReplays ? { RELAY_LOAD_REPLAYS: '1' } : {}),
    ...(c.model ? { RELAY_MODEL: c.model } : {}),
    ...(c.agentMode ? { RELAY_AGENT_MODE: c.agentMode } : {}),
    ...(c.config && Object.keys(c.config).length > 0 ? { RELAY_CONFIG: JSON.stringify(c.config) } : {}),
  }
}

// What Claude Code's permission mode, or a read-only run, sets on the agent: its own mode, if it has
// one, and how the relay answers its permission requests.
export type AcpMode = { readonly agentMode?: string; readonly policy: Policy }

export type AcpSpec = {
  readonly name: string
  readonly command: readonly string[] // the ACP agent, as the relay starts it
  readonly env?: Readonly<Record<string, string>>
  readonly steer?: 'steering' | 'prompt' // how a message reaches a running prompt: the relay's RELAY_STEER
  // Its session/load replays the history, so a load that replays nothing found no session.
  readonly loadReplays?: boolean
  // readOnly: plan mode or a read-only run; the rest by Claude Code's permission mode.
  readonly modes: { readonly readOnly: AcpMode; readonly bypassPermissions: AcpMode; readonly dontAsk: AcpMode; readonly default: AcpMode }
  readonly thinking?: string // the config option a thinking level sets
}

// One run's data, from the layer above: command replaces the spec's (an installed entry point), env
// and config add to it.
export type AcpRun = {
  readonly root: string
  readonly prompt: string
  readonly readOnly: boolean
  readonly mode: Mode
  readonly inbox?: string
  readonly session?: string
  readonly model?: string
  readonly thinking?: string
  readonly command?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly config?: Readonly<Record<string, string>>
}

export function acpMode(spec: AcpSpec, readOnly: boolean, mode: Mode): AcpMode {
  if (readOnly || mode === 'plan') return spec.modes.readOnly
  if (mode === 'bypassPermissions') return spec.modes.bypassPermissions
  if (mode === 'dontAsk') return spec.modes.dontAsk
  return spec.modes.default
}

export function acpStart(spec: AcpSpec, run: AcpRun): ProcessSpawnRequest {
  const { agentMode, policy } = acpMode(spec, run.readOnly, run.mode)
  const config = { ...(run.config ?? {}), ...(run.thinking && spec.thinking ? { [spec.thinking]: run.thinking } : {}) }
  return {
    argv: relayArgv(run.root, run.command ?? spec.command),
    env: {
      ...relayEnv({
        inbox: run.inbox,
        steer: spec.steer,
        session: run.session,
        loadReplays: spec.loadReplays,
        model: run.model,
        agentMode,
        policy,
        config,
      }),
      ...(spec.env ?? {}),
      ...(run.env ?? {}),
    },
    input: run.prompt,
  }
}
