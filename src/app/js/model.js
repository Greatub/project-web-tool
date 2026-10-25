let projectData = [];

let versionList = [];

let auditLog = [];

let activeVersionTag = "Draft";

let selectedBaselineTag = "NONE";

function parseDate(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  const dt = new Date(str + "T00:00:00Z");
  return Number.isFinite(dt.getTime()) && dt.toISOString().slice(0, 10) === str ? dt : null;
}

function formatDate(dt) {
  if (!dt) return "";
  return dt.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const dt = parseDate(dateStr);
  if (!dt) return "";
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  return formatDate(dt);
}

function diffDays(startStr, finishStr) {
  const s = parseDate(startStr),
    f = parseDate(finishStr);
  if (!s || !f) return null;
  return Math.round((f - s) / 86400000) + 1;
}

function canonicalPerson(raw) {
  const p = raw.trim().replace(/\s+/g, " ");
  const aliases = projectSettings.personAliases || {};
  const simple = p.replace(/\s*\([^)]*\)\s*/g, "").trim();
  return aliases[p.toLowerCase()] || aliases[simple.toLowerCase()] || simple;
}

function splitPeople(str) {
  return typeof str === "string"
    ? str
        .split(/[;\n,/]+/)
        .map(canonicalPerson)
        .filter(Boolean)
    : [];
}

function uniquePeopleList(arrOfStrings) {
  const map = new Map();
  arrOfStrings.forEach((raw) =>
    splitPeople(raw).forEach((p) => {
      if (!map.has(p.toLowerCase())) map.set(p.toLowerCase(), p);
    }),
  );
  return [...map.values()];
}

function hasPerson(raw, person) {
  const key = canonicalPerson(person).toLowerCase();
  return splitPeople(raw).some((p) => p.toLowerCase() === key);
}

function allItems(data) {
  return data.flatMap((f) => [f, ...f.mainTasks.flatMap((m) => [m, ...m.subtasks])]);
}

function validateProject(data) {
  if (!Array.isArray(data)) throw inputError("msgProjectDataMustBeAnArray");
  const ids = new Set(),
    subs = new Map();
  const check = (it) => {
    if (
      !it ||
      typeof it.wbs !== "string" ||
      !/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(it.wbs) ||
      typeof it.name !== "string" ||
      !it.name.trim()
    )
      throw inputError("msgInvalidTaskIdOrName");
    if (ids.has(it.wbs)) throw inputError("msgDuplicateWbs", it.wbs);
    ids.add(it.wbs);
  };
  data.forEach((f) => {
    check(f);
    if (!Array.isArray(f.mainTasks)) throw inputError("msgInvalidMaintasks", f.wbs);
    f.mainTasks.forEach((m) => {
      check(m);
      if (!Array.isArray(m.subtasks)) throw inputError("msgInvalidSubtasks", m.wbs);
      m.subtasks.forEach((s) => {
        check(s);
        subs.set(s.wbs, s);
        if (s.start && !parseDate(s.start)) throw inputError("msgInvalidDate", s.wbs);
        if (s.days != null && s.days !== "" && (!Number.isInteger(Number(s.days)) || Number(s.days) < 1))
          throw inputError("msgDurationMustBeAPositiveInteger", s.wbs);
        if (!Number.isFinite(Number(s.pct ?? 0)) || Number(s.pct ?? 0) < 0 || Number(s.pct ?? 0) > 100)
          throw inputError("msgProgressMustBe0100", s.wbs);
        if (!Number.isInteger(Number(s.lag || 0))) throw inputError("msgLagMustBeAnInteger", s.wbs);
        if (s.prio != null && s.prio !== "" && ![1, 2, 3].includes(Number(s.prio)))
          throw inputError("msgInvalidPriority", s.wbs);
        ["group1", "group2", "group3"].forEach((k) => {
          if (s[k] != null && typeof s[k] !== "string") throw inputError("msgInvalidPersonField", s.wbs);
        });
        if (s.pred != null && typeof s.pred !== "string") throw inputError("msgInvalidPredecessor", s.wbs);
      });
    });
  });
  const degree = new Map(),
    successors = new Map();
  subs.forEach((s) => {
    if (s.pred && !subs.has(s.pred)) throw inputError("msgMissingPredecessor", s.wbs, s.pred);
    degree.set(s.wbs, s.pred ? 1 : 0);
    if (s.pred) {
      if (!successors.has(s.pred)) successors.set(s.pred, []);
      successors.get(s.pred).push(s.wbs);
    }
  });
  const queue = [...subs.keys()].filter((id) => !degree.get(id)),
    order = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    order.push(subs.get(id));
    (successors.get(id) || []).forEach((next) => {
      degree.set(next, degree.get(next) - 1);
      if (!degree.get(next)) queue.push(next);
    });
  }
  if (order.length !== subs.size) throw inputError("msgDependencyCycleDetectedCorrectThePredecessors");
  return { subs, order };
}

