// A fake ACP agent for the relay's tests, on the SDK's own agent side. By default its prompt fails as
// codex-acp's does when Codex hits its usage limit, with the cause in the error's data. With FAKE_ECHO
// set it takes images and answers with what it was offered: the client's capabilities, as the SDK
// hands them to an agent, and the prompt's block types. As agy does, it loads any session id, and replays
// a user message only for the one it has, `known`.
import { Readable, Writable } from 'node:stream'
// The unstable schema, as codex-acp's: the stable one has no plan capability and drops it.
import * as acp from '@agentclientprotocol/sdk/unstable'

const echo = process.env.FAKE_ECHO === '1'
let offered
await acp
  .agent()
  .onRequest(acp.methods.agent.initialize, (ctx) => {
    offered = ctx.params.clientCapabilities
    return { protocolVersion: ctx.params.protocolVersion, agentCapabilities: { promptCapabilities: { image: echo } } }
  })
  .onRequest(acp.methods.agent.session.new, () => ({ sessionId: 's1' }))
  .onRequest(acp.methods.agent.session.load, async (ctx) => {
    if (ctx.params.sessionId === 'known')
      await ctx.client.notify(acp.methods.client.session.update, {
        sessionId: 'known',
        update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'earlier' } },
      })
    return {}
  })
  .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
    if (!echo) throw acp.RequestError.internalError({ details: "You've hit your usage limit. Try again at 10:04 PM." })
    const blocks = ctx.params.prompt.map((b) => (b.type === 'image' ? `image:${b.mimeType}:${b.data.length}` : b.type))
    const text = JSON.stringify({ offered, blocks })
    await ctx.client.notify(acp.methods.client.session.update, {
      sessionId: 's1',
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
    })
    return { stopReason: 'end_turn' }
  })
  .connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))).closed
