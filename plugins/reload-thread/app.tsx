// bb-plugin-reload-thread — adds "Reload from Session" to every thread menu.
// The server reads the thread's Claude Code session log and returns the turns
// bb does not have (run outside bb, e.g. `claude --resume` in a terminal).
// They show read-only in a side panel tab; bb's timeline is not changed.
import { useEffect, useState } from "react";
import {
  Markdown,
  definePluginApp,
  experimental_THREAD_ACTION_GROUPS,
  useBbContext,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { BbNavigate, PluginRpcClient, PluginThreadPanelProps } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { Contract, ReloadResult } from "./contract.ts";
import type { Turn, TurnItem } from "./session-log.ts";

const PANEL_ACTION_ID = "outside-turns";
const PANEL_TITLE = "Outside turns";

type Rpc = PluginRpcClient<Contract>;
type OkResult = Extract<ReloadResult, { status: "ok" }>;

interface PanelParams {
  threadId: string;
  snapshotId?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Toast for a result that opens no panel; returns true when it handled the result. */
function toastForResult(result: ReloadResult): boolean {
  if (result.status === "unsupported") {
    toast.error("Only Claude Code threads are supported");
  } else if (result.status === "no-session") {
    toast.error("This thread has no Claude Code session yet");
  } else if (result.status === "no-log") {
    toast.error(`No session log found for ${result.providerThreadId}`);
  } else if (result.turns.length === 0) {
    toast.info("No new turns outside bb");
  } else {
    return false;
  }
  return true;
}

/** Opens the panel in the given thread, navigating there first when another thread is in view. */
async function openPanel(navigate: BbNavigate, focusedThreadId: string | null, params: PanelParams): Promise<boolean> {
  const options = { actionId: PANEL_ACTION_ID, title: PANEL_TITLE, params: { ...params } };
  if (focusedThreadId === params.threadId && navigate.openThreadPanel(options)) return true;
  navigate.toThread(params.threadId);
  for (let attempt = 0; attempt < 10; attempt++) {
    await delay(150);
    if (navigate.openThreadPanel(options)) return true;
  }
  return false;
}

async function reloadThread(rpc: Rpc, navigate: BbNavigate, focusedThreadId: string | null, threadId: string) {
  const result = await rpc.call("reload", { threadId });
  if (toastForResult(result)) return;
  const ok = result as OkResult;
  const opened = await openPanel(navigate, focusedThreadId, {
    threadId,
    ...(ok.snapshotId === null ? {} : { snapshotId: ok.snapshotId }),
  });
  if (!opened) toast.error("Could not open the side panel; open the thread and try again");
  const count = `${ok.turns.length} turn${ok.turns.length === 1 ? "" : "s"} outside bb`;
  if (ok.stopped) toast.success(`${count}. The next message reloads the session.`);
  else if (ok.stopError !== null) toast.error(`${count}, but the thread could not be stopped: ${ok.stopError}`);
  else toast.warning(`${count}. The thread is ${ok.threadStatus}, so it was not stopped; the agent sees these turns after its runtime restarts.`);
}

function ToolItem({ item }: { item: Extract<TurnItem, { kind: "tool" }> }) {
  return (
    <details className="rounded border border-border/60 text-xs">
      <summary className="cursor-pointer select-none px-2 py-1 font-mono">
        <span className="font-semibold">{item.name}</span>
        {item.input !== "" ? <span className="text-muted-foreground"> {item.input}</span> : null}
        {item.isError ? <span className="text-destructive"> (error)</span> : null}
        {item.result === null ? <span className="text-muted-foreground"> (no result)</span> : null}
      </summary>
      {item.result !== null ? (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 px-2 py-1 font-mono">
          {item.result}
        </pre>
      ) : null}
    </details>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <section className="flex flex-col gap-2">
      {turn.prompt !== null ? (
        <div className="rounded-md bg-muted px-3 py-2 text-sm">
          <div className="whitespace-pre-wrap break-words">{turn.prompt}</div>
          {turn.timestamp !== null ? (
            <div className="mt-1 text-xs text-muted-foreground">{new Date(turn.timestamp).toLocaleString()}</div>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Continued turn</div>
      )}
      {turn.items.map((item, index) => {
        if (item.kind === "text") return <Markdown key={index} content={item.text} />;
        if (item.kind === "tool") return <ToolItem key={index} item={item} />;
        return (
          <div key={index} className="my-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            Context compacted
            <span className="h-px flex-1 bg-border" />
          </div>
        );
      })}
    </section>
  );
}

function asParams(value: unknown, threadId: string): PanelParams {
  const record = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    threadId: typeof record.threadId === "string" ? record.threadId : threadId,
    ...(typeof record.snapshotId === "string" ? { snapshotId: record.snapshotId } : {}),
  };
}

function OutsideTurnsPanel({ threadId, params }: PluginThreadPanelProps) {
  const rpc = useRpc<Contract>();
  const target = asParams(params, threadId);
  const [result, setResult] = useState<ReloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromSnapshot, setFromSnapshot] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      const kept = version === 0 && target.snapshotId !== undefined ? await rpc.call("snapshot", { snapshotId: target.snapshotId }) : null;
      const next = kept ?? (await rpc.call("preview", { threadId: target.threadId }));
      if (cancelled) return;
      setFromSnapshot(kept !== null);
      setResult(next);
    })().catch((caught: unknown) => {
      if (!cancelled) setError(errorMessage(caught));
    });
    return () => {
      cancelled = true;
    };
  }, [rpc, target.threadId, target.snapshotId, version]);

  const refresh = (
    <button type="button" className="text-xs underline" onClick={() => setVersion((value) => value + 1)}>
      Read again
    </button>
  );

  if (error !== null) return <div className="text-sm text-destructive">Could not read the session: {error} {refresh}</div>;
  if (result === null) return <div className="text-sm text-muted-foreground">Reading the session log…</div>;
  if (result.status !== "ok") {
    const text =
      result.status === "unsupported"
        ? "Only Claude Code threads are supported."
        : result.status === "no-session"
          ? "This thread has no Claude Code session yet."
          : `No session log found for ${result.providerThreadId}.`;
    return <div className="text-sm text-muted-foreground">{text}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div>
          Read-only view of turns in the Claude Code session that bb does not show.{" "}
          {fromSnapshot ? "Snapshot taken at reload. " : ""}
          {refresh}
        </div>
        {target.threadId !== threadId ? <div className="text-destructive">These turns belong to thread {target.threadId}.</div> : null}
        {result.rewritten ? (
          <div className="text-destructive">
            The session history was rewritten outside bb (rewind or edit), so the whole active branch is shown.
          </div>
        ) : null}
        {result.omittedTurns > 0 ? <div>{result.omittedTurns} older turns are not shown.</div> : null}
        <div className="break-all font-mono">{result.logPath}</div>
      </header>
      {result.turns.length === 0 ? <div className="text-sm text-muted-foreground">No new turns outside bb.</div> : null}
      {result.turns.map((turn, index) => (
        <TurnView key={index} turn={turn} />
      ))}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: PANEL_ACTION_ID,
    title: PANEL_TITLE,
    icon: "History",
    component: OutsideTurnsPanel,
    run: ({ threadId, openPanel }) => {
      openPanel({ title: PANEL_TITLE, params: { threadId } });
    },
  });

  app.slots.experimental_threadAction({
    id: "reload-from-session",
    title: "Reload from Session",
    icon: "History",
    group: experimental_THREAD_ACTION_GROUPS.open,
    // Called once for the whole app: the RPC client and the thread in view.
    useData: () => ({ rpc: useRpc<Contract>(), focusedThreadId: useBbContext().threadId }),
    item: ({ thread, data, navigate }) => ({
      label: "Reload from Session",
      icon: "History",
      run: async () => {
        // bb swallows errors thrown from `run`, so surface them as a toast.
        try {
          await reloadThread(data.rpc, navigate, data.focusedThreadId, thread.id);
        } catch (error) {
          toast.error(`Could not reload from the session: ${errorMessage(error)}`);
        }
      },
    }),
  });
});
