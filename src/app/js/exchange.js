// One schema is shared by the browser importer and exporter; workbook styles come from the authored master.
const EXCEL_HEADERS = [
  "WBS",
  "Level",
  "Task / Sub-task",
  "Predecessor",
  "Lag",
  "Priority",
  "Starting Date",
  "Delivery Date",
  "Days",
  "% Complete",
  "Status",
  "Group 1",
  "Group 2",
  "Group 3",
];

function exchangePeople(value) {
  return String(value ?? "")
    .split(/[;,\n/]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join("; ");
}

function exchangeRows(data = projectData) {
  const rows = [EXCEL_HEADERS];
  const date = (s) =>
    s ? Math.round((Date.parse(s + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000) : null;
  const push = (s, level) =>
    rows.push([
      s.wbs,
      level,
      s.name,
      s.pred || "",
      s.lag ?? 0,
      s.prio ?? null,
      date(s.start),
      date(s.finish),
      s.days ?? null,
      Number(s.pct || 0) / 100,
      s.status?.code || "tbc",
      exchangePeople(s.group1),
      exchangePeople(s.group2),
      exchangePeople(s.group3),
    ]);
  data.forEach((f) => {
    push(f, "Family");
    f.mainTasks.forEach((m) => {
      push(m, "Main Task");
      m.subtasks.forEach((s) => push(s, "Sub-task"));
    });
  });
  return rows;
}

function applyImportedRows(rows, data) {
  if (!Array.isArray(rows) || !rows.length) throw inputError("msgThePlanWorksheetIsEmpty");
  const header = rows[0].map((c) => String(c ?? "").trim());
  while (header.length && header[header.length - 1] === "") header.pop();
  if (header.length !== EXCEL_HEADERS.length || EXCEL_HEADERS.some((h, i) => header[i] !== h))
    throw inputError("msgUseTheStandard14HeadersIn");
  const lookup = new Map();
  data.forEach((f) => {
    lookup.set(f.wbs, { level: "Family", task: f });
    f.mainTasks.forEach((m) => {
      lookup.set(m.wbs, { level: "Main Task", task: m });
      m.subtasks.forEach((s) => lookup.set(s.wbs, { level: "Sub-task", task: s }));
    });
  });
  const seen = new Set();
  let count = 0;
  const fail = (r, field, key, ...args) => {
    throw inputError("msgRowField", r, field, t(key, ...args));
  };
  const blank = (v) => v == null || String(v).trim() === "" || /^TBC$/i.test(String(v).trim());
  const number = (v, r, field, fallback) => {
    if (blank(v)) return fallback;
    if (typeof v === "boolean" || !Number.isFinite(Number(v))) fail(r, field, "msgAValidNumberIsRequired");
    return Number(v);
  };
  rows.slice(1).forEach((row, i) => {
    const r = i + 2;
    if (!row.some((v) => v != null && String(v).trim() !== "")) return;
    if (row.slice(14).some((v) => v != null && String(v).trim() !== ""))
      fail(r, "", "msgDataOutsideTheTemplateColumnsIs");
    // Identifiers must be text; numeric WBS can silently lose trailing zeros in Excel.
    if (typeof row[0] !== "string") fail(r, "WBS", "msgKeepTheIdentifierAsText");
    const id = row[0].trim(),
      level = String(row[1] ?? "").trim(),
      entry = lookup.get(id);
    if (!entry) fail(r, "WBS", "msgTaskNotFoundExportFromThe", id);
    if (seen.has(id)) fail(r, "WBS", "msgDuplicateIdentifier", id);
    seen.add(id);
    if (level !== entry.level) fail(r, "Level", "msgTheLevelDoesNotMatchThe");
    if (level !== "Sub-task") return;
    const st = entry.task;
    st.name = String(row[2] ?? "").trim();
    if (!st.name) fail(r, EXCEL_HEADERS[2], "msgTaskNameIsRequired");
    if (!blank(row[3]) && typeof row[3] !== "string") fail(r, "Predecessor", "msgTheIdentifierMustBeText");
    st.pred = blank(row[3]) ? "" : row[3].trim();
    st.lag = number(row[4], r, "Lag", 0);
    st.prio = number(row[5], r, "Priority", null);
    st.days = number(row[8], r, "Days", null);
    if (!Number.isInteger(st.lag)) fail(r, "Lag", "msgUseIntegerCalendarDays");
    if (st.prio !== null && ![1, 2, 3].includes(st.prio)) fail(r, "Priority", "msgUse123OrBlank");
    if (st.days !== null && (!Number.isInteger(st.days) || st.days < 1))
      fail(r, "Days", "msgUseAPositiveIntegerOrBlank");
    const start = row[6];
    if (blank(start)) st.start = "";
    else if (typeof start === "number") {
      if (!Number.isFinite(start) || start < 1 || start > 2958465)
        fail(r, "Starting Date", "msgTheDateSerialIsOutOf");
      st.start = formatDate(new Date(Date.UTC(1899, 11, 30) + Math.floor(start) * 86400000));
    } else st.start = String(start).trim();
    if (st.start && !parseDate(st.start)) fail(r, "Starting Date", "msgUseAnExcelDateOrYyyy");
    const rawPct = row[9];
    let fraction;
    if (blank(rawPct)) fraction = 0;
    else if (typeof rawPct === "string" && rawPct.trim().endsWith("%"))
      fraction = Number(rawPct.trim().slice(0, -1)) / 100;
    else fraction = number(rawPct, r, "% Complete", 0);
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
      fail(r, "% Complete", "msgEnter0100ForExample25");
    st.pct = Math.round(fraction * 100000000) / 1000000;
    ["group1", "group2", "group3"].forEach((k, j) => (st[k] = exchangePeople(row[11 + j])));
    count++;
  });
  if (!count) throw inputError("msgNoSubtaskRowsToUpdate");
  return count;
}

function xmlDocument(text, label) {
  const doc = new DOMParser().parseFromString(text || "", "application/xml");
  if (doc.getElementsByTagNameNS("*", "parsererror").length) throw inputError("msgInvalidXml", label);
  return doc;
}

function xlsxSheetRows(files, sheetName = "Plan") {
  const book = xmlDocument(files["xl/workbook.xml"], "workbook"),
    rel = xmlDocument(files["xl/_rels/workbook.xml.rels"], "relationships");
  const sheets = [...book.getElementsByTagNameNS("*", "sheet")].filter(
    (s) => s.getAttribute("name") === sheetName,
  );
  if (sheets.length !== 1) throw inputError("msgExpectedExactlyOneWorksheet", sheetName);
  const id = sheets[0].getAttribute("r:id"),
    link = [...rel.getElementsByTagNameNS("*", "Relationship")].find((r) => r.getAttribute("Id") === id);
  if (!link || link.getAttribute("TargetMode") === "External")
    throw inputError("msgInvalidPlanWorksheetRelationship");
  const target = link.getAttribute("Target"),
    parts = (target.startsWith("/") ? target.slice(1) : "xl/" + target).split("/"),
    resolved = [];
  for (const p of parts) {
    if (p === "..") resolved.pop();
    else if (p !== ".") resolved.push(p);
  }
  const sheet = xmlDocument(files[resolved.join("/")], "Plan"),
    shared = [];
  if (files["xl/sharedStrings.xml"])
    [
      ...xmlDocument(files["xl/sharedStrings.xml"], "shared strings").getElementsByTagNameNS("*", "si"),
    ].forEach((si) =>
      shared.push([...si.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join("")),
    );
  const date1904 = ["1", "true"].includes(
    book.getElementsByTagNameNS("*", "workbookPr")[0]?.getAttribute("date1904"),
  );
  const rows = [];
  for (const r of sheet.getElementsByTagNameNS("*", "row")) {
    const index = Number(r.getAttribute("r")) - 1;
    if (!Number.isInteger(index) || index < 0 || index > 100000) throw inputError("msgInvalidWorksheetRow");
    if (rows[index]) throw inputError("msgDuplicateWorksheetRow", index + 1);
    const values = [],
      seenCells = new Set();
    for (const c of r.getElementsByTagNameNS("*", "c")) {
      const ref = c.getAttribute("r") || "",
        col = ref.replace(/\d/g, "");
      let n = 0;
      for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64;
      if (n < 1 || n > 16384) throw inputError("msgInvalidCellReference", ref);
      if (
        !/^[A-Z]+[1-9][0-9]*$/.test(ref) ||
        Number(ref.match(/[0-9]+$/)[0]) !== index + 1 ||
        seenCells.has(n)
      )
        throw inputError("msgDuplicateOrMisplacedCell", ref);
      seenCells.add(n);
      if (c.getElementsByTagNameNS("*", "f").length)
        throw inputError("msgCellContainsAFormulaPasteValues", ref);
      const type = c.getAttribute("t"),
        v = c.getElementsByTagNameNS("*", "v")[0]?.textContent;
      if (type === "e") throw inputError("msgExcelCellError", ref, v);
      if (type === "s" && (!Number.isInteger(Number(v)) || shared[Number(v)] === undefined))
        throw inputError("msgInvalidSharedString", ref);
      let value =
        type === "s"
          ? shared[Number(v)]
          : type === "inlineStr"
            ? [...c.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join("")
            : type === "b"
              ? v === "1"
              : type === "str" || type === "d"
                ? v || ""
                : v == null
                  ? ""
                  : Number(v);
      if (type === "d" && value) value = value.slice(0, 10);
      if (
        date1904 &&
        typeof value === "number" &&
        ((["Plan", "NewTasks"].includes(sheetName) && index > 0 && [7, 8].includes(n)) ||
          (sheetName === "Project" && index === 2 && n === 2))
      ) {
        if (!Number.isInteger(value)) throw inputError("msgDateMustNotIncludeATime");
        value = formatDate(new Date(Date.UTC(1904, 0, 1) + value * 86400000));
      }
      values[n - 1] = value;
    }
    rows[index] = values;
  }
  return Array.from({ length: rows.length }, (_, i) => rows[i] || []);
}

function storedZip(files) {
  const encoder = new TextEncoder(),
    chunks = [],
    central = [];
  let offset = 0;
  const bytes = (n) => new Uint8Array(n),
    view = (b) => new DataView(b.buffer);
  for (const [name, text] of Object.entries(files)) {
    const n = encoder.encode(name),
      body = encoder.encode(text),
      crc = crc32Bytes(body),
      h = bytes(30),
      v = view(h);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint16(12, 0x21, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, body.length, true);
    v.setUint32(22, body.length, true);
    v.setUint16(26, n.length, true);
    const c = bytes(46),
      cv = view(c);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, body.length, true);
    cv.setUint16(28, n.length, true);
    cv.setUint32(42, offset, true);
    chunks.push(h, n, body);
    central.push(c, n);
    offset += h.length + n.length + body.length;
  }
  const end = bytes(22),
    ev = view(end),
    cd = central.reduce((sum, b) => sum + b.length, 0),
    count = Object.keys(files).length;
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, cd, true);
  ev.setUint32(16, offset, true);
  const result = new Uint8Array(offset + cd + 22);
  let position = 0;
  for (const chunk of [...chunks, ...central, end]) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

async function unzipXlsxBuffer(arrayBuffer) {
  const view = new DataView(arrayBuffer),
    bytes = new Uint8Array(arrayBuffer),
    out = {},
    decoder = new TextDecoder();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw inputError("msgInvalidZipDirectory");
  let pos = view.getUint32(end + 16, true);
  const count = view.getUint16(end + 10, true);
  if (count > 2000) throw inputError("msgWorkbookHasTooManyZipEntries");
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50)
      throw inputError("msgInvalidZipEntry");
    const flags = view.getUint16(pos + 8, true),
      method = view.getUint16(pos + 10, true),
      size = view.getUint32(pos + 20, true),
      rawSize = view.getUint32(pos + 24, true),
      nl = view.getUint16(pos + 28, true),
      el = view.getUint16(pos + 30, true),
      cl = view.getUint16(pos + 32, true),
      local = view.getUint32(pos + 42, true);
    const expectedCrc = view.getUint32(pos + 16, true),
      name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nl));
    pos += 46 + nl + el + cl;
    if (Object.prototype.hasOwnProperty.call(out, name)) throw inputError("msgDuplicateZipEntry");
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    expanded += rawSize;
    if (expanded > 50 * 1024 * 1024 || flags & 1) throw inputError("msgEncryptedOrOversizedWorkbook");
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50)
      throw inputError("msgInvalidZipData");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + size > bytes.length) throw inputError("msgTruncatedZipData");
    const packed = bytes.subarray(start, start + size);
    let unpacked;
    if (method === 0) unpacked = packed;
    else if (method === 8) {
      if (typeof DecompressionStream === "undefined") throw inputError("msgUseACurrentEdgeOrChrome");
      unpacked = new Uint8Array(
        await new Response(
          new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
        ).arrayBuffer(),
      );
    } else throw inputError("msgUnsupportedZipCompression");
    if (unpacked.length !== rawSize || crc32Bytes(unpacked) !== expectedCrc)
      throw inputError("msgWorkbookZipIntegrityCheckFailed");
    out[name] = decoder.decode(unpacked);
  }
  return out;
}

