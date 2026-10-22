// Pure parsing and diffing of a Claude Code session log (JSONL). No I/O, so
// the logic runs the same in the plugin server and in `node --test`.
//
// A session log is a tree: every line has a `uuid` and a `parentUuid`. Edits,
// rewinds, and retries leave dead branches in the file. The active branch is
// the path from the leaf (the newest line under `last-prompt.leafUuid`) back
// to the root. A
// compaction starts a new root (`parentUuid: null`) that points back through
// `logicalParentUuid`.

/** One raw JSONL line. Only the fields this module reads are typed. */
export interface LogLine {
  type?: string;
  subtype?: string;
  uuid?: string;
  parentUuid?: string | null;
  logicalParentUuid?: string | null;
  leafUuid?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  toolUseResult?: unknown;
  origin?: { kind?: string } | null;
  promptSource?: string;
  timestamp?: string;
  message?: {
    id?: string;
    role?: string;
    content?: unknown;
  };
}

export type TurnItem =
  | { kind: "text"; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: string;
      result: string | null;
      isError: boolean;
    }
  | { kind: "compaction" };

export interface Turn {
  /** The user prompt that started the turn; null when the new lines start mid-turn. */
  prompt: string | null;
  timestamp: string | null;
  items: TurnItem[];
}

export interface DiffResult {
  turns: Turn[];
  /** True when the anchor is not on the active branch (history was rewritten outside bb). */
  rewritten: boolean;
  /** How the start of the new lines was found. */
  mode: "anchor" | "prompt-match" | "rewritten";
}

export interface DiffOptions {
  /** Uuid of the last log line bb has (`providerCheckpointId` of its newest completed turn). */
  anchor?: string | null;
  /**
   * Prompts bb sent, oldest first. Without an anchor they locate the last turn
   * bb has. With an anchor, pass only the prompts sent after the anchor's turn:
   * those turns are bb's own (running or interrupted) and are left out.
   */
  bbPrompts?: readonly string[];
  /** Maximum characters kept from one tool result. Default 2000. */
  maxToolOutput?: number;
}

const REAL_PROMPT_SOURCES = new Set(["typed", "sdk", "queued", "suggestion_accepted"]);
const INJECTED_PREFIXES = ["<command-name>", "<local-command-stdout>", "<task-notification>"];
const INPUT_KEYS = ["command", "file_path", "path", "pattern", "url", "query", "description", "prompt", "skill"];
const MAX_INPUT = 200;

export function parseJsonl(text: string): LogLine[] {
  const lines: LogLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    try {
      const value: unknown = JSON.parse(line);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) lines.push(value as LogLine);
    } catch {
      // A partly written last line or a corrupt line: skip it.
    }
  }
  return lines;
}

/** Whitelisted conversation line, outside any sidechain (subagent). */
function isKept(line: LogLine): boolean {
  if (line.isSidechain === true) return false;
  return (
    line.type === "user" ||
    line.type === "assistant" ||
    (line.type === "system" && line.subtype === "compact_boundary")
  );
}

/**
 * Lines of the active branch, root first. Every line with a uuid takes part
 * in the walk (the leaf is often a hook or system line), so filter the result
 * with the whitelist afterwards.
 */
