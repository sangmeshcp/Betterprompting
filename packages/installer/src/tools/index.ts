import type { ToolDetector } from "../types.js";
import { cursor } from "./cursor.js";
import { claudeCode } from "./claudeCode.js";
import { claudeDesktop } from "./claudeDesktop.js";
import { continueDev } from "./continueDev.js";
import { aider } from "./aider.js";
import { cline } from "./cline.js";
import { zed } from "./zed.js";

export const ALL_TOOLS: ToolDetector[] = [
  claudeCode,
  claudeDesktop,
  cursor,
  continueDev,
  aider,
  cline,
  zed,
];

export function toolById(id: string): ToolDetector | undefined {
  return ALL_TOOLS.find((t) => t.id === id);
}
