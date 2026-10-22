# reload-thread

A BB plugin for Claude Code threads that you continued outside BB, for example with `claude --resume <id>` in a terminal. It adds **Reload from Session** to every thread menu: the thread header menu, the sidebar row menu, and the right-click menu.

When you click it:

1. The server reads the thread's Claude Code session log and finds the turns BB does not have.
2. If there are no new turns, a toast says "No new turns outside bb".
3. If there are new turns, an **Outside turns** tab opens in the thread's side panel. The tab shows user prompts, assistant text, tool calls with their name and short input, and compaction markers. Tool results are collapsed. You cannot edit anything in the tab.
4. If the thread is idle or errored, the plugin calls `threads.stop`. This shuts down the Claude runtime that BB keeps loaded. On the next BB message, BB starts a new runtime that reads the session log again, so the agent sees the outside turns. The plugin does not stop a running thread. It shows a warning toast instead.

BB's own timeline does not change, because BB has no API that writes into it. The plugin does not touch `~/.bb/bb.db`. For threads of other providers, the plugin shows "Only Claude Code threads are supported".

## Why this plugin exists

Sometimes you continue a BB thread outside BB by resuming the same Claude Code session in a terminal with `claude --resume <id>`. Claude Code writes those turns to the session log, but BB does not show them. If BB still has the Claude runtime of that thread loaded, the agent does not know about them either, and the next BB turn continues from the old point in the history.

The idea comes from the "reload agent" feature in [Paseo](https://github.com/getpaseo/paseo). Paseo closes the live session and reads the history again from the provider's session file. BB has no API to replace a thread's timeline, so this plugin does the two things BB allows. It shows the outside turns in a side panel, and it makes the agent load them.

## Manual workaround

You can do the plugin's main step by hand:

```
bb thread stop <threadId>
```

Then send the next message in BB. BB reloads the session from the log, and the agent has the outside turns in its context. The BB chat still does not show them.

The plugin runs the same stop for you when the log has outside turns and the thread is not running. It also shows those turns in the **Outside turns** panel.

This works only if Claude Code writes the outside turns to the same session file. Resume the session in the terminal without `--fork-session`, and do not use the terminal and BB on the same session at the same time.

## How the diff works

- The plugin reads the thread's events with `sdk.threads.events.list`, newest first. The session id is the newest `providerThreadId`. The anchor is the `providerCheckpointId` of the newest `turn/completed` event that has one. It is the uuid of the last log line that BB has.
- The log is `~/.claude/projects/<slug>/<session id>.jsonl`. The slug is the environment path with every non-alphanumeric character replaced by `-`. The plugin uses `CLAUDE_CONFIG_DIR` if it is set. If the log is not at that path, the plugin searches every project folder.
- The active branch is the path from the leaf back to the root through `parentUuid`. Across a compaction, the path follows `logicalParentUuid`. The leaf is the newest line under `last-prompt.leafUuid`. The plugin does not use `leafUuid` itself as the leaf, because Claude Code writes that record when you send a prompt, before the rest of the turn.
- New turns are the lines after the anchor on that branch. The plugin leaves out turns whose prompt BB sent after the anchor, which happens when a BB turn is running or was interrupted.
- If the anchor is not on the branch, someone rewrote the history outside BB with a rewind or an edit. The plugin then shows the whole branch with a warning.
- If there is no anchor, the plugin matches BB's prompts to the log's prompts in order. New turns start after the last match.
- The plugin keeps three line types: `user`, `assistant`, and `system` with `subtype: "compact_boundary"`. It skips subagent lines (`isSidechain`), meta lines, slash-command output, and task notifications. It cuts tool results to 2000 characters and returns at most the newest 200 turns.

## CLI

```
bb reload-thread check <threadId> [--json]
```

This prints what **Reload from Session** would find. It does not stop the thread or change anything else.

## Files

- `app.tsx`: the thread action and the **Outside turns** panel.
- `server.ts`: reads BB events, finds the log, stops the thread, and holds the RPC methods (`reload`, `preview`, `snapshot`) and the CLI command.
- `contract.ts`: the RPC contract that the app and the server share.
- `session-log.ts`: JSONL parsing and diffing, with no side effects.
- `tests/`: unit tests on small fixture logs. Run them with `node --test`, no extra setup.
- `PLUGIN_OVERVIEW.md`: the store listing text. Keep it consistent with `bb.description` in `package.json`.

## Develop

```
npm install
npx tsc --noEmit
npm test
bb plugin build
bb plugin install path:. --yes
bb plugin reload reload-thread
```