export function activeBranch(lines: readonly LogLine[]): LogLine[] {
  const byUuid = new Map<string, LogLine>();
  for (const line of lines) {
    if (typeof line.uuid === "string" && line.isSidechain !== true) byUuid.set(line.uuid, line);
  }

  let leaf: LogLine | undefined;
  for (let i = lines.length - 1; i >= 0 && leaf === undefined; i--) {
    const line = lines[i];
    if (line.type === "last-prompt" && typeof line.leafUuid === "string") leaf = byUuid.get(line.leafUuid);
  }
  // `last-prompt` is written when a prompt is sent, so the rest of that turn
  // is appended after its leaf. Move to the newest line that descends from it.
  if (leaf?.uuid !== undefined) {
    const children = new Map<string, LogLine[]>();
    for (const line of byUuid.values()) {
      const parent = line.parentUuid ?? line.logicalParentUuid ?? null;
      if (parent === null) continue;
      const list = children.get(parent);
      if (list === undefined) children.set(parent, [line]);
      else list.push(line);
    }
    const descendants = new Set<LogLine>([leaf]);
    const queue = [leaf];
    while (queue.length > 0) {
      for (const child of children.get(queue.pop()?.uuid ?? "") ?? []) {
        if (descendants.has(child)) continue;
        descendants.add(child);
        queue.push(child);
      }
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      if (descendants.has(lines[i])) {
        leaf = lines[i];
        break;
      }
    }
  }
  for (let i = lines.length - 1; i >= 0 && leaf === undefined; i--) {
    if (isKept(lines[i])) leaf = lines[i];
  }

  const path: LogLine[] = [];
  const seen = new Set<string>();
  let current = leaf;
  while (current !== undefined && typeof current.uuid === "string" && !seen.has(current.uuid)) {
    seen.add(current.uuid);
    path.push(current);
    const parent = current.parentUuid ?? current.logicalParentUuid ?? null;
    current = parent === null ? undefined : byUuid.get(parent);
  }
  return path.reverse();
}

function contentBlocks(line: LogLine): unknown[] {
  const content = line.message?.content;
  return Array.isArray(content) ? content : [];
}

function blockType(block: unknown): string | undefined {
  return block !== null && typeof block === "object" ? (block as { type?: string }).type : undefined;
}

/** Plain text of a message content (string or blocks); images become "[image]". */
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    const type = blockType(block);
    if (type === "text") parts.push(String((block as { text?: unknown }).text ?? ""));
    else if (type === "image") parts.push("[image]");
  }
  return parts.join("\n");
}

export type UserLineKind = "prompt" | "tool_result" | "compact_summary" | "injected";

export function classifyUser(line: LogLine): UserLineKind {
  if (line.isCompactSummary === true) return "compact_summary";
  if (contentBlocks(line).some((block) => blockType(block) === "tool_result")) return "tool_result";
  if (line.toolUseResult !== undefined) return "injected";
  if (line.isMeta === true) return "injected";
  const originKind = line.origin?.kind;
  if (originKind === "task-notification" || originKind === "peer") return "injected";
  const text = contentText(line.message?.content).trimStart();
  if (INJECTED_PREFIXES.some((prefix) => text.startsWith(prefix))) return "injected";
  if (originKind === "human") return "prompt";
  if (line.promptSource !== undefined) return REAL_PROMPT_SOURCES.has(line.promptSource) ? "prompt" : "injected";
  if (originKind === undefined) return "prompt";
  return "injected";
}

