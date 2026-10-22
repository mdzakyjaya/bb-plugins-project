# Progress

## Current state (2026-10-22)

- `copy-provider-session-id` 0.1.0: done. Renamed from `copy-session-id` because that id already exists in the BB Community marketplace (it copies the BB thread id; this plugin copies the provider session id). Display name: "Copy Provider Session Id".
- GitHub repo (public): https://github.com/mdzakyjaya/bb-plugins-project. `main` is pushed.
- Release tag `copy-provider-session-id/v0.1.0` is pushed. The old tag `copy-session-id/v0.1.0` stays on GitHub, unused. Never move a tag.
- Installed in BB from git: `bb plugin install git:https://github.com/mdzakyjaya/bb-plugins-project.git@^0.1.0 --plugin copy-provider-session-id --tag-prefix copy-provider-session-id/`. Installed and running; tested in the UI after the rename: works.
- Not submitted to the BB Community marketplace. Dzaky chose local use only for now.
- `reload-thread` 0.1.0 (Claude Code threads only): built, typechecked, 15 unit tests pass, installed locally from `path:`. Committed, tag `reload-thread/v0.1.0` pushed.
  - Verified with `bb reload-thread check` and the `preview` RPC over HTTP: `thr_w9mez36bbn` shows the 10 turns that ran outside BB; idle threads with no outside turns show 0; a Codex thread shows "Only Claude Code threads are supported".
  - Tested in the UI by Dzaky: the menu item and the side panel work. The `threads.stop` after a reload is not confirmed (plugin log shows only `preview` calls).
  - Scope: the outside turns show only in the plugin panel, not in the BB timeline (no SDK API to write events). The agent gets them on its next cold resume.

## Known issues

- On Windows, every plugin CLI command (also bb's own, e.g. `bb automation --help`) prints its output, then exits 127 with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. This is a bb CLI bug, not a plugin bug.

## Next steps

1. Confirm that **Reload from Session** stops the thread and that the next BB message knows the outside turns.
2. (On hold) Submit to the BB Community marketplace. The `submit-a-plugin` skill was not available in the 2026-10-22 session, so find the submit process first.