// Version tags: letters (any script), digits, spaces, dots, underscores and hyphens.
const VERSION_TAG_PATTERN = /^[\p{L}\p{N}._ -]+$/u;

function validateVersions(list) {
  if (!Array.isArray(list)) throw inputError("msgInvalidVersionHistory");
  const tags = new Set();
  list.forEach((v) => {
    if (
      !v ||
      typeof v.tag !== "string" ||
      !VERSION_TAG_PATTERN.test(v.tag) ||
      tags.has(v.tag) ||
      !["time", "author", "note"].every((k) => typeof v[k] === "string")
    )
      throw inputError("msgInvalidOrDuplicateVersion");
    tags.add(v.tag);
    validateProject(v.data);
  });
}

function validateAudit(list) {
  if (
    !Array.isArray(list) ||
    list.some((a) => !a || !["time", "ver", "wbs", "action", "detail"].every((k) => typeof a[k] === "string"))
  )
    throw inputError("msgInvalidAuditLog");
}

function nowTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function recalculateSchedule(targetData = projectData, statusDateOverride = null) {
  const { subs, order } = validateProject(targetData);
  order.forEach((st) => {
    if (st.pred) {
      const pred = subs.get(st.pred);
      st.start = pred.finish ? addDays(pred.finish, 1 + Number(st.lag || 0)) : "";
    }
    st.finish = st.start && Number(st.days) > 0 ? addDays(st.start, Number(st.days) - 1) : "";
  });

  const statusDate = statusDateOverride || document.getElementById("statusDateInput")?.value || today();

  targetData.forEach((fam) => {
    fam.mainTasks.forEach((mt) => {
      const validStarts = mt.subtasks
        .map((s) => s.start)
        .filter(Boolean)
        .sort();
      const validFinishes = mt.subtasks
        .map((s) => s.finish)
        .filter(Boolean)
        .sort();
      const validPrios = mt.subtasks.map((s) => Number(s.prio)).filter((n) => n >= 1 && n <= 3);

      mt.start = validStarts.length ? validStarts[0] : "";
      mt.finish = validFinishes.length ? validFinishes[validFinishes.length - 1] : "";
      mt.days = mt.start && mt.finish ? diffDays(mt.start, mt.finish) : null;
      mt.prio = validPrios.length ? Math.min(...validPrios) : null;

      let wSum = 0,
        dSum = 0;
      mt.subtasks.forEach((st) => {
        const d = Number(st.days) || 0;
        const p = Number(st.pct) || 0;
        if (d > 0) {
          wSum += d * p;
          dSum += d;
        }
        st.status = computeStatus(st.start, st.finish, st.pct, statusDate);
      });
      mt.pct = dSum > 0 ? Math.round(wSum / dSum) : 0;
      mt.status = computeStatus(mt.start, mt.finish, mt.pct, statusDate);

      for (const id of GROUP_IDS) mt[id] = uniquePeopleList(mt.subtasks.map((task) => task[id])).join("; ");
      for (const key of LEGACY_ROLLUP_KEYS) delete mt[key];
    });

    const fStarts = fam.mainTasks
      .map((m) => m.start)
      .filter(Boolean)
      .sort();
    const fFinishes = fam.mainTasks
      .map((m) => m.finish)
      .filter(Boolean)
      .sort();
    const fPrios = fam.mainTasks.map((m) => Number(m.prio)).filter((n) => n >= 1 && n <= 3);

    fam.start = fStarts.length ? fStarts[0] : "";
    fam.finish = fFinishes.length ? fFinishes[fFinishes.length - 1] : "";
    fam.days = fam.start && fam.finish ? diffDays(fam.start, fam.finish) : null;
    fam.prio = fPrios.length ? Math.min(...fPrios) : null;

    let fwSum = 0,
      fdSum = 0;
    fam.mainTasks.forEach((mt) => {
      mt.subtasks.forEach((st) => {
        const d = Number(st.days) || 0;
        if (d > 0) {
          fwSum += d * (Number(st.pct) || 0);
          fdSum += d;
        }
      });
    });
    fam.pct = fdSum > 0 ? Math.round(fwSum / fdSum) : 0;
    fam.status = computeStatus(fam.start, fam.finish, fam.pct, statusDate);
    for (const id of GROUP_IDS) fam[id] = uniquePeopleList(fam.mainTasks.map((task) => task[id])).join("; ");
    for (const key of LEGACY_ROLLUP_KEYS) delete fam[key];
  });

  if (targetData === projectData) saveState();
}

