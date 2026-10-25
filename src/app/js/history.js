// Undo / redo for the current browser session, and the versions & change log dialog.
// Undo steps hold the task data and version list before a change. They are kept in memory only and
// are cleared when another project is opened.

const UNDO_LIMIT = 50;
let undoStack = [],
  redoStack = [];

function undoSnapshot(label) {
  return { label, data: copy(projectData), versions: copy(versionList), activeVersionTag };
}

function pushUndo(label) {
  undoStack.push(undoSnapshot(label));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack = [];
  refreshUndoButtons();
}

function clearUndoHistory() {
  undoStack = [];
  redoStack = [];
  refreshUndoButtons();
}

function applySnapshot(snapshot) {
  projectData = copy(snapshot.data);
  versionList = copy(snapshot.versions);
  activeVersionTag = snapshot.activeVersionTag;
  if (!versionList.some((v) => v.tag === document.getElementById("fltBaseline").value))
    document.getElementById("fltBaseline").value = "NONE";
}

function stepHistory(from, to, auditAction) {
  if (!from.length || projectMeta.archived) return false;
  const snapshot = from.pop();
  to.push(undoSnapshot(snapshot.label));
  applySnapshot(snapshot);
  recordAudit("-", auditAction, snapshot.label || "");
  refreshUndoButtons();
  renderAll();
  return true;
}

function undo() {
  return stepHistory(undoStack, redoStack, "Undo");
}

function redo() {
  return stepHistory(redoStack, undoStack, "Redo");
}

function refreshUndoButtons() {
  const undoButton = document.getElementById("btnUndo"),
    redoButton = document.getElementById("btnRedo");
  if (!undoButton || !redoButton) return;
  const last = undoStack.at(-1),
    next = redoStack.at(-1);
  undoButton.disabled = !last || projectMeta.archived;
  redoButton.disabled = !next || projectMeta.archived;
  undoButton.title = last ? t("msgUndoNamed", last.label) + " (Ctrl+Z)" : t("msgUndo") + " (Ctrl+Z)";
  redoButton.title = next
    ? t("msgRedoNamed", next.label) + " (Ctrl+Shift+Z)"
    : t("msgRedo") + " (Ctrl+Shift+Z)";
}

// ---- Versions & change log ----

function setBaseline(tag) {
  document.getElementById("fltBaseline").value = tag;
  selectedBaselineTag = tag;
  renderAll();
}

async function restoreVersion(tag) {
  const version = versionList.find((v) => v.tag === tag);
  if (!version) return false;
  const confirmed = await askConfirm(t("msgRestoreVersionConfirm", tag), {
    title: t("msgRestoreVersionTitle"),
    confirmLabel: t("msgRestore"),
  });
  if (!confirmed) return false;
  const ok = transactionalEdit(
    (data) => {
      data.splice(0, data.length, ...copy(version.data));
    },
    { label: t("msgUndoRestoreVersion", tag) },
  );
  if (!ok) return false;
  activeVersionTag = tag;
  recordAudit("-", "Restore version", tag);
  renderAll();
  return true;
}

async function deleteVersion(tag) {
  try {
    assertEditable();
  } catch (e) {
    showMessage(e.message);
    return false;
  }
  const confirmed = await askConfirm(t("msgDeleteVersionConfirm", tag), {
    title: t("msgDeleteVersionTitle"),
    confirmLabel: t("msgDeleteAction"),
    danger: true,
  });
  if (!confirmed) return false;
  pushUndo(t("msgUndoDeleteVersion", tag));
  versionList = versionList.filter((v) => v.tag !== tag);
  if (document.getElementById("fltBaseline").value === tag)
    document.getElementById("fltBaseline").value = "NONE";
  recordAudit("-", "Delete version", tag);
  renderAll();
  return true;
}

