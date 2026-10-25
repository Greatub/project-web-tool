const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../../src/index.html"), "utf8"),
  script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split("// Synchronize scroll")[0];
const nodes = new Map(),
  storage = new Map();
let failWrites = false,
  checks = 0;
const document = {
  documentElement: { style: { setProperty() {} } },
  getElementById(id) {
    if (!nodes.has(id))
      nodes.set(id, {
        value: "",
        textContent: "",
        innerHTML: "",
        classList: { add() {}, remove() {}, toggle() {} },
      });
    return nodes.get(id);
  },
};
const ctx = vm.createContext({
  console,
  document,
  localStorage: {
    getItem: (k) => storage.get(k) || null,
    setItem(k, v) {
      if (failWrites) throw new Error("quota");
      storage.set(k, v);
    },
  },
  crypto,
  alert() {},
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
const run = (s) => vm.runInContext(s, ctx);
async function test(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}
run(
  'loadState();renderAll=()=>{};applyStaticI18n=()=>{};addProject(newProject("Fictional contract project",syntheticData()));recalculateSchedule();',
);
function payload(mode = "update") {
  run(
    `globalThis.fixture={meta:{format:EXCHANGE_FORMAT,version:2,mode:${JSON.stringify(mode)},projectId:${mode === "update" ? "projectId" : "null"},baseRevision:null,columns:copy(EXCEL_HEADERS),newColumns:copy(NEW_TASK_HEADERS)},plan:${mode === "update" ? "copy(exchangeRows())" : "[copy(EXCEL_HEADERS)]"},newTasks:[copy(NEW_TASK_HEADERS)],project:[['Field','Value'],['Project Name','Fictional import'],['Status Date','2030-01-15']]}`,
  );
}
(async () => {
  await test("v2 creation supports out-of-order explicit parents and FS scheduling", () => {
    payload("create");
    run(
      `fixture.newTasks.push(['X.1.1','Sub-task','New task','','0','2','2030-01-01','',3,0.25,'','Demo Person A','','','X.1'],['X.1','Main Task','New delivery','','','','','','','','','','','','X'],['X','Family','New phase','','','','','','','','','','','','']);globalThis.created=prepareExchangeCandidate(fixture,exchangeBase())`,
    );
    assert.equal(run("created.candidate.currentData[0].mainTasks[0].subtasks[0].pct"), 25);
    assert.equal(run("created.added"), 3);
    assert.equal(run("created.candidate.projectId===projectId"), false);
  });
  await test("v2 changes editable names, personnel and durations without changing source", () => {
    payload();
    const before = run("stableJSON(exchangeBase())");
    run(
      `fixture.plan[1][2]='Renamed phase';fixture.plan[3][8]=5;fixture.plan[3][11]='Demo Person C';globalThis.updated=prepareExchangeCandidate(fixture,exchangeBase())`,
    );
    assert.equal(run("updated.candidate.currentData[0].name"), "Renamed phase");
    assert.ok(run('updated.changes.some(c=>c.field==="Delivery Date")'));
    assert.equal(run("stableJSON(exchangeBase())"), before);
  });
  await test("all read-only edits and missing original rows are refused", () => {
    for (const [row, col, value] of [
      [1, 0, "other"],
      [1, 8, 999],
      [3, 7, "2030-05-01"],
      [3, 10, "done"],
      [4, 6, "2030-05-01"],
    ]) {
      payload();
      ctx.change = { row, col, value };
      run("fixture.plan[change.row][change.col]=change.value");
      assert.throws(() => run("prepareExchangeCandidate(fixture,exchangeBase())"));
    }
    payload();
    run("fixture.plan.splice(1,1)");
    assert.throws(() => run("prepareExchangeCandidate(fixture,exchangeBase())"));
  });
  await test("wrong project, version, column mapping and invalid hierarchy refuse whole batch", () => {
    for (const expression of [
      'fixture.meta.projectId="other"',
      "fixture.meta.version=99",
      'fixture.meta.columns[0]="ID"',
      `fixture.newTasks.push(['X','Main Task','Bad parent','','','','','','','','','','','','missing'])`,
    ]) {
      payload();
      run(expression);
      assert.throws(() => run("prepareExchangeCandidate(fixture,exchangeBase())"));
    }
  });
  await test("duplicate new identifiers and predecessor cycles are refused", () => {
    payload();
    run(`fixture.newTasks.push(['1.1.1','Sub-task','Duplicate','','','','','','','','','','','','1.1'])`);
    assert.throws(() => run("prepareExchangeCandidate(fixture,exchangeBase())"));
    payload();
    run(`fixture.plan[3][3]='1.1.2'`);
    assert.throws(() => run("prepareExchangeCandidate(fixture,exchangeBase())"));
  });
  await test("unintended numeric percent, invalid date and fractional Lag reject", () => {
    for (const [col, value] of [
      [9, 25],
      [6, "2030-02-30"],
      [4, 1.5],
    ]) {
      payload();
      ctx.change = { col, value };
      run("fixture.plan[3][change.col]=change.value");
      assert.throws(() => run("prepareExchangeCandidate(fixture,exchangeBase())"));
    }
  });
  await test("Project status date accepts typed Excel dates and rejects time fractions", () => {
    payload();
    run("fixture.project[2][1]=Date.UTC(2030,0,15)/86400000-Date.UTC(1899,11,30)/86400000");
    assert.equal(
      run("prepareExchangeCandidate(fixture,exchangeBase()).candidate.settings.statusDate"),
      "2030-01-15",
    );
    run("fixture.project[2][1]+=0.5");
    assert.throws(() => run("prepareExchangeCandidate(fixture,exchangeBase())"));
  });
  await test("source revision changes with data/config but ignores view collapse", async () => {
    const before = await run("exchangeRevision(exchangeBase())");
    run("projectData[0].collapsed=true");
    assert.equal(await run("exchangeRevision(exchangeBase())"), before);
    run('projectSettings.people.push("Demo Person Z")');
    assert.notEqual(await run("exchangeRevision(exchangeBase())"), before);
    payload();
    run('fixture.meta.baseRevision="old"');
    await assert.rejects(() => run("validateExchangeRevision(fixture.meta,exchangeBase())"));
  });
  await test("preview conflict in memory or persisted workspace refuses commit", () => {
    payload();
    run(
      "globalThis.plan=prepareExchangeCandidate(fixture,exchangeBase());globalThis.guard={projectId,baseState:stableJSON(exchangeBase()),stored:localStorage.getItem(WORKSPACE_KEY)}",
    );
    run('projectMeta.name="Changed while previewing"');
    assert.throws(() => run("commitExcelCandidate(plan,guard)"));
    run('saveState();guard={projectId,baseState:stableJSON(exchangeBase()),stored:"different"}');
    assert.throws(() => run("commitExcelCandidate(plan,guard)"));
  });
  await test("quota failure leaves data, backups, audit and saved bytes unchanged", () => {
    payload();
    run(
      "globalThis.plan=prepareExchangeCandidate(fixture,exchangeBase());globalThis.guard={projectId,baseState:stableJSON(exchangeBase()),stored:localStorage.getItem(WORKSPACE_KEY)}",
    );
    const memory = run("stableJSON(currentBundle())"),
      saved = storage.get(run("WORKSPACE_KEY"));
    failWrites = true;
    assert.throws(() => run("commitExcelCandidate(plan,guard)"));
    failWrites = false;
    assert.equal(run("stableJSON(currentBundle())"), memory);
    assert.equal(storage.get(run("WORKSPACE_KEY")), saved);
  });
  await test("successful commit retains project-scoped pre-import recovery across reload", () => {
    run("commitExcelCandidate(plan,guard)");
    assert.equal(run("excelRecoveryPoints.length"), 1);
    assert.equal(run("excelRecoveryPoints[0].bundle.metadata.name"), "Changed while previewing");
    run("loadState()");
    assert.equal(run("excelRecoveryPoints.length"), 1);
    assert.equal(run("excelRecoveryPoints[0].bundle.recoveryPoints"), undefined);
  });
  await test("copying a project remaps recovery identities and isolates snapshots", () => {
    run(
      "globalThis.duplicate=assignProjectIdentity(copy(currentBundle()),crypto.randomUUID());validateBundle(duplicate)",
    );
    assert.equal(run("duplicate.recoveryPoints[0].bundle.projectId===duplicate.projectId"), true);
    assert.equal(run("duplicate.projectId===projectId"), false);
  });
  await test("generated v3 workbook has protected sheets, unlocked inputs and strict validations", async () => {
    const bytes = await run("buildControlledWorkbook()");
    ctx.zipBytes = bytes;
    const files = await run("unzipXlsxBuffer(zipBytes.buffer)");
    assert.ok(files["xl/workbook.xml"].includes('lockStructure="1"'));
    assert.ok(files["xl/workbook.xml"].includes('name="Metadata"'));
    assert.ok(files["xl/styles.xml"].includes('<protection locked="0"/>'));
    for (const n of [1, 2, 3, 4, 5, 6, 7])
      assert.ok(files["xl/worksheets/sheet" + n + ".xml"].includes("<sheetProtection"));
    assert.ok(files["xl/worksheets/sheet3.xml"].includes('sqref="B2:B201"'));
    assert.ok(files["xl/worksheets/sheet3.xml"].includes('sqref="J2:J201"'));
    assert.ok(files["xl/worksheets/sheet2.xml"].includes("Group 2"));
  });
  await test("empty and summary-only Plan sheets omit invalid empty validation containers", async () => {
    assert.equal(run("excelValidation([])"), "");
    for (const mode of ["create", "update"]) {
      run('globalThis.emptyBase=newProject("Blank contract")');
      ctx.emptyBytes = await run("buildControlledWorkbook(" + JSON.stringify(mode) + ",emptyBase)");
      const files = await run("unzipXlsxBuffer(emptyBytes.buffer)");
      assert.ok(!files["xl/worksheets/sheet2.xml"].includes("dataValidations"));
    }
    run('emptyBase.currentData=[{wbs:"P",name:"Phase",mainTasks:[]}]');
    ctx.emptyBytes = await run('buildControlledWorkbook("update",emptyBase)');
    assert.ok(
      !(await run("unzipXlsxBuffer(emptyBytes.buffer)"))["xl/worksheets/sheet2.xml"].includes(
        "dataValidations",
      ),
    );
  });
  await test("blank template is always English and Arial 9 pt in either web language", async () => {
    const original = run("curLang");
    for (const lang of ["zh", "en"]) {
      ctx.language = lang;
      run("curLang=language");
      ctx.blankBytes = await run('buildControlledWorkbook("create")');
      const files = await run("unzipXlsxBuffer(blankBytes.buffer)");
      for (const n of [1, 2, 3, 4, 6, 7])
        assert.ok(!/[\u3400-\u9fff]/.test(files["xl/worksheets/sheet" + n + ".xml"]));
      assert.ok(files["xl/styles.xml"].includes('<sz val="9"/>'));
      assert.ok(files["xl/styles.xml"].includes('<name val="Arial"/>'));
      assert.ok(files["xl/worksheets/sheet1.xml"].includes("New project"));
    }
    ctx.language = original;
    run("curLang=language");
  });
  await test("Chinese instructions are complete, protected and use DengXian 9 pt", async () => {
    ctx.cnBytes = await run('buildControlledWorkbook("create")');
    const files = await run("unzipXlsxBuffer(cnBytes.buffer)");
    assert.ok(files["xl/workbook.xml"].includes('name="Instructions_zh"'));
    assert.ok(files["xl/styles.xml"].includes('<name val="等线"/>'));
    const cn = files["xl/worksheets/sheet5.xml"];
    assert.ok(cn.includes("中文说明"));
    assert.ok(cn.includes("字段对应"));
    assert.ok(cn.includes("Parent WBS"));
    assert.ok(cn.includes("<sheetProtection"));
    const en = files["xl/worksheets/sheet4.xml"];
    const rows = (xml) => (xml.match(/<row /g) || []).length;
    assert.equal(rows(cn), rows(en));
    const cells = [...cn.matchAll(/<c r="[A-Z]+[0-9]+" s="([0-9]+)"/g)];
    assert.equal(cells.length, rows(cn) * 2);
    assert.ok(cells.every((c) => ["9", "10"].includes(c[1])));
    const styles = [
      ...files["xl/styles.xml"].matchAll(/<xf numFmtId="[^"]*" fontId="([^"]+)"[^>]*>[\s\S]*?<\/xf>/g),
    ];
    assert.equal(styles[9][1], "1");
    assert.equal(styles[10][1], "1");
  });
  await test("v3 package relationships and content types reference existing parts", async () => {
    ctx.relBytes = await run("buildControlledWorkbook()");
    const files = await run("unzipXlsxBuffer(relBytes.buffer)");
    for (const match of files["xl/_rels/workbook.xml.rels"].matchAll(/Target="([^"]+)"/g)) {
      const target = match[1].startsWith("/") ? match[1].slice(1) : "xl/" + match[1];
      assert.ok(Object.hasOwn(files, target), "Missing part " + target);
    }
    for (const match of files["[Content_Types].xml"].matchAll(/PartName="\/([^"]+)"/g))
      assert.ok(Object.hasOwn(files, match[1]), "Missing part " + match[1]);
    assert.ok(files["[Content_Types].xml"].includes('PartName="/xl/workbook.xml"'));
  });
  await test("all editable fields map to the same WBS and roundtrip without changes", () => {
    payload("create");
    run(
      `fixture.newTasks.push(['P','Family','Fictional phase','','','','','','','','','','','',''],['P.1','Main Task','Fictional delivery','','','','','','','','','','','','P'],['P.1.10','Sub-task','Fictional task A','',-2,3,'2030-01-10','',7,0.37125,'','Person A; Person B','Person C','Person D','P.1'],['P.1.20','Sub-task','Fictional task B','P.1.10',2,1,'','',4,0.125,'','Person E','Person F','Person G','P.1']);globalThis.mapped=prepareExchangeCandidate(fixture,exchangeBase())`,
    );
    const serial = (date) => (Date.parse(date + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000;
    assert.deepEqual(JSON.parse(run("JSON.stringify(exchangeRows(mapped.candidate.currentData)[3])")), [
      "P.1.10",
      "Sub-task",
      "Fictional task A",
      "",
      -2,
      3,
      serial("2030-01-10"),
      serial("2030-01-16"),
      7,
      0.37125,
      "prog",
      "Person A; Person B",
      "Person C",
      "Person D",
    ]);
    assert.deepEqual(JSON.parse(run("JSON.stringify(exchangeRows(mapped.candidate.currentData)[4])")), [
      "P.1.20",
      "Sub-task",
      "Fictional task B",
      "P.1.10",
      2,
      1,
      serial("2030-01-19"),
      serial("2030-01-22"),
      4,
      0.125,
      "prog",
      "Person E",
      "Person F",
      "Person G",
    ]);
    assert.equal(run("mapped.candidate.currentData[0].mainTasks[0].subtasks[0].pct"), 37.125);
    run(
      `globalThis.mappedPayload={meta:{format:EXCHANGE_FORMAT,version:2,mode:'update',projectId:mapped.candidate.projectId,columns:copy(EXCEL_HEADERS),newColumns:copy(NEW_TASK_HEADERS)},plan:exchangeRows(mapped.candidate.currentData),project:[['Field','Value'],['Project Name',mapped.candidate.metadata.name],['Status Date',mapped.candidate.settings.statusDate]],newTasks:[NEW_TASK_HEADERS]}`,
    );
    assert.equal(run("prepareExchangeCandidate(mappedPayload,mapped.candidate).changes.length"), 0);
  });
  await test("corrupt ZIP data fails CRC validation", async () => {
    const bytes = await run("buildControlledWorkbook()");
    bytes[100] ^= 1;
    ctx.badZip = bytes;
    await assert.rejects(() => run("unzipXlsxBuffer(badZip.buffer)"));
  });
  await test("source writing APIs are absent; exports use unique download names", () => {
    assert.ok(!/showOpenFilePicker|createWritable|writeFileSync|FileSystemFileHandle/.test(html));
    assert.match(html, /crypto\.randomUUID\(\)\.slice\(0, ?8\) \+\s*"\.xlsx"/);
  });
  await test("ten stable groups accept custom names and reject excess or duplicate configuration", () => {
    run(
      `globalThis.ten=GROUP_IDS.map((id,i)=>({id,name:'Custom '+(i+1),color:GROUP_COLORS[i]}));validateGroups(ten)`,
    );
    assert.throws(() => run('validateGroups([...ten,{...ten[0],id:"group11"}])'));
    assert.throws(() => run("validateGroups([{...ten[0]},{...ten[1],name:ten[0].name.toLowerCase()}])"));
    assert.equal(run('defaultGroups().map(g=>g.name).join(",")'), "Group 1,Group 2,Group 3");
  });
  await test("group ten rolls up, filters people and renders names safely in both languages", () => {
    run(
      `globalThis.groupBase=newProject('Group check',syntheticData());groupBase.settings.groups=copy(ten);groupBase.currentData[0].mainTasks[0].subtasks[0].group10='Person Ten';recalculateSchedule(groupBase.currentData,groupBase.settings.statusDate);validateBundle(groupBase);selectBundle(groupBase)`,
    );
    assert.equal(run("projectData[0].group10"), "Person Ten");
    assert.equal(run('personMatches(projectData[0],"Person Ten","group10")'), true);
    for (const lang of ["zh", "en"]) {
      ctx.language = lang;
      run("curLang=language;renderPeopleView();renderGroupInputs(projectData[0].mainTasks[0].subtasks[0])");
      assert.ok(nodes.get("peopleSummaryTable").innerHTML.includes("Custom 10"));
      assert.ok(nodes.get("taskGroupInputs").innerHTML.includes("md_group10"));
      assert.ok(run('getPeople().some(p=>p.key==="Person Ten")'));
    }
    run('projectSettings.groups[9].name="<Custom>"');
    assert.ok(run('groupHeaders().includes("&lt;Custom&gt;")'));
    assert.equal(run("projectData[0].mainTasks[0].subtasks[0].group10"), "Person Ten");
  });
  function groupedPayload() {
    run(
      `globalThis.groupFixture={meta:{format:EXCHANGE_FORMAT,version:3,mode:'update',projectId:groupBase.projectId,baseRevision:null,columns:groupExcelHeaders(groupBase.settings),newColumns:[...groupExcelHeaders(groupBase.settings),'Parent WBS'],fields:copy(GROUP_FIELDS),newFields:[...GROUP_FIELDS,'parentWbs'],maxGroups:10},plan:groupExchangeRows(groupBase.currentData,groupBase.settings),newTasks:[[...groupExcelHeaders(groupBase.settings),'Parent WBS']],project:[['Field','Value'],['Project Name',groupBase.metadata.name],['Status Date',groupBase.settings.statusDate]],groupRows:[copy(GROUP_SHEET_HEADERS),...ten.map(g=>[g.id,'Yes',g.name,g.color])]}`,
    );
  }
  await test("v3 preserves all 21 fields and group assignments through preview and export", () => {
    groupedPayload();
    run("globalThis.groupResult=prepareExchangeCandidate(groupFixture,groupBase)");
    assert.equal(run("groupResult.changes.length"), 0);
    const before = run("stableJSON(groupBase)");
    run(
      `groupFixture.plan[3][20]='Person Changed';groupFixture.groupRows[10][2]='Quality review';groupResult=prepareExchangeCandidate(groupFixture,groupBase)`,
    );
    assert.equal(
      run("groupResult.candidate.currentData[0].mainTasks[0].subtasks[0].group10"),
      "Person Changed",
    );
    assert.equal(run("groupResult.candidate.settings.groups[9].name"), "Quality review");
    assert.equal(
      run("groupExchangeRows(groupResult.candidate.currentData,groupResult.candidate.settings)[3][20]"),
      "Person Changed",
    );
    assert.equal(run("stableJSON(groupBase)"), before);
  });
  await test("v3 rejects disabled assigned groups, bad mapping and read-only summary changes", () => {
    for (const expression of [
      'groupFixture.groupRows[10][1]="No"',
      'groupFixture.meta.fields[20]="other"',
      'groupFixture.groupRows[10][0]="group9"',
      'groupFixture.plan[1][20]="forbidden"',
      'groupFixture.plan[3][21]="extra"',
    ]) {
      groupedPayload();
      run(expression);
      assert.throws(() => run("prepareExchangeCandidate(groupFixture,groupBase)"));
    }
    run("globalThis.disabled=copy(groupBase);disabled.settings.groups.pop()");
    assert.throws(() => run("validateBundle(disabled)"));
  });
  await test("v3 can enable and assign a previously disabled first slot in one batch", () => {
    groupedPayload();
    run(
      "globalThis.oneBase=copy(groupBase);for(const item of allItems(oneBase.currentData))for(const id of GROUP_IDS.slice(1))item[id]='';oneBase.settings.groups=[copy(ten[0])];groupFixture.plan=groupExchangeRows(oneBase.currentData,oneBase.settings);groupFixture.plan[0]=copy(groupFixture.meta.columns);groupFixture.plan[3][12]='New member';globalThis.enabledResult=prepareExchangeCandidate(groupFixture,oneBase)",
    );
    assert.equal(run("enabledResult.candidate.currentData[0].mainTasks[0].subtasks[0].group2"), "New member");
    assert.equal(run("enabledResult.candidate.settings.groups.length"), 10);
  });
  await test("v3 NewTasks maps group ten and explicit parents without losing first three groups", () => {
    groupedPayload();
    run(
      `groupFixture.newTasks.push(['1.1.50','Sub-task','Ten task','',0,2,'2030-01-01','',2,0.5,'','Person One','','','','','','','','','Person Ten','1.1']);groupResult=prepareExchangeCandidate(groupFixture,groupBase)`,
    );
    assert.equal(run("groupResult.added"), 1);
    assert.equal(
      run('allItems(groupResult.candidate.currentData).find(t=>t.wbs==="1.1.50").group10'),
      "Person Ten",
    );
    assert.equal(
      run('allItems(groupResult.candidate.currentData).find(t=>t.wbs==="1.1.50").group1'),
      "Person One",
    );
  });
  await test("v3 workbook contains explicit mappings, ten protected slots and 9 pt instructions", async () => {
    ctx.groupBytes = await run('buildControlledWorkbook("update",groupBase)');
    const files = await run("unzipXlsxBuffer(groupBytes.buffer)");
    assert.ok(files["xl/workbook.xml"].includes('name="Groups"'));
    assert.ok(files["xl/worksheets/sheet7.xml"].includes("group10"));
    assert.ok(files["xl/worksheets/sheet7.xml"].includes("<sheetProtection"));
    assert.ok(files["xl/worksheets/sheet3.xml"].includes('r="V1"'));
    assert.ok(files["xl/worksheets/sheet2.xml"].includes('r="U4"'));
    assert.ok(files["xl/worksheets/sheet6.xml"].includes("&quot;version&quot;:3"));
    assert.ok(files["xl/styles.xml"].includes('<name val="等线"/>'));
    assert.ok(!files["xl/worksheets/sheet2.xml"].includes("Team B"));
  });
  await test("legacy role aliases migrate snapshots and recovery without mutating source", () => {
    run(
      `globalThis.old=copy(groupBase);old.schemaVersion=1;old.legacyGroupFields=['owner','team_a','team_b'];old.settings.roleLabels={};old.settings.supportGroups=[];delete old.settings.groups;for(const item of allItems(old.currentData)){for(let i=0;i<3;i++){item[['owner','team_a','team_b'][i]]=item[GROUP_IDS[i]];delete item[GROUP_IDS[i]];}for(const id of GROUP_IDS.slice(3))delete item[id];}old.versionHistory=[{tag:'V1',time:today(),author:'Demo',note:'Before migration',data:copy(old.currentData)}];old.auditLog=[];delete old.recoveryPoints;old.recoveryPoints=[{time:today(),bundle:copy(old)}];globalThis.oldBytes=stableJSON(old);globalThis.migrated=migrateBundle(old)`,
    );
    assert.equal(run("migrated.schemaVersion"), 2);
    assert.equal(
      run("migrated.versionHistory[0].data[0].mainTasks[0].subtasks[0].group1"),
      run("groupBase.currentData[0].mainTasks[0].subtasks[0].group1"),
    );
    assert.equal(run("migrated.recoveryPoints[0].bundle.schemaVersion"), 2);
    assert.equal(run("stableJSON(old)"), run("oldBytes"));
    assert.equal(
      run("migrated.currentData[0].mainTasks[0].subtasks[0].group1"),
      run("groupBase.currentData[0].mainTasks[0].subtasks[0].group1"),
    );
  });
  await test("legacy 14-column headers are explicitly normalized without source modification", () => {
    payload();
    run(
      `fixture.meta.columns=[...EXCEL_HEADERS.slice(0,11),'Owner','Team A','Team B'];fixture.meta.newColumns=[...fixture.meta.columns,'Parent WBS'];fixture.plan[0]=copy(fixture.meta.columns);fixture.newTasks[0]=copy(fixture.meta.newColumns);globalThis.legacyBefore=stableJSON(fixture);prepareExchangeCandidate(fixture,exchangeBase())`,
    );
    assert.equal(run("stableJSON(fixture)"), run("legacyBefore"));
  });
  await test("workspace migration backs up exact bytes before replacing and refuses failed writes", () => {
    run(
      `globalThis.oldWorkspace={schemaVersion:1,activeProjectId:old.projectId,projects:{[old.projectId]:old}}`,
    );
    const key = run("WORKSPACE_KEY"),
      raw = run("JSON.stringify(oldWorkspace)");
    storage.set(key, raw);
    run("storageReadBlocked=false;loadState()");
    assert.equal(run("projectId"), run("old.projectId"));
    assert.equal(run("currentBundle().schemaVersion"), 2);
    assert.ok([...storage].some(([k, v]) => k.startsWith(key + ":before-groups:") && v === raw));
    storage.set(key, raw);
    failWrites = true;
    run("storageReadBlocked=false;loadState()");
    failWrites = false;
    assert.equal(storage.get(key), raw);
    assert.equal(run("storageReadBlocked"), true);
  });

  console.log(checks + " Excel contract checks passed");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
