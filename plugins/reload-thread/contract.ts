// RPC contract shared by server.ts and app.tsx. The schemas are tiny
// hand-written Standard Schema objects, so the plugin needs no validator
// dependency. Outputs come from our own server, so they pass through.
import type { PluginRpcContract, StandardSchemaV1 } from "@get-bb/plugin-sdk";
import type { DiffResult, Turn } from "./session-log.ts";

function schema<T>(check: (value: unknown) => string | null = () => null): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "reload-thread",
      validate: (value) => {
        const message = check(value);
        return message === null ? { value: value as T } : { issues: [{ message }] };
      },
    },
  };
}

function stringField(name: string) {
  return (value: unknown): string | null => {
    const field = value !== null && typeof value === "object" ? (value as Record<string, unknown>)[name] : undefined;
    return typeof field === "string" && field !== "" ? null : `${name} must be a non-empty string`;
  };
}

export type ReloadResult =
  | { status: "unsupported"; providerId: string }
  | { status: "no-session" }
  | { status: "no-log"; providerThreadId: string; searched: string[] }
  | {
      status: "ok";
      threadId: string;
      providerThreadId: string;
      logPath: string;
      /** `providerCheckpointId` of bb's newest completed turn; null when there is none. */
      anchor: string | null;
      mode: DiffResult["mode"];
      rewritten: boolean;
      turns: Turn[];
      /** Oldest turns left out to keep the payload small. */
      omittedTurns: number;
      threadStatus: string;
      /** True when the thread's runtime was released so the next turn reloads the session. */
      stopped: boolean;
      stopError: string | null;
      /** Key for `snapshot`; null for a preview. */
      snapshotId: string | null;
    };

export const contract = {
  reload: {
    experimental_description: "Read Claude Code turns bb does not have and release the idle thread's runtime.",
    input: schema<{ threadId: string }>(stringField("threadId")),
    output: schema<ReloadResult>(),
  },
  preview: {
    experimental_description: "Read Claude Code turns bb does not have, without changing the thread.",
    input: schema<{ threadId: string }>(stringField("threadId")),
    output: schema<ReloadResult>(),
  },
  snapshot: {
    experimental_description: "Return a result kept by an earlier reload; null when it expired.",
    input: schema<{ snapshotId: string }>(stringField("snapshotId")),
    output: schema<ReloadResult | null>(),
  },
} as const satisfies PluginRpcContract;

export type Contract = typeof contract;
