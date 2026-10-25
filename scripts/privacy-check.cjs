const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const PUBLIC_FILES = [
  ".gitignore",
  "README.md",
  "package.json",
  "src/index.html",
  "src/app/shell.html",
  "src/app/styles.css",
  "src/app/js/i18n.js",
  "src/app/js/model.js",
  "src/app/js/storage.js",
  "src/app/js/dialogs.js",
  "src/app/js/exchange.js",
  "src/app/js/views.js",
  "src/app/js/history.js",
  "src/app/js/editing.js",
  "src/app/js/boot.js",
  "docs/PUBLIC.md",
  "docs/STATUS.md",
  "scripts/build.cjs",
  "scripts/privacy-check.cjs",
  "scripts/release.cjs",
  "tests/public/core.cjs",
  "tests/public/excel.cjs",
  "tests/public/storage.cjs",
  "tests/public/workflow.cjs",
  "tests/e2e/smoke.cjs",
  ".githooks/pre-commit",
  ".githooks/pre-push",
  ".github/workflows/check.yml",
];
function inspect(files, read) {
  const errors = [];
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
    /\bAKIA[A-Z0-9]{16}\b/,
    /\bsk-[A-Za-z0-9_-]{24,}\b/,
    /[A-Z]:[\\/]Users[\\/][^\s"'<>]+/i,
    /(?:^|[\s"'(=])\/(?:Users|home)\/[A-Za-z0-9._-]+\//,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  ];
  const blocked = new Set([
    "1f6899a9cbf8930d0527f900fae9c217b747bdefbd359e14116e4c6fe966ca04",
    "00c05d494bfe497388ea7a42a436790fc92228f4344fd25a06041235fa40277b",
  ]);
  const hasBlockedFragment = (content) => {
    for (const word of content.toLowerCase().match(/[a-z0-9_]+/g) || [])
      for (const n of [3, 4])
        for (let i = 0; i <= word.length - n; i++)
          if (
            blocked.has(
              crypto
                .createHash("sha256")
                .update(word.slice(i, i + n))
                .digest("hex"),
            )
          )
            return true;
    return false;
  };
  for (const file of files) {
    if (!PUBLIC_FILES.includes(file)) {
      errors.push(file + ": outside public allowlist");
      continue;
    }
    const content = read(file);
    if (content.includes("\0")) {
      errors.push(file + ": binary file forbidden");
      continue;
    }
    let decoded = content;
    // Older revisions embedded an escaped Excel template; decode it so history scans see its text.
    const embedded = file === "src/index.html" && content.match(/const EXCEL_MASTER_PARTS=(\{.*?\});/);
    if (embedded) decoded += "\n" + Object.values(JSON.parse(embedded[1])).join("\n");
    if (patterns.some((p) => p.test(decoded)))
      errors.push(file + ": potential credential, email or local user path");
    if (hasBlockedFragment(decoded)) errors.push(file + ": prohibited source identifier detected");
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return files.length;
}
function check(mode) {
  let files = PUBLIC_FILES,
    read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  if (mode === "--history") {
    const commits = cp
      .execFileSync("git", ["rev-list", "--all"], { cwd: root, encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    let total = 0;
    for (const commit of commits) {
      const paths = cp
        .execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", commit], { cwd: root, encoding: "utf8" })
        .split("\0")
        .filter(Boolean);
      total += inspect(paths, (f) =>
        cp.execFileSync("git", ["show", commit + ":" + f], { cwd: root, encoding: "utf8" }),
      );
    }
    console.log("Privacy history gate passed: " + commits.length + " commits, " + total + " file revisions.");
    return total;
  }
  if (mode === "--staged" || mode === "--tracked") {
    const args =
      mode === "--staged"
        ? ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]
        : ["ls-files", "-z"];
    files = cp.execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
    read = (f) => cp.execFileSync("git", ["show", ":" + f], { cwd: root, encoding: "utf8" });
  }
  const count = inspect(files, read);
  console.log("Privacy gate passed: " + count + " public files.");
  return count;
}
if (require.main === module) {
  try {
    check(process.argv[2]);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
module.exports = { PUBLIC_FILES, inspect, check };