async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.name.toLowerCase().endsWith(".json")) {
      const raw = JSON.parse(await file.text());
      let b;
      if (raw.schemaVersion !== undefined) {
        b = migrateBundle(raw);
      } else {
        const data = Array.isArray(raw) ? raw : raw.currentData;
        validateProject(data);
        b = newProject("Migrated project", data);
        b.versionHistory = raw.versionHistory || [];
        b.auditLog = raw.auditLog || [];
        b.activeVersionTag = raw.activeVersionTag || "Draft";
        if (!raw.legacyGroupFields) throw inputError("msgUnversionedJsonRequiresExplicitLegacygroupfields");
        b.schemaVersion = 1;
        b.legacyGroupFields = raw.legacyGroupFields;
        b = migrateBundle(b);
      }
      const confirmed = await askConfirm(
        t("msgImportJsonSummary", b.metadata.name, allItems(b.currentData).length, b.versionHistory.length),
        {
          title: t("msgImportJsonTitle"),
          confirmLabel: t("msgImportAsCopy"),
        },
      );
      if (!confirmed) return;
      // Complete backup download is initiated before applying any migration.
      exportVersionBundle();
      b = copy(b);
      assignProjectIdentity(b, crypto.randomUUID());
      addProject(b);
    } else if (file.name.toLowerCase().endsWith(".xlsx")) {
      await importControlledExcel(file);
    } else if (file.name.toLowerCase().endsWith(".xml")) {
      await importProjectXML(file);
    } else if (file.name.toLowerCase().endsWith(".mpp")) {
      throw inputError("mspUseXml");
    } else throw inputError("mspUseJsonXlsxXml");
  } catch (e) {
    showError(t("msgImportNotApplied") + e.message);
  } finally {
    event.target.value = "";
  }
}

// Exchange v2: explicit mapping, protected inputs, optimistic concurrency, atomic recovery.
const EXCHANGE_FORMAT = "project-workspace-exchange";

const NEW_TASK_HEADERS = [...EXCEL_HEADERS, "Parent WBS"];

let excelRecoveryPoints = [],
  excelImportBusy = false;

