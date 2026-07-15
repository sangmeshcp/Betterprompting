import { homedir, platform } from "node:os";
import { resolve } from "node:path";

export type Platform = "darwin" | "linux" | "win32";

export function currentPlatform(): Platform {
  const p = platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "linux";
}

export function home(...parts: string[]): string {
  return resolve(homedir(), ...parts);
}

// APPDATA on Windows, XDG_CONFIG_HOME on Linux, Library on macOS.
export function appConfigDir(name: string): string {
  const p = currentPlatform();
  if (p === "darwin") return home("Library", "Application Support", name);
  if (p === "win32") {
    const appdata = process.env.APPDATA;
    return appdata ? resolve(appdata, name) : home("AppData", "Roaming", name);
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? resolve(xdg, name) : home(".config", name);
}
