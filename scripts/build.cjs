// Builds the single-file offline app (src/index.html) from the readable sources in src/app/.
// Usage: node scripts/build.cjs          write src/index.html
//        node scripts/build.cjs --check  fail if src/index.html is out of date
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = path.join(root, "src", "app");
const output = path.join(root, "src", "index.html");
// Order matters only for top-level constants that reference each other; boot.js must stay last.
const SCRIPTS = [
  "i18n",
  "model",
  "storage",
  "dialogs",
  "exchange",
  "views",
  "history",
  "editing",
  "boot",
].map((name) => `js/${name}.js`);
const SOURCES = ["shell.html", "styles.css", ...SCRIPTS];

function read(file) {
  return fs.readFileSync(path.join(app, file), "utf8").replace(/\r\n/g, "\n");
}

function build() {
  const shell = read("shell.html");
  const styles = read("styles.css");
  const scripts = SCRIPTS.map((file) => `// ---- src/app/${file} ----\n${read(file).trimEnd()}\n`).join("\n");
  if (/<\/(script|style)[\s>]/i.test(styles + scripts))
    throw new Error("Sources must not contain closing script/style tags");
  for (const marker of ["/* @build:styles */", "/* @build:scripts */"]) {
    if (shell.split(marker).length !== 2)
      throw new Error("shell.html must contain " + marker + " exactly once");
  }
  return shell
    .replace("/* @build:styles */", () => styles.trimEnd())
    .replace("/* @build:scripts */", () => scripts.trimEnd());
}

if (require.main === module) {
  const html = build();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
    if (current !== html) {
      console.error("src/index.html is out of date. Run: npm run build");
      process.exitCode = 1;
    } else console.log("src/index.html matches src/app sources.");
  } else {
    fs.writeFileSync(output, html);
    console.log(
      "Built src/index.html (" + Math.round(html.length / 1024) + " KB) from " + SOURCES.length + " sources.",
    );
  }
}

module.exports = { build, SOURCES: SOURCES.map((file) => "src/app/" + file) };
