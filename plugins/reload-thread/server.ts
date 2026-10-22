// bb-plugin-reload-thread — backend. Reads the Claude Code session log of a
// thread, finds the turns that ran outside bb (e.g. `claude --resume` in a
// terminal), and hands them to the app. After a reload of an idle thread it
// stops the thread, so the next bb turn cold-resumes the session and the
// agent sees the outside turns. bb's own timeline is never written.
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { cliCommand, defineCli } from "@get-bb/plugin-sdk";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { contract, type ReloadResult } from "./contract.ts";
import { diffSession, parseJsonl, projectSlug, type Turn } from "./session-log.ts";

const CLAUDE_PROVIDER = "claude-code";
// Server maximum for thread event pages; a larger limit is rejected.
const PAGE_SIZE = 100;
const MAX_TURNS = 200;
const MAX_SNAPSHOTS = 20;

interface BbState {
  providerThreadId: string | null;
  anchor: string | null;
  /** Prompts bb sent, oldest first: after the anchor's turn, or the whole session without an anchor. */
  prompts: string[];
}

function claudeProjectsDir(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
}

function promptText(input: unknown): string {
  if (!Array.isArray(input)) return "";
  return input
    .filter((part): part is { type: "text"; text: string } => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

export default async function plugin(bb: BbPluginApi) {
  const snapshots = new Map<string, ReloadResult>();

  /** Newest session id, the anchor, and the prompts bb sent, from the thread's events (newest first). */
  async function readBbState(threadId: string): Promise<BbState> {
    const state: BbState = { providerThreadId: null, anchor: null, prompts: [] };
    const promptsNewestFirst: string[] = [];
    let beforeSeq: string | undefined;
    pages: for (;;) {
      const rows = await bb.sdk.threads.events.list({
        threadId,
        order: "desc",
        limit: String(PAGE_SIZE),
        types: ["thread/identity", "turn/started", "turn/completed", "client/turn/requested"],
        ...(beforeSeq === undefined ? {} : { beforeSeq }),
      });
      for (const row of rows) {
        const data = (row.data ?? {}) as Record<string, unknown>;
        const pid = typeof data.providerThreadId === "string" && data.providerThreadId !== "" ? data.providerThreadId : null;
        if (pid !== null) {
          if (state.providerThreadId === null) state.providerThreadId = pid;
          // An older provider session (context cleared): its turns are not in this log.
          else if (pid !== state.providerThreadId) break pages;
        }
        if (row.type === "turn/completed" && typeof data.providerCheckpointId === "string" && data.providerCheckpointId !== "") {
          state.anchor = data.providerCheckpointId;
          break pages;
        }
        if (row.type === "client/turn/requested") promptsNewestFirst.push(promptText(data.input));
      }
      if (rows.length < PAGE_SIZE) break;
      beforeSeq = String(rows[rows.length - 1].seq);
    }
    state.prompts = promptsNewestFirst.filter((text) => text !== "").reverse();
    return state;
  }

  /** `<projects>/<slug>/<pid>.jsonl` for the cwd first, then every project folder. */
  async function findLog(providerThreadId: string, cwd: string | null): Promise<{ path: string | null; searched: string[] }> {
    const root = claudeProjectsDir();
    const file = `${providerThreadId}.jsonl`;
    const searched: string[] = [];
    if (cwd !== null) {
      const resolved = await realpath(cwd).catch(() => cwd);
      for (const dir of new Set([projectSlug(resolved), projectSlug(cwd)])) {
        const candidate = join(root, dir, file);
        searched.push(candidate);
        if (existsSync(candidate)) return { path: candidate, searched };
      }
    }
    searched.push(join(root, "*", file));
    let dirs: string[] = [];
    try {
      dirs = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      return { path: null, searched };
    }
    for (const dir of dirs) {
      const candidate = join(root, dir, file);
      if (existsSync(candidate)) return { path: candidate, searched };
    }
    return { path: null, searched };
  }

  async function read(threadId: string, release: boolean): Promise<ReloadResult> {
    const thread = await bb.sdk.threads.get({ threadId });
    if (thread.providerId !== CLAUDE_PROVIDER) return { status: "unsupported", providerId: thread.providerId };

    const state = await readBbState(threadId);
    if (state.providerThreadId === null) return { status: "no-session" };

    let cwd: string | null = null;
    if (thread.environmentId !== null) {
      try {
        cwd = (await bb.sdk.environments.get({ environmentId: thread.environmentId })).path ?? null;
      } catch (error) {
        bb.log.warn(`could not read environment ${thread.environmentId}: ${String(error)}`);
      }
    }
    const log = await findLog(state.providerThreadId, cwd);
    if (log.path === null) return { status: "no-log", providerThreadId: state.providerThreadId, searched: log.searched };

    const lines = parseJsonl(await readFile(log.path, "utf8"));
    const diff = diffSession(lines, { anchor: state.anchor, bbPrompts: state.prompts });
    const omittedTurns = Math.max(0, diff.turns.length - MAX_TURNS);
    const turns: Turn[] = diff.turns.slice(omittedTurns);

    let stopped = false;
    let stopError: string | null = null;
    const running = thread.status !== "idle" && thread.status !== "error";
    if (release && turns.length > 0 && !running) {
      try {
        await bb.sdk.threads.stop({ threadId });
        stopped = true;
      } catch (error) {
        stopError = error instanceof Error ? error.message : String(error);
        bb.log.warn(`stop failed for ${threadId}: ${stopError}`);
      }
    }

    const result: ReloadResult = {
      status: "ok",
      threadId,
      providerThreadId: state.providerThreadId,
      logPath: log.path,
      anchor: state.anchor,
      mode: diff.mode,
      rewritten: diff.rewritten,
      turns,
      omittedTurns,
      threadStatus: thread.status,
      stopped,
      stopError,
      snapshotId: null,
    };
    bb.log.info(
      `${release ? "reload" : "preview"} ${threadId}: ${turns.length} new turn(s), mode=${diff.mode}, ` +
        `rewritten=${diff.rewritten}, status=${thread.status}, stopped=${stopped}, log=${log.path}`,
    );
    return result;
  }

  bb.rpc.register(contract, {
    reload: async ({ threadId }) => {
      const result = await read(threadId, true);
      if (result.status !== "ok" || result.turns.length === 0) return result;
      const snapshotId = randomUUID();
      const kept = { ...result, snapshotId };
      snapshots.set(snapshotId, kept);
      while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value as string);
      return kept;
    },
    preview: ({ threadId }) => read(threadId, false),
    snapshot: ({ snapshotId }) => snapshots.get(snapshotId) ?? null,
  });

  bb.cli.register(
    defineCli({
      name: "reload-thread",
      summary: "Inspect Claude Code turns that ran outside bb",
      commands: {
        check: cliCommand({
          summary: "Show the turns in a thread's Claude Code session log that bb does not have. Changes nothing.",
          positionals: [{ name: "threadId", description: "BB thread id (thr_…)", required: true }],
          options: { json: { type: "boolean", description: "Print the full result as JSON" } },
          run: async ({ positionals, options }) => {
            const result = await read(positionals.threadId, false);
            if (options.json) return { exitCode: 0, stdout: `${JSON.stringify(result, null, 2)}\n` };
            return { exitCode: 0, stdout: formatCheck(result) };
          },
        }),
      },
    }),
  );

  bb.log.info("loaded");
}

function formatCheck(result: ReloadResult): string {
  if (result.status === "unsupported") return `Only Claude Code threads are supported (provider: ${result.providerId}).\n`;
  if (result.status === "no-session") return "The thread has no provider session yet.\n";
  if (result.status === "no-log") return `No session log for ${result.providerThreadId}. Searched:\n  ${result.searched.join("\n  ")}\n`;
  const out = [
    `session:  ${result.providerThreadId}`,
    `log:      ${result.logPath}`,
    `anchor:   ${result.anchor ?? "(none)"}`,
    `mode:     ${result.mode}${result.rewritten ? " (history rewritten outside bb)" : ""}`,
    `status:   ${result.threadStatus}`,
    `new turns: ${result.turns.length}${result.omittedTurns > 0 ? ` (+${result.omittedTurns} older omitted)` : ""}`,
  ];
  for (const turn of result.turns) {
    out.push("", `> ${oneLine(turn.prompt ?? "(continued turn)")}  [${turn.timestamp ?? "?"}]`);
    for (const item of turn.items) {
      if (item.kind === "text") out.push(`  text: ${oneLine(item.text)}`);
      else if (item.kind === "tool") out.push(`  tool: ${item.name}(${oneLine(item.input)})${item.isError ? " ERROR" : ""}`);
      else out.push("  -- compacted --");
    }
  }
  return `${out.join("\n")}\n`;
}

function oneLine(text: string, max = 120): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max)}…`;
}
