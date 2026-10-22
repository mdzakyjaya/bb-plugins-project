# bb-plugins-project

Multi-plugin repo for Dzaky's BB plugins. Target: publish each plugin on the BB Community marketplace.

## Layout

- `.bb/plugins.json`: collection manifest. Add every new plugin here (`name` = plugin id, `source` = `./plugins/<id>`).
- `plugins/<id>/`: one plugin. Holds `package.json` (manifest, `bb` field), `app.tsx`, `server.ts`, `tsconfig.json`, `README.md`, `PLUGIN_OVERVIEW.md`.
- `node_modules/` and `dist/` are not committed. BB builds `dist/` at install time.

## Commands

Run inside `plugins/<id>/`:

```
npm install
npx tsc --noEmit                 # typecheck
bb plugin build                  # build dist/
bb plugin install path:. --yes   # install from this path
bb plugin reload <id>            # after edits
bb plugin dev                    # rebuild + reload on save
bb plugin logs <id>
```

## Rules

- Keep `bb.description` (under ~140 chars) and `PLUGIN_OVERVIEW.md` consistent. Overview rules: max 4000 chars, `##` headings only, no HTML, images, tables, or task lists, absolute https links only.
- Release = git tag `<plugin>/vX.Y.Z` (e.g. `copy-provider-session-id/v0.1.0`) matching `version` in that plugin's `package.json`. Never move a tag; publish a fix as a new version.
- Submit to the marketplace with the `submit-a-plugin` skill.
- `PROGRESS.md` holds the current state. Update it when you change something.
