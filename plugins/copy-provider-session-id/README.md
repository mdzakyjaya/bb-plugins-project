# copy-provider-session-id

A BB plugin that adds **Copy Provider Session Id** to every thread menu (thread header menu, sidebar row menu, right-click menu). It copies the provider's own session id, so you can resume the thread in a terminal:

```
claude --resume <id>   # Claude Code threads
codex resume <id>      # Codex threads
```

The id is the newest `providerThreadId` in the thread's events, read with `sdk.threads.events.list`. A thread with no provider session shows an error toast.

## Files

- `app.tsx`: registers the thread action.
- `server.ts`: minimal backend entry (BB requires one).
- `PLUGIN_OVERVIEW.md`: store listing text. Keep it consistent with `bb.description` in `package.json`.

## Develop

```
npm install
npx tsc --noEmit
bb plugin build
bb plugin install path:. --yes
bb plugin reload copy-provider-session-id
```
