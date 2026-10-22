import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  activeBranch,
  buildTurns,
  classifyUser,
  diffSession,
  parseJsonl,
  projectSlug,
  type LogLine,
} from "../session-log.ts";

function fixture(name: string): LogLine[] {
  return parseJsonl(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
}

test("parseJsonl skips blank and broken lines", () => {
  assert.equal(parseJsonl('{"type":"user"}\n\n{broken\n[1]\n{"type":"assistant"}').length, 2);
});

test("projectSlug matches Claude Code's folder names", () => {
  assert.equal(
    projectSlug("C:\\Users\\dzaky\\_Working Vault\\bb-plugin-project"),
    "C--Users-dzaky--Working-Vault-bb-plugin-project",
  );
});

test("classifyUser", () => {
  const user = (extra: Partial<LogLine>, content: unknown = "hi"): LogLine => ({
    type: "user",
    message: { role: "user", content },
    ...extra,
  });
  assert.equal(classifyUser(user({})), "prompt");
  assert.equal(classifyUser(user({ origin: { kind: "human" } })), "prompt");
  assert.equal(classifyUser(user({ promptSource: "queued" })), "prompt");
  assert.equal(classifyUser(user({ promptSource: "hook" })), "injected");
  assert.equal(classifyUser(user({ isMeta: true })), "injected");
  assert.equal(classifyUser(user({ origin: { kind: "task-notification" } })), "injected");
  assert.equal(classifyUser(user({ origin: { kind: "peer" } })), "injected");
  assert.equal(classifyUser(user({}, "<local-command-stdout>x</local-command-stdout>")), "injected");
  assert.equal(classifyUser(user({}, " <task-notification>done")), "injected");
  assert.equal(classifyUser(user({ isCompactSummary: true })), "compact_summary");
  assert.equal(
    classifyUser(user({ toolUseResult: {} }, [{ type: "tool_result", tool_use_id: "t", content: "x" }])),
    "tool_result",
  );
});

test("activeBranch follows last-prompt.leafUuid and skips dead branches", () => {
  const ids = activeBranch(fixture("branch.jsonl")).map((line) => line.uuid);
  assert.deepEqual(ids, ["u1", "a1", "u3", "a3"]);
});

test("activeBranch extends a stale last-prompt leaf to the newest descendant", () => {
  const lines: LogLine[] = [
    { type: "user", uuid: "u1", parentUuid: null, message: { content: "one" } },
    { type: "assistant", uuid: "a1", parentUuid: "u1", message: { id: "m1", content: [{ type: "text", text: "A" }] } },
    { type: "user", uuid: "u2", parentUuid: "u1", message: { content: "dead" } },
    { type: "user", uuid: "u3", parentUuid: "a1", message: { content: "two" } },
    { type: "last-prompt", leafUuid: "u3" },
    { type: "assistant", uuid: "a3", parentUuid: "u3", message: { id: "m3", content: [{ type: "text", text: "B" }] } },
    { type: "system", subtype: "stop_hook_summary", uuid: "s3", parentUuid: "a3" },
    { type: "user", uuid: "u4", parentUuid: "u2", message: { content: "later dead-branch line" } },
  ];
  assert.deepEqual(
    activeBranch(lines).map((line) => line.uuid),
    ["u1", "a1", "u3", "a3", "s3"],
  );
  assert.deepEqual(diffSession(lines, { anchor: "a3" }).turns, []);
});

test("activeBranch falls back to the last kept line without last-prompt", () => {
  const lines = fixture("branch.jsonl").filter((line) => line.type !== "last-prompt");
  assert.deepEqual(
    activeBranch(lines).map((line) => line.uuid),
    ["u1", "a1", "u3", "a3"],
  );
});

test("activeBranch crosses compaction through logicalParentUuid", () => {
  const ids = activeBranch(fixture("compact.jsonl")).map((line) => line.uuid);
  assert.deepEqual(ids, ["u1", "a1", "c1", "cs", "u2", "a2"]);
});

test("diff by anchor returns the outside turn with tools paired", () => {
  const result = diffSession(fixture("basic.jsonl"), { anchor: "a2" });
  assert.equal(result.mode, "anchor");
  assert.equal(result.rewritten, false);
  assert.equal(result.turns.length, 1);
  const [turn] = result.turns;
  assert.equal(turn.prompt, "Outside prompt in terminal");
  assert.equal(turn.timestamp, "2026-10-01T11:00:00Z");
  assert.deepEqual(turn.items, [
    { kind: "text", text: "Let me look." },
    { kind: "tool", id: "t1", name: "Bash", input: "ls -la", result: "file-a\nfile-b", isError: false },
    { kind: "text", text: "Two files." },
  ]);
});

test("diff by anchor at the leaf finds nothing", () => {
  assert.deepEqual(diffSession(fixture("basic.jsonl"), { anchor: "a5" }).turns, []);
});

test("diff by anchor drops turns bb sent after the anchor", () => {
  const result = diffSession(fixture("basic.jsonl"), { anchor: "a2", bbPrompts: ["Outside prompt in terminal"] });
  assert.deepEqual(result.turns, []);
});

test("anchor on a dead branch means history was rewritten", () => {
  const result = diffSession(fixture("branch.jsonl"), { anchor: "a2" });
  assert.equal(result.rewritten, true);
  assert.equal(result.mode, "rewritten");
  assert.deepEqual(
    result.turns.map((turn) => turn.prompt),
    ["Root prompt", "Rewound prompt"],
  );
});

test("diff without anchor matches bb prompts in order", () => {
  const result = diffSession(fixture("basic.jsonl"), { bbPrompts: ["First prompt from bb"] });
  assert.equal(result.mode, "prompt-match");
  assert.deepEqual(
    result.turns.map((turn) => turn.prompt),
    ["Outside prompt in terminal"],
  );
});

test("diff without anchor and no matching prompt flags rewritten", () => {
  const result = diffSession(fixture("basic.jsonl"), { bbPrompts: ["something else"] });
  assert.equal(result.rewritten, true);
  assert.equal(result.turns.length, 2);
});

test("compaction shows one marker, not the summary text", () => {
  const result = diffSession(fixture("compact.jsonl"), { anchor: "a1" });
  assert.equal(result.turns.length, 2);
  assert.deepEqual(result.turns[0], { prompt: null, timestamp: null, items: [{ kind: "compaction" }] });
  assert.equal(result.turns[1].prompt, "After compaction");
});

test("long tool output is truncated", () => {
  const lines: LogLine[] = [
    { type: "user", uuid: "u", parentUuid: null, message: { content: "go" } },
    {
      type: "assistant",
      uuid: "a",
      parentUuid: "u",
      message: { id: "m", content: [{ type: "tool_use", id: "t", name: "Read", input: { file_path: "/x" } }] },
    },
    {
      type: "user",
      uuid: "r",
      parentUuid: "a",
      toolUseResult: {},
      message: { content: [{ type: "tool_result", tool_use_id: "t", is_error: true, content: [{ type: "text", text: "y".repeat(50) }] }] },
    },
  ];
  const [turn] = buildTurns(lines, 10);
  const tool = turn.items[0];
  assert.equal(tool.kind, "tool");
  if (tool.kind !== "tool") return;
  assert.equal(tool.input, "/x");
  assert.equal(tool.isError, true);
  assert.equal(tool.result, `${"y".repeat(10)}… [40 more chars]`);
});
