import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import type {
  FileEdit,
  InstallContext,
  InstallPlan,
  PlanEntry,
} from "./types.js";
import { ALL_TOOLS } from "./tools/index.js";
import { planShellEdits } from "./shell.js";
import { planService, readServicePath, serviceIsInstalled } from "./service.js";
import { readState, recordTouch, writeState } from "./state.js";

function runShellCommand(cmd: string): void {
  if (platform() === "win32") {
    execFileSync("cmd.exe", ["/c", cmd], { stdio: "inherit" });
  } else {
    execFileSync("sh", ["-c", cmd], { stdio: "inherit" });
  }
}

export * from "./types.js";
export { ALL_TOOLS, toolById } from "./tools/index.js";

export interface BuildPlanOpts {
  proxyHost?: string;
  proxyPort?: number;
  only?: string[];
  force?: boolean;
  dryRun?: boolean;
  skipService?: boolean;
}

export function buildPlan(opts: BuildPlanOpts = {}): InstallPlan {
  const host = opts.proxyHost ?? "127.0.0.1";
  const port = opts.proxyPort ?? 8787;
  const ctx: InstallContext = {
    proxyUrl: `http://${host}:${port}`,
    openaiBase: `http://${host}:${port}/v1`,
    force: Boolean(opts.force),
    dryRun: Boolean(opts.dryRun),
  };

  const selectedIds = opts.only?.length
    ? new Set(opts.only)
    : new Set(ALL_TOOLS.map((t) => t.id));

  const entries: PlanEntry[] = [];
  for (const tool of ALL_TOOLS) {
    if (!selectedIds.has(tool.id)) {
      entries.push({
        toolId: tool.id,
        displayName: tool.displayName,
        status: "skipped",
        edits: [],
        note: "not selected (--only)",
      });
      continue;
    }
    const report = tool.detect();
    if (!report.detected) {
      entries.push({
        toolId: tool.id,
        displayName: tool.displayName,
        status: "not-detected",
        edits: [],
      });
      continue;
    }

    const existing = report.currentBaseUrl ?? null;
    const alreadyOurs = existing === ctx.proxyUrl || existing === ctx.openaiBase;
    const foreignExisting = existing && !alreadyOurs;

    if (alreadyOurs) {
      entries.push({
        toolId: tool.id,
        displayName: tool.displayName,
        status: "already-configured",
        edits: [],
        note: report.configPath ? `already points to ${existing}` : undefined,
      });
      continue;
    }
    if (foreignExisting && !ctx.force) {
      entries.push({
        toolId: tool.id,
        displayName: tool.displayName,
        status: "conflict",
        edits: [],
        note: `existing baseURL "${existing}" left in place. Re-run with --force to override.`,
      });
      continue;
    }

    entries.push({
      toolId: tool.id,
      displayName: tool.displayName,
      status: "will-configure",
      edits: tool.plan(ctx, report),
      note: report.notes,
    });
  }

  const shellEdits = planShellEdits(ctx);
  const serviceEdits = opts.skipService ? [] : planService(ctx).edits;

  return { ctx, entries, serviceEdits, shellEdits };
}

export interface ApplyResult {
  written: string[];
  deleted: string[];
  serviceActivated: boolean;
}

export function apply(plan: InstallPlan, opts: BuildPlanOpts = {}): ApplyResult {
  let state = readState();
  const written: string[] = [];
  const deleted: string[] = [];

  const applyEdit = (edit: FileEdit, toolId: string) => {
    if (edit.kind === "write") {
      state = recordTouch(state, edit.path, toolId);
      mkdirSync(dirname(edit.path), { recursive: true });
      writeFileSync(edit.path, edit.content, "utf8");
      written.push(edit.path);
    } else if (edit.kind === "delete") {
      state = recordTouch(state, edit.path, toolId);
      if (existsSync(edit.path)) unlinkSync(edit.path);
      deleted.push(edit.path);
    }
  };

  for (const entry of plan.entries) {
    for (const edit of entry.edits) applyEdit(edit, entry.toolId);
  }
  for (const edit of plan.shellEdits) applyEdit(edit, "shell");
  for (const edit of plan.serviceEdits) applyEdit(edit, "service");

  let serviceActivated = false;
  if (plan.serviceEdits.length) {
    const svc = planService(plan.ctx);
    if (svc.activateCommand) {
      try {
        runShellCommand(svc.activateCommand);
        serviceActivated = true;
        state = { ...state, serviceInstalled: true };
      } catch {
        // Best-effort: leave the files in place, user can activate manually.
      }
    } else {
      state = { ...state, serviceInstalled: true };
    }
  }

  writeState(state);
  return { written, deleted, serviceActivated };
}

