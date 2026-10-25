function recordAudit(wbs, action, detail) {
  auditLog.unshift({
    time: nowTimestamp(),
    ver: activeVersionTag,
    wbs: wbs || "-",
    action,
    detail,
  });
  if (auditLog.length > 200) auditLog.length = 200;
  saveState();
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime + ";charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

let lastSaveError = "";

let storageReadBlocked = false;

// Generic workspace: one localStorage write commits the complete workspace.
const WORKSPACE_KEY = "project-web-tool:workspace:v1";

let workspace = { schemaVersion: 1, activeProjectId: null, projects: {} },
  projectId = "",
  projectMeta = {},
  projectSettings = {};

function currentBundle() {
  return {
    schemaVersion: 2,
    projectId,
    metadata: copy(projectMeta),
    settings: copy(projectSettings),
    currentData: copy(projectData),
    versionHistory: copy(versionList),
    auditLog: copy(auditLog),
    activeVersionTag,
    recoveryPoints: copy(excelRecoveryPoints),
  };
}

function commitWorkspace(next) {
  const serialized = JSON.stringify(next);
  localStorage.setItem(WORKSPACE_KEY, serialized);
  workspace = next;
  workspaceChars = WORKSPACE_KEY.length + serialized.length;
}

// Storage usage. Browsers allow roughly five million characters of localStorage per origin, and every
// file:// page shares one origin, so usage counts all keys, not only this app's workspace.
const STORAGE_LIMIT_CHARS = 5 * 1024 * 1024;
const STORAGE_WARN_RATIO = 0.8;
let workspaceChars = null,
  otherStorageChars = null,
  unsavedSince = "";

function storageUsage() {
  try {
    if (workspaceChars === null || otherStorageChars === null) {
      let other = 0;
      for (let i = 0; i < (localStorage.length || 0); i++) {
        const key = localStorage.key(i);
        if (key !== WORKSPACE_KEY) other += key.length + (localStorage.getItem(key) || "").length;
      }
      otherStorageChars = other;
      if (workspaceChars === null)
        workspaceChars = WORKSPACE_KEY.length + (localStorage.getItem(WORKSPACE_KEY) || "").length;
    }
  } catch (e) {
    return { used: 0, ratio: 0 };
  }
  const used = workspaceChars + otherStorageChars;
  return { used, ratio: used / STORAGE_LIMIT_CHARS };
}

function formatStorageSize(chars) {
  return chars < 1024 * 1024
    ? Math.max(1, Math.round(chars / 1024)) + " KB"
    : (chars / (1024 * 1024)).toFixed(1) + " MB";
}

// A persistent banner replaces one-off alerts: it stays until data is saved again.
function updateSaveBanner() {
  const banner = document.getElementById("saveBanner");
  if (!banner) return;
  const usage = storageUsage();
  let level = "",
    message = "";
  if (storageReadBlocked) {
    level = "error";
    message = t("msgBannerReadBlocked", lastSaveError);
  } else if (lastSaveError) {
    level = "error";
    message = t("msgBannerSaveFailed", unsavedSince, lastSaveError);
  } else if (usage.ratio >= STORAGE_WARN_RATIO) {
    level = "warning";
    message = t("msgBannerStorageHigh", Math.round(usage.ratio * 100), formatStorageSize(usage.used));
  }
  banner.hidden = !level;
  if (!level) return;
  banner.className = "save-banner save-banner-" + level;
  banner.innerHTML =
    '<span class="save-banner-text">' +
    escapeHtml(message) +
    '</span><button type="button" class="btn" onclick="exportVersionBundle()">' +
    t("msgExportJsonBackup") +
    "</button>" +
    (lastSaveError && !storageReadBlocked
      ? '<button type="button" class="btn" onclick="retrySave()">' + t("msgRetrySave") + "</button>"
      : "");
}

function retrySave() {
  otherStorageChars = null;
  if (saveState()) renderProjectControls();
}

function normalizeDefaultName(b) {
  if (b.metadata.name === "空白项目" && b.metadata.customName !== true) {
    b.metadata.name = "Untitled project";
    return true;
  }
  return false;
}

function selectBundle(b) {
  validateBundle(b);
  normalizeDefaultName(b);
  excelRecoveryPoints = (b.recoveryPoints || []).map(compactRecoveryPoint);
  projectId = b.projectId;
  projectMeta = copy(b.metadata);
  projectSettings = copy(b.settings);
  projectData = copy(b.currentData);
  versionList = b.versionHistory.map(compactVersion);
  auditLog = copy(b.auditLog);
  activeVersionTag = b.activeVersionTag;
  selectedBaselineTag = "NONE";
  curLang = projectSettings.language;
  document.getElementById("statusDateInput").value = projectSettings.statusDate;
  for (const id of ["fltFamily", "fltPerson", "fltRole"]) document.getElementById(id).value = "ALL";
  document.getElementById("fltBaseline").value = "NONE";
}

function loadState() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw) {
      const candidate = JSON.parse(raw);
      if (
        candidate.schemaVersion !== 1 ||
        !candidate.projects ||
        !candidate.projects[candidate.activeProjectId]
      )
        throw inputError("msgInvalidWorkspace");
      let migrated = false;
      for (const [id, b] of Object.entries(candidate.projects)) {
        if (b.schemaVersion === 1) {
          candidate.projects[id] = migrateBundle(b);
          migrated = true;
        }
        if (normalizeDefaultName(candidate.projects[id])) migrated = true;
        validateBundle(candidate.projects[id]);
        if (id !== b.projectId) throw inputError("msgProjectIdMismatch");
      }
      if (migrated) {
        localStorage.setItem(WORKSPACE_KEY + ":before-groups:" + new Date().toISOString(), raw);
        otherStorageChars = null;
        commitWorkspace(candidate);
      } else workspace = candidate;
    } else {
      const b = newProject("Untitled project");
      const next = { schemaVersion: 1, activeProjectId: b.projectId, projects: { [b.projectId]: b } };
      commitWorkspace(next);
    }
    selectBundle(workspace.projects[workspace.activeProjectId]);
  } catch (e) {
    storageReadBlocked = true;
    lastSaveError = e.message;
    const b = newProject("Recovery workspace (unsaved)");
    selectBundle(b);
    updateSaveBanner();
  }
}

