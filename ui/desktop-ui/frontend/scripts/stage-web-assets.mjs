import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(frontendRoot, "..", "web");
const defaultDistRoot = path.resolve(os.tmpdir(), "epydios-agentops-desktop", "frontend-dist");
const distRoot = process.env.EPYDIOS_STAGE_WEB_DIST
  ? path.resolve(process.env.EPYDIOS_STAGE_WEB_DIST)
  : defaultDistRoot;

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });
fs.cpSync(sourceRoot, distRoot, { recursive: true });

console.log(`staged ${sourceRoot} -> ${distRoot}`);