function computeStatus(start, finish, pct, statusDate) {
  if (!start || !finish) return { code: "tbc", text: t("st_tbc") };
  if (Number(pct) >= 100) return { code: "done", text: t("st_done") };
  if (statusDate > finish) return { code: "delay", text: t("st_delay") };
  if (Number(pct) > 0) return { code: "prog", text: t("st_prog") };
  return { code: "sched", text: t("st_sched") };
}

// Persisted copies (version snapshots, recovery points) keep only the fields a user enters.
// Dates, roll-ups and statuses are recalculated when the copy is used, so they are not stored.
const SUBTASK_INPUT_FIELDS = ["wbs", "name", "pred", "lag", "prio", "days", "pct"];
function compactData(data) {
  const pick = (item, keys) =>
    Object.fromEntries(keys.filter((key) => item[key] !== undefined).map((key) => [key, item[key]]));
  return data.map((family) => ({
    ...pick(family, ["wbs", "name"]),
    mainTasks: family.mainTasks.map((main) => ({
      ...pick(main, ["wbs", "name"]),
      subtasks: main.subtasks.map((task) => {
        const kept = pick(task, SUBTASK_INPUT_FIELDS);
        // A start date is an input only when the task has no predecessor.
        kept.start = task.pred ? "" : task.start || "";
        for (const id of GROUP_IDS) if (task[id]) kept[id] = task[id];
        return kept;
      }),
    })),
  }));
}
function compactVersion(version) {
  return { ...version, data: compactData(version.data) };
}

function buildTaskLookupMap(dataTree) {
  const map = new Map();
  if (!dataTree) return map;
  const copy = JSON.parse(JSON.stringify(dataTree));
  recalculateSchedule(copy);
  copy.forEach((f) => {
    map.set(f.wbs, { type: "Family", item: f });
    f.mainTasks.forEach((m) => {
      map.set(m.wbs, { type: "Main Task", item: m });
      m.subtasks.forEach((s) => {
        map.set(s.wbs, { type: "Sub-task", item: s });
      });
    });
  });
  return map;
}

function shortenName(p) {
  return p.replace(/\s*\(.*?\)\s*/g, "").trim();
}

