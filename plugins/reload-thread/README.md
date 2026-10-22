# reload-thread

A BB plugin for Claude Code threads that were continued outside BB, for example with `claude --resume <id>` in a terminal. It adds **Reload from Session** to every thread menu (thread header menu, sidebar row menu, right-click menu).

On click:

1. The server reads the thread's Claude Code session log and finds the turns BB does not have.
2. No new turns: a toast says "No new turns outside bb".
3. New turns: an **Outside turns** tab opens in the thread's side panel. It shows them read-only: user prompts, assistant text, tool calls (name and short input, result collapsed), and compaction markers.
4. If the thread is idle (or errored), the plugin calls `threads.stop`. This releases the loaded runtime, so the next BB message cold-resumes the session and the agent sees the outside turns. A running thread is not stopped; a warning toast shows instead.

BB's own timeline does not change: there is no API to write into it. The plugin does not touch `~/.bb/bb.db`. Threads of other providers show "Only Claude Code threads are supported".

## How the diff works

- From the thread's events (`sdk.threads.events.list`, newest first): the session id is the newest `providerThreadId`. The anchor is the `providerCheckpointId` of the newest `turn/completed` that has one: the uuid of the last log line BB has.
- The log is `~/.claude/projects/<slug>/<session id>.jsonl` (`CLAUDE_CONFIG_DIR` is honored), where the slug is the environment path with every non-alphanumeric character replaced by `-`. If it is not there, every project folder is searched.
- The active branch is the path from the leaf back to the root through `parentUuid` (and `logicalParentUuid` across compactions). The leaf is the newest line under `last-prompt.leafUuid`, because that record is written when a prompt is sent, before the rest of the turn.
- New turns are the lines after the anchor on that branch, minus turns whose prompt BB itself sent after the anchor (a running or interrupted BB turn). If the anchor is not on the branch, the history was rewritten outside BB (rewind, edit): the whole branch is shown with a warning. Without an anchor, BB's prompts are matched to the log's prompts in order; new turns start after the last match.
- Kept line types: `user`, `assistant`, and `system` with `subtype: "compact_boundary"`. Sidechain (subagent) lines, meta lines, slash-command output, and task notifications are skipped. Tool results are truncated to 2000 characters. At most the newest 200 turns are returned.

## CLI

```
bb reload-thread check <threadId> [--json]
```

Prints what **Reload from Session** would find. It changes nothing (no stop).

## Files

- `app.tsx`: the thread action and the **Outside turns** panel.
- `server.ts`: reads BB events, finds the log, stops the thread, RPC methods (`reload`, `preview`, `snapshot`) and the CLI command.
- `contract.ts`: RPC contract shared by app and server.
- `session-log.ts`: pure JSONL parsing and diffing.
- `tests/`: unit tests on small fixture logs (`node --test`, no extra setup).
- `PLUGIN_OVERVIEW.md`: store listing text. Keep it consistent with `bb.description` in `package.json`.

## Develop

```
npm install
npx tsc --noEmit
npm test
bb plugin build
bb plugin install path:. --yes
bb plugin reload reload-thread
```
