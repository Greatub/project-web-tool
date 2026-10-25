// Workflow checks: phases, moving tasks, undo/redo, archive, project deletion, versions, language.
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const html = fs.readFileSync(path.join(__dirname, "../../src/index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split("// Synchronize scroll")[0];

const nodes = new Map();
const storage = new Map();
const document = {
  documentElement: { style: { setProperty() {} } },
  getElementById(id) {
    if (!nodes.has(id)) {
      // Like real inputs, values are always strings.
      let v = "";
      nodes.set(id, {
        get value() {
          return v;
        },
        set value(next) {
          v = String(next ?? "");
        },
        textContent: "",
        innerHTML: "",
        hidden: false,
        disabled: false,
        classList: { add() {}, remove() {}, toggle() {} },
      });
    }
    return nodes.get(id);
  },
};
const localStorage = {
  get length() {
    return storage.size;
  },
  key: (i) => [...storage.keys()][i] ?? null,
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
};
const ctx = vm.createContext({
  console,
  document,
  localStorage,
  crypto,
  Date,
  Map,
  Set,
  Number,
  String,
  JSON,
  Blob,
  Response,
  DecompressionStream,
  TextEncoder,
  TextDecoder,
  Uint8Array,
  DataView,
});
vm.runInContext(script, ctx);
const run = (source) => vm.runInContext(source, ctx);
const value = (id, v) => (document.getElementById(id).value = v);

let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}

(async () => {
  run(`loadState(); renderAll = () => {}; applyStaticI18n = () => {}; renderAllKeepingFocus = () => {};
    openAppDialog = () => {}; closeAppDialog = () => {};
    setDialogError = (d, m) => { if (m) throw new Error(m); };
    askConfirm = async () => true; showMessage = async () => true;
    showError = (m) => { throw new Error(m); };
    addProject(newProject("Workflow", syntheticData())); recalculateSchedule();`);

  await test("next WBS numbers are suggested for phases and children", () => {
    assert.equal(run("suggestPhaseWbs()"), "2");
    assert.equal(run("suggestChildWbs('1', 'Main Task')"), "1.2");
    assert.equal(run("suggestChildWbs('1.1', 'Sub-task')"), "1.1.3");
  });

  await test("empty phases stay visible in the table", () => {
    run("transactionalEdit((data) => data.push({ wbs: '2', name: 'Launch', mainTasks: [] }))");
    assert.ok(run("getVisibleRows().some((r) => r.obj.wbs === '2')"));
  });

  await test("renaming a phase WBS renames its tasks and their predecessors", () => {
    run("transactionalEdit((data) => renameWbs(data, '1', '7'))");
    assert.deepEqual(run("allItems(projectData).map((x) => x.wbs)"), ["7", "7.1", "7.1.1", "7.1.2", "2"]);
    assert.equal(run("findSubtaskByWbs('7.1.2').pred"), "7.1.1");
  });

  await test("phases and tasks move up and down within their parent", () => {
    assert.equal(run("moveWithinParent('2', -1)"), true);
    assert.deepEqual(run("projectData.map((f) => f.wbs)"), ["2", "7"]);
    assert.equal(run("moveWithinParent('2', -1)"), false, "already first");
    run("moveWithinParent('7.1.2', -1)");
    assert.deepEqual(run("projectData[1].mainTasks[0].subtasks.map((s) => s.wbs)"), ["7.1.2", "7.1.1"]);
  });

  await test("a sub-task moves to another main task from the task dialog", () => {
    run("transactionalEdit((data) => data[0].mainTasks.push({ wbs: '2.1', name: 'Go live', subtasks: [] }))");
    run("openEditModal('Sub-task', '7.1.1')");
    value("mdParent", "2.1");
    run("saveModalTask()");
    assert.deepEqual(run("projectData[0].mainTasks[0].subtasks.map((s) => s.wbs)"), ["7.1.1"]);
    assert.equal(run("findSubtaskByWbs('7.1.2').pred"), "7.1.1", "dependency kept across parents");
  });

  await test("undo and redo restore data step by step", () => {
    const before = run("JSON.stringify(compactData(projectData))");
    run("inlineUpdateSubtask('7.1.1', 'days', '9')");
    assert.equal(run("findSubtaskByWbs('7.1.1').days"), 9);
    assert.equal(run("undo()"), true);
    assert.equal(run("JSON.stringify(compactData(projectData))"), before);
    assert.equal(run("redo()"), true);
    assert.equal(run("findSubtaskByWbs('7.1.1').days"), 9);
    assert.ok(run("auditLog[0].action === 'Redo'"));
  });

  await test("a failed edit records no undo step", () => {
    const depth = run("undoStack.length");
    assert.throws(() => run("inlineUpdateSubtask('7.1.1', 'start', '10/25/2026')"), /YYYY-MM-DD/);
    assert.equal(run("undoStack.length"), depth);
  });

  await test("versions accept non-Latin tags; restore and delete are undoable", async () => {
    value("verTagInput", "基线一");
    value("verAuthorInput", "PM");
    value("verNoteInput", "");
    run("confirmSaveVersion()");
    assert.equal(run("versionList[0].tag"), "基线一");
    run("inlineUpdateSubtask('7.1.1', 'pct', '80')");
    await run("restoreVersion('基线一')");
    assert.equal(run("findSubtaskByWbs('7.1.1').pct"), 25);
    run("undo()");
    assert.equal(run("findSubtaskByWbs('7.1.1').pct"), 80);
    await run("deleteVersion('基线一')");
    assert.equal(run("versionList.length"), 0);
    run("undo()");
    assert.equal(run("versionList.length"), 1);
  });

  await test("archived projects reject edits until restored", () => {
    run("toggleArchive()");
    assert.equal(run("projectMeta.archived"), true);
    assert.throws(() => run("inlineUpdateSubtask('7.1.1', 'pct', '10')"), /archived/);
    assert.equal(run("undo()"), false);
    run("toggleArchive()");
    run("inlineUpdateSubtask('7.1.1', 'pct', '10')");
    assert.equal(run("findSubtaskByWbs('7.1.1').pct"), 10);
  });

  await test("switching projects keeps the interface language and clears undo", () => {
    run("curLang = 'zh'; globalThis.firstId = projectId; addProject(newProject('Second'))");
    run("switchProject(firstId)");
    assert.equal(run("curLang"), "zh");
    assert.equal(run("undoStack.length"), 0);
    run("curLang = 'en'");
  });

  await test("deleting projects selects another project and never leaves the workspace empty", () => {
    const count = run("Object.keys(workspace.projects).length");
    run("removeProject(projectId)");
    assert.equal(run("Object.keys(workspace.projects).length"), count - 1);
    for (const id of run("Object.keys(workspace.projects)")) {
      ctx.target = id;
      run("removeProject(target)");
    }
    assert.equal(run("Object.keys(workspace.projects).length"), 1);
    assert.equal(run("projectMeta.name"), "Untitled project");
    assert.ok(JSON.parse(storage.get(run("WORKSPACE_KEY"))).projects[run("projectId")]);
  });

  console.log(checks + " workflow checks passed");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