function escapeHtml(s) {
  return String(s || "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function findSubtaskByWbs(wbs) {
  for (const fam of projectData) {
    for (const mt of fam.mainTasks) {
      for (const st of mt.subtasks) {
        if (st.wbs === wbs) return st;
      }
    }
  }
  return null;
}

const copy = (value) => JSON.parse(JSON.stringify(value));

function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function newProject(name = "Untitled project", data = []) {
  return {
    schemaVersion: 2,
    projectId: crypto.randomUUID(),
    metadata: { name, archived: false, customName: name !== "Untitled project" },
    settings: defaults(),
    currentData: copy(data),
    versionHistory: [],
    auditLog: [],
    activeVersionTag: "Draft",
    recoveryPoints: [],
  };
}

function assignProjectIdentity(b, id) {
  b.projectId = id;
  for (const point of b.recoveryPoints || []) point.bundle.projectId = id;
  return b;
}

function syntheticData() {
  return [
    {
      wbs: "1",
      name: "Example phase",
      mainTasks: [
        {
          wbs: "1.1",
          name: "Example delivery",
          subtasks: [
            {
              wbs: "1.1.1",
              name: "Prepare prototype",
              pred: "",
              lag: 0,
              prio: 2,
              start: today(),
              days: 3,
              pct: 25,
              group1: "Demo Person A",
              group2: "Demo Person B",
              group3: "",
            },
            {
              wbs: "1.1.2",
              name: "Validate prototype",
              pred: "1.1.1",
              lag: 0,
              prio: 2,
              start: "",
              days: 2,
              pct: 0,
              group1: "Demo Person B",
              group2: "",
              group3: "",
            },
          ],
        },
      ],
    },
  ];
}

// Stable project groups. Slot identity is independent of its editable display name.
const MAX_GROUPS = 10;

const GROUP_IDS = Array.from({ length: MAX_GROUPS }, (_, i) => "group" + (i + 1));

const GROUP_COLORS = [
  "#467F78",
  "#617FA3",
  "#A17952",
  "#846AA0",
  "#A95C64",
  "#527E9B",
  "#8B8745",
  "#5E8D72",
  "#94758B",
  "#707B87",
];
// Roll-up arrays written by earlier versions; removed on recalculation.
const LEGACY_ROLLUP_KEYS = ["leadersList", "group2List", "group3List"];

function defaultGroups() {
  return GROUP_IDS.slice(0, 3).map((id, i) => ({ id, name: "Group " + (i + 1), color: GROUP_COLORS[i] }));
}

function groups(settings = projectSettings) {
  return settings?.groups || defaultGroups();
}

function groupName(id, settings = projectSettings) {
  return groups(settings).find((g) => g.id === id)?.name || id.replace("group", "Group ");
}

function validateGroups(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_GROUPS)
    throw inputError("msgUse1To10Groups");
  const ids = new Set(),
    names = new Set();
  for (const g of list) {
    if (
      !GROUP_IDS.includes(g.id) ||
      ids.has(g.id) ||
      typeof g.name !== "string" ||
      !g.name.trim() ||
      g.name.length > 60 ||
      names.has(g.name.trim().toLowerCase()) ||
      !/^#[a-f0-9]{6}$/i.test(g.color)
    )
      throw inputError("msgGroupIdsNamesMustBeUnique");
    ids.add(g.id);
    names.add(g.name.trim().toLowerCase());
  }
}

function defaults() {
  return { language: curLang, statusDate: today(), people: [], personAliases: {}, groups: defaultGroups() };
}

