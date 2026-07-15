export interface InstallContext {
  proxyUrl: string;          // http://127.0.0.1:8787
  openaiBase: string;        // http://127.0.0.1:8787/v1
  force: boolean;            // override existing conflicting values
  dryRun: boolean;
}

export type FileEdit =
  | {
      kind: "write";
      path: string;
      content: string;
      note?: string;
    }
  | {
      kind: "delete";
      path: string;
      note?: string;
    }
  | {
      kind: "restore";
      path: string;
      content: string | null;  // null means the file did not previously exist
      note?: string;
    };

export interface DetectorReport {
  detected: boolean;
  currentBaseUrl?: string | null;
  configPath?: string;
  notes?: string;
}

export interface ToolDetector {
  id: string;
  displayName: string;
  detect(): DetectorReport;
  plan(ctx: InstallContext, report: DetectorReport): FileEdit[];
}

export interface PlanEntry {
  toolId: string;
  displayName: string;
  status: "will-configure" | "already-configured" | "conflict" | "not-detected" | "skipped";
  edits: FileEdit[];
  note?: string;
}

export interface InstallPlan {
  ctx: InstallContext;
  entries: PlanEntry[];
  serviceEdits: FileEdit[];       // LaunchAgent / systemd / Task Scheduler
  shellEdits: FileEdit[];         // .zshrc etc.
}