function stableJSON(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((k) => k !== "collapsed")
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stableJSON(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

async function exchangeRevision(bundle) {
  const bytes = new TextEncoder().encode(stableJSON(bundle));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function exchangeBase() {
  const b = currentBundle();
  delete b.recoveryPoints;
  return b;
}

function crc32Bytes(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function exchangeFail(key, ...args) {
  throw inputError(key, ...args);
}

function hasCell(value) {
  return value !== null && value !== undefined && value !== "";
}

function assertHeaders(rows, headers, label) {
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows[0].length !== headers.length ||
    headers.some((h, i) => rows[0][i] !== h)
  )
    throw inputError("msgInvalidHeadersColumnMapping", label);
}

function normalizeExchangeDate(value) {
  if (!hasCell(value) || value === "TBC") return "";
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 1 || value > 2958465 || value === 60)
      throw inputError("msgInvalidExcelDateSerial");
    return formatDate(new Date(Date.UTC(1899, 11, 30) + value * 86400000));
  }
  if (!parseDate(value)) throw inputError("msgInvalidCalendarDate");
  return value;
}

function sameSnapshotCell(a, b, col) {
  if ([6, 7].includes(col)) return normalizeExchangeDate(a) === normalizeExchangeDate(b);
  return String(a ?? "") === String(b ?? "");
}

function guardPlanRows(rows, bundle, complete = true) {
  assertHeaders(rows, EXCEL_HEADERS, "Plan");
  const expected = new Map(
      exchangeRows(bundle.currentData)
        .slice(1)
        .map((r) => [r[0], r]),
    ),
    seen = new Set();
  rows.slice(1).forEach((row, index) => {
    if (!row.some(hasCell)) return;
    const base = expected.get(row[0]);
    if (!base || seen.has(row[0])) throw inputError("msgPlanUnknownChangedOrDuplicateWbs", index + 2);
    seen.add(row[0]);
    if (row.length > 14 && row.slice(14).some(hasCell)) throw inputError("msgPlanExtraColumns");
    const readonly =
      base[1] === "Sub-task"
        ? [0, 1, 7, 10, ...(complete && base[3] ? [6] : [])]
        : Array.from({ length: 14 }, (_, i) => i).filter((i) => !complete || i !== 2);
    for (const col of readonly)
      if (!sameSnapshotCell(row[col], base[col], col))
        throw inputError("msgPlanReadOnlyCellChanged", index + 2, EXCEL_HEADERS[col]);
    for (const col of [6, 7]) if (hasCell(row[col])) normalizeExchangeDate(row[col]);
  });
  if (complete && seen.size !== expected.size) exchangeFail("msgPlanRowsWereRemovedOrOmitted");
}

function appendNewTasks(rows, data) {
  assertHeaders(rows, NEW_TASK_HEADERS, "NewTasks");
  const original = new Map(allItems(data).map((t) => [t.wbs, t])),
    pending = [];
  rows.slice(1).forEach((row, index) => {
    if (!row.some(hasCell)) return;
    if (row.length > 15 && row.slice(15).some(hasCell)) throw inputError("msgNewtasksExtraColumns");
    const [id, level, name] = row,
      parent = row[14] ?? "";
    if (
      typeof id !== "string" ||
      !/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(id) ||
      original.has(id) ||
      pending.some((p) => p.id === id)
    )
      throw inputError("msgNewtasksInvalidDuplicateTextWbs", index + 2);
    if (!["Family", "Main Task", "Sub-task"].includes(level) || typeof name !== "string" || !name.trim())
      throw inputError("msgNewtasksLevelAndNameRequired", index + 2);
    if (hasCell(row[7]) || hasCell(row[10])) throw inputError("msgNewtasksDeliveryDateStatusMustRemain");
    if (level !== "Sub-task" && row.slice(3, 14).some(hasCell))
      throw inputError("msgNewtasksSummaryRowsAcceptOnlyWbs");
    if (typeof parent !== "string" || (level === "Family" ? parent !== "" : !parent))
      throw inputError("msgNewtasksInvalidParentWbs");
    if (level === "Sub-task" && hasCell(row[3]) && hasCell(row[6]))
      throw inputError("msgNewtasksLeaveStartingDateBlankWhen");
    pending.push({ id, level, name: name.trim(), parent, row });
  });
  if (pending.length > 200) throw inputError("msgNewtasksMaximum200AdditionsPerImport");
  const all = new Map(original);
  for (const p of pending) {
    const t =
      p.level === "Family"
        ? { wbs: p.id, name: p.name, mainTasks: [] }
        : p.level === "Main Task"
          ? { wbs: p.id, name: p.name, subtasks: [] }
          : {
              wbs: p.id,
              name: p.name,
              pred: "",
              lag: 0,
              prio: null,
              start: "",
              days: null,
              pct: 0,
              group1: "",
              group2: "",
              group3: "",
            };
    p.task = t;
    all.set(p.id, t);
  }
  for (const p of pending) {
    if (p.level === "Family") data.push(p.task);
    else {
      const parent = all.get(p.parent),
        list = p.level === "Main Task" ? parent?.mainTasks : parent?.subtasks;
      if (!Array.isArray(list)) throw inputError("msgNewtasksParentLevelNotFound", p.id);
      list.push(p.task);
    }
  }
  const subRows = pending.filter((p) => p.level === "Sub-task").map((p) => p.row.slice(0, 14));
  if (subRows.length) applyImportedRows([EXCEL_HEADERS, ...subRows], data);
  return pending.length;
}

function prepareExchangeV2(payload, base, groupUpdate = null) {
  const meta = payload.meta,
    legacy = meta === null;
  if (
    !legacy &&
    (meta.format !== EXCHANGE_FORMAT ||
      meta.version !== 2 ||
      !["update", "create"].includes(meta.mode) ||
      stableJSON(meta.columns) !== stableJSON(EXCEL_HEADERS) ||
      stableJSON(meta.newColumns) !== stableJSON(NEW_TASK_HEADERS))
  )
    throw inputError("msgUnsupportedExchangeVersionOrMapping");
  const create = !legacy && meta.mode === "create";
  if (!legacy && !create && meta.projectId !== base.projectId)
    exchangeFail("msgWorkbookProjectIdDoesNotMatch");
  if (create && (meta.projectId !== null || meta.baseRevision !== null))
    throw inputError("msgInvalidCreationTemplateIdentity");
  const candidate = create ? newProject("New project") : copy(base);
  guardPlanRows(payload.plan, candidate, !legacy);
  if (!legacy) {
    const lookup = new Map(allItems(candidate.currentData).map((t) => [t.wbs, t]));
    for (const row of payload.plan.slice(1).filter((r) => r.some(hasCell))) {
      if (row[1] !== "Sub-task") {
        if (typeof row[2] !== "string" || !row[2].trim()) throw inputError("msgPlanSummaryNameRequired");
        lookup.get(row[0]).name = row[2].trim();
      }
    }
  }
  const subRows = payload.plan.filter((r, i) => i === 0 || r[1] === "Sub-task");
  if (subRows.length > 1) applyImportedRows(subRows, candidate.currentData);
  let added = 0;
  if (!legacy) {
    assertHeaders(payload.project, ["Field", "Value"], "Project");
    if (
      payload.project.length !== 3 ||
      payload.project[1]?.[0] !== "Project Name" ||
      payload.project[2]?.[0] !== "Status Date" ||
      payload.project.slice(1).some((r) => r.length > 2 && r.slice(2).some(hasCell))
    )
      throw inputError("msgProjectInvalidFieldMapping");
    const statusDate = normalizeExchangeDate(payload.project[2][1]);
    if (typeof payload.project[1][1] !== "string" || !payload.project[1][1].trim() || !statusDate)
      throw inputError("msgProjectProjectNameAndValidStatus");
    candidate.metadata.name = payload.project[1][1].trim();
    candidate.settings.statusDate = statusDate;
    added = appendNewTasks(payload.newTasks, candidate.currentData);
  }
  if (groupUpdate) {
    candidate.settings.groups = copy(groupUpdate.groups);
    const tasks = new Map(allItems(candidate.currentData).map((t) => [t.wbs, t]));
    for (const row of groupUpdate.rows.filter((r) => r[1] === "Sub-task"))
      for (let i = 3; i < 10; i++) tasks.get(row[0])[GROUP_IDS[i]] = exchangePeople(row[11 + i]);
  }
  recalculateSchedule(candidate.currentData, candidate.settings.statusDate);
  validateBundle(candidate);
  const changes = exchangeChanges(create ? [] : base.currentData, candidate.currentData);
  if (candidate.metadata.name !== base.metadata.name && !create)
    changes.unshift({
      wbs: "Project",
      field: "Project Name",
      before: base.metadata.name,
      after: candidate.metadata.name,
    });
  if (candidate.settings.statusDate !== base.settings.statusDate && !create)
    changes.unshift({
      wbs: "Project",
      field: "Status Date",
      before: base.settings.statusDate,
      after: candidate.settings.statusDate,
    });
  return { candidate, changes, added, create, legacy };
}

function exchangeChanges(before, after) {
  const old = new Map(
      exchangeRows(before)
        .slice(1)
        .map((r) => [r[0], r]),
    ),
    changes = [];
  for (const row of exchangeRows(after).slice(1)) {
    const prev = old.get(row[0]);
    if (!prev) {
      changes.push({
        wbs: row[0],
        field: "New " + row[1],
        before: "",
        after: row[2],
      });
      continue;
    }
    for (let col = 2; col < 14; col++)
      if (!sameSnapshotCell(prev[col], row[col], col))
        changes.push({
          wbs: row[0],
          field: EXCEL_HEADERS[col],
          before: [6, 7].includes(col) ? normalizeExchangeDate(prev[col]) : String(prev[col] ?? ""),
          after: [6, 7].includes(col) ? normalizeExchangeDate(row[col]) : String(row[col] ?? ""),
        });
  }
  return changes;
}

function worksheetNames(files) {
  const book = xmlDocument(files["xl/workbook.xml"], "workbook");
  return [...book.getElementsByTagNameNS("*", "sheet")].map((s) => s.getAttribute("name"));
}

async function readExchangePayload(files, base) {
  const names = worksheetNames(files);
  if (new Set(names).size !== names.length) throw inputError("msgDuplicateWorksheetNames");
  for (const [name, xml] of Object.entries(files))
    if (name.endsWith(".rels")) {
      const d = xmlDocument(xml, "relationships");
      if (
        [...d.getElementsByTagNameNS("*", "Relationship")].some(
          (r) => r.getAttribute("TargetMode") === "External",
        )
      )
        throw inputError("msgExternalWorkbookLinksAreNotSupported");
    }
  // Parse all sheets to reject formulas/errors even outside the input area.
  const sheets = Object.fromEntries(names.map((name) => [name, xlsxSheetRows(files, name)]));
  if (!names.includes("Metadata")) {
    if (names.some((n) => !["Plan", "Instructions"].includes(n)))
      throw inputError("msgVersionMetadataMissingUseAnIntact");
    return { meta: null, plan: sheets.Plan };
  }
  const rows = sheets.Metadata;
  assertHeaders(rows, ["Field", "Value"], "Metadata");
  if (rows.length !== 2 || rows[1]?.[0] !== "Contract" || typeof rows[1]?.[1] !== "string")
    throw inputError("msgInvalidExchangeContract");
  const meta = JSON.parse(rows[1][1]);
  if (![2, 3].includes(meta.version)) throw inputError("msgUnsupportedExchangeVersion");
  const required = [
    "Plan",
    "NewTasks",
    "Project",
    "Instructions",
    "Metadata",
    ...(meta.version === 3 ? ["Groups"] : []),
  ];
  if (
    required.some((n) => !names.includes(n)) ||
    names.some((n) => ![...required, "Instructions_zh"].includes(n))
  )
    throw inputError("msgMissingOrUnexpectedExchangeWorksheets");
  await validateExchangeRevision(meta, base);
  return {
    meta,
    plan: sheets.Plan,
    newTasks: sheets.NewTasks,
    project: sheets.Project,
    groupRows: sheets.Groups,
  };
}

async function validateExchangeRevision(meta, base) {
  if (meta.mode === "update" && meta.projectId !== base.projectId)
    exchangeFail("msgWorkbookProjectIdDoesNotMatch");
  if (meta.mode === "update" && meta.baseRevision !== (await exchangeRevision(base)))
    exchangeFail("msgThisWorkbookIsStaleWebData");
}

function excelSheetXML(
  rows,
  editable,
  widths,
  validation = "",
  isDate = (r, c) => [6, 7].includes(c),
  styleOverride = null,
) {
  const esc = escapeHtml,
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rowHeight = (row, r) =>
    Math.min(
      500,
      Math.max(
        r ? 30 : 38,
        ...row.map((v, c) => {
          const units = Array.from(String(v ?? "")).reduce(
            (n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1),
            0,
          );
          return Math.ceil(units / Math.max(1, (widths[c] || 18) - 3)) * 15 + 10;
        }),
      ),
    );
  const content = rows
    .map(
      (row, r) =>
        '<row r="' +
        (r + 1) +
        '" ht="' +
        rowHeight(row, r) +
        '" customHeight="1">' +
        row
          .map((value, c) => {
            const unlocked = r > 0 && editable(r, c),
              date = isDate(r, c),
              pct = c === 9,
              text = [0, 3, 14].includes(c);
            const style = styleOverride
              ? styleOverride(r, c)
              : r === 0
                ? 1
                : unlocked
                  ? date
                    ? 5
                    : pct
                      ? 6
                      : text
                        ? 7
                        : 2
                  : date
                    ? 3
                    : pct
                      ? 4
                      : text
                        ? 8
                        : 0;
            if (
              typeof value === "string" &&
              (value.length > 32000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))
            )
              throw inputError("msgExcelCellTextIsInvalidOr");
            return (
              '<c r="' +
              String.fromCharCode(65 + c) +
              (r + 1) +
              '" s="' +
              style +
              '"' +
              (typeof value === "number"
                ? "><v>" + value + "</v>"
                : ' t="inlineStr"><is><t xml:space="preserve">' + esc(value ?? "") + "</t></is>") +
              "</c>"
            );
          })
          .join("") +
        "</row>",
    )
    .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="' +
    ns +
    '"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>' +
    widths
      .map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>')
      .join("") +
    "</cols><sheetData>" +
    content +
    '</sheetData><sheetProtection sheet="1" objects="1" scenarios="1" selectLockedCells="0" selectUnlockedCells="0"/>' +
    validation +
    "</worksheet>"
  );
}

function excelValidation(ranges) {
  if (!ranges.length) return "";
  return (
    '<dataValidations count="' +
    ranges.length +
    '">' +
    ranges
      .map(
        ([range, type, a, b]) =>
          '<dataValidation sqref="' +
          range +
          '" type="' +
          type +
          '" ' +
          (type === "list" ? "" : 'operator="between" ') +
          'allowBlank="1" showErrorMessage="1" errorStyle="stop" errorTitle="Invalid input" error="Use the values and units defined in Instructions."><formula1>' +
          escapeHtml(a) +
          "</formula1>" +
          (b === undefined ? "" : "<formula2>" + escapeHtml(b) + "</formula2>") +
          "</dataValidation>",
      )
      .join("") +
    "</dataValidations>"
  );
}

