# via

Run Codex, Antigravity, OpenCode and pi as Claude Code subagents, each through its own CLI and login. Claude plans, they do the work, you steer.

I wanted to use my ChatGPT plan from Claude Code too, without switching windows.

![A via:codex agent view in Claude Code: its steps folded into lines such as "Ran 4 commands", and the agent panel row "via:codex Checking budget counts in home.ts"](https://github.com/user-attachments/assets/e36113c3-b375-4f0d-99ae-5851e73105e9)

Codex's tool calls fold into one line, like Claude Code's own; ctrl+o shows each one with its output.

## Who it's for

You, if all three are true:

- You work in Claude Code.
- You also pay for ChatGPT or Google AI, or want OpenCode's free models.
- You want to hand off tasks, or get another model's review, without leaving Claude Code.

Otherwise:

| If | Use |
| --- | --- |
| Claude Code isn't your main window | A harness that switches models itself: OpenCode, pi, Cursor |
| You want Codex's reviews, a review gate before Claude stops, or to move the session into Codex | OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc), alongside `via` |
| You're on API keys | [claude-code-router](https://github.com/musistudio/claude-code-router): any model, under Claude Code's permissions |

## What I've used it for

- **Codex, to spend my ChatGPT plan too.** A TypeScript migration one slice per agent, refactors, mutation testing, and fixing what a review found.
- **Free models for small tasks.** DeepSeek V4.1 Flash on OpenCode's free tier, or OpenRouter's free models through pi.
- **A review by a model that didn't write the code**, before a release or going public.
- **The same fix on two models**, to see which one is good enough.

## How it differs

- **Each model uses its own harness's tools**, not Claude Code's tools through a proxy. The same model scores 13 to 21 points apart across harnesses on Terminal-Bench ([survey](https://arxiv.org/pdf/2606.20683)).
- **Codex and agy are OpenAI's and Google's own CLIs**, so no login is borrowed. Google has [suspended accounts](https://discuss.ai.google.dev/t/paid-pro-subscriber-banned-instantly-for-testing-opencode-oauth/124403) for logging in to Antigravity from other tools. `via` holds no tokens.
- **No Claude model sits between Claude and the harness**, so the hand-off costs no Claude tokens. OpenAI's plugin puts a Sonnet subagent there.
- **A subagent, not a Bash call.** It streams, takes follow-ups and interrupts, and runs beside the others.
- **Pinned by default.** Codex's adapter installs on first use from a lockfile `via` ships: every package hash-checked, no install scripts. CI runs against the latest Claude Code weekly.

> [!IMPORTANT]
> - Each harness runs its own tools as you, with its own permission settings, outside Claude Code's. The one thing `via` enforces is read-only: plan mode, or `tools: read` at the top of the prompt. Codex, OpenCode and pi then can't write; agy refuses, because it can't.
> - Outside read-only, a repository's `.codex`, `.opencode` and `.pi` config loads, as if you had trusted it. In a repository you didn't write, use `tools: read`; Codex and OpenCode then refuse one that carries its own config.
> - pi and OpenCode are third-party clients. A subscription login there is subject to that provider's rules for third-party clients.

## Set up

1. **Install a harness and sign in to it**: [Codex](https://github.com/openai/codex), [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli), [OpenCode](https://opencode.ai) or [pi](https://pi.dev). One is enough. `via` needs [Node](https://nodejs.org) 22.18 or later; Codex and OpenCode also need npm.
2. **Install the plugin** in Claude Code:

   ```
   /plugin install via --marketplace SeanLF/claude-code-subagent-harnesses
   ```

3. **Restart Claude Code** so it finds the harnesses on your PATH. Restart again after installing another one.

Tested on macOS; CI also runs on Linux. Windows is untested.

## Use

Ask in plain language: "Have codex review src/api".

Optional lines at the top of the prompt set up the harness. They stick for that agent's later messages.

| Line | Effect |
| --- | --- |
| `model: <model>` | The harness's model. `via-help` lists the ones the harness offers you |
| `tools: read` | Read-only, whatever the permission mode; see [Permissions](#permissions). pi also takes a tool list: `read` is read-only; any other list, such as `-bash,read`, can still edit and loads the project's `.pi` extensions |
| `thinking: <level>` | Reasoning effort. A level the harness or model doesn't have is refused |
| `via-help` | Replies with that harness's lines and levels instead of running it |

```text
tools: read
thinking: high
Why does the login test fail on CI but not locally?
```

## What you'll see

- At session start, `via` adds an agent type for each harness on your PATH: `via:codex`, `via:agy`, `via:opencode`, `via:pi`.
- The agent streams the harness's text, tool calls and, where reported, thinking.
- Codex's and OpenCode's tool calls show as rows (`Ran npm test`, `Read file 'src/a.ts'`) that fold into one counted line. pi's and agy's show as text lines (`▸ bash: npm test`), and the latest one shows in the agent panel; your own `subagentStatusLine` setting wins there.
- A subagent the harness starts (Codex does) shows nested under the `via` agent, with its tool calls and last message, signed with its model. `via` approves the Agent call that creates it, since auto mode's classifier only judges calls a model asked for.
- Follow-ups continue the same harness session, even after a reload. A `SendMessage` to a running Codex, OpenCode or pi agent reaches it at its next step, and so does a message you type into that agent's own view. Start the message with `interrupt:` to stop the current step and run it at once. agy only takes messages as follow-ups.
- An answer ends with the model that wrote it, as the harness reports it. A name taken from your `model:` line because the harness didn't confirm it is marked `(requested)`; a harness that won't say gets `model not reported`. Stopped or failed runs say so, unsigned.
- The transcript and task name the harness's model, not a Claude one: `Fix the parser · gpt-6-luna · high`.
- When a harness compacts its own context, a `Compacted conversation` row shows, with pi's summary behind ctrl+o.
- So Claude Code never compacts a `via` agent's copy of the conversation, which no model reads, `via` sets `CLAUDE_CODE_MAX_CONTEXT_TOKENS` while a Claude model is the main one. It only sizes non-Claude models, so other non-Claude agents get the same window. A value you set is left alone, and `via` removes its own when `/model` switches to a non-Claude model.
- Codex and OpenCode run over [ACP](https://agentclientprotocol.com), a standard protocol for driving coding agents. On first use `via` installs Codex's adapter, [`codex-acp`](https://github.com/agentclientprotocol/codex-acp), into `~/.claude/via/acp/`. It drives your own `codex`; no Codex binary is installed.

## Permissions

- **Read-only** is what `via` enforces, in plan mode or with `tools: read`. Codex runs in its read-only sandbox with MCP servers and plugins off; OpenCode with only reading tools and no project config; pi with only its reading tools. agy is refused. So are Codex in a project with a `.codex` folder and OpenCode in one with `.opencode`, since both would load code from there before any permission applies.
- **Otherwise** Codex works in its workspace sandbox and asks before going past it, as `codex exec` does. OpenCode, pi and agy run with their own permission settings, as when you run them yourself.
- A question a harness asks (Codex past its sandbox, OpenCode where its config says `ask`) shows in Claude Code's own dialog, with a notification: "codex wants to run `curl -sI https://example.com`. Allow it?". Only "Allow once" or "Deny" is offered, so nothing outlives the run. A dismissed or unanswered question, or a `claude -p` run with nobody to ask, is a deny. Bypass mode approves its questions; don't-ask mode denies them. pi and agy never ask.
- The mode is the one when the agent started, kept across its follow-ups and reloads. Switching modes later doesn't change an agent already running.
- Outside read-only, Codex runs with the working folder trusted (`codex-acp` sets that), so a project's `.codex/config.toml` loads, as if you had trusted the project in Codex. Outside a Git repository it edits without the refusal `codex exec` has.

## Harnesses

Each can load its own user config and instructions files; agy, for one, reads your global `AGENTS.md`.

| | Notes |
| --- | --- |
| `codex` | An interrupted command can keep running until it finishes. |
| `agy` | Commands run in Antigravity's sandbox, away from credentials such as `~/.kube`; its own file edits are not sandboxed. Its changelog says it leaves background tasks it started, such as dev servers, running after a headless run ends. |
| `opencode` | A read-only run replaces your own `OPENCODE_CONFIG_CONTENT` with `via`'s reading agent. |
| `pi` | Any model pi reaches: API keys, or logins such as ChatGPT, Copilot or OpenRouter (pi's `/login`); `pi --list-models` lists them. On a ChatGPT login it runs pi's own tools, not Codex's sandbox. A read-only tool list also skips the project's `.pi` extensions, even in a project you trusted. |

## Settings

In `/config`, or `pluginConfigs` in `settings.json`:

- `timeoutMinutes` (default 30): a longer run is stopped. The answer keeps what the harness wrote and says it was stopped.
- `defaultModel`: pi's model when the prompt has no `model:` line.
- `codexAcp` (default `pinned`): `pinned` runs the `codex-acp` version `via` ships with, its dependencies locked and hash-checked, updated only when `via` is. `latest` installs the newest into `~/.claude/via/acp/latest` once per Claude Code session, its dependencies unpinned.

## Develop

`mise install && pnpm install`, then `pnpm lint` (Biome: format and lint), `pnpm test` and `pnpm validate`, which CI runs too; the last two need the `claude` CLI. `pnpm typecheck` needs the engine's typings, which a logged-in Claude Code session writes to `.claude-plugin/types/`.

- `relay/relay.mjs` is the committed bundle the plugin runs: the ACP relay with the ACP SDK bundled in. After changing `relay/src/` or the SDK version, run `pnpm build:relay`; CI fails when the bundle doesn't match.
- `relay/codex-acp/` is the lockfile `via` installs `codex-acp` from (`npm ci --ignore-scripts`).
- `hooks/acp/` is the generic ACP client (the step tool, the rows, the spawn of an agent described as plain data). `pnpm lint` fails if it imports anything of `via`'s, so it can ship on its own.
- Codex's and OpenCode's tool calls reach Claude Code as calls to `via`'s MCP tool `step`, which runs nothing: `via` answers each with what the harness reported. As an MCP tool, a run of them folds into one counted line. A `step` call `via` didn't make is refused.
- Nested agents need the harness to report subagents over ACP ([subagents RFD](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/rfds/subagents.mdx)); `codex-acp` does.
- `relay/test/` tests the relay against a fake agent (`pnpm test:relay`, which CI runs); `relay/checks/` holds the live checks used to verify each ACP agent.

## Credit

Inspired by [pi-agent-for-claude](https://github.com/FazalAAli/pi-agent-for-claude) by Fazal Ali. [claudexor](https://github.com/razzant/claudexor)'s Antigravity adapter was prior art for `via:agy`. The relay bundles the [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk) (Apache-2.0) and zod (MIT); see `relay/THIRD_PARTY_LICENSES`. MIT licence.
