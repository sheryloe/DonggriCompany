import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const directories = [
  path.join(ROOT, "coverage"),
  path.join(ROOT, "coverage", "api"),
  path.join(ROOT, "coverage", "web"),
];

for (const directory of directories) {
  fs.mkdirSync(directory, { recursive: true });
}