function versionsTableHtml() {
  if (!versionList.length) return '<p class="empty-note">' + t("msgNoVersionsYet") + "</p>";
  const baseline = document.getElementById("fltBaseline").value;
  const head = ["vColTag", "vColTime", "vColAuthor", "vColNote", "vColSpan", "vColProg", "vColAct"]
    .map((k) => "<th>" + t(k) + "</th>")
    .join("");
  const rows = versionList
    .map((v) => {
      const tag = escapeHtml(v.tag);
      const isBaseline = v.tag === baseline;
      return (
        "<tr><td><strong>" +
        tag +
        "</strong>" +
        (v.tag === activeVersionTag
          ? ' <span class="pill pill-group1">' + t("msgCurrentBase") + "</span>"
          : "") +
        '</td><td class="cell-date">' +
        escapeHtml(v.time) +
        "</td><td>" +
        escapeHtml(v.author) +
        "</td><td>" +
        escapeHtml(v.note) +
        "</td><td>" +
        escapeHtml(v.span || "") +
        "</td><td>" +
        escapeHtml(v.progress || "") +
        '</td><td class="row-actions"><button type="button" class="btn" data-version-action="baseline" data-tag="' +
        tag +
        '"' +
        (isBaseline ? " disabled" : "") +
        ">" +
        t(isBaseline ? "msgIsBaseline" : "vBtnSetBase") +
        '</button><button type="button" class="btn" data-version-action="restore" data-tag="' +
        tag +
        '">' +
        t("vBtnRestore") +
        '</button><button type="button" class="btn btn-danger" data-version-action="delete" data-tag="' +
        tag +
        '">' +
        t("msgDeleteAction") +
        "</button></td></tr>"
      );
    })
    .join("");
  return (
    '<div class="table-scroll"><table class="data-grid"><thead><tr>' +
    head +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table></div>"
  );
}

function auditTableHtml() {
  if (!auditLog.length) return '<p class="empty-note">' + t("msgNoChangesYet") + "</p>";
  const head = ["logColTime", "logColVer", "logColWbs", "logColAction", "logColDetail"]
    .map((k) => "<th>" + t(k) + "</th>")
    .join("");
  const rows = auditLog
    .map(
      (a) =>
        '<tr><td class="cell-date">' +
        escapeHtml(a.time) +
        "</td><td>" +
        escapeHtml(a.ver) +
        "</td><td>" +
        escapeHtml(a.wbs) +
        "</td><td>" +
        escapeHtml(a.action) +
        "</td><td>" +
        escapeHtml(a.detail) +
        "</td></tr>",
    )
    .join("");
  return (
    '<p class="ui-caption">' +
    t("msgAuditLimit", auditLog.length) +
    '</p><div class="table-scroll"><table class="data-grid"><thead><tr>' +
    head +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table></div>"
  );
}

function openHistoryDialog(initialTab = "versions") {
  let tab = initialTab;
  const draw = (d) => {
    for (const button of d.querySelectorAll("[role=tab]")) {
      const selected = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    d.querySelector("#historyPanel").innerHTML = tab === "versions" ? versionsTableHtml() : auditTableHtml();
  };
  return showDialog({
    id: "historyDialog",
    title: t("msgHistoryTitle"),
    size: "wide",
    bodyHtml:
      '<div class="tabs" role="tablist"><button type="button" role="tab" id="historyTabVersions" data-tab="versions" aria-controls="historyPanel">' +
      t("msgVersionsTab", versionList.length) +
      '</button><button type="button" role="tab" id="historyTabLog" data-tab="log" aria-controls="historyPanel">' +
      t("msgChangeLogTab", auditLog.length) +
      '</button></div><div id="historyPanel" role="tabpanel"></div>',
    actions: [
      {
        label: t("btnSaveVer").replace(/^[^A-Za-z㐀-鿿]+/u, ""),
        align: "start",
        onClick: (d) => (closeAppDialog(d, null), openVersionModal(), false),
      },
      { label: t("msgClose"), value: null },
    ],
    onOpen(d) {
      draw(d);
      d.querySelector(".tabs").addEventListener("click", (e) => {
        const button = e.target.closest("[role=tab]");
        if (!button) return;
        tab = button.dataset.tab;
        draw(d);
        button.focus();
      });
      d.querySelector(".tabs").addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        tab = tab === "versions" ? "log" : "versions";
        draw(d);
        d.querySelector('[data-tab="' + tab + '"]').focus();
      });
      d.querySelector("#historyPanel").addEventListener("click", async (e) => {
        const button = e.target.closest("[data-version-action]");
        if (!button) return;
        const tag = button.dataset.tag,
          action = button.dataset.versionAction;
        if (action === "baseline") setBaseline(tag);
        if (action === "restore") await restoreVersion(tag);
        if (action === "delete") await deleteVersion(tag);
        d.querySelector("#historyTabVersions").textContent = t("msgVersionsTab", versionList.length);
        d.querySelector("#historyTabLog").textContent = t("msgChangeLogTab", auditLog.length);
        draw(d);
      });
    },
  });
}
