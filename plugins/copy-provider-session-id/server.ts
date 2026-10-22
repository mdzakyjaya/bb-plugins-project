// bb-plugin-copy-provider-session-id — backend entry. The plugin is frontend-only;
// bb requires a server entry, so this one only logs that it loaded.
import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");
}
