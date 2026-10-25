const fs = require("node:fs"),
  path = require("node:path"),
  { PUBLIC_FILES, check } = require("./privacy-check.cjs");
check();
const root = path.resolve(__dirname, "..");
const target = path.join(root, "public-release");
if (fs.existsSync(target))
  throw new Error("public-release already exists; move it aside before generating a fresh release.");
fs.mkdirSync(target);
for (const file of PUBLIC_FILES) {
  const dest = path.join(target, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(root, file), dest);
}
console.log("Created public-release from the reviewed allowlist. No case files or browser exports included.");
