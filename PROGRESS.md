# Progress

## Current state (2026-10-22)

- `copy-session-id` 0.1.0: done. Typechecks, builds, and is installed in BB from `path:` this repo.
- Not yet published: no GitHub repo, no tag, no marketplace entry.

## Next steps

1. Confirm the copyright name in `LICENSE` and the repository URL in `plugins/copy-session-id/package.json`.
2. Create the GitHub repo `mdzakyjaya/bb-plugin-project` and push `main`.
3. Tag the release: `git tag copy-session-id/v0.1.0 && git push --tags`.
4. Test a git install: `bb plugin install git:https://github.com/mdzakyjaya/bb-plugin-project.git@^0.1.0 --plugin copy-session-id --tag-prefix copy-session-id/`.
5. Submit to the BB Community marketplace with the `submit-a-plugin` skill.
