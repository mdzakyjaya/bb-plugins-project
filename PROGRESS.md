# Progress

## Current state (2026-10-22)

- Plugin renamed from `copy-session-id` to `copy-provider-session-id` because `copy-session-id` already exists in the BB Community marketplace (it copies the BB thread id; this plugin copies the provider session id). Display name: "Copy Provider Session Id".
- `copy-provider-session-id` 0.1.0: code done and typechecks after the rename. Not yet re-tested in BB.
- GitHub repo (public): https://github.com/mdzakyjaya/bb-plugins-project.
- Old tag `copy-session-id/v0.1.0` is pushed. Do not move it. It is unused after the rename.
- BB still has the old `copy-session-id` installed from git. Replace it after the rename is pushed and tagged.
- Not submitted to the BB Community marketplace. Dzaky chose local use only for now.

## Next steps

1. Push the rename commit.
2. Tag `copy-provider-session-id/v0.1.0` and push the tag.
3. Uninstall `copy-session-id`, then install: `bb plugin install git:https://github.com/mdzakyjaya/bb-plugins-project.git@^0.1.0 --plugin copy-provider-session-id --tag-prefix copy-provider-session-id/`.
4. (On hold) Submit to the BB Community marketplace. Find the submit process first; the `submit-a-plugin` skill was not available.
