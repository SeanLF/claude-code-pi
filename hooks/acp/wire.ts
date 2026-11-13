// The ACP session updates the parser reads, by the fields it reads. A hooks module may import only its own
// files, so these stand in for the SDK's types; checks/sdk.ts fails when the SDK drops or renames a field
// named here. Every value is unknown: an agent's JSON is checked as it is read.
export type Read = {
  agent_message_chunk: 'content' | 'messageId'
  agent_thought_chunk: 'content'
  tool_call: 'toolCallId' | 'title' | 'kind' | 'status' | 'locations' | 'content' | 'rawOutput' | '_meta'
  tool_call_update: 'toolCallId' | 'title' | 'kind' | 'status' | 'locations' | 'content' | 'rawOutput' | '_meta'
  plan: 'entries'
  compaction_summary_chunk: 'compactionId' | 'content'
  compaction_update: 'compactionId' | 'summary' | 'status' | 'error'
  usage_update: 'used'
  subagent_update: 'sessionId' | 'title' | 'description' | 'state'
  config_option_update: 'configOptions'
}

export type SessionUpdate = {
  [K in keyof Read]: { readonly sessionUpdate: K } & { readonly [F in Read[K]]?: unknown }
}[keyof Read]

// A tool call's content items, by the fields outputOf reads.
export type ContentRead = { content: 'content'; diff: 'path' | 'oldText' | 'newText' }