function saveState() {
  if (storageReadBlocked) return false;
  try {
    projectSettings.language = curLang;
    projectSettings.statusDate =
      document.getElementById("statusDateInput").value || projectSettings.statusDate;
    const b = validateBundle(currentBundle()),
      next = copy(workspace);
    next.projects[projectId] = b;
    next.activeProjectId = projectId;
    commitWorkspace(next);
    lastSaveError = "";
    unsavedSince = "";
    updateSaveBanner();
    return true;
  } catch (e) {
    lastSaveError = e.message;
    unsavedSince = unsavedSince || nowTimestamp();
    updateSaveBanner();
    return false;
  }
}

function switchProject(id) {
  if (!saveState()) return;
  try {
    const target = validateBundle(copy(workspace.projects[id]));
    const next = copy(workspace);
    next.activeProjectId = id;
    commitWorkspace(next);
    selectBundle(target);
    applyStaticI18n();
    renderAll();
  } catch (e) {
    alert(e.message);
    renderProjectControls();
  }
}

function addProject(b) {
  validateBundle(b);
  if (!saveState()) throw inputError("msgCurrentProjectCouldNotBeSaved");
  const next = copy(workspace);
  if (next.projects[b.projectId]) throw inputError("msgDuplicateProjectId");
  next.projects[b.projectId] = b;
  next.activeProjectId = b.projectId;
  commitWorkspace(next);
  selectBundle(b);
  applyStaticI18n();
  renderAll();
}

function exportVersionBundle() {
  downloadBlob(
    JSON.stringify(currentBundle(), null, 2),
    "Project_" + projectId + "_" + today() + ".json",
    "application/json",
  );
}