function exchangeStyles() {
  const styles = [
    [0, 2, 1],
    [0, 3, 1],
    [0, 4, 0],
    [164, 2, 1],
    [165, 2, 1],
    [164, 4, 0],
    [165, 4, 0],
    [49, 4, 0],
    [49, 2, 1],
    [0, 3, 1, 1],
    [0, 2, 1, 1],
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="2"><font><sz val="9"/><color rgb="FF3A3A3A"/><name val="Arial"/></font><font><sz val="9"/><color rgb="FF3A3A3A"/><name val="等线"/><charset val="134"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7F7F7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0EEE8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4E5"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11">' +
    styles
      .map(
        ([num, fill, locked, font = 0]) =>
          '<xf numFmtId="' +
          num +
          '" fontId="' +
          font +
          '" fillId="' +
          fill +
          '" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1" applyAlignment="1" applyProtection="1"><alignment vertical="center" wrapText="1"/><protection locked="' +
          locked +
          '"/></xf>',
      )
      .join("") +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0"/></cellStyles></styleSheet>'
  );
}

function previewExcel(plan) {
  const rows = plan.changes
    .map(
      (c) =>
        "<tr>" +
        [c.wbs, c.field, c.before, c.after].map((v) => "<td>" + escapeHtml(v) + "</td>").join("") +
        "</tr>",
    )
    .join("");
  return showDialog({
    title: plan.source === "Project XML" ? t("mspPreviewTitle") : t("msgExcelImportPreview"),
    size: "wide",
    bodyHtml:
      '<p class="app-dialog-message">' +
      escapeHtml(
        (plan.create ? t("msgCreateProject") : t("msgUpdateProject")) + plan.candidate.metadata.name,
      ) +
      '</p><p class="ui-caption">' +
      escapeHtml(
        plan.source === "Project XML"
          ? plan.notices.join(" ")
          : plan.legacy
            ? t("msgLegacyV10NoProjectIdentity")
            : t("msgV20EditableFieldsOnlyRecovery"),
      ) +
      '</p><p class="ui-caption">' +
      plan.added +
      t("msgNew") +
      plan.changes.length +
      t("msgFieldChangesIncludingRecalculations") +
      '</p><div class="exchange-changes"><table class="data-grid"><thead><tr>' +
      [t("msgTask"), t("msgField"), t("msgBefore"), t("msgAfter")]
        .map((label) => "<th>" + label + "</th>")
        .join("") +
      "</tr></thead><tbody>" +
      rows +
      '</tbody></table></div><p class="ui-caption">' +
      (plan.source === "Project XML" ? t("mspReadOnlyCopy") : t("msgTheSourceExcelIsNeverWritten")) +
      "</p>",
    actions: [
      { label: t("msgCancel"), value: false },
      { label: t("msgApplyChanges"), value: true, kind: "primary" },
    ],
  }).then((value) => value === true);
}

// A recovery point stores the project data and settings only. Version history and the audit log are
// independent of imports and always taken from the live project when a point is restored.
function compactRecoveryPoint(point) {
  const bundle = copy(point.bundle);
  delete bundle.recoveryPoints;
  bundle.currentData = compactData(bundle.currentData);
  bundle.versionHistory = [];
  bundle.auditLog = [];
  return { time: point.time, bundle };
}

function recoveryEntry(b) {
  return compactRecoveryPoint({ time: nowTimestamp(), bundle: b });
}

function commitExcelCandidate(plan, guard) {
  if (storageReadBlocked) exchangeFail("msgStorageRecoveryModeBlocksImport");
  if (!plan.create && projectMeta.archived) exchangeFail("msgProjectArchivedReadOnly");
  if (
    projectId !== guard.projectId ||
    stableJSON(exchangeBase()) !== guard.baseState ||
    localStorage.getItem(WORKSPACE_KEY) !== guard.stored
  )
    exchangeFail("msgDataChangedDuringPreviewImportCancelled");
  const b = copy(plan.candidate),
    next = copy(workspace);
  if (plan.create) {
    if (next.projects[b.projectId]) throw inputError("msgDuplicateProjectId");
    b.recoveryPoints = [];
  } else b.recoveryPoints = [recoveryEntry(currentBundle()), ...excelRecoveryPoints].slice(0, 3);
  b.auditLog.unshift({
    time: nowTimestamp(),
    ver: b.activeVersionTag,
    wbs: "-",
    action: plan.source === "Project XML" ? "Project XML import" : "Excel import",
    detail: plan.added + " new; " + plan.changes.length + " field changes",
  });
  b.auditLog = b.auditLog.slice(0, 200);
  validateBundle(b);
  next.projects[b.projectId] = b;
  next.activeProjectId = b.projectId;
  commitWorkspace(next);
  selectBundle(b);
  applyStaticI18n();
  renderAll();
}

async function importControlledExcel(file) {
  if (excelImportBusy) throw inputError("msgAnImportIsAlreadyInProgress");
  excelImportBusy = true;
  try {
    const base = exchangeBase(),
      guard = {
        projectId,
        baseState: stableJSON(base),
        stored: localStorage.getItem(WORKSPACE_KEY),
      };
    if (file.size > 20 * 1024 * 1024) throw inputError("msgWorkbookExceeds20Mb");
    const files = await unzipXlsxBuffer(await file.arrayBuffer()),
      payload = await readExchangePayload(files, base),
      plan = prepareExchangeCandidate(payload, base);
    if (!plan.create && !plan.changes.length) {
      showMessage(t("msgNoChangesToApply"));
      return;
    }
    if (!(await previewExcel(plan))) return;
    commitExcelCandidate(plan, guard);
  } finally {
    excelImportBusy = false;
  }
}

