// AGPL-3.0 §6/§13: users of the deployed app must be able to get the corresponding source.
// Packs the committed repository (HEAD) into public/source.zip so every deploy ships its own source.
import { execSync } from "node:child_process";
const root = execSync("git rev-parse --show-toplevel").toString().trim();
execSync(`git -C "${root}" archive --format=zip -o "${root}/web/public/source.zip" HEAD`);
console.log("Wrote public/source.zip from", execSync(`git -C "${root}" rev-parse --short HEAD`).toString().trim());