function validateBundle(b) {
  if (
    !b ||
    b.schemaVersion !== 2 ||
    typeof b.projectId !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(b.projectId) ||
    !b.metadata ||
    typeof b.metadata.name !== "string" ||
    !b.metadata.name.trim() ||
    typeof b.activeVersionTag !== "string"
  )
    throw inputError("msgInvalidProjectIdentitySchemaversion");
  const s = b.settings;
  if (
    !s ||
    !parseDate(s.statusDate) ||
    !["zh", "en"].includes(s.language) ||
    !Array.isArray(s.people) ||
    s.people.some((p) => typeof p !== "string") ||
    !s.personAliases ||
    Object.values(s.personAliases).some((p) => typeof p !== "string")
  )
    throw inputError("msgInvalidProjectSettings");
  validateGroups(s.groups);
  validateProject(b.currentData);
  validateVersions(b.versionHistory);
  validateAudit(b.auditLog);
  const enabled = new Set(s.groups.map((g) => g.id));
  for (const item of allItems(b.currentData))
    for (const id of GROUP_IDS) {
      if (item[id] != null && typeof item[id] !== "string") throw inputError("msgInvalidGroupAssignment");
      if (!enabled.has(id) && hasCell(item[id]) && !item.mainTasks && !item.subtasks)
        throw inputError("msgGroupHasAssignmentsClearThemBefore", id);
    }
  if (b.recoveryPoints !== undefined) {
    if (!Array.isArray(b.recoveryPoints) || b.recoveryPoints.length > 3)
      throw inputError("msgInvalidRecoveryPoints");
    for (const p of b.recoveryPoints) {
      if (
        typeof p.time !== "string" ||
        p.bundle?.projectId !== b.projectId ||
        p.bundle.recoveryPoints !== undefined
      )
        throw inputError("msgInvalidRecoveryIdentity");
      validateBundle(p.bundle);
    }
  }
  return b;
}

// Legacy JSON supplies its own ordered mapping; no organization identifiers are embedded here.
function legacyGroupFields(raw) {
  const keys = raw.legacyGroupFields || Object.keys(raw.settings?.roleLabels || {});
  if (
    !Array.isArray(keys) ||
    keys.length !== 3 ||
    new Set(keys).size !== 3 ||
    keys.some((k) => typeof k !== "string" || !k || ["__proto__", "prototype", "constructor"].includes(k))
  )
    throw inputError("msgLegacyJsonRequiresThreeExplicitLegacygroupfields");
  return keys;
}

function migrateBundle(raw) {
  if (raw.schemaVersion === 2) return validateBundle(copy(raw));
  if (raw.schemaVersion !== 1) throw inputError("msgUnsupportedProjectSchema");
  const b = copy(raw),
    oldKeys = legacyGroupFields(raw);
  const migrateData = (data) => {
    for (const item of allItems(data)) {
      for (let i = 0; i < 3; i++) {
        if (item[oldKeys[i]] !== undefined) {
          item[GROUP_IDS[i]] = item[oldKeys[i]];
          delete item[oldKeys[i]];
        }
      }
      for (const key of Object.keys(item))
        if (key.endsWith("List") && !["mainTasks", "subtasks"].includes(key)) delete item[key];
    }
  };
  migrateData(b.currentData);
  for (const v of b.versionHistory || []) migrateData(v.data);
  const previous = b.settings,
    labels = previous.roleLabels || {};
  b.settings = {
    language: previous.language,
    statusDate: previous.statusDate,
    people: previous.people || [],
    personAliases: previous.personAliases || {},
    groups: defaultGroups(),
  };
  b.settings.groups.forEach((g, i) => {
    const color = previous.supportGroups?.[i - 1]?.color;
    if (i && /^#[a-f0-9]{6}$/i.test(color)) g.color = color;
  });
  delete b.legacyGroupFields;
  b.schemaVersion = 2;
  if (b.recoveryPoints)
    b.recoveryPoints = b.recoveryPoints.map((p) => ({ ...p, bundle: migrateBundle(p.bundle) }));
  return validateBundle(b);
}

function getPeople() {
  const all = uniquePeopleList([
    ...projectSettings.people,
    ...projectData.flatMap((f) =>
      f.mainTasks.flatMap((m) => m.subtasks.flatMap((s) => groups().map((g) => s[g.id]))),
    ),
  ]);
  return all
    .map((name) => ({ key: name, label: name, group: t("msgProjectParticipants") }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function personMatches(item, person, role) {
  return (
    person === "ALL" ||
    groups()
      .filter((g) => role === "ALL" || g.id === role)
      .some((g) => hasPerson(item[g.id], person))
  );
}
