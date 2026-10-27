// Storage, save-failure, people-matrix and translation checks for the built single-file app.
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const html = fs.readFileSync(path.join(__dirname, "../../src/index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split("// Synchronize scroll")[0];

const nodes = new Map();
const storage = new Map();
let failWrites = false;
const document = {
  documentElement: { style: { setProperty() {} } },
  getElementById(id) {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value: "",
        textContent: "",
        innerHTML: "",
        hidden: true,
        className: "",
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
  setItem(k, v) {
    if (failWrites) throw new Error("quota exceeded");
    storage.set(k, String(v));
  },
};
const alerts = [];
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
  alert: (m) => alerts.push(m),
  confirm: () => true,
});
vm.runInContext(script, ctx);
const run = (source) => vm.runInContext(source, ctx);

let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}

// A deterministic project with dependencies, roll-ups and several groups.
function bigProject(families, mains, subs) {
  ctx.size = { families, mains, subs };
  run(`globalThis.makeData = () => {
    const data = [];
    for (let f = 1; f <= size.families; f++) {
      const family = { wbs: String(f), name: "Phase " + f, mainTasks: [] };
      for (let m = 1; m <= size.mains; m++) {
        const main = { wbs: f + "." + m, name: "Main " + m, subtasks: [] };
        for (let s = 1; s <= size.subs; s++) {
          main.subtasks.push({
            wbs: f + "." + m + "." + s, name: "A reasonably descriptive task name " + s,
            pred: s > 1 ? f + "." + m + "." + (s - 1) : "", lag: s % 3 === 0 ? -1 : 0, prio: 2,
            start: s > 1 ? "" : "2030-01-0" + (1 + (m % 9)), days: 3, pct: 10 * (s % 5),
            group1: "Person A; Person B", group2: "Person C", group3: "",
          });
        }
        family.mainTasks.push(main);
      }
      data.push(family);
    }
    return data;
  }`);
}

