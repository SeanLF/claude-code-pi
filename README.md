# via

Run Codex, Antigravity, OpenCode and pi as Claude Code subagents, each through its own CLI and login. Claude plans, they do the work, you steer.

Codex and agy are OpenAI's and Google's own CLIs, so no login is borrowed; Google has [suspended accounts](https://discuss.ai.google.dev/t/paid-pro-subscriber-banned-instantly-for-testing-opencode-oauth/124403) for logging in to Antigravity from other tools. `via` stores no credentials, and no Claude model sits in between, so the hand-off costs no Claude tokens.

![A via:codex agent view in Claude Code: its steps folded into lines such as "Ran 4 commands", and the agent panel row "via:codex Checking budget counts in home.ts"](https://github.com/user-attachments/assets/e36113c3-b375-4f0d-99ae-5851e73105e9)

## Who it's for

People who work in Claude Code, also pay for ChatGPT or Google AI (or want OpenCode's free models), and want to hand off tasks or get another model's review without switching windows.

Not for you if:

- Claude Code isn't your main window: use a harness that switches models itself (OpenCode, pi, Cursor).
- You want Codex's reviews, a review gate before Claude stops, or to move the session into Codex: OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc), alongside `via`.
- You're on API keys: [claude-code-router](https://github.com/musistudio/claude-code-router).

## What I've used it for

- Codex, to spend my ChatGPT plan too: a TypeScript migration one slice per agent, refactors, mutation testing.
- Free models for small tasks, on OpenCode's free tier or OpenRouter through pi.
- A review by a model that didn't write the code.
- The same fix on two models, to see which one is good enough.

> [!IMPORTANT]
> - Each harness runs its own tools as you, with its own permission settings, outside Claude Code's. The one thing `via` enforces is read-only: plan mode, or `tools: read` at the top of the prompt. Codex, OpenCode and pi then can't write; agy refuses, because it can't.
> - Outside read-only, a repository's `.codex`, `.opencode` and `.pi` config loads, as if you had trusted it. In a repository you didn't write, use `tools: read`; Codex and OpenCode then refuse one that carries its own config.
> - pi and OpenCode are third-party clients. A subscription login there is subject to that provider's rules for third-party clients.

## Set up

```
/plugin install via --marketplace SeanLF/claude-code-subagent-harnesses
```

Your agent can do the rest: install and sign in to [Codex](https://github.com/openai/codex), [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli), [OpenCode](https://opencode.ai) or [pi](https://pi.dev), with Node 22.18+ and npm, then restart Claude Code. Windows is untested.

## Use

Ask in plain language: "Have codex review src/api". Optional top lines stick for that agent's later messages:

| Line | Effect |
| --- | --- |
| `model: <model>` | The harness's model |
| `tools: read` | Read-only, whatever the permission mode. pi also takes a tool list; anything but `read` can still edit and loads the project's `.pi` extensions |
| `thinking: <level>` | Reasoning effort; a level the harness or model doesn't have is refused |
| `via-help` | Lists that harness's models, lines and levels instead of running it |

A message to a running Codex, OpenCode or pi agent reaches it at its next step; `interrupt:` first stops the current step. agy only takes follow-ups. Each answer is signed with the model the harness reports.

## Permissions

- **Read-only** (plan mode or `tools: read`): Codex gets its read-only sandbox with MCP servers and plugins off; OpenCode and pi get only reading tools, OpenCode without project config. agy is refused, and so are Codex under a `.codex` folder and OpenCode under `.opencode`, which would load code before any permission applies.
- **Otherwise** Codex works in its workspace sandbox and asks before going past it; OpenCode, pi and agy use their own permission settings. Codex treats the working folder as trusted, so a project's `.codex/config.toml` loads, and it edits outside a Git repository, which `codex exec` refuses.
- A harness's question (Codex past its sandbox, OpenCode where its config says `ask`) shows in Claude Code's dialog as "Allow once" or "Deny", so nothing outlives the run. No answer, or `claude -p`, is a deny. Bypass mode approves; don't-ask mode denies. pi and agy never ask.
- The mode is fixed when the agent starts, across its follow-ups and reloads.
- `via` approves the Agent call for a harness's own nested subagent itself, since auto mode's classifier only judges calls a model asked for.

## Harnesses

Each loads its own user config and instructions files (agy reads your global `AGENTS.md`).

- `codex`: an interrupted command can keep running until it finishes.
- `agy`: commands run in Antigravity's sandbox, away from credentials such as `~/.kube`; its own file edits are not sandboxed. Its changelog says background tasks it started, such as dev servers, keep running after a headless run.
- `opencode`: a read-only run replaces your own `OPENCODE_CONFIG_CONTENT`.
- `pi`: any model pi reaches by API key or `/login`. On a ChatGPT login it runs pi's own tools, not Codex's sandbox. A read-only tool list skips the project's `.pi` extensions, even in a project you trusted.

## Settings

In `/config`, or `pluginConfigs` in `settings.json`:

- `timeoutMinutes` (default 30): a longer run is stopped, keeping what the harness wrote.
- `defaultModel`: pi's model when the prompt has no `model:` line.
- `codexAcp` (default `pinned`): `pinned` installs the `codex-acp` adapter from the lockfile `via` ships, hash-checked, no install scripts. `latest` installs the newest once per Claude Code session, unpinned.

While a Claude model is the main one, `via` sets `CLAUDE_CODE_MAX_CONTEXT_TOKENS` (it sizes only non-Claude models) so Claude Code never compacts a `via` agent's conversation. A value you set is left alone.

## Develop

`mise install && pnpm install`, then `pnpm lint`, `pnpm test` and `pnpm validate` (the last two need the `claude` CLI). `pnpm typecheck` needs the typings a logged-in Claude Code session writes to `.claude-plugin/types/`.

- Codex and OpenCode run over [ACP](https://agentclientprotocol.com) (Agent Client Protocol, a standard way to drive coding agents) through `relay/relay.mjs`, a committed bundle: run `pnpm build:relay` after changing `relay/src/` or the SDK. `relay/codex-acp/` is `codex-acp`'s lockfile.
- `hooks/acp/` is the generic ACP client and may not import `via`'s code. `hooks/record.ts` keeps one record per agent in `$.store`; `hooks/install.ts` installs ACP adapters; `hooks/writer.ts` writes a run's steps for `via` agents and nested ones.
- Harness tool calls reach Claude Code as calls to the MCP tool `step`, which runs nothing and refuses calls `via` didn't make.
- `pnpm test:relay` tests the relay against a fake agent; `relay/checks/` holds live checks per ACP agent.

## Credit

Inspired by [pi-agent-for-claude](https://github.com/FazalAAli/pi-agent-for-claude) by Fazal Ali. [claudexor](https://github.com/razzant/claudexor)'s Antigravity adapter was prior art for `via:agy`. The relay bundles the [ACP TypeScript SDK](https://github.com/agentclientprotocol/typescript-sdk) (Apache-2.0) and zod (MIT); see `relay/THIRD_PARTY_LICENSES`. MIT licence.