export interface RevertResult {
  restored: string[];
  removed: string[];
  serviceDeactivated: boolean;
}

export function revert(): RevertResult {
  const state = readState();
  const restored: string[] = [];
  const removed: string[] = [];

  // Deactivate the service FIRST so we don't leave a running process pointing
  // at files we're about to delete.
  let serviceDeactivated = false;
  if (state.serviceInstalled) {
    const svc = planService({
      proxyUrl: "",
      openaiBase: "",
      force: false,
      dryRun: false,
    });
    if (svc.deactivateCommand) {
      try {
        runShellCommand(svc.deactivateCommand);
        serviceDeactivated = true;
      } catch {
        /* ignore */
      }
    }
  }

  // Reverse touches in reverse order so nested-directory writes come off
  // before their parents. We trust the recorded pre-install content
  // byte-for-byte — it's the only way to guarantee an exact restore.
  // Sentinel / fenced-block stripping is kept as a fallback for state files
  // that were manually cleared.
  for (const t of [...state.touched].reverse()) {
    if (t.previousContent === null) {
      if (existsSync(t.path)) {
        unlinkSync(t.path);
        removed.push(t.path);
      }
      continue;
    }
    mkdirSync(dirname(t.path), { recursive: true });
    writeFileSync(t.path, t.previousContent, "utf8");
    restored.push(t.path);
  }

  writeState({ version: 1, touched: [], serviceInstalled: false });
  return { restored, removed, serviceDeactivated };
}

export function currentStatus(): {
  serviceInstalled: boolean;
  servicePath: string | null;
  touchedCount: number;
} {
  const state = readState();
  return {
    serviceInstalled: serviceIsInstalled(),
    servicePath: readServicePath(),
    touchedCount: state.touched.length,
  };
}

// Human-readable summary of an install plan for the CLI.
export function summarize(plan: InstallPlan): string {
  const lines: string[] = [];
  lines.push(`Proxy URL: ${plan.ctx.proxyUrl}`);
  lines.push(`OpenAI base URL: ${plan.ctx.openaiBase}`);
  lines.push("");
  lines.push("Tools:");
  for (const e of plan.entries) {
    const marker = statusMarker(e.status);
    lines.push(`  ${marker} ${e.displayName.padEnd(20)} ${e.note ?? ""}`);
    for (const edit of e.edits) {
      lines.push(`      → ${edit.kind} ${edit.path}${edit.note ? "  (" + edit.note + ")" : ""}`);
    }
  }
  if (plan.shellEdits.length) {
    lines.push("");
    lines.push("Shell exports:");
    for (const edit of plan.shellEdits) {
      lines.push(`  → ${edit.kind} ${edit.path}`);
    }
  }
  if (plan.serviceEdits.length) {
    lines.push("");
    lines.push("Auto-start service:");
    for (const edit of plan.serviceEdits) {
      lines.push(`  → ${edit.kind} ${edit.path}`);
    }
  }
  return lines.join("\n");
}

function statusMarker(s: PlanEntry["status"]): string {
  switch (s) {
    case "will-configure": return "[+]";
    case "already-configured": return "[=]";
    case "conflict": return "[!]";
    case "not-detected": return "[ ]";
    case "skipped": return "[-]";
  }
}
