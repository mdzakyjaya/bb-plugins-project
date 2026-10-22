## What you get

A **Reload from Session** item in every thread menu: the thread header menu, the sidebar row menu, and the right-click menu on a thread. It is for Claude Code threads that you continued outside BB, for example with `claude --resume <id>` in a terminal.

One click reads the thread's Claude Code session log and finds the turns that BB does not show. They open read-only in an **Outside turns** tab in the thread's side panel: your prompts, the assistant's replies, tool calls with collapsed results, and context compaction markers. If there are none, a toast says so.

If the thread is idle, the plugin also releases its loaded runtime. Your next message in BB then resumes the session from disk, so the agent knows what happened outside BB. A running thread is not stopped; you get a warning instead.

## How it works

The plugin reads the thread's events through the BB plugin SDK to get the Claude Code session id and the last turn BB recorded. It then reads the session file under `~/.claude/projects` on the BB machine, follows the active conversation branch, and returns the turns after BB's last one. If the history was rewritten outside BB, for example by a rewind, the whole active branch is shown with a note.

The BB timeline itself is not changed, because BB has no API to write into it. The plugin does not read the BB database and sends nothing over the network.

For debugging, `bb reload-thread check <threadId>` prints what the menu item would find, without changing the thread.

## Requirements

- BB 0.46 or later.
- A Claude Code thread whose session file is on the machine that runs the BB server. Other providers show a toast that only Claude Code threads are supported.
