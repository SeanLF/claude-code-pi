// A pi tool call without an id reaches Claude Code as a text line, not a tool call (the ACP harnesses'
// are calls to the step tool: hooks/acp/steps.ts), so for it Claude Code's subagentStatusLine draws the
// latest one from the row files run.ts writes.
export type Activity = { readonly step: string; readonly tools: number }

// A harness names its own tools: control characters (escape sequences) never reach the terminal.
export const stepOf = (line: string) =>
  line
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .trim()
    .replace(/^▸\s*/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
