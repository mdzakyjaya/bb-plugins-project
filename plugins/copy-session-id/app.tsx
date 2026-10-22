// bb-plugin-copy-session-id — adds "Copy Provider Session Id" to every thread
// menu (header menu, sidebar row menu, right-click menu, compact drawer).
// The id is the provider's own session id (Claude Code session, Codex thread),
// so the thread can be resumed in a terminal, e.g. `claude --resume <id>`.
import {
  definePluginApp,
  experimental_THREAD_ACTION_GROUPS,
  experimental_copyToClipboard,
} from "@get-bb/plugin-sdk/app";
import type { PluginBrowserBbSdk } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";

const PAGE_SIZE = 200;

/**
 * Newest provider session id recorded in the thread's events. Scans newest
 * first, so a thread whose provider session changed (clear context) returns
 * the current one.
 */
async function findProviderSessionId(sdk: PluginBrowserBbSdk, threadId: string): Promise<string | null> {
  let beforeSeq: string | undefined;
  for (;;) {
    const rows = await sdk.threads.events.list({
      threadId,
      order: "desc",
      limit: String(PAGE_SIZE),
      ...(beforeSeq === undefined ? {} : { beforeSeq }),
    });
    for (const row of rows) {
      const id = (row.data as { providerThreadId?: unknown }).providerThreadId;
      if (typeof id === "string" && id !== "") return id;
    }
    if (rows.length < PAGE_SIZE) return null;
    beforeSeq = String(rows[rows.length - 1].seq);
  }
}

export default definePluginApp((app) => {
  app.slots.experimental_threadAction({
    id: "copy-provider-session-id",
    title: "Copy Provider Session Id",
    icon: "Copy",
    group: experimental_THREAD_ACTION_GROUPS.open,
    item: ({ thread, sdk }) => ({
      label: "Copy Provider Session Id",
      icon: "Copy",
      run: async () => {
        const id = await findProviderSessionId(sdk, thread.id);
        if (id === null) {
          toast.error("This thread has no provider session yet");
          return;
        }
        const copied = await experimental_copyToClipboard({ text: id });
        if (copied) toast.success(`Copied ${id}`);
        else toast.error("Could not copy to clipboard");
      },
    }),
  });
});
