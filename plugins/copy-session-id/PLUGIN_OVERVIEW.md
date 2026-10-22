## What you get

A **Copy Provider Session Id** item in every thread menu: the thread header menu, the sidebar row menu, and the right-click menu on a thread. One click puts the provider's own session id on your clipboard and shows a toast with the copied value.

Use the id to continue the same conversation outside BB:

```
claude --resume <id>
codex resume <id>
```

This is useful when you want to pick up a thread in a plain terminal, inspect the session files on disk, or hand a session to another tool.

## How it works

BB records the provider session id on the thread's events. The plugin reads the thread's events through the BB plugin SDK, newest first, and copies the most recent id. If the provider session changed during the thread, for example after a context clear, you get the current one.

The plugin runs only in the BB app. It does not read the BB database directly, does not change threads, and sends nothing over the network.

## Requirements

- BB 0.46 or later.
- A thread that ran on a provider that reports a session id, such as Claude Code or Codex. A thread that has not started a provider session yet shows an error toast instead.
