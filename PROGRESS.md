# Progress

## Current state (2026-10-22)

- `copy-session-id` 0.1.0: done and tested in the UI.
- GitHub repo (public): https://github.com/mdzakyjaya/bb-plugins-project. `main` is pushed.
- Release tag `copy-session-id/v0.1.0` is pushed.
- Installed in BB from git: `bb plugin install git:https://github.com/mdzakyjaya/bb-plugins-project.git@^0.1.0 --plugin copy-session-id --tag-prefix copy-session-id/`. Works.
- Not submitted to the BB Community marketplace. Dzaky chose local use only for now.
- `reload-thread` 0.1.0 (Claude Code threads only): built, typechecked, 15 unit tests pass, installed locally from `path:`. Not committed, not tagged; waiting for Dzaky's review.
  - Verified with `bb reload-thread check` and the `preview` RPC over HTTP: `thr_w9mez36bbn` shows the 10 turns that ran outside BB; idle threads with no outside turns show 0; a Codex thread shows "Only Claude Code threads are supported".
  - Not yet clicked in the UI: the menu item, the side panel, and the `threads.stop` after a reload.

## Known issues

- On Windows, every plugin CLI command (also bb's own, e.g. `bb automation --help`) prints its output, then exits 127 with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. This is a bb CLI bug, not a plugin bug.

## Next steps

1. Test `reload-thread` in the UI: run **Reload from Session** on a thread with outside turns, check the panel, the toasts, and that the next BB message resumes with the outside turns.
2. Commit `reload-thread`, then tag `reload-thread/v0.1.0`.
3. (On hold) Submit to the BB Community marketplace. The `submit-a-plugin` skill was not available in the 2026-10-22 session, so find the submit process first.