async function downloadExchange(mode) {
  try {
    const base = exchangeBase();
    validateBundle(base);
    const bytes = await buildControlledWorkbook(mode, base);
    downloadBlob(
      bytes,
      "Project_" +
        (mode === "create" ? "Blank_Template" : base.projectId) +
        "_v3_" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        "_" +
        crypto.randomUUID().slice(0, 8) +
        ".xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  } catch (e) {
    showError(t("msgExportFailed") + e.message);
  }
}

async function restoreExcelRecovery() {
  try {
    const point = excelRecoveryPoints[0];
    if (!point) throw inputError("msgNoExcelRecoveryPoint");
    const base = exchangeBase(),
      guard = {
        projectId,
        baseState: stableJSON(base),
        stored: localStorage.getItem(WORKSPACE_KEY),
      },
      b = copy(point.bundle);
    b.versionHistory = copy(versionList);
    b.auditLog = copy(auditLog);
    b.activeVersionTag = activeVersionTag;
    recalculateSchedule(b.currentData, b.settings.statusDate);
    validateBundle(b);
    if (b.projectId !== projectId) throw inputError("msgRecoveryProjectMismatch");
    if (
      !(await askConfirm(t("msgRestoreDataBeforeTheLastExcel"), {
        confirmLabel: t("msgRestore"),
      }))
    )
      return;
    commitExcelCandidate(
      {
        candidate: b,
        create: false,
        added: 0,
        changes: exchangeChanges(base.currentData, b.currentData),
      },
      guard,
    );
  } catch (e) {
    showError(t("msgRecoveryNotApplied") + e.message);
  }
}

const GROUP_FIELDS = [
  "wbs",
  "level",
  "name",
  "pred",
  "lag",
  "prio",
  "start",
  "finish",
  "days",
  "pct",
  "status",
  ...GROUP_IDS,
];

const GROUP_SHEET_HEADERS = ["Group ID", "Enabled", "Name", "Color"];

function groupExcelHeaders(settings) {
  return [
    ...EXCEL_HEADERS.slice(0, 11),
    ...GROUP_IDS.map((id, i) => {
      const name = groups(settings).find((g) => g.id === id)?.name,
        slot = "Group " + (i + 1);
      return name && name !== slot ? slot + " | " + name : slot;
    }),
  ];
}

function groupExchangeRows(data = projectData, settings = projectSettings) {
  const rows = exchangeRows(data);
  return [
    groupExcelHeaders(settings),
    ...rows
      .slice(1)
      .map((row, i) => [
        ...row.slice(0, 11),
        ...GROUP_IDS.map((id) => exchangePeople(allItems(data)[i][id])),
      ]),
  ];
}

function parseExcelGroups(rows) {
  assertHeaders(rows, GROUP_SHEET_HEADERS, "Groups");
  if (rows.length !== 11) throw inputError("msgGroupsRequiresAll10SlotRows");
  const list = [];
  rows.slice(1).forEach((r, i) => {
    if (r[0] !== GROUP_IDS[i] || r.length !== 4 || !["Yes", "No"].includes(r[1]))
      throw inputError("msgGroupsDoNotChangeIdsOr");
    if (r[1] === "Yes")
      list.push({
        id: r[0],
        name: typeof r[2] === "string" ? r[2].trim() : "",
        color: r[3],
      });
  });
  validateGroups(list);
  return list;
}

function packageExchangeSheets(sheets) {
  const files = { "xl/styles.xml": exchangeStyles() },
    ns = "http://schemas.openxmlformats.org/package/2006/relationships";
  files["[Content_Types].xml"] =
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets
      .map(
        (_, i) =>
          '<Override PartName="/xl/worksheets/sheet' +
          (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>',
      )
      .join("") +
    "</Types>";
  files["_rels/.rels"] =
    '<Relationships xmlns="' +
    ns +
    '"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  files["xl/_rels/workbook.xml.rels"] =
    '<Relationships xmlns="' +
    ns +
    '">' +
    sheets
      .map(
        (_, i) =>
          '<Relationship Id="rId' +
          (i + 1) +
          '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
          (i + 1) +
          '.xml"/>',
      )
      .join("") +
    '<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  files["xl/workbook.xml"] =
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookProtection lockStructure="1"/><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    sheets
      .map(
        ([name], i) =>
          '<sheet name="' +
          name +
          '" sheetId="' +
          (i + 1) +
          '" r:id="rId' +
          (i + 1) +
          '"' +
          (name === "Metadata" ? ' state="hidden"' : "") +
          "/>",
      )
      .join("") +
    "</sheets></workbook>";
  sheets.forEach(([, xml], i) => (files["xl/worksheets/sheet" + (i + 1) + ".xml"] = xml));
  return storedZip(files);
}

async function buildControlledWorkbook(mode = "update", base = exchangeBase()) {
  if (!["create", "update"].includes(mode)) throw inputError("msgInvalidExchangeMode");
  validateBundle(base);
  const b = mode === "create" ? newProject("New project") : copy(base);
  recalculateSchedule(b.currentData, b.settings.statusDate);
  const columns = groupExcelHeaders(b.settings),
    newColumns = [...columns, "Parent WBS"];
  const meta = {
    format: EXCHANGE_FORMAT,
    version: 3,
    mode,
    projectId: mode === "create" ? null : b.projectId,
    baseRevision: mode === "create" ? null : await exchangeRevision(base),
    columns,
    newColumns,
    fields: GROUP_FIELDS,
    newFields: [...GROUP_FIELDS, "parentWbs"],
    maxGroups: 10,
  };
  const plan = mode === "create" ? [columns] : groupExchangeRows(b.currentData, b.settings),
    newRows = [newColumns, ...Array.from({ length: 200 }, () => Array(22).fill(""))];
  const groupRows = [
    GROUP_SHEET_HEADERS,
    ...GROUP_IDS.map((id, i) => {
      const g = groups(b.settings).find((g) => g.id === id);
      return [id, g ? "Yes" : "No", g?.name || "Group " + (i + 1), g?.color || GROUP_COLORS[i]];
    }),
  ];
  const en = [
    ["Step / rule", "Instructions"],
    [
      "1. Configure groups",
      "Groups supports 1–10 groups. Keep Group ID unchanged. Set Enabled to Yes/No; edit Name and Color. Names are unrestricted project roles, not fixed job types. Names must be unique.",
    ],
    [
      "2. Create",
      "Fill Project. In NewTasks enter text WBS, Level, name and Parent WBS (column V). Family has no parent; Main Task belongs to Family; Sub-task belongs to Main Task. Summary rows accept A:C and V only.",
    ],
    [
      "3. Update",
      "Keep every Plan row and its WBS / Level. Edit C (name); subtasks also allow D:F, I:J and L:U. G is editable only without an existing predecessor. H/K and summaries are calculated. Use NewTasks for additions; do not delete Plan rows.",
    ],
    [
      "4. Group assignments",
      "L:U map to group1–group10 by stable ID. Column captions reflect the exported names; change group names in Groups, not the headers. Renaming preserves assignments. Disabled groups must have no task assignments.",
    ],
    [
      "5. Preview and save",
      "Review every change, including group configuration and schedule recalculations. Confirm to commit once; errors or cancellation preserve data. Before updates the app retains three project recovery points.",
    ],
    [
      "6. Save a new file",
      "Export a new timestamped XLSX after web edits. The app only reads source files and never writes them back. Stale revisions, wrong projects or changes during preview reject import.",
    ],
    [
      "Input types",
      "Text IDs; Excel dates or YYYY-MM-DD; positive integer duration; signed integer Lag; priority 1/2/3; progress 25% or 0.25; people separated by semicolons. Blank people clear values; blank dates/durations mean TBC; blank progress/Lag means zero.",
    ],
    [
      "No formulas",
      "Formulas, external relationships and error cells are rejected in every sheet. Sheet protection is for accidental edits, not encryption. At most 200 new tasks per import.",
    ],
    [
      "Field mapping",
      "A:K = wbs, level, name, pred, lag, prio, start, finish, days, pct/100, status.code. L:U = group1 through group10. NewTasks V = parentWbs. Metadata v3 stores explicit field and column mappings.",
    ],
    [
      "Language and compatibility",
      "Data labels and this sheet use English Arial 9 pt. Instructions_zh uses DengXian 9 pt. User text is preserved. v1/v2 imports retain their 14-column meaning; v3 is required to export all 10 group slots.",
    ],
  ];
  const zh = [
    ["步骤 / 规则", "中文说明"],
    [
      "1. 配置组",
      "Groups 支持 1–10 个自定义组。Group ID 不可修改。Enabled 填 Yes/No，Name 和 Color 可编辑。名称不限于特定职位，组名不可重复。",
    ],
    [
      "2. 创建",
      "填写 Project。在 NewTasks 填文本 WBS、Level、名称和 V 列 Parent WBS。Family 无父级；Main Task 的父级为 Family；Sub-task 的父级为 Main Task。汇总级仅填 A:C 和 V。",
    ],
    [
      "3. 更新",
      "保留 Plan 所有原行及 WBS / Level。C 列名称可改；子任务还可改 D:F、I:J 和 L:U；G 仅原任务无前置时可改。H/K 及汇总值只读。新增填写 NewTasks，不通过删行删除任务。",
    ],
    [
      "4. 组与人员",
      "L:U 按稳定编号映射 group1–group10。表头显示导出时的组名；改名请在 Groups 操作，不改表头。改名保留原关联；禁用组必须先清空其任务人员。",
    ],
    [
      "5. 预览和保存",
      "核对包含组配置与排程重算的全部变化，确认后一次提交；错误或取消不改数据。更新前保留项目内最近三个恢复点。",
    ],
    [
      "6. 另存新文件",
      "网页修改后导出带时间与随机后缀的新文件。应用只读取源文件，不写回。源版本过期、错项目或预览期间数据变化时拒绝导入。",
    ],
    [
      "输入格式",
      "编号为文本；日期为 Excel 日期或 YYYY-MM-DD；工期正整数；Lag 为有符号整数自然日；优先级 1/2/3；进度填 25% 或 0.25；人员用分号分隔。空人员清除，空日期/工期未定，空进度/Lag 为零。",
    ],
    [
      "禁止公式",
      "全部工作表均禁止公式、外链及错误单元格。表保护用于防误操作，不是加密。一次最多新增 200 条任务。",
    ],
    [
      "字段对应",
      "A:K 对应编号、层级、名称、前置、Lag、优先级、开始日期、计算交付日期、工期、进度、计算状态。L:U 对应 group1–group10；NewTasks 的 V 列对应父级编号。Metadata v3 明确保存字段和列映射。",
    ],
    [
      "字体与兼容",
      "数据表及英文说明使用 Arial 9 号，本中文表使用等线 9 号。用户原文保留。v1/v2 导入维持原 14 列语义；完整导出 10 个组使用 v3。",
    ],
  ];
  const widths = [16, 18, 48, 18, 12, 12, 18, 18, 12, 16, 14, ...GROUP_IDS.map(() => 24)];
  const rules = (r) => [
    ["E" + r, "whole", "-365000", "365000"],
    ["F" + r, "list", '"1,2,3"'],
    ["G" + r, "date", "1", "2958465"],
    ["I" + r, "whole", "1", "365000"],
    ["J" + r, "decimal", "0", "1"],
  ];
  const ranges = [
    ["B2:B201", "list", '"Family,Main Task,Sub-task"'],
    ...rules(2).map(([ref, ...rest]) => [ref + ":" + ref.replace("2", "201"), ...rest]),
  ];
  return packageExchangeSheets([
    [
      "Project",
      excelSheetXML(
        [
          ["Field", "Value"],
          ["Project Name", b.metadata.name],
          [
            "Status Date",
            (Date.parse(b.settings.statusDate + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86400000,
          ],
        ],
        (r, c) => c === 1,
        [24, 65],
        excelValidation([["B3", "date", "1", "2958465"]]),
        (r, c) => r === 2 && c === 1,
      ),
    ],
    [
      "Plan",
      excelSheetXML(
        plan,
        (r, c) =>
          c === 2 ||
          (plan[r][1] === "Sub-task" && ([3, 4, 5, 8, 9].includes(c) || c >= 11 || (c === 6 && !plan[r][3]))),
        widths,
        excelValidation(plan.slice(1).flatMap((row, i) => (row[1] === "Sub-task" ? rules(i + 2) : []))),
      ),
    ],
    [
      "NewTasks",
      excelSheetXML(newRows, (r, c) => ![7, 10].includes(c), [...widths, 20], excelValidation(ranges)),
    ],
    ["Instructions", excelSheetXML(en, () => false, [24, 115])],
    [
      "Instructions_zh",
      excelSheetXML(
        zh,
        () => false,
        [24, 115],
        "",
        () => false,
        (r) => (r ? 10 : 9),
      ),
    ],
    [
      "Metadata",
      excelSheetXML(
        [
          ["Field", "Value"],
          ["Contract", JSON.stringify(meta)],
        ],
        () => false,
        [24, 100],
      ),
    ],
    [
      "Groups",
      excelSheetXML(
        groupRows,
        (r, c) => c > 0,
        [18, 15, 36, 20],
        excelValidation([["B2:B11", "list", '"Yes,No"']]),
        () => false,
      ),
    ],
  ]);
}

function prepareGroupedExchange(payload, base) {
  const m = payload.meta;
  if (
    m.format !== EXCHANGE_FORMAT ||
    m.version !== 3 ||
    !["create", "update"].includes(m.mode) ||
    m.maxGroups !== 10 ||
    stableJSON(m.fields) !== stableJSON(GROUP_FIELDS) ||
    stableJSON(m.newFields) !== stableJSON([...GROUP_FIELDS, "parentWbs"]) ||
    !Array.isArray(m.columns) ||
    m.columns.length !== 21 ||
    stableJSON(m.columns.slice(0, 11)) !== stableJSON(EXCEL_HEADERS.slice(0, 11)) ||
    stableJSON(m.newColumns) !== stableJSON([...m.columns, "Parent WBS"])
  )
    throw inputError("msgInvalidV3FieldMapping");
  assertHeaders(payload.plan, m.columns, "Plan");
  assertHeaders(payload.newTasks, m.newColumns, "NewTasks");
  const configured = parseExcelGroups(payload.groupRows);
  const oldRows = new Map(
    groupExchangeRows(base.currentData, base.settings)
      .slice(1)
      .map((r) => [r[0], r]),
  );
  for (const row of payload.plan.slice(1).filter((r) => r.some(hasCell))) {
    if (row.length > 21 && row.slice(21).some(hasCell)) throw inputError("msgPlanExtraColumns");
    if (row[1] !== "Sub-task" && m.mode === "update")
      for (let i = 14; i < 21; i++)
        if (String(row[i] ?? "") !== String(oldRows.get(row[0])?.[i] ?? ""))
          throw inputError("msgPlanSummaryGroupAssignmentsAreRead");
  }
  for (const row of payload.newTasks.slice(1).filter((r) => r.some(hasCell))) {
    if (row.length > 22 && row.slice(22).some(hasCell)) throw inputError("msgNewtasksExtraColumns");
    if (row[1] !== "Sub-task" && row.slice(3, 21).some(hasCell))
      throw inputError("msgNewtasksSummaryRowsAcceptAC");
  }
  const adapter = {
    meta: {
      ...m,
      version: 2,
      columns: EXCEL_HEADERS,
      newColumns: NEW_TASK_HEADERS,
    },
    project: payload.project,
    plan: [EXCEL_HEADERS, ...payload.plan.slice(1).map((r) => r.slice(0, 14))],
    newTasks: [NEW_TASK_HEADERS, ...payload.newTasks.slice(1).map((r) => [...r.slice(0, 14), r[21]])],
  };
  const result = prepareExchangeV2(adapter, base, {
      groups: configured,
      rows: [...payload.plan.slice(1), ...payload.newTasks.slice(1)],
    }),
    candidate = result.candidate;
  candidate.settings.groups = configured;
  const lookup = new Map(allItems(candidate.currentData).map((t) => [t.wbs, t]));
  for (const row of [...payload.plan.slice(1), ...payload.newTasks.slice(1)].filter(
    (r) => r[1] === "Sub-task",
  )) {
    const task = lookup.get(row[0]);
    for (let i = 3; i < 10; i++) task[GROUP_IDS[i]] = exchangePeople(row[11 + i]);
  }
  validateBundle(candidate);
  recalculateSchedule(candidate.currentData, candidate.settings.statusDate);
  const before = new Map(
    groupExchangeRows(m.mode === "create" ? [] : base.currentData, base.settings)
      .slice(1)
      .map((r) => [r[0], r]),
  );
  result.changes = [];
  for (const row of groupExchangeRows(candidate.currentData, candidate.settings).slice(1)) {
    const old = before.get(row[0]);
    for (let col = 2; col < 21; col++)
      if (!old || !sameSnapshotCell(old[col], row[col], col))
        result.changes.push({
          wbs: row[0],
          field: m.columns[col],
          before: old?.[col] ?? "",
          after: row[col] ?? "",
        });
  }
  if (stableJSON(base.settings.groups) !== stableJSON(configured))
    result.changes.unshift({
      wbs: "Project",
      field: "Groups",
      before: JSON.stringify(base.settings.groups),
      after: JSON.stringify(configured),
    });
  for (const [field, old, value] of [
    ["Project Name", base.metadata.name, candidate.metadata.name],
    ["Status Date", base.settings.statusDate, candidate.settings.statusDate],
  ])
    if (old !== value)
      result.changes.unshift({
        wbs: "Project",
        field,
        before: old,
        after: value,
      });
  return result;
}

function normalizeLegacyPayload(payload) {
  const p = copy(payload);
  if (p.meta?.version === 3) return p;
  const header = p.plan?.[0],
    valid =
      Array.isArray(header) &&
      header.length === 14 &&
      stableJSON(header.slice(0, 11)) === stableJSON(EXCEL_HEADERS.slice(0, 11)) &&
      header.slice(11).every((x) => typeof x === "string" && x.trim()) &&
      new Set(header.slice(11)).size === 3;
  if (!valid) throw inputError("msgInvalidLegacy14ColumnMapping");
  if (p.meta?.version === 2) {
    if (
      stableJSON(p.meta.columns) !== stableJSON(header) ||
      stableJSON(p.meta.newColumns) !== stableJSON([...header, "Parent WBS"]) ||
      stableJSON(p.newTasks?.[0]) !== stableJSON(p.meta.newColumns)
    )
      throw inputError("msgLegacyFileColumnDeclarationsDoNot");
    p.meta.columns = copy(EXCEL_HEADERS);
    p.meta.newColumns = copy(NEW_TASK_HEADERS);
    p.newTasks[0] = copy(NEW_TASK_HEADERS);
  }
  p.plan[0] = copy(EXCEL_HEADERS);
  return p;
}

function prepareExchangeCandidate(payload, base) {
  const p = normalizeLegacyPayload(payload);
  return p.meta?.version === 3 ? prepareGroupedExchange(p, base) : prepareExchangeV2(p, base);
}

function exportToExcelXML() {
  return showDialog({
    title: t("msgExcelV3TemplatesAndCopies"),
    bodyHtml:
      '<p class="app-dialog-message">' +
      t("msgUpTo10CustomGroupsConfigure") +
      '</p><div class="exchange-options"><button type="button" class="btn btn-primary" data-mode="update">' +
      t("msgSaveCurrentProjectV3") +
      '</button><button type="button" class="btn" data-mode="create">' +
      t("msgBlankCreationTemplateV3") +
      '</button><button type="button" class="btn" id="excelRestore" ' +
      (excelRecoveryPoints.length ? "" : "disabled") +
      ">" +
      t("msgRestoreBeforeLastImport") +
      '</button></div><p class="ui-caption">' +
      t("msgV1V2ImportsPreserveTheFirst") +
      "</p>",
    actions: [{ label: t("msgClose"), value: null }],
    onOpen(d) {
      d.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => downloadExchange(b.dataset.mode)));
      d.querySelector("#excelRestore").onclick = () => {
        closeAppDialog(d, null);
        restoreExcelRecovery();
      };
    },
  });
}

/* Microsoft Project XML: explicit, limited field exchange; source files stay read-only. */
const MSP_NS = "http://schemas.microsoft.com/project";
const MSP_TEXT_IDS = [
  "188743731",
  "188743734",
  "188743737",
  "188743740",
  "188743743",
  "188743746",
  "188743747",
  "188743748",
  "188743749",
  "188743750",
];
const MSP_MARKER = "ProjectWorkspace XML v1\n";
const MSP_TASK_MARKER = "ProjectWorkspace Task v1\n";
const MSP_MAPPING = {
  wbs: "WBS",
  level: "OutlineLevel",
  name: "Name",
  start: "Start",
  finish: "Finish (exclusive)",
  days: "Duration (24 hours/day)",
  pct: "PercentComplete",
  prio: "Priority (900/500/100)",
  pred: "PredecessorUID (FS)",
  lag: "LinkLag (14400/day)",
  groups: GROUP_IDS.map((id, i) => [id, MSP_TEXT_IDS[i]]),
};
function mspReject(key, ...args) {
  throw inputError(key, ...args);
}
function mspChildren(node, name) {
  return [...node.children].filter((n) => n.localName === name && n.namespaceURI === MSP_NS);
}
function mspNode(node, name) {
  const found = mspChildren(node, name);
  if (found.length > 1) throw inputError("mspDuplicateProjectXmlElement0", name);
  return found[0];
}
function mspText(node, name, fallback = "") {
  const n = mspNode(node, name);
  if (n?.children.length) throw inputError("mspExpectedATextField0", name);
  return n ? n.textContent : fallback;
}
function mspValue(node, name, fallback = "") {
  return mspText(node, name, fallback).trim();
}
function mspNumber(node, name, fallback) {
  const value = mspValue(node, name);
  if (value === "") return fallback;
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw inputError("mspInvalidInteger0", name);
  return Number(value);
}
function mspDate(value, finish = false) {
  if (!value) return "";
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.0+)?$/.test(value) ||
    !parseDate(value.slice(0, 10)) ||
    !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d/.test(value.slice(11))
  )
    throw inputError("mspInvalidUnsupportedProjectDate0", value);
  return finish && /^00:00:00/.test(value.slice(11)) ? addDays(value.slice(0, 10), -1) : value.slice(0, 10);
}
function mspDuration(value, format) {
  if (!value) return null;
  if (![4, 6, 8, 10, 12].includes(format))
    mspReject("mspUseElapsedDurationsWorkingCalendarsCannotBeSilently");
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) throw inputError("mspUnsupportedProjectDuration0", value);
  const days =
    Number(match[1] || 0) +
    (Number(match[2] || 0) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0)) / 86400;
  if (!Number.isSafeInteger(days) || days < 1 || days > 365000)
    mspReject("mspDurationMustBePositiveWholeCalendarDaysMilestones");
  return days;
}
const MSP_ELAPSED_FORMATS = [4, 6, 8, 10, 12];
// Fallback for a task without dates: working duration in whole days (at least one).
function mspWorkingDays(value, minutesPerDay) {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
  if (!match) throw inputError("mspUnsupportedProjectDuration0", value);
  const minutes =
    Number(match[1] || 0) * 1440 +
    Number(match[2] || 0) * 60 +
    Number(match[3] || 0) +
    Number(match[4] || 0) / 60;
  return Math.max(1, Math.ceil(minutes / Math.max(1, minutesPerDay)));
}
function readProjectXML(text) {
  if (
    typeof text !== "string" ||
    text.length > 2 * 1024 * 1024 ||
    new TextEncoder().encode(text).length > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(text)
  )
    mspReject("mspXmlExceeds2MbOrContainsAForbidden");
  const root = xmlDocument(text, "Project XML").documentElement;
  if (root.localName !== "Project" || root.namespaceURI !== MSP_NS)
    mspReject("mspSelectAMicrosoftProjectXmlFile");
  if ([...root.getElementsByTagNameNS("*", "*")].some((n) => n.namespaceURI !== MSP_NS))
    throw inputError("mspForeignXmlNamespace");
  if (["0", "false"].includes(mspValue(root, "ScheduleFromStart", "1")))
    mspReject("mspFinishScheduledProjectsAreUnsupported");
  const container = mspNode(root, "Tasks"),
    nodes = container ? mspChildren(container, "Task") : [];
  if (nodes.length > 2001) throw inputError("mspProjectXmlSupportsAtMost2000Tasks");
  const uids = new Set();
  for (const n of nodes) {
    const uid = mspNumber(n, "UID", null);
    if (uid === null || uid < 0 || uids.has(uid)) throw inputError("mspMissingDuplicateTaskUid");
    uids.add(uid);
  }
  const summary = nodes.find((n) => mspNumber(n, "UID", null) === 0);
  if (
    summary &&
    (mspNumber(summary, "OutlineLevel", null) !== 0 || !["1", "true"].includes(mspValue(summary, "Summary")))
  )
    throw inputError("mspUid0MustBeTheProjectSummaryNot");
  const notes = summary ? mspValue(summary, "Notes") : "";
  let contract = null;
  if (notes.startsWith(MSP_MARKER)) {
    contract = JSON.parse(notes.slice(MSP_MARKER.length));
    if (
      contract.format !== "ProjectWorkspaceMSPDI" ||
      contract.version !== 1 ||
      stableJSON(contract.mapping) !== stableJSON(MSP_MAPPING)
    )
      throw inputError("mspUnsupportedProjectXmlContractMapping");
    validateGroups(contract.groups);
  }
  const definitions = mspNode(root, "ExtendedAttributes"),
    aliases = new Map();
  for (const n of definitions ? mspChildren(definitions, "ExtendedAttribute") : []) {
    const id = mspValue(n, "FieldID");
    if (aliases.has(id)) throw inputError("mspDuplicateCustomFieldDefinition");
    aliases.set(id, mspValue(n, "Alias"));
  }
  const resources = new Map(),
    resourceRoot = mspNode(root, "Resources");
  for (const n of resourceRoot ? mspChildren(resourceRoot, "Resource") : []) {
    const id = mspNumber(n, "UID", null);
    if (id === null || resources.has(id)) throw inputError("mspInvalidDuplicateResourceUid");
    resources.set(id, mspValue(n, "Name"));
  }
  const assignments = new Map(),
    assignmentRoot = mspNode(root, "Assignments");
  for (const a of assignmentRoot ? mspChildren(assignmentRoot, "Assignment") : []) {
    const id = mspNumber(a, "TaskUID", null),
      r = mspNumber(a, "ResourceUID", null);
    if (!uids.has(id) || !resources.has(r) || !resources.get(r))
      throw inputError("mspUnresolvedResourceAssignment");
    if (!assignments.has(id)) assignments.set(id, []);
    assignments.get(id).push(resources.get(r));
  }
  const rows = [];
  let hasResources = false,
    priorityMapped = false;
  for (const n of nodes) {
    const uid = mspNumber(n, "UID", null);
    if (uid === 0) continue;
    if (["1", "true"].includes(mspValue(n, "IsNull"))) throw inputError("mspNullTaskRowsAreUnsupported");
    const row = {
      uid,
      wbs: mspValue(n, "WBS") || mspValue(n, "OutlineNumber"),
      name: mspText(n, "Name"),
      level: mspNumber(n, "OutlineLevel", null),
      summary: ["1", "true"].includes(mspValue(n, "Summary")),
      start: mspDate(mspValue(n, "Start")),
      sourceFinish: mspDate(mspValue(n, "Finish"), true),
      days: null,
      pct: mspNumber(n, "PercentComplete", 0),
      prio: null,
      predUID: null,
      lag: 0,
    };
    if (![1, 2, 3].includes(row.level) || row.level < 3 !== row.summary)
      mspReject("mspUseThreeLevelsPhaseMainTaskSubtaskHierarchy");
    for (const field of ["Recurring", "IsSubproject", "ExternalTask"])
      if (["1", "true"].includes(mspValue(n, field)))
        throw inputError("mspUnsupportedTaskFeature0", field + " (" + row.wbs + ")");
    const links = mspChildren(n, "PredecessorLink");
    if (links.length > 1) throw inputError("mspMultiplePredecessorsAreUnsupported0", row.wbs);
    if (links.length) {
      const link = links[0];
      if (
        row.summary ||
        mspNumber(link, "Type", 1) !== 1 ||
        ["1", "true"].includes(mspValue(link, "CrossProject"))
      )
        throw inputError("mspOnlyLocalSubtaskFsLinksAreSupported");
      row.predUID = mspNumber(link, "PredecessorUID", null);
      const lag = mspNumber(link, "LinkLag", 0);
      if (lag && !MSP_ELAPSED_FORMATS.includes(mspNumber(link, "LagFormat", null))) {
        // Working-time Lag: the calendar-day Lag is derived from the file's dates (prepareProjectXML).
        row.lagFromDates = true;
      } else {
        row.lag = lag / 14400;
        if (!Number.isSafeInteger(row.lag)) throw inputError("mspLagMustBeWholeCalendarDays");
      }
    }
    const taskNotes = mspValue(n, "Notes");
    if (taskNotes.startsWith(MSP_TASK_MARKER)) {
      const extra = JSON.parse(taskNotes.slice(MSP_TASK_MARKER.length));
      if (extra.version !== 1 || !Number.isSafeInteger(extra.inactiveLag))
        throw inputError("mspInvalidInactiveLagMapping");
      if (!links.length) row.lag = extra.inactiveLag;
    }
    if (!row.summary) {
      // Files saved by this tool use whole elapsed days and import exactly. Anything else (working time,
      // times of day, date constraints, task calendars, leveling delays, milestones) is converted to
      // calendar days from the file's own start and finish dates, so imported dates match the file;
      // the preview lists every converted task.
      const rawStart = mspValue(n, "Start"),
        rawFinish = mspValue(n, "Finish"),
        rawDuration = mspValue(n, "Duration"),
        format = mspNumber(n, "DurationFormat", mspNumber(root, "DurationFormat", null)),
        midnight = (v) => !v || /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?$/.test(v);
      row.milestone = ["1", "true"].includes(mspValue(n, "Milestone"));
      const exact =
        MSP_ELAPSED_FORMATS.includes(format) &&
        midnight(rawStart) &&
        midnight(rawFinish) &&
        !row.milestone &&
        mspNumber(n, "ConstraintType", 0) === 0 &&
        mspValue(n, "CalendarUID", "-1") === "-1" &&
        mspNumber(n, "LevelingDelay", 0) === 0;
      if (exact) row.days = mspDuration(rawDuration, format);
      else {
        row.converted = { start: rawStart, finish: rawFinish };
        if (row.start && rawFinish) {
          if (row.sourceFinish < row.start) row.sourceFinish = row.start;
          row.days = diffDays(row.start, row.sourceFinish);
        } else row.days = mspWorkingDays(rawDuration, mspNumber(root, "MinutesPerDay", 480));
      }
      const priority = mspNumber(n, "Priority", null);
      if (priority !== null) {
        if (priority < 0 || priority > 1000) throw inputError("mspPriorityIsOutside01000");
        row.prio = priority > 500 ? 1 : priority === 500 ? 2 : 3;
        priorityMapped ||= ![100, 500, 900].includes(priority);
      }
    }
    const values = new Map();
    for (const a of mspChildren(n, "ExtendedAttribute")) {
      const id = mspValue(a, "FieldID");
      if (values.has(id)) throw inputError("mspDuplicateTaskCustomField");
      if (MSP_TEXT_IDS.includes(id) && mspValue(a, "ValueGUID") && !mspValue(a, "Value"))
        throw inputError("mspCustomFieldLookupValuesRequireExplicitTextValues");
      values.set(id, mspText(a, "Value"));
    }
    GROUP_IDS.forEach((id, i) => {
      const field = MSP_TEXT_IDS[i],
        mapped = contract || aliases.get(field)?.startsWith("PW " + id + " | ");
      row[id] = mapped ? values.get(field) || "" : "";
    });
    if (row.summary && GROUP_IDS.some((id) => row[id]))
      throw inputError("mspSummaryGroupAssignmentsAreUnsupported");
    const people = assignments.get(uid) || [];
    if (people.length) {
      if (contract) throw inputError("mspResourceAssignmentsConflictWithTheDeclaredGroupMapping");
      if (row.summary) throw inputError("mspSummaryResourceAssignmentsAreUnsupported");
      row.group1 = [...new Set([...(row.group1 ? row.group1.split(";") : []), ...people])].join("; ");
      hasResources = true;
    }
    rows.push(row);
  }
  return {
    // Microsoft Project stores the file name in Name and the project title in Title.
    name: mspText(root, "Title") || mspText(root, "Name") || "Imported project",
    statusDate: mspDate(mspValue(root, "StatusDate")) || today(),
    groups: contract ? copy(contract.groups) : null,
    rows,
    hasResources,
    priorityMapped,
  };
}
function prepareProjectXML(model) {
  const candidate = newProject(model.name),
    data = [],
    byUID = new Map(),
    sourceFinishes = new Map();
  candidate.metadata.customName = true;
  candidate.settings.statusDate = model.statusDate;
  if (model.groups) candidate.settings.groups = copy(model.groups);
  else {
    const used = GROUP_IDS.filter((id) => model.rows.some((r) => r[id]));
    candidate.settings.groups = used.length
      ? used.map((id, i) => ({
          id,
          name: "Group " + (GROUP_IDS.indexOf(id) + 1),
          color: defaultGroups()[i % 3].color,
        }))
      : defaultGroups();
  }
  let phase = null,
    main = null;
  for (const r of model.rows) {
    const task = { wbs: r.wbs, name: r.name };
    if (byUID.has(r.uid)) throw inputError("mspDuplicateTaskUid");
    byUID.set(r.uid, task);
    if (r.level === 1) {
      task.mainTasks = [];
      data.push(task);
      phase = task;
      main = null;
    } else if (r.level === 2) {
      if (!phase) throw inputError("mspMainTaskHasNoPhase");
      task.subtasks = [];
      phase.mainTasks.push(task);
      main = task;
    } else {
      if (!main) throw inputError("mspSubtaskHasNoMainTask");
      Object.assign(task, {
        start: r.start,
        days: r.days,
        pct: r.pct,
        prio: r.prio,
        pred: "",
        lag: r.lag,
      });
      for (const id of GROUP_IDS) task[id] = r[id] || "";
      main.subtasks.push(task);
      sourceFinishes.set(r.uid, r.sourceFinish);
    }
  }
  const rowByUID = new Map(model.rows.map((r) => [r.uid, r]));
  for (const r of model.rows)
    if (r.predUID !== null) {
      const p = byUID.get(r.predUID);
      if (!p || p.mainTasks || p.subtasks) throw inputError("mspPredecessorMustResolveToASubtask");
      const task = byUID.get(r.uid),
        predRow = rowByUID.get(r.predUID);
      task.pred = p.wbs;
      // Keep the file's dates when either side was converted or the Lag was in working time.
      if ((r.converted || predRow.converted || r.lagFromDates) && r.start && predRow.sourceFinish)
        task.lag = diffDays(predRow.sourceFinish, r.start) - 2;
      else if (r.lagFromDates) throw inputError("mspLagMustUseElapsedUnits");
    }
  candidate.currentData = data;
  validateBundle(candidate);
  recalculateSchedule(data, candidate.settings.statusDate);
  // Preview: one "New" row per task (as for Excel creation templates) plus summary values the
  // schedule recalculated differently from the file. Values are shown as the app displays them.
  const fieldLabel = {
    start: EXCEL_HEADERS[6],
    days: EXCEL_HEADERS[8],
    pct: EXCEL_HEADERS[9],
    prio: EXCEL_HEADERS[5],
  };
  const shown = (key, value) =>
    value === null || value === undefined || value === "" ? "" : key === "pct" ? value + "%" : String(value);
  const recalculations = [];
  for (const r of model.rows) {
    const actual = byUID.get(r.uid);
    if (r.level === 3) {
      if (r.sourceFinish && actual.finish !== r.sourceFinish)
        mspReject("mspFileDatesDoNotMatchCalendarDayScheduling", r.wbs);
      if (r.start && actual.start !== r.start) mspReject("mspPredecessorAndStartDateDisagree0", r.wbs);
    } else
      for (const key of ["start", "days", "pct", "prio"])
        if ((r[key] ?? "") !== "" && r[key] !== actual[key])
          recalculations.push({
            wbs: r.wbs,
            field: fieldLabel[key],
            before: shown(key, r[key]),
            after: shown(key, actual[key]),
          });
  }
  const timeText = (v) => (v ? v.slice(0, 16).replace("T", " ") : "TBC");
  const conversions = model.rows
    .filter((r) => r.converted)
    .map((r) => {
      const task = byUID.get(r.uid);
      return {
        wbs: r.wbs,
        field: t("mspCalendarConversion"),
        before: timeText(r.converted.start) + " – " + timeText(r.converted.finish),
        after:
          (task.start || "TBC") +
          " – " +
          (task.finish || "TBC") +
          " (" +
          (task.days ?? "-") +
          t("daysUnit") +
          ")",
      };
    });
  const changes = exchangeChanges([], data).concat(conversions, recalculations);
  return {
    candidate,
    create: true,
    added: model.rows.length,
    changes,
    source: "Project XML",
    notices: [
      t("mspCreatesAnIndependentCopyOnlyCurrentFieldsAre"),
      ...(model.hasResources ? [t("mspStandardResourceAssignmentNamesMapToGroup1")] : []),
      ...(model.priorityMapped ? [t("mspProjectPrioritiesWereMappedToHighMediumNormal")] : []),
      ...(conversions.length ? [t("mspConvertedToCalendarDays", conversions.length)] : []),
      ...(model.rows.some((r) => r.milestone)
        ? [t("mspMilestonesConverted", model.rows.filter((r) => r.milestone).length)]
        : []),
    ],
  };
}
function mspTag(name, value) {
  return value === null || value === undefined || value === ""
    ? ""
    : "<" + name + ">" + escapeHtml(String(value)) + "</" + name + ">";
}
function buildProjectXML(base = exchangeBase()) {
  const b = copy(base);
  validateBundle(b);
  recalculateSchedule(b.currentData, b.settings.statusDate);
  const items = allItems(b.currentData);
  if (items.length > 2000) throw inputError("mspProjectXmlSupportsAtMost2000Tasks");
  for (const value of [b.metadata.name, ...items.map((t) => t.name)])
    if (value.length > 255) throw inputError("mspProjectNamesTaskNamesSupportAtMost255");
  const uid = new Map(items.map((t, i) => [t.wbs, i + 1])),
    meta = {
      format: "ProjectWorkspaceMSPDI",
      version: 1,
      mapping: MSP_MAPPING,
      groups: b.settings.groups,
    };
  const rootTask =
    "<Task><UID>0</UID><ID>0</ID>" +
    mspTag("Name", b.metadata.name) +
    "<OutlineLevel>0</OutlineLevel><Summary>1</Summary>" +
    mspTag("Notes", MSP_MARKER + JSON.stringify(meta)) +
    "</Task>";
  const tasks = [];
  b.currentData.forEach((f, fi) => {
    tasks.push([f, 1, String(fi + 1)]);
    f.mainTasks.forEach((m, mi) => {
      tasks.push([m, 2, fi + 1 + "." + (mi + 1)]);
      m.subtasks.forEach((s, si) => tasks.push([s, 3, fi + 1 + "." + (mi + 1) + "." + (si + 1)]));
    });
  });
  const body = tasks
    .map(([t, level, outline]) => {
      if (!Number.isInteger(t.pct || 0))
        throw inputError("mspProjectPercentcompleteRequiresWholePercentages0", t.wbs);
      if (t.days != null && Number(t.days) > 365000)
        throw inputError("mspProjectDurationExceeds365000Days0", t.wbs);
      if (t.start) mspDate(t.start + "T00:00:00");
      if (t.finish) mspDate(addDays(t.finish, 1) + "T00:00:00");
      const summary = level < 3;
      let result =
        "<Task>" +
        mspTag("UID", uid.get(t.wbs)) +
        mspTag("ID", uid.get(t.wbs)) +
        mspTag("Name", t.name) +
        "<Type>1</Type>" +
        mspTag("WBS", t.wbs) +
        mspTag("OutlineNumber", outline) +
        mspTag("OutlineLevel", level) +
        mspTag("Priority", t.prio ? { 1: 900, 2: 500, 3: 100 }[t.prio] : null) +
        mspTag("Start", t.start ? t.start + "T00:00:00" : null) +
        mspTag("Finish", t.finish ? addDays(t.finish, 1) + "T00:00:00" : null) +
        mspTag("Duration", t.days ? "PT" + t.days * 24 + "H0M0S" : null) +
        "<DurationFormat>8</DurationFormat><Estimated>0</Estimated><Milestone>0</Milestone>" +
        mspTag("Summary", summary ? 1 : 0) +
        mspTag("PercentComplete", t.pct || 0);
      if (!summary && !t.pred && t.lag)
        result += mspTag(
          "Notes",
          MSP_TASK_MARKER + JSON.stringify({ version: 1, inactiveLag: Number(t.lag) }),
        );
      if (t.pred)
        result +=
          "<PredecessorLink>" +
          mspTag("PredecessorUID", uid.get(t.pred)) +
          "<Type>1</Type><CrossProject>0</CrossProject>" +
          mspTag("LinkLag", (t.lag || 0) * 14400) +
          "<LagFormat>8</LagFormat></PredecessorLink>";
      if (!summary)
        for (const g of b.settings.groups) {
          const value = t[g.id] || "";
          if (value.length > 255) throw inputError("mspGroupAssignmentsSupportAtMost255CharactersPer", t.wbs);
          result +=
            "<ExtendedAttribute>" +
            mspTag("FieldID", MSP_TEXT_IDS[GROUP_IDS.indexOf(g.id)]) +
            "<Value>" +
            escapeHtml(value) +
            "</Value></ExtendedAttribute>";
        }
      return result + "</Task>";
    })
    .join("");
  const definitions = b.settings.groups
    .map(
      (g) =>
        "<ExtendedAttribute>" +
        mspTag("FieldID", MSP_TEXT_IDS[GROUP_IDS.indexOf(g.id)]) +
        mspTag("FieldName", "Text" + (GROUP_IDS.indexOf(g.id) + 1)) +
        mspTag("Alias", "PW " + g.id + " | " + g.name) +
        "</ExtendedAttribute>",
    )
    .join("");
  const starts = items
    .map((t) => t.start)
    .filter(Boolean)
    .sort();
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?><Project xmlns="' +
    MSP_NS +
    '"><SaveVersion>12</SaveVersion>' +
    mspTag("Name", b.metadata.name) +
    "<ScheduleFromStart>1</ScheduleFromStart>" +
    mspTag("StartDate", (starts[0] || b.settings.statusDate) + "T00:00:00") +
    "<CurrencyCode>USD</CurrencyCode><DefaultStartTime>00:00:00</DefaultStartTime><DefaultFinishTime>00:00:00</DefaultFinishTime><MinutesPerDay>1440</MinutesPerDay><MinutesPerWeek>10080</MinutesPerWeek><DurationFormat>8</DurationFormat>" +
    mspTag("StatusDate", b.settings.statusDate + "T00:00:00") +
    "<ExtendedAttributes>" +
    definitions +
    "</ExtendedAttributes><Tasks>" +
    rootTask +
    body +
    "</Tasks></Project>";
  if (
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u.test(xml) ||
    new TextEncoder().encode(xml).length > 2 * 1024 * 1024
  )
    throw inputError("mspInvalidXmlCharactersOrXmlExceeds2Mb");
  return xml;
}
async function importProjectXML(file) {
  if (excelImportBusy) throw new Error(t("mspAnImportIsAlreadyInProgress"));
  excelImportBusy = true;
  try {
    if (file.size > 2 * 1024 * 1024) throw inputError("mspProjectXmlExceeds2Mb");
    const base = exchangeBase(),
      guard = {
        projectId,
        baseState: stableJSON(base),
        stored: localStorage.getItem(WORKSPACE_KEY),
      },
      plan = prepareProjectXML(readProjectXML(await file.text()));
    if (await previewExcel(plan)) commitExcelCandidate(plan, guard);
  } finally {
    excelImportBusy = false;
  }
}

function exportProjectXML() {
  return showDialog({
    title: t("mspExportTitle"),
    bodyHtml:
      '<p class="app-dialog-message">' +
      escapeHtml(t("mspExportDescription")) +
      '</p><p class="ui-caption">' +
      escapeHtml(t("mspExportDetail")) +
      "</p>",
    actions: [
      { label: t("msgCancel"), value: null },
      {
        label: t("mspSaveXml"),
        kind: "primary",
        value: true,
        onClick() {
          downloadBlob(
            buildProjectXML(),
            "Project_" +
              projectId +
              "_MSPDI_v1_" +
              new Date().toISOString().replace(/[:.]/g, "-") +
              "_" +
              crypto.randomUUID().slice(0, 8) +
              ".xml",
            "application/xml",
          );
        },
      },
    ],
  });
}