(async () => {
  run("loadState(); renderAll = () => {}; applyStaticI18n = () => {};");
  // Dialogs need a real browser; the smoke test covers them. Here they confirm and surface errors.
  run(`openAppDialog = () => {}; closeAppDialog = () => {};
    setDialogError = (d, m) => { if (m) throw new Error(m); };
    askConfirm = async () => true; showMessage = async () => true;
    renderProjectControls = () => updateSaveBanner();
    showError = (m) => { throw new Error(m); };`);

  await test("compacted copies drop derived fields but recalculate to identical schedules", () => {
    bigProject(2, 3, 5);
    run("globalThis.full = makeData(); recalculateSchedule(full, '2030-01-10');");
    run("globalThis.compact = compactData(full);");
    const sub = run("JSON.stringify(compact[0].mainTasks[0].subtasks[1])");
    for (const derived of ['"finish"', '"status"', '"group4"']) assert.ok(!sub.includes(derived), derived);
    assert.equal(run("compact[0].mainTasks[0].subtasks[1].start"), "", "dependent start is derived");
    assert.ok(!run("JSON.stringify(compact[0])").includes('"leadersList"'));
    run("recalculateSchedule(compact, '2030-01-10')");
    // Same dates, statuses, roll-ups and people as the full copy (empty group fields are simply omitted).
    assert.equal(run("stableJSON(groupExchangeRows(compact))"), run("stableJSON(groupExchangeRows(full))"));
  });

  await test("version snapshots are stored compacted and still drive baseline comparison", () => {
    run(
      "projectData = makeData(); recalculateSchedule(); openVersionModal(); document.getElementById('verTagInput').value = 'V1.0'; confirmSaveVersion();",
    );
    assert.ok(!run("JSON.stringify(versionList[0].data)").includes('"finish"'));
    assert.equal(
      run("buildTaskLookupMap(versionList[0].data).get('1.1.5').item.finish"),
      run("findSubtaskByWbs('1.1.5').finish"),
    );
  });

  await test("recovery points keep data only and restore without rolling back versions", async () => {
    run("excelRecoveryPoints = [recoveryEntry(currentBundle())]; saveState();");
    const point = run("excelRecoveryPoints[0].bundle");
    assert.equal(point.versionHistory.length, 0);
    assert.equal(point.auditLog.length, 0);
    assert.equal(point.recoveryPoints, undefined);
    run(
      "projectData[0].name = 'Renamed after import'; versionList.unshift(compactVersion({ tag: 'V1.1', time: today(), author: 'Demo', note: '', span: '', progress: '', data: copy(projectData) })); saveState();",
    );
    await run("restoreExcelRecovery()");
    assert.equal(run("projectData[0].name"), "Phase 1");
    assert.equal(run("versionList.map((v) => v.tag).join()"), "V1.1,V1.0");
    assert.ok(run("projectData[0].finish"), "restored data is recalculated");
  });

  await test("old full recovery points and snapshots are compacted when a project loads", () => {
    run(`globalThis.legacy = currentBundle();
      legacy.versionHistory = [{ tag: 'Old', time: today(), author: 'Demo', note: '', data: copy(projectData) }];
      legacy.recoveryPoints = [{ time: today(), bundle: { ...copy(legacy), recoveryPoints: undefined } }];
      delete legacy.recoveryPoints[0].bundle.recoveryPoints;
      selectBundle(legacy);`);
    assert.equal(run("excelRecoveryPoints[0].bundle.versionHistory.length"), 0);
    assert.ok(!run("JSON.stringify(versionList[0].data)").includes('"status"'));
  });

  await test("800 sub-tasks with 5 snapshots and 3 recovery points stay well under the storage limit", () => {
    bigProject(10, 10, 8);
    run("projectData = makeData(); versionList = []; excelRecoveryPoints = []; recalculateSchedule();");
    for (let i = 0; i < 5; i++) {
      run(`versionList.unshift(compactVersion({ tag: 'S${i}', time: today(), author: 'Demo', note: '', span: '', progress: '', data: copy(projectData) }));
        excelRecoveryPoints = [recoveryEntry(currentBundle()), ...excelRecoveryPoints].slice(0, 3);`);
      assert.equal(run("saveState()"), true);
    }
    const chars = storage.get(run("WORKSPACE_KEY")).length;
    // The previous format reached the 5 MB limit at this size; require at least 50% headroom.
    assert.ok(chars < 2.5 * 1024 * 1024, "workspace uses " + chars + " characters");
    assert.ok(run("storageUsage().ratio") < 0.5);
  });

  await test("save failures show a persistent banner until a save succeeds", () => {
    alerts.length = 0;
    failWrites = true;
    run("projectData[0].name = 'Edited while full'; saveState();");
    const banner = nodes.get("saveBanner");
    assert.equal(banner.hidden, false);
    assert.match(banner.className, /save-banner-error/);
    assert.match(banner.innerHTML, /retrySave\(\)/);
    assert.match(banner.innerHTML, /exportVersionBundle\(\)/);
    const since = run("unsavedSince");
    run("saveState(); recordAudit('1', 'edit', 'second failure');");
    assert.equal(banner.hidden, false, "banner stays for later failures");
    assert.equal(run("unsavedSince"), since, "keeps the time of the first unsaved change");
    assert.equal(alerts.length, 0, "no blocking alerts");
    failWrites = false;
    run("retrySave()");
    assert.equal(banner.hidden, true);
    assert.equal(run("lastSaveError"), "");
  });

  await test("high storage usage shows a warning banner", () => {
    storage.set("other-app", "x".repeat(4.5 * 1024 * 1024));
    run("otherStorageChars = null; saveState();");
    const banner = nodes.get("saveBanner");
    assert.equal(banner.hidden, false);
    assert.match(banner.className, /save-banner-warning/);
    storage.delete("other-app");
    run("otherStorageChars = null; saveState();");
    assert.equal(banner.hidden, true);
  });

  await test("people matrix header has one column per body cell", () => {
    run("selectBundle(newProject('Matrix', syntheticData())); recalculateSchedule(); renderPeopleView();");
    const table = nodes.get("raciMatrixTable").innerHTML;
    const headers = (table.match(/<thead>[\s\S]*<\/thead>/)[0].match(/<th>/g) || []).length;
    const firstRow = table.match(/<tbody>([\s\S]*?)<\/tr>/)[1];
    const cells = (firstRow.match(/<td[ >]/g) || []).length;
    assert.equal(cells, headers);
  });

  await test("JSON download receipts survive reload, ignore view preferences and detect later changes", async () => {
    run(`addProject(newProject('Backup example', syntheticData())); recalculateSchedule();
      downloadBlob = (content, filename) => { globalThis.lastDownload = {content, filename}; };`);
    assert.equal(await run("exportVersionBundle()"), true);
    assert.match(run("lastDownload.filename"), /\.json$/);
    assert.equal(run("JSON.parse(lastDownload.content).projectId"), run("projectId"));
    const receipt = JSON.parse(storage.get(run("BACKUP_RECEIPT_PREFIX + projectId")));
    assert.match(receipt.revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(receipt).sort(), ["at", "revision"]);
    run("loadState(); recalculateSchedule();");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /matches current data/);
    const originalRevision = await run("backupRevision(currentBundle())");
    run("projectSettings.personAliases.collapsed = 'Example alias';");
    assert.notEqual(await run("backupRevision(currentBundle())"), originalRevision);
    run("delete projectSettings.personAliases.collapsed;");
    run("projectData[0].collapsed = true; curLang = 'zh'; saveState();");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /与当前数据一致/);
    run("curLang = 'en'; projectData[0].name = 'Changed phase'; saveState();");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /Changed since/);
    run("loadState();");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /Changed since/);
  });

  await test("save timestamps stay stable for redraws and update only with meaningful project changes", () => {
    run("workspace.savedAt[projectId] = '2030-01-01T00:00:00.000Z'; saveState();");
    assert.equal(run("workspace.savedAt[projectId]"), "2030-01-01T00:00:00.000Z");
    run("projectData[0].name = 'Updated phase'; saveState();");
    assert.notEqual(run("workspace.savedAt[projectId]"), "2030-01-01T00:00:00.000Z");
  });

  await test("backup receipts are project-scoped and partial exports never mark a full backup", async () => {
    run("globalThis.backedUpId = projectId; addProject(newProject('Another example', syntheticData())); recalculateSchedule();");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /No JSON backup/);
    run("buildProjectXML();");
    assert.equal(storage.has(run("BACKUP_RECEIPT_PREFIX + projectId")), false);
    run("switchProject(backedUpId);");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /Changed since/);
  });

  await test("failed downloads do not record a receipt; backup remains available without hashing or receipt storage", async () => {
    run(`addProject(newProject('Download example')); downloadBlob = () => { throw new Error('Download blocked'); };
      showError = (message) => { globalThis.exportError = message; };`);
    assert.equal(await run("exportVersionBundle()"), false);
    assert.match(run("exportError"), /Download blocked/);
    assert.equal(storage.has(run("BACKUP_RECEIPT_PREFIX + projectId")), false);
    run("downloadBlob = () => {}; globalThis.realBackupRevision = backupRevision; backupRevision = async () => { throw new Error('No crypto'); };");
    assert.equal(await run("exportVersionBundle()"), true);
    assert.equal(storage.has(run("BACKUP_RECEIPT_PREFIX + projectId")), false);
    run("backupRevision = realBackupRevision;");
    failWrites = true;
    assert.equal(await run("exportVersionBundle()"), true);
    failWrites = false;
    assert.equal(storage.has(run("BACKUP_RECEIPT_PREFIX + projectId")), false);
  });

  await test("async backup uses captured content and cannot mark another project or newer edits as backed up", async () => {
    run(`globalThis.capturedId = projectId;
      backupRevision = (bundle) => new Promise(resolve => { globalThis.releaseDigest = async () => resolve(await realBackupRevision(bundle)); });
      globalThis.pendingBackup = exportVersionBundle();
      projectData = syntheticData(); saveState();
      addProject(newProject('Switched project'));`);
    await run("releaseDigest()");
    assert.equal(await run("pendingBackup"), true);
    assert.equal(storage.has(run("BACKUP_RECEIPT_PREFIX + projectId")), false);
    assert.equal(storage.has(run("BACKUP_RECEIPT_PREFIX + capturedId")), true);
    run("backupRevision = realBackupRevision; switchProject(capturedId);");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /Changed since/);
  });

  await test("failed saves override backup status and malformed receipts never claim backup success", async () => {
    storage.set(run("BACKUP_RECEIPT_PREFIX + projectId"), "broken");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /Backup status unavailable/);
    failWrites = true;
    run("saveState()");
    await run("updateDataSafetyStatus()");
    assert.match(nodes.get("dataSafetyStatus").textContent, /not safely saved/);
    failWrites = false;
    run("saveState()");
  });

  await test("import failures retain file and location, escape content and offer targeted repair and retry", async () => {
    run("showDialog = async options => { globalThis.capturedDialog = options; return null; };");
    await run(`showImportFailure({name:'<example>.xlsx'}, Object.assign(inputError('msgCellContainsAFormulaPasteValues', 'H9'), {location:'Plan'}))`);
    const body = run("capturedDialog.bodyHtml");
    assert.match(body, /&lt;example&gt;\.xlsx/);
    assert.match(body, /Plan/);
    assert.match(body, /H9/);
    assert.match(body, /replace the formula with its value/);
    assert.match(body, /not applied/);
    assert.equal(run("capturedDialog.actions[1].label"), "Choose corrected file");
    assert.equal(run(`importRepairKey({name:'plan.xlsx'}, inputError('msgThisWorkbookIsStaleWebData'))`), "guideFixStale");
    assert.equal(run(`importRepairKey({name:'plan.xlsx'}, inputError('msgWorkbookProjectIdDoesNotMatch'))`), "guideFixProject");
    assert.equal(run(`importRepairKey({name:'plan.mpp'}, inputError('mspUseXml'))`), "guideFixFormat");
    const before = storage.get(run("WORKSPACE_KEY"));
    await run(`handleFileImport({target:{files:[{name:'bad.json',text:async()=>'{invalid'}],value:'bad.json'}})`);
    assert.equal(storage.get(run("WORKSPACE_KEY")), before);
    assert.match(run("capturedDialog.bodyHtml"), /intact JSON bundle/);
  });

  await test("every translation key used in the app exists in English and Chinese", () => {
    const sources = path.join(__dirname, "../../src/app/js");
    const code = fs
      .readdirSync(sources)
      .map((f) => fs.readFileSync(path.join(sources, f), "utf8"))
      .join("\n");
    const used = new Set();
    for (const m of code.matchAll(/\b(?:t|inputError|exchangeFail)\(\s*"([A-Za-z0-9_]+)"(?!\s*\+)/g))
      used.add(m[1]);
    for (const m of code.matchAll(/\bfail\(\s*r,\s*[^,]+,\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of code.matchAll(/^\s*"((?:lbl|btn)[A-Za-z]+)",$/gm)) used.add(m[1]);
    const en = new Set(run("Object.keys(I18N.en)"));
    const zh = new Set(run("Object.keys(I18N.zh)"));
    assert.deepEqual(
      [...en].filter((k) => !zh.has(k)),
      [],
      "keys missing in Chinese",
    );
    assert.deepEqual(
      [...zh].filter((k) => !en.has(k)),
      [],
      "keys missing in English",
    );
    assert.deepEqual(
      [...used].filter((k) => !en.has(k)),
      [],
      "keys missing in dictionary",
    );
    assert.ok(!/\bwords\(/.test(code), "use t(key) instead of inline language pairs");
    run("curLang = 'zh'");
    assert.equal(run("t('msgDuplicateWbs', 'A.1')"), "WBS 编号重复：A.1");
    run("curLang = 'en'");
  });

  console.log(checks + " storage and translation checks passed");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
