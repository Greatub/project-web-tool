// Real XML parsing through Python's standard library; no browser/runtime dependency.
const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  cp = require("node:child_process"),
  path = require("node:path");
const html = fs.readFileSync(path.join(__dirname, "../../src/index.html"), "utf8"),
  script = html.match(/<script>([\s\S]*?)<\/script>/)[1].split("// Synchronize scroll")[0];
const python = `import json,sys,xml.etree.ElementTree as E
def node(e):
 ns,local=e.tag[1:].split('}',1) if e.tag.startswith('{') else ('',e.tag)
 return dict(localName=local,namespaceURI=ns,textContent=''.join(e.itertext()),children=[node(c) for c in e])
try: print(json.dumps(node(E.fromstring(sys.stdin.buffer.read())),ensure_ascii=True))
except Exception as e: print(str(e),file=sys.stderr);sys.exit(1)`;
function hydrate(n) {
  n.getElementsByTagNameNS = (ns, local) =>
    n.children.flatMap((c) => [
      ...((ns === "*" || c.namespaceURI === ns) && (local === "*" || c.localName === local) ? [c] : []),
      ...c.getElementsByTagNameNS(ns, local),
    ]);
  n.children = n.children.map(hydrate);
  return n;
}
class DOMParser {
  parseFromString(text) {
    const p = cp.spawnSync(process.platform === "win32" ? "python" : "python3", ["-c", python], {
      input: text,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    if (p.status !== 0) throw new Error("Invalid XML: " + p.stderr);
    const root = hydrate(JSON.parse(p.stdout));
    return {
      documentElement: root,
      getElementsByTagNameNS: (ns, name) => root.getElementsByTagNameNS(ns, name),
    };
  }
}
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
  DOMParser,
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
  TextEncoder,
  TextDecoder,
});
vm.runInContext(script, ctx);
const run = (s) => vm.runInContext(s, ctx);
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS " + name);
}
run(
  `loadState();renderAll=()=>{};applyStaticI18n=()=>{};addProject(newProject('Fictional & project',syntheticData()));projectSettings.statusDate='2030-01-15';document.getElementById('statusDateInput').value='2030-01-15';projectSettings.groups=GROUP_IDS.map((id,i)=>({id,name:'Team '+(i+1),color:'#467f78'}));projectData[0].mainTasks[0].subtasks[0].name=' Review <scope> & "dates" '; projectData[0].mainTasks[0].subtasks[0].group10=' Demo Person Z '; projectData[0].mainTasks[0].subtasks[0].lag=2;projectData[0].mainTasks[0].subtasks[1].lag=-1;recalculateSchedule();saveState();globalThis.original=stableJSON(currentBundle());globalThis.xml=buildProjectXML();globalThis.plan=prepareProjectXML(readProjectXML(xml));`,
);
test("Project XML roundtrip preserves fields, groups, escaped text and negative Lag", () => {
  assert.equal(
    run("stableJSON(groupExchangeRows(plan.candidate.currentData,plan.candidate.settings))"),
    run("stableJSON(groupExchangeRows(projectData,projectSettings))"),
  );
  assert.equal(run("plan.candidate.metadata.name"), run("projectMeta.name"));
  assert.equal(run("plan.candidate.settings.statusDate"), "2030-01-15");
  assert.equal(run("stableJSON(plan.candidate.settings.groups)"), run("stableJSON(projectSettings.groups)"));
  assert.notEqual(run("plan.candidate.projectId"), run("projectId"));
  assert.equal(run("stableJSON(currentBundle())"), run("original"));
});
test("import preview lists each new task once with readable values", () => {
  const changes = run("plan.changes");
  assert.equal(
    changes.length,
    run("plan.added"),
    "one row per task, no recalculation noise for an own export",
  );
  assert.ok(changes.every((c) => /^New /.test(c.field)));
  assert.ok(!changes.some((c) => /^\d{5}$/.test(String(c.after))), "no Excel date serials");
});
test("recalculated summary values are shown as dates and percentages", () => {
  run(
    "globalThis.edited=xml.replace(/(<WBS>1<\\/WBS>[\\s\\S]*?<PercentComplete>)\\d+(<\\/PercentComplete>)/,'$199$2');globalThis.recalc=prepareProjectXML(readProjectXML(edited)).changes.filter((c)=>!/^New /.test(c.field))",
  );
  assert.deepEqual(
    JSON.parse(run("JSON.stringify(recalc)")).map((c) => [c.wbs, c.field, c.before]),
    [["1", "% Complete", "99%"]],
  );
  assert.match(run("recalc[0].after"), /^\d+%$/);
});
test("XML has standard namespace, elapsed units, unique UIDs and exclusive finish dates", () => {
  assert.ok(run('xml.includes("<DurationFormat>8</DurationFormat>")'));
  assert.ok(run('xml.includes("<LinkLag>-14400</LinkLag>")'));
  assert.ok(run('xml.includes("<FieldID>188743750</FieldID>")'));
  assert.equal(run("readProjectXML(xml).rows.length"), 4);
});
test("unknown dates/duration/priority and empty projects roundtrip", () => {
  run(
    `globalThis.unknown=newProject('Unknown',syntheticData());for(const s of unknown.currentData[0].mainTasks[0].subtasks){s.start='';s.days=null;s.prio=null;}globalThis.unknownResult=prepareProjectXML(readProjectXML(buildProjectXML(unknown)));`,
  );
  assert.equal(run("unknownResult.candidate.currentData[0].mainTasks[0].subtasks[0].days"), null);
  assert.equal(run("unknownResult.candidate.currentData[0].mainTasks[0].subtasks[0].start"), "");
  assert.equal(run("unknownResult.candidate.currentData[0].mainTasks[0].subtasks[0].prio"), null);
  assert.equal(run("prepareProjectXML(readProjectXML(buildProjectXML(newProject()))).added"), 0);
});
test("working durations, partial days, milestones, constraints and task calendars reject", () => {
  for (const expression of [
    `xml.replaceAll('<DurationFormat>8','<DurationFormat>7')`,
    `xml.replace('PT72H0M0S','PT8H0M0S')`,
    `xml.replace('<Milestone>0','<Milestone>1')`,
    `xml.replace('</Name><Type>','</Name><ConstraintType>4</ConstraintType><Type>')`,
    `xml.replace('</Name><Type>','</Name><CalendarUID>1</CalendarUID><Type>')`,
  ])
    assert.throws(() => run("prepareProjectXML(readProjectXML(" + expression + "))"));
});
test("multiple, non-FS, summary, unresolved and cyclic predecessors reject", () => {
  for (const expression of [
    `xml.replace('<Type>1</Type><CrossProject>','<Type>3</Type><CrossProject>')`,
    `xml.replace('</PredecessorLink>','</PredecessorLink><PredecessorLink><PredecessorUID>3</PredecessorUID></PredecessorLink>')`,
    `xml.replace('<PredecessorUID>3','<PredecessorUID>999')`,
    `xml.replace('<PredecessorUID>3','<PredecessorUID>2')`,
    `xml.replace('<PredecessorUID>3','<PredecessorUID>4')`,
    `xml.replace('<LagFormat>8','<LagFormat>7')`,
  ])
    assert.throws(() => run("prepareProjectXML(readProjectXML(" + expression + "))"));
});
test("invalid namespace, DTD, malformed XML, duplicate UIDs and excessive depth reject", () => {
  for (const expression of [
    `xml.replace(MSP_NS,'urn:wrong')`,
    `'<!DOCTYPE Project>'+xml`,
    `xml.slice(0,-9)`,
    `xml.replace('<UID>4','<UID>3')`,
    `xml.replace('<OutlineLevel>3','<OutlineLevel>4')`,
    `xml.replace('<WBS>1.1.2','<WBS>1.1.1')`,
  ])
    assert.throws(() => run("prepareProjectXML(readProjectXML(" + expression + "))"));
});
test("schedule conflicts, invalid progress, fractional Lag and unsupported mappings reject", () => {
  for (const expression of [
    `xml.replace('<LinkLag>-14400','<LinkLag>14400')`,
    `xml.replace('<PercentComplete>25','<PercentComplete>101')`,
    `xml.replace('<LinkLag>-14400','<LinkLag>1')`,
    `xml.replace('&quot;version&quot;:1','&quot;version&quot;:99')`,
  ])
    assert.throws(() => run("prepareProjectXML(readProjectXML(" + expression + "))"));
});
test("standard resource assignments are explicitly mapped to Group 1 in preview", () => {
  run(
    String.raw`globalThis.generic=xml.replace(/<Notes>[\s\S]*?<\/Notes>/,'').replace(/<ExtendedAttributes>[\s\S]*?<\/ExtendedAttributes>/,'').replace(/<ExtendedAttribute>[\s\S]*?<\/ExtendedAttribute>/g,'').replace('</Project>','<Resources><Resource><UID>10</UID><Name>Demo Resource</Name></Resource></Resources><Assignments><Assignment><UID>1</UID><TaskUID>3</TaskUID><ResourceUID>10</ResourceUID></Assignment></Assignments></Project>');globalThis.genericPlan=prepareProjectXML(readProjectXML(generic));`,
  );
  assert.equal(run("genericPlan.candidate.currentData[0].mainTasks[0].subtasks[0].group1"), "Demo Resource");
  assert.ok(run('genericPlan.notices.some(n=>n.includes("Group 1"))'));
});
test("export rejects truncation, XML control characters and fractional progress", () => {
  for (const expression of [
    `b.currentData[0].mainTasks[0].subtasks[0].group10='x'.repeat(256)`,
    `b.metadata.name='x'.repeat(256)`,
    `b.currentData[0].mainTasks[0].subtasks[0].name='bad'+String.fromCharCode(1)`,
    `b.currentData[0].mainTasks[0].subtasks[0].pct=25.5`,
  ])
    assert.throws(() => run("globalThis.b=copy(currentBundle());" + expression + ";buildProjectXML(b)"));
});
test("cancelled preview and switched project leave the original workspace untouched", () => {
  assert.equal(run("stableJSON(currentBundle())"), run("original"));
  run(
    "globalThis.guard={projectId,baseState:stableJSON(exchangeBase()),stored:localStorage.getItem(WORKSPACE_KEY)}",
  );
  assert.throws(() => run('commitExcelCandidate(plan,{...guard,projectId:"different"})'));
  assert.equal(run("stableJSON(currentBundle())"), run("original"));
});
test("failed import persistence leaves both memory and stored bytes unchanged", () => {
  const before = storage.get(run("WORKSPACE_KEY"));
  failWrites = true;
  assert.throws(() => run("commitExcelCandidate(plan,guard)"));
  failWrites = false;
  assert.equal(storage.get(run("WORKSPACE_KEY")), before);
  assert.equal(run("stableJSON(currentBundle())"), run("original"));
});
test("successful import creates isolated project with an accurate audit action", () => {
  const previous = run("projectId");
  run("commitExcelCandidate(plan,guard)");
  assert.notEqual(run("projectId"), previous);
  assert.equal(run("auditLog[0].action"), "Project XML import");
  assert.equal(run('stableJSON(workspace.projects["' + previous + '"])'), run("original"));
});
test("new export button and both languages reuse existing component classes", () => {
  for (const lang of ["zh", "en"]) {
    ctx.lang = lang;
    run("curLang=lang");
    assert.ok(run('t("btnExportProject")').includes("Project XML"));
  }
  assert.match(html, /class="btn" id="btnExportProject"/);
  assert.ok(html.includes("mspSaveXml"));
  assert.ok(!/createWritable|showSaveFilePicker/.test(html));
});
(async () => {
  const dialogs = [];
  ctx.captureDialog = (spec) => {
    dialogs.push(spec);
    return Promise.resolve(null);
  };
  run("showDialog=captureDialog");
  for (const lang of ["en", "zh"]) {
    ctx.lang = lang;
    run("curLang=lang");
    assert.equal(await run("previewExcel(plan)"), false);
    const dialog = dialogs.at(-1);
    assert.equal(dialog.size, "wide");
    assert.equal(dialog.title, lang === "en" ? "Project XML import preview" : "Project XML 导入预览");
    assert.ok(dialog.bodyHtml.includes('class="exchange-changes"'));
    assert.ok(!/style=/.test(dialog.bodyHtml));
    assert.equal(dialog.actions[0].value, false);
    assert.equal(dialog.actions[1].value, true);
  }
  checks++;
  console.log("PASS localized Project XML preview uses the shared wide dialog and confirm/cancel actions");
  const before = run("stableJSON(workspace)"),
    saved = storage.get(run("WORKSPACE_KEY"));
  ctx.file = { size: Buffer.byteLength(run("xml")), text: async () => run("xml") };
  run("previewExcel=async()=>false");
  await run("importProjectXML(file)");
  assert.equal(run("stableJSON(workspace)"), before);
  assert.equal(storage.get(run("WORKSPACE_KEY")), saved);
  assert.equal(run("excelImportBusy"), false);
  checks++;
  console.log("PASS import cancellation leaves storage and busy state unchanged");
  run('previewExcel=async()=>{localStorage.setItem(WORKSPACE_KEY,"external change");return true;}');
  await assert.rejects(() => run("importProjectXML(file)"));
  assert.equal(run("stableJSON(workspace)"), before);
  assert.equal(run("excelImportBusy"), false);
  checks++;
  console.log("PASS concurrent stored changes cancel XML import before any commit");
  storage.set(run("WORKSPACE_KEY"), saved);
  ctx.file = {
    size: 2 * 1024 * 1024 + 1,
    text: async () => {
      throw new Error("Oversized files must not be read");
    },
  };
  await assert.rejects(() => run("importProjectXML(file)"));
  assert.equal(run("excelImportBusy"), false);
  assert.equal(run("stableJSON(workspace)"), before);
  checks++;
  console.log("PASS size limit rejects before reading or saving");
  console.log(checks + " Project XML checks passed");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
