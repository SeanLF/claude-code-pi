// The harnesses' published types against via's own copies (hooks/acp/wire.ts, hooks/wire.ts). A hooks
// module may import only its own files, so this is where a field a harness renames or drops fails: each
// constant below is typed `true` only while its check holds, and names what broke otherwise.
import type { SessionUpdate as AcpUpdate, ToolCallContent } from '@agentclientprotocol/sdk/unstable'
import type { JsonAgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { ModelReasoningEffort } from '@openai/codex-sdk'
import type { ContentRead, Read } from '../hooks/acp/wire'
import type { CODEX_EFFORTS, PiEvent } from '../hooks/wire'

type None<T> = [T] extends [never] ? true : T
// A type that fails to resolve is any, and any passes every check: so each one checked must be real. pi's
// nested types matter most: pnpm-workspace.yaml drops packages pi's types may move into.
type Real<T> = 0 extends 1 & T ? 'unresolved' : true

// ACP: every update and field the parser reads is one the SDK has.
type Acp<K> = Extract<AcpUpdate, { sessionUpdate: K }>
export const acpUpdates: None<Exclude<keyof Read, AcpUpdate['sessionUpdate']>> = true
export const acpFields: None<{ [K in keyof Read]: Exclude<Read[K], keyof Acp<K>> }[keyof Read]> = true
export const acpContent: None<Exclude<keyof ContentRead, ToolCallContent['type']>> = true
export const acpContentFields: None<
  { [K in keyof ContentRead]: Exclude<ContentRead[K], keyof Extract<ToolCallContent, { type: K }>> }[keyof ContentRead]
> = true

// pi: every event and field the adapter reads is one pi sends, and pi's own shape fits via's copy.
type Pi<K> = Extract<JsonAgentSessionEvent, { type: K }>
type Ours<K> = Extract<PiEvent, { type: K }>
type Reply = Extract<Pi<'message_end'>['message'], { role: 'assistant' }>
type OurMessage = NonNullable<Ours<'message_end'>['message']>
type Delta = NonNullable<Pi<'message_update'>['assistantMessageEvent']>
export const resolved: Real<
  AcpUpdate | ToolCallContent | JsonAgentSessionEvent | ModelReasoningEffort | Reply | Reply['usage'] | Delta | NonNullable<Pi<'compaction_end'>['result']>
> = true
export const piEvents: None<Exclude<PiEvent['type'], JsonAgentSessionEvent['type']>> = true
export const piFields: None<{ [K in PiEvent['type']]: Exclude<keyof Ours<K>, keyof Pi<K>> }[PiEvent['type']]> = true
export const piShapes: None<{ [K in PiEvent['type']]: Pi<K> extends Ours<K> ? never : K }[PiEvent['type']]> = true
export const piMessage: None<Exclude<keyof OurMessage, keyof Reply>> = true
export const piUsage: None<Exclude<keyof NonNullable<OurMessage['usage']>, keyof Reply['usage']>> = true
// The streamed text and thinking: each a variant pi sends, with its delta.
export const piDeltaKinds: None<Exclude<'text_delta' | 'thinking_delta', Delta['type']>> = true
export const piDeltas: None<{ [K in 'text_delta' | 'thinking_delta']: Exclude<'delta', keyof Extract<Delta, { type: K }>> }['text_delta' | 'thinking_delta']> = true
export const piCompaction: None<
  Exclude<keyof NonNullable<Ours<'compaction_end'>['result']>, keyof NonNullable<Pi<'compaction_end'>['result']>>
> = true

// Codex: the efforts via offers are exactly the ones Codex takes.
type Efforts = (typeof CODEX_EFFORTS)[number]
export const effortsKnown: None<Exclude<Efforts, ModelReasoningEffort>> = true
export const effortsAll: None<Exclude<ModelReasoningEffort, Efforts>> = true
