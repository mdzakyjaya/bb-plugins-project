# bb-plugins-project

Dzaky's plugins for [BB](https://getbb.app). Each plugin lives in its own directory under `plugins/` and is listed in `.bb/plugins.json`.

## Plugins

| Plugin | What it does |
| --- | --- |
| [copy-session-id](plugins/copy-session-id) | Adds **Copy Provider Session Id** to every thread menu, to resume a thread with `claude --resume <id>` or `codex resume <id>`. |
| [reload-thread](plugins/reload-thread) | Adds **Reload from Session** to every thread menu: shows Claude Code turns that ran outside BB in a side panel and reloads the session so the agent sees them. |

## Install

Install one plugin at a time. Each plugin has its own release tags, `<plugin>/vX.Y.Z`:

```
bb plugin install git:https://github.com/mdzakyjaya/bb-plugins-project.git@^0.1.0 --plugin copy-session-id --tag-prefix copy-session-id/
```

From a local clone:

```
cd plugins/copy-session-id
npm install
bb plugin install path:. --yes
```

## License

MIT. See [LICENSE](LICENSE).
