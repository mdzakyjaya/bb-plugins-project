## What you get

The plugin adds a **Reload from Session** item to every thread menu: the thread header menu, the sidebar row menu, and the right-click menu on a thread. It is for Claude Code threads that you continued outside BB, for example with `claude --resume <id>` in a terminal.

One click reads the thread's Claude Code session log and finds the turns that BB does not show. An **Outside turns** tab opens in the thread's side panel with your prompts, the assistant's replies, tool calls with collapsed results, and context compaction markers. You cannot edit anything in the tab. If there are no outside turns, a toast says so.

If the thread is idle, the plugin also stops its Claude runtime. On your next message, BB starts a new runtime that reads the session file again, so the agent knows what happened outside BB. The plugin does not stop a running thread. It shows a warning instead.

## Why it exists

When you resume a BB thread's session in a terminal, Claude Code writes those turns to the session file, but BB does not show them. If BB still has the thread's runtime loaded, the agent does not know about them either. The idea comes from the "reload agent" feature in Paseo (https://github.com/getpaseo/paseo).

Without the plugin, you can run `bb thread stop <threadId>` and then send your next message. The agent then has the outside turns in its context, but you cannot see them. The plugin runs that stop for you and shows the turns in the side panel.

## How it works

The plugin reads the thread's events through the BB plugin SDK to get the Claude Code session id and the last turn that BB recorded. It then reads the session file under `~/.claude/projects` on the BB machine, follows the active conversation branch, and returns the turns after the last BB turn. If someone rewrote the history outside BB, for example with a rewind, the plugin shows the whole active branch with a note.

The BB timeline does not change, because BB has no API that writes into it. The plugin does not read the BB database and sends nothing over the network.

To debug, run `bb reload-thread check <threadId>`. It prints what the menu item would find and does not change the thread.

## Requirements

- BB 0.46 or later.
- A Claude Code thread whose session file is on the machine that runs the BB server. For other providers, a toast says that only Claude Code threads are supported.
- In the terminal, resume the session without `--fork-session`, so the outside turns go into the same session file.