function isPrompt(line: LogLine): boolean {
  return line.type === "user" && line.isSidechain !== true && classifyUser(line) === "prompt";
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** True when a log prompt is the same message as a prompt bb sent. */
export function promptMatches(logPrompt: string, bbPrompt: string): boolean {
  const log = normalize(logPrompt);
  const sent = normalize(bbPrompt);
  if (sent === "") return log === "";
  return log === sent || log.includes(sent);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} more chars]`;
}

/** Short, single-line summary of a tool input. */
export function summarizeInput(input: unknown): string {
  if (input === null || typeof input !== "object") return truncate(String(input ?? ""), MAX_INPUT);
  const record = input as Record<string, unknown>;
  for (const key of INPUT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value !== "") return truncate(normalize(value), MAX_INPUT);
  }
  return truncate(JSON.stringify(input), MAX_INPUT);
}

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  return contentText(content);
}

/** Turns from conversation lines (any lines; non-whitelisted ones are skipped). */
export function buildTurns(lines: readonly LogLine[], maxToolOutput = 2000): Turn[] {
  const turns: Turn[] = [];
  const tools = new Map<string, Extract<TurnItem, { kind: "tool" }>>();
  const textByMessage = new Map<string, Extract<TurnItem, { kind: "text" }>>();
  let current: Turn | null = null;

  const turn = (line: LogLine): Turn => {
    if (current === null) {
      current = { prompt: null, timestamp: line.timestamp ?? null, items: [] };
      turns.push(current);
    }
    return current;
  };
  const addCompaction = (line: LogLine) => {
    const items = turn(line).items;
    if (items[items.length - 1]?.kind !== "compaction") items.push({ kind: "compaction" });
  };

  for (const line of lines) {
    if (!isKept(line)) continue;
    if (line.type === "system") {
      addCompaction(line);
      continue;
    }
    if (line.type === "user") {
      const kind = classifyUser(line);
      if (kind === "prompt") {
        current = { prompt: contentText(line.message?.content), timestamp: line.timestamp ?? null, items: [] };
        turns.push(current);
      } else if (kind === "compact_summary") {
        addCompaction(line);
      } else if (kind === "tool_result") {
        for (const block of contentBlocks(line)) {
          if (blockType(block) !== "tool_result") continue;
          const result = block as { tool_use_id?: string; content?: unknown; is_error?: boolean };
          const tool = result.tool_use_id === undefined ? undefined : tools.get(result.tool_use_id);
          if (tool === undefined) continue;
          tool.result = truncate(toolResultText(result.content), maxToolOutput);
          tool.isError = result.is_error === true;
        }
      }
      continue;
    }
    // assistant: one line per content block, grouped by message.id.
    const messageId = line.message?.id ?? line.uuid ?? "";
    for (const block of contentBlocks(line)) {
      const type = blockType(block);
      if (type === "text") {
        const text = String((block as { text?: unknown }).text ?? "");
        if (text.trim() === "") continue;
        const existing = textByMessage.get(messageId);
        const items = turn(line).items;
        if (existing !== undefined && items[items.length - 1] === existing) {
          existing.text += `\n\n${text}`;
        } else {
          const item: Extract<TurnItem, { kind: "text" }> = { kind: "text", text };
          items.push(item);
          textByMessage.set(messageId, item);
        }
      } else if (type === "tool_use") {
        const use = block as { id?: string; name?: string; input?: unknown };
        const id = use.id ?? "";
        if (id !== "" && tools.has(id)) continue;
        const item: Extract<TurnItem, { kind: "tool" }> = {
          kind: "tool",
          id,
          name: use.name ?? "tool",
          input: summarizeInput(use.input),
          result: null,
          isError: false,
        };
        turn(line).items.push(item);
        if (id !== "") tools.set(id, item);
      }
    }
  }
  return turns;
}

/**
 * Turns on the active branch that bb does not have.
 *
 * With an anchor: the lines after it on the active branch, minus turns whose
 * prompt bb itself sent after the anchor. Anchor off the branch: the whole
 * branch, flagged `rewritten`. Without an anchor: the turns after the last
 * log prompt that matches a bb prompt (matched in order).
 */
export function diffSession(lines: readonly LogLine[], options: DiffOptions = {}): DiffResult {
  const path = activeBranch(lines);
  const bbPrompts = options.bbPrompts ?? [];
  const max = options.maxToolOutput ?? 2000;

  if (options.anchor) {
    const index = path.findIndex((line) => line.uuid === options.anchor);
    if (index < 0) return { turns: buildTurns(path, max), rewritten: true, mode: "rewritten" };
    let turns = buildTurns(path.slice(index + 1), max);
    if (bbPrompts.length > 0) {
      let next = 0;
      turns = turns.filter((turn) => {
        if (turn.prompt === null || next >= bbPrompts.length) return true;
        if (!promptMatches(turn.prompt, bbPrompts[next])) return true;
        next++;
        return false;
      });
    }
    return { turns, rewritten: false, mode: "anchor" };
  }

  let lastMatched = -1;
  let next = 0;
  for (let i = 0; i < path.length && next < bbPrompts.length; i++) {
    if (!isPrompt(path[i])) continue;
    if (promptMatches(contentText(path[i].message?.content), bbPrompts[next])) {
      lastMatched = i;
      next++;
    }
  }
  if (bbPrompts.length > 0 && lastMatched < 0) {
    return { turns: buildTurns(path, max), rewritten: true, mode: "rewritten" };
  }
  let start = path.length;
  for (let i = lastMatched + 1; i < path.length; i++) {
    if (isPrompt(path[i])) {
      start = i;
      break;
    }
  }
  if (lastMatched < 0) start = 0;
  return { turns: buildTurns(path.slice(start), max), rewritten: false, mode: "prompt-match" };
}

/** Claude Code's project folder name for a working directory. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}
