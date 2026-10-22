# bb-plugin-project

Dzaky's plugins for [BB](https://getbb.app). Each plugin lives in its own directory under `plugins/` and is listed in `.bb/plugins.json`.

## Plugins

| Plugin | What it does |
| --- | --- |
| [copy-session-id](plugins/copy-session-id) | Adds **Copy Provider Session Id** to every thread menu, to resume a thread with `claude --resume <id>` or `codex resume <id>`. |

## Install

Install one plugin at a time. Each plugin has its own release tags, `<plugin>/vX.Y.Z`:

```
bb plugin install git:https://github.com/mdzakyjaya/bb-plugin-project.git@^0.1.0 --plugin copy-session-id --tag-prefix copy-session-id/
```

From a local clone:

```
cd plugins/copy-session-id
npm install
bb plugin install path:. --yes
```

## License

MIT. See [LICENSE](LICENSE).
