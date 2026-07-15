import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { home, currentPlatform } from "./paths.js";
import type { FileEdit, InstallContext } from "./types.js";

// Where the `betterprompting` binary lives. On global npm installs it's on
// PATH; on the curl installer it's ~/.betterprompting/bin/betterprompting.
// We hardcode the resolved path we know about, and fall back to "betterprompting"
// on PATH.
function betterpromptingBin(): string {
  const candidates = [
    home(".betterprompting", "bin", "betterprompting"),
    "/usr/local/bin/betterprompting",
    home(".local", "bin", "betterprompting"),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return "betterprompting";
}

export interface ServicePlan {
  edits: FileEdit[];
  activateCommand: string | null;   // shell cmd to run after write, or null if none
  deactivateCommand: string | null; // shell cmd to run before delete, or null
  humanName: string;
}

export function planService(_ctx: InstallContext): ServicePlan {
  const p = currentPlatform();
  if (p === "darwin") return planLaunchAgent();
  if (p === "linux") return planSystemdUser();
  return planWindowsTask();
}

function planLaunchAgent(): ServicePlan {
  const path = home("Library", "LaunchAgents", "com.betterprompting.proxy.plist");
  const bin = betterpromptingBin();
  const stdoutPath = home(".betterprompting", "logs", "proxy.out.log");
  const stderrPath = home(".betterprompting", "logs", "proxy.err.log");
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.betterprompting.proxy</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${stdoutPath}</string>
  <key>StandardErrorPath</key><string>${stderrPath}</string>
</dict>
</plist>
`;
  return {
    humanName: "LaunchAgent (com.betterprompting.proxy)",
    edits: [{ kind: "write", path, content, note: "LaunchAgent" }],
    activateCommand: `launchctl bootstrap gui/$UID "${path}" 2>/dev/null || launchctl load "${path}"`,
    deactivateCommand: `launchctl bootout gui/$UID "${path}" 2>/dev/null || launchctl unload "${path}" 2>/dev/null || true`,
  };
}

function planSystemdUser(): ServicePlan {
  const dir = process.env.XDG_CONFIG_HOME
    ? resolve(process.env.XDG_CONFIG_HOME, "systemd", "user")
    : home(".config", "systemd", "user");
  const path = resolve(dir, "betterprompting.service");
  const bin = betterpromptingBin();
  const content = `# Managed by \`betterprompting install\`.
[Unit]
Description=Betterprompting interceptor proxy
After=network-online.target

[Service]
Type=simple
ExecStart=${bin} start
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`;
  return {
    humanName: "systemd user unit (betterprompting.service)",
    edits: [{ kind: "write", path, content, note: "systemd user unit" }],
    activateCommand: `systemctl --user daemon-reload && systemctl --user enable --now betterprompting.service && (loginctl enable-linger "$USER" 2>/dev/null || true)`,
    deactivateCommand: `systemctl --user disable --now betterprompting.service 2>/dev/null || true`,
  };
}

function planWindowsTask(): ServicePlan {
  // We don't write a config file for the task; we register it via schtasks.
  // Represent this as a "manifest" file so uninstall knows what to remove,
  // but the real work is in the activate/deactivate commands.
  const manifestPath = home(".betterprompting", "service", "task.manifest");
  const bin = betterpromptingBin();
  const content = `betterprompting-task\n${bin}\n`;
  return {
    humanName: "Task Scheduler entry (BetterpromptingProxy)",
    edits: [{ kind: "write", path: manifestPath, content }],
    activateCommand: `schtasks /Create /F /SC ONLOGON /TN BetterpromptingProxy /TR "${bin} start"`,
    deactivateCommand: `schtasks /Delete /F /TN BetterpromptingProxy`,
  };
}

export function serviceIsInstalled(): boolean {
  const p = currentPlatform();
  if (p === "darwin")
    return existsSync(
      home("Library", "LaunchAgents", "com.betterprompting.proxy.plist")
    );
  if (p === "linux") {
    const dir = process.env.XDG_CONFIG_HOME
      ? resolve(process.env.XDG_CONFIG_HOME, "systemd", "user")
      : home(".config", "systemd", "user");
    return existsSync(resolve(dir, "betterprompting.service"));
  }
  return existsSync(home(".betterprompting", "service", "task.manifest"));
}

// Utility for a nicer status message.
export function readServicePath(): string | null {
  const p = currentPlatform();
  if (p === "darwin") {
    const path = home("Library", "LaunchAgents", "com.betterprompting.proxy.plist");
    return existsSync(path) ? path : null;
  }
  if (p === "linux") {
    const path = process.env.XDG_CONFIG_HOME
      ? resolve(process.env.XDG_CONFIG_HOME, "systemd", "user", "betterprompting.service")
      : home(".config", "systemd", "user", "betterprompting.service");
    return existsSync(path) ? path : null;
  }
  const path = home(".betterprompting", "service", "task.manifest");
  return existsSync(path) ? path : null;
}

// Suppress an unused-import warning by re-exporting readFileSync where useful.
export { readFileSync as _readFileSync };
