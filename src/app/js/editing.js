// Editing: tasks, phases, projects, Gantt drag and keyboard moves.
// Every change to project data goes through transactionalEdit, which validates a candidate copy,
// records an undo step and only then replaces the live data.

function assertEditable() {
  if (projectMeta.archived) throw inputError("msgProjectArchivedReadOnly");
}

function transactionalEdit(edit, { label = "", onError = showError } = {}) {
  try {
    assertEditable();
    const candidate = copy(projectData);
    edit(candidate);
    validateProject(candidate);
    recalculateSchedule(candidate);
    pushUndo(label);
    projectData = candidate;
    return true;
  } catch (e) {
    onError(e.message);
    return false;
  }
}

function findParentList(data, wbs) {
  for (const family of data) {
    if (family.wbs === wbs) return { list: data, item: family, level: "Family" };
    for (const main of family.mainTasks) {
      if (main.wbs === wbs) return { list: family.mainTasks, item: main, level: "Main Task", parent: family };
      const task = main.subtasks.find((s) => s.wbs === wbs);
      if (task) return { list: main.subtasks, item: task, level: "Sub-task", parent: main };
    }
  }
  return null;
}

// Renames an item and every descendant whose WBS starts with "<old>.", and updates predecessors.
function renameWbs(data, oldWbs, newWbs) {
  if (oldWbs === newWbs) return;
  const renames = new Map([[oldWbs, newWbs]]);
  for (const it of allItems(data)) {
    if (it.wbs.startsWith(oldWbs + ".")) renames.set(it.wbs, newWbs + it.wbs.slice(oldWbs.length));
  }
  for (const it of allItems(data)) {
    if (renames.has(it.wbs)) it.wbs = renames.get(it.wbs);
    if (it.pred && renames.has(it.pred)) it.pred = renames.get(it.pred);
  }
}

function moveWithinParent(wbs, direction) {
  let moved = false;
  const ok = transactionalEdit(
    (data) => {
      const found = findParentList(data, wbs);
      if (!found) throw inputError("msgTaskNotFound");
      const from = found.list.indexOf(found.item),
        to = from + direction;
      if (to < 0 || to >= found.list.length) return;
      found.list.splice(from, 1);
      found.list.splice(to, 0, found.item);
      moved = true;
    },
    { label: t("msgUndoMove", wbs) },
  );
  if (ok && moved) {
    recordAudit(wbs, "Move", direction < 0 ? "up" : "down");
    renderAll();
  }
  return ok && moved;
}

// ---- Gantt: pointer drag and keyboard moves share one change function ----

let dragState = null;

function applyBarChange(wbs, mode, delta) {
  const st = findSubtaskByWbs(wbs);
  if (!st || !st.start || !delta) return false;
  const origStart = st.start,
    origDays = Number(st.days) || 1,
    nextStart = addDays(origStart, delta),
    nextDays = Math.max(1, origDays + delta);
  if (mode === "resize" && nextDays === origDays) return false;
  const ok = transactionalEdit(
    (data) => {
      const task = allItems(data).find((x) => x.wbs === wbs);
      if (mode === "move") {
        task.start = nextStart;
        if (task.pred) {
          const pred = allItems(data).find((x) => x.wbs === task.pred);
          if (pred?.finish) task.lag = diffDays(pred.finish, task.start) - 2;
        }
      } else task.days = nextDays;
    },
    { label: t(mode === "move" ? "msgUndoReschedule" : "msgUndoResize", wbs) },
  );
  if (ok)
    recordAudit(
      wbs,
      mode === "move" ? "Drag Move / 拖拽改期" : "Resize Days / 调整工期",
      mode === "move" ? `Start: ${origStart} → ${nextStart}` : `Days: ${origDays}d → ${nextDays}d`,
    );
  return ok;
}

function startBarDrag(e, wbs, mode, dayWidth) {
  if (e.button !== 0 || projectMeta.archived) return;
  const st = findSubtaskByWbs(wbs);
  if (!st || !st.start) return;
  e.preventDefault();
  const barEl = e.currentTarget.closest(".gantt-bar-subtask");
  dragState = {
    wbs,
    st,
    mode,
    dayWidth,
    startX: e.clientX,
    origStart: st.start,
    origDays: Number(st.days) || 1,
    origLeft: parseFloat(barEl.style.left),
    barEl,
    deltaDays: 0,
  };
  document.addEventListener("pointermove", onBarDragMove);
  document.addEventListener("pointerup", onBarDragEnd);
  document.addEventListener("pointercancel", onBarDragEnd);
}

function onBarDragMove(e) {
  if (!dragState) return;
  const dDays = Math.round((e.clientX - dragState.startX) / dragState.dayWidth);
  dragState.deltaDays = dDays;
  const tooltip = document.getElementById("dragTooltip");
  tooltip.style.display = "block";
  tooltip.style.left = e.clientX + 14 + "px";
  tooltip.style.top = e.clientY - 28 + "px";
  if (dragState.mode === "move") {
    dragState.barEl.style.left = dragState.origLeft + dDays * dragState.dayWidth + "px";
    const newStart = addDays(dragState.origStart, dDays);
    const newFinish = addDays(newStart, dragState.origDays - 1);
    const lagNote =
      dragState.st.pred && dDays ? " · " + t("msgLagChange", (dDays > 0 ? "+" : "") + dDays) : "";
    tooltip.textContent = `${dragState.wbs}: ${newStart} ~ ${newFinish} (${dragState.origDays}${t("daysUnit")})${lagNote}`;
  } else {
    const newDays = Math.max(1, dragState.origDays + dDays);
    dragState.barEl.style.width = newDays * dragState.dayWidth + "px";
    tooltip.textContent = `${dragState.wbs}: ${newDays}${t("daysUnit")} (→ ${addDays(dragState.origStart, newDays - 1)})`;
  }
}

function onBarDragEnd() {
  if (!dragState) return;
  const { wbs, mode, deltaDays } = dragState;
  dragState = null;
  document.getElementById("dragTooltip").style.display = "none";
  document.removeEventListener("pointermove", onBarDragMove);
  document.removeEventListener("pointerup", onBarDragEnd);
  document.removeEventListener("pointercancel", onBarDragEnd);
  if (deltaDays !== 0) {
    applyBarChange(wbs, mode, deltaDays);
    renderAll();
  }
}

// Arrow keys move a focused bar by one day; Shift+Arrow changes its duration; Enter opens it.
function onBarKeydown(e, wbs) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openEditModal("Sub-task", wbs);
    return;
  }
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  if (applyBarChange(wbs, e.shiftKey ? "resize" : "move", e.key === "ArrowLeft" ? -1 : 1))
    renderAllKeepingFocus("bar:" + wbs);
}

// ---- Inline table edits ----

function inlineUpdateSubtask(wbs, field, rawValue) {
  if (!["start", "days", "pct"].includes(field) || suppressInlineChanges) return;
  const val = String(rawValue ?? "").trim();
  const oldVal = findSubtaskByWbs(wbs)?.[field];
  if (String(oldVal ?? "") === val) return;
  const ok = transactionalEdit(
    (data) => {
      const st = allItems(data).find((s) => s.wbs === wbs);
      if (!st) throw inputError("msgTaskNotFound");
      if (field === "start" && val && !parseDate(val)) throw inputError("msgDateFormat");
      st[field] = field === "start" ? val : field === "days" && val === "" ? null : Number(val);
      if (field === "start" && st.pred) {
        const pred = allItems(data).find((s) => s.wbs === st.pred);
        if (!val || !pred?.finish) throw inputError("msgStartIsDeterminedByThePredecessor");
        st.lag = diffDays(pred.finish, val) - 2;
      }
    },
    { label: t("msgUndoEdit", wbs) },
  );
  if (ok) recordAudit(wbs, "Inline Edit (" + field + ")", String(oldVal) + " → " + val);
  // Render after focus has moved (Tab / Enter), then put focus back on the same field.
  scheduleRender();
}

// ---- Version snapshot dialog ----

function openVersionModal() {
  const nums = versionList.map((v) => parseFloat(v.tag.replace(/^V/i, ""))).filter((n) => !isNaN(n));
  document.getElementById("verTagInput").value = nums.length
    ? "V" + (Math.max(...nums) + 0.1).toFixed(1)
    : "V1.0";
  document.getElementById("verNoteInput").value = "";
  openAppDialog(document.getElementById("versionModal"));
}

function closeVersionModal() {
  closeAppDialog(document.getElementById("versionModal"), null);
}

function confirmSaveVersion() {
  const dialog = document.getElementById("versionModal");
  try {
    assertEditable();
    const tag = document.getElementById("verTagInput").value.trim() || "V1.0";
    const author = document.getElementById("verAuthorInput").value.trim() || "PM";
    const note = document.getElementById("verNoteInput").value.trim() || "Schedule & resource update";
    if (!VERSION_TAG_PATTERN.test(tag)) throw inputError("msgInvalidVersionTag");
    if (versionList.some((v) => v.tag === tag)) throw inputError("msgVersionTagAlreadyExists");
    pushUndo(t("msgUndoSaveVersion", tag));
    versionList.unshift({
      tag,
      time: nowTimestamp(),
      author,
      note,
      span: document.getElementById("kpiSpan").textContent,
      progress: document.getElementById("kpiProgress").textContent,
      data: compactData(projectData),
    });
    activeVersionTag = tag;
    recordAudit("-", "Save Version / 保存版本快照", `${tag} (${author}): ${note}`);
    closeVersionModal();
    renderAll();
  } catch (e) {
    setDialogError(dialog, e.message);
  }
}

// ---- Task dialog ----

function populatePredOptions(excludeWbs) {
  let html = `<option value="">${t("noPredOpt")}</option>`;
  for (const fam of projectData)
    for (const mt of fam.mainTasks)
      for (const st of mt.subtasks)
        if (st.wbs !== excludeWbs)
          html += `<option value="${escapeHtml(st.wbs)}">${escapeHtml(st.wbs)} - ${escapeHtml(st.name.slice(0, 36))} (${st.finish || "TBC"})</option>`;
  document.getElementById("mdPred").innerHTML = html;
}

function onModalTypeChange() {
  const type = document.getElementById("mdType").value;
  const parentSel = document.getElementById("mdParent");
  if (type === "Main Task") {
    document.getElementById("mdParentLabel").textContent = t("lblMdParentFam");
    parentSel.innerHTML = projectData
      .map((f) => `<option value="${escapeHtml(f.wbs)}">${escapeHtml(f.wbs)}. ${escapeHtml(f.name)}</option>`)
      .join("");
  } else {
    document.getElementById("mdParentLabel").textContent = t("lblMdParentMain");
    parentSel.innerHTML = projectData
      .flatMap((f) => f.mainTasks)
      .map(
        (mt) =>
          `<option value="${escapeHtml(mt.wbs)}">${escapeHtml(mt.wbs)} - ${escapeHtml(mt.name.slice(0, 40))}</option>`,
      )
      .join("");
  }
  document.getElementById("mdSubtaskFields").hidden = type === "Main Task";
}

function setTaskDialogMode(mode) {
  const editing = mode === "edit";
  document.getElementById("mdMode").value = mode;
  document.getElementById("mdType").disabled = editing;
  for (const id of ["mdDeleteBtn", "mdMoveUp", "mdMoveDown"]) document.getElementById(id).hidden = !editing;
}

function openAddModal(defaultType) {
  try {
    assertEditable();
    if (defaultType === "Main Task" && !projectData.length) throw inputError("msgAddPhaseFirst");
    if (defaultType === "Sub-task" && !projectData.some((f) => f.mainTasks.length))
      throw inputError("msgAddMainTaskFirst");
  } catch (e) {
    showMessage(e.message);
    return;
  }
  setTaskDialogMode("add");
  document.getElementById("mdOrigWbs").value = "";
  document.getElementById("modalTitle").textContent =
    defaultType === "Main Task" ? t("mdAddMain") : t("mdAddSub");
  document.getElementById("mdType").value = defaultType;
  onModalTypeChange();
  populatePredOptions("");
  const parent = document.getElementById("mdParent");
  parent.selectedIndex = Math.max(0, parent.options.length - 1);
  document.getElementById("mdWbs").value = suggestChildWbs(parent.value, defaultType);
  parent.onchange = () =>
    (document.getElementById("mdWbs").value = suggestChildWbs(
      parent.value,
      document.getElementById("mdType").value,
    ));
  document.getElementById("mdName").value = "";
  document.getElementById("mdPrio").value = "2";
  document.getElementById("mdPred").value = "";
  document.getElementById("mdLag").value = "0";
  document.getElementById("mdStart").value = today();
  document.getElementById("mdDays").value = "7";
  document.getElementById("mdFinish").value = addDays(today(), 6);
  document.getElementById("mdPct").value = "0";
  renderGroupInputs({});
  openAppDialog(document.getElementById("taskModal"));
  document.getElementById("mdName").focus();
}

function openEditModal(type, wbs) {
  if (type === "Family") {
    editPhase(wbs);
    return;
  }
  const found = findParentList(projectData, wbs);
  if (!found) return;
  setTaskDialogMode("edit");
  document.getElementById("mdOrigWbs").value = wbs;
  document.getElementById("mdType").value = type;
  onModalTypeChange();
  document.getElementById("mdParent").value = found.parent.wbs;
  document.getElementById("mdParent").onchange = null;
  const item = found.item;
  document.getElementById("modalTitle").textContent =
    `${t(type === "Main Task" ? "mdEditMain" : "mdEditSub")} [${item.wbs}]`;
  document.getElementById("mdWbs").value = item.wbs;
  document.getElementById("mdName").value = item.name;
  document.getElementById("mdPrio").value = item.prio || "";
  if (type === "Sub-task") {
    populatePredOptions(wbs);
    document.getElementById("mdPred").value = item.pred || "";
    document.getElementById("mdLag").value = item.lag || 0;
    document.getElementById("mdStart").value = item.start || "";
    document.getElementById("mdDays").value = item.days || "";
    document.getElementById("mdFinish").value = item.finish || "";
    document.getElementById("mdPct").value = item.pct || 0;
    renderGroupInputs(item);
  }
  const index = found.list.indexOf(item);
  document.getElementById("mdMoveUp").disabled = index === 0;
  document.getElementById("mdMoveDown").disabled = index === found.list.length - 1;
  openAppDialog(document.getElementById("taskModal"));
}

function onModalPredChange() {
  const predWbs = document.getElementById("mdPred").value;
  const lag = Number(document.getElementById("mdLag").value || 0);
  const predTask = predWbs && findSubtaskByWbs(predWbs);
  if (predTask?.finish) {
    document.getElementById("mdStart").value = addDays(predTask.finish, 1 + lag);
    onModalStartOrDaysChange();
  }
}

function onModalStartOrDaysChange() {
  const s = document.getElementById("mdStart").value.trim();
  const d = Number(document.getElementById("mdDays").value || 0);
  document.getElementById("mdFinish").value = parseDate(s) && d > 0 ? addDays(s, d - 1) : "";
}

function saveModalTask() {
  const dialog = document.getElementById("taskModal");
  const value = (id) => document.getElementById(id).value.trim();
  const mode = value("mdMode"),
    type = value("mdType"),
    wbs = value("mdWbs"),
    name = value("mdName"),
    orig = value("mdOrigWbs"),
    parentWbs = value("mdParent");
  if (!name || !wbs) {
    setDialogError(dialog, t("msgWbsAndNameAreRequired"));
    return;
  }
  if (type === "Sub-task" && value("mdStart") && !parseDate(value("mdStart"))) {
    setDialogError(dialog, t("msgDateFormat"));
    return;
  }
  const ok = transactionalEdit(
    (data) => {
      if (allItems(data).some((it) => it.wbs === wbs && (mode === "add" || it.wbs !== orig)))
        throw inputError("msgDuplicateWbs2");
      const parents = type === "Main Task" ? data : data.flatMap((f) => f.mainTasks);
      const parent = parents.find((p) => p.wbs === parentWbs);
      if (!parent) throw inputError("msgParentNotFound");
      const children = type === "Main Task" ? parent.mainTasks : parent.subtasks;
      if (type === "Main Task") {
        if (mode === "add") {
          children.push({ wbs, name, collapsed: false, subtasks: [] });
          return;
        }
        const found = findParentList(data, orig);
        if (!found) throw inputError("msgTaskNotFound");
        found.item.name = name;
        renameWbs(data, orig, wbs);
        if (found.parent !== parent) {
          found.list.splice(found.list.indexOf(found.item), 1);
          children.push(found.item);
        }
        return;
      }
      const input = {
        wbs,
        name,
        pred: value("mdPred"),
        lag: Number(value("mdLag") || 0),
        prio: value("mdPrio") ? Number(value("mdPrio")) : null,
        start: value("mdStart"),
        days: value("mdDays") ? Number(value("mdDays")) : null,
        pct: Number(value("mdPct") || 0),
        ...readGroupInputs(),
      };
      if (mode === "add") {
        children.push(input);
        return;
      }
      const found = findParentList(data, orig);
      if (!found) throw inputError("msgTaskNotFound");
      Object.assign(found.item, input);
      for (const it of allItems(data)) if (it.pred === orig) it.pred = wbs;
      if (found.parent !== parent) {
        found.list.splice(found.list.indexOf(found.item), 1);
        children.push(found.item);
      }
    },
    {
      label: t(mode === "add" ? "msgUndoAdd" : "msgUndoEdit", wbs),
      onError: (message) => setDialogError(dialog, message),
    },
  );
  if (!ok) return;
  recordAudit(wbs, mode === "add" ? "Add task" : "Update task", name);
  closeAppDialog(dialog, true);
  renderAll();
}

function moveModalTask(direction) {
  const wbs = document.getElementById("mdOrigWbs").value;
  if (!moveWithinParent(wbs, direction)) return;
  const found = findParentList(projectData, wbs);
  const index = found.list.indexOf(found.item);
  document.getElementById("mdMoveUp").disabled = index === 0;
  document.getElementById("mdMoveDown").disabled = index === found.list.length - 1;
}

// Items outside `removed` that still point at a removed task as predecessor.
function blockingDependents(data, removed) {
  return allItems(data).filter((s) => !removed.has(s.wbs) && removed.has(s.pred));
}

async function deleteModalTask() {
  const dialog = document.getElementById("taskModal");
  const id = document.getElementById("mdOrigWbs").value;
  const found = findParentList(projectData, id);
  if (!found) return;
  const removed = new Set([
    id,
    ...(found.level === "Main Task" ? found.item.subtasks.map((s) => s.wbs) : []),
  ]);
  const dependents = blockingDependents(projectData, removed);
  if (dependents.length) {
    setDialogError(
      dialog,
      t("msgRemoveTheseDependenciesBeforeDeletion") + dependents.map((s) => s.wbs).join(", "),
    );
    return;
  }
  const children = found.level === "Main Task" ? found.item.subtasks.length : 0;
  const confirmed = await askConfirm(
    children ? t("msgDeleteMainTaskWithChildren", id, children) : t("msgDeleteTask", id),
    {
      title: t("mdDeleteBtn"),
      confirmLabel: t("msgDeleteAction"),
      danger: true,
    },
  );
  if (!confirmed) return;
  const ok = transactionalEdit(
    (data) => {
      const target = findParentList(data, id);
      target.list.splice(target.list.indexOf(target.item), 1);
    },
    { label: t("msgUndoDelete", id), onError: (message) => setDialogError(dialog, message) },
  );
  if (!ok) return;
  recordAudit(id, "Delete task", id);
  closeAppDialog(dialog, true);
  renderAll();
}

function closeModal() {
  closeAppDialog(document.getElementById("taskModal"), null);
}

// ---- WBS suggestions ----

function nextNumber(values) {
  const nums = values.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

function suggestPhaseWbs() {
  return nextNumber(projectData.map((f) => f.wbs));
}

function suggestChildWbs(parentWbs, type) {
  const parent = (type === "Main Task" ? projectData : projectData.flatMap((f) => f.mainTasks)).find(
    (p) => p.wbs === parentWbs,
  );
  if (!parent) return "";
  const children = type === "Main Task" ? parent.mainTasks : parent.subtasks;
  const suffixes = children.map((c) =>
    c.wbs.startsWith(parentWbs + ".") ? c.wbs.slice(parentWbs.length + 1) : "",
  );
  return parentWbs + "." + nextNumber(suffixes);
}

// ---- Phases ----

async function addPhase() {
  try {
    assertEditable();
  } catch (e) {
    showMessage(e.message);
    return;
  }
  const values = await askForm({
    title: t("msgAddPhaseTitle"),
    intro: t("msgAddPhaseIntro"),
    fields: [
      { name: "wbs", label: t("lblMdWbs"), value: suggestPhaseWbs(), required: true },
      { name: "name", label: t("msgPhaseName"), value: "", required: true },
    ],
    submitLabel: t("msgAddPhaseTitle"),
    validate(v) {
      const candidate = copy(projectData);
      candidate.push({ wbs: v.wbs, name: v.name, mainTasks: [] });
      validateProject(candidate);
    },
  });
  if (!values) return;
  if (
    transactionalEdit((data) => data.push({ wbs: values.wbs, name: values.name, mainTasks: [] }), {
      label: t("msgUndoAdd", values.wbs),
    })
  ) {
    recordAudit(values.wbs, "Add phase", values.name);
    renderAll();
  }
}

function editPhase(wbs) {
  const phase = projectData.find((f) => f.wbs === wbs);
  if (!phase) return;
  const readValues = (d) => ({
    wbs: d.querySelector("#phaseWbs").value.trim(),
    name: d.querySelector("#phaseName").value.trim(),
  });
  return showDialog({
    title: t("msgEditPhaseTitle", wbs),
    bodyHtml:
      '<div class="form-grid two-col"><div class="form-field"><label for="phaseWbs">' +
      t("lblMdWbs") +
      '</label><input id="phaseWbs" value="' +
      escapeHtml(phase.wbs) +
      '"></div><div class="form-field"><label for="phaseName">' +
      t("msgPhaseName") +
      '</label><input id="phaseName" value="' +
      escapeHtml(phase.name) +
      '"></div></div><p class="ui-caption">' +
      t("msgPhaseRenameHint") +
      "</p>",
    actions: [
      {
        label: t("msgDeleteAction"),
        kind: "danger",
        align: "start",
        async onClick(d) {
          if (await deletePhase(wbs)) closeAppDialog(d, null);
          return false;
        },
      },
      { label: t("msgMoveUp"), align: "start", onClick: () => (moveWithinParent(wbs, -1), false) },
      { label: t("msgMoveDown"), align: "start", onClick: () => (moveWithinParent(wbs, 1), false) },
      { label: t("msgCancel"), value: null },
      {
        label: t("msgSave"),
        kind: "primary",
        onClick(d) {
          const v = readValues(d);
          if (!v.wbs || !v.name) throw inputError("msgWbsAndNameAreRequired");
          let error = "";
          const ok = transactionalEdit(
            (data) => {
              if (v.wbs !== wbs && allItems(data).some((it) => it.wbs === v.wbs))
                throw inputError("msgDuplicateWbs2");
              data.find((f) => f.wbs === wbs).name = v.name;
              renameWbs(data, wbs, v.wbs);
            },
            { label: t("msgUndoEdit", wbs), onError: (message) => (error = message) },
          );
          if (!ok) throw new Error(error);
          recordAudit(v.wbs, "Update phase", v.name);
          renderAll();
        },
      },
    ],
  });
}

async function deletePhase(wbs) {
  const phase = projectData.find((f) => f.wbs === wbs);
  if (!phase) return false;
  const removed = new Set(allItems([phase]).map((x) => x.wbs));
  const dependents = blockingDependents(projectData, removed);
  if (dependents.length) {
    await showMessage(
      t("msgRemoveTheseDependenciesBeforeDeletion") + dependents.map((s) => s.wbs).join(", "),
    );
    return false;
  }
  const count = removed.size - 1;
  const confirmed = await askConfirm(
    count ? t("msgDeletePhaseWithChildren", phase.name, count) : t("msgDeleteTask", phase.name),
    {
      title: t("msgDeletePhaseTitle"),
      confirmLabel: t("msgDeleteAction"),
      danger: true,
    },
  );
  if (!confirmed) return false;
  if (
    !transactionalEdit(
      (data) =>
        data.splice(
          data.findIndex((f) => f.wbs === wbs),
          1,
        ),
      { label: t("msgUndoDelete", wbs) },
    )
  )
    return false;
  recordAudit(wbs, "Delete phase", phase.name);
  renderAll();
  return true;
}

// ---- Projects ----

async function projectAction(action) {
  try {
    if (action === "new" || action === "demo") {
      const values = await askForm({
        title: t(action === "demo" ? "btnDemoProject" : "btnNewProject"),
        fields: [
          {
            name: "name",
            label: t("msgProjectName"),
            value: action === "demo" ? "Fictional demo" : "",
            required: true,
          },
        ],
        submitLabel: t("msgCreate"),
      });
      if (values) addProject(newProject(values.name, action === "demo" ? syntheticData() : []));
    }
    if (action === "duplicate") {
      const values = await askForm({
        title: t("btnDuplicateProject"),
        fields: [
          { name: "name", label: t("msgNameOfDuplicate"), value: projectMeta.name + " copy", required: true },
        ],
        submitLabel: t("btnDuplicateProject"),
      });
      if (!values) return;
      const b = currentBundle();
      assignProjectIdentity(b, crypto.randomUUID());
      b.metadata = { name: values.name, archived: false, customName: true };
      addProject(b);
    }
    if (action === "settings") openProjectSettings();
    if (action === "archive") toggleArchive();
    if (action === "delete") await deleteCurrentProject();
    if (action === "phase") await addPhase();
  } catch (e) {
    showError(e.message);
  }
}

function toggleArchive() {
  const previous = projectMeta.archived;
  projectMeta.archived = !previous;
  if (!saveState()) projectMeta.archived = previous;
  else recordAudit("-", previous ? "Restore project" : "Archive project", projectMeta.name);
  clearUndoHistory();
  renderAll();
}

async function deleteCurrentProject() {
  const values = await askForm({
    title: t("msgDeleteProjectTitle"),
    intro: t("msgDeleteProjectIntro", projectMeta.name),
    fields: [{ name: "backup", type: "checkbox", label: t("msgDownloadBackupFirst"), value: true }],
    submitLabel: t("msgDeleteProjectAction"),
  });
  if (!values) return;
  if (values.backup) exportVersionBundle();
  removeProject(projectId);
}

// Fills the current empty project with the fictional example (from the empty-state guide).
function loadDemoIntoProject() {
  if (projectData.length) return;
  if (transactionalEdit((data) => data.push(...syntheticData()), { label: t("btnDemoProject") })) {
    recordAudit("-", "Load fictional demo", "");
    renderAll();
  }
}

// ---- Group inputs and project settings ----

function renderGroupInputs(item = {}) {
  const host = document.getElementById("taskGroupInputs");
  if (!host) return;
  host.innerHTML = groups()
    .map(
      (g) =>
        '<div class="form-field"><label for="md_' +
        g.id +
        '">' +
        escapeHtml(g.name) +
        t("msgPeopleSeparatedBySemicolons") +
        '</label><input id="md_' +
        g.id +
        '" type="text" value="' +
        escapeHtml(item[g.id] || "") +
        '"></div>',
    )
    .join("");
}

function readGroupInputs() {
  return Object.fromEntries(
    GROUP_IDS.map((id) => [id, document.getElementById("md_" + id)?.value.trim() || ""]),
  );
}

function openProjectSettings() {
  let draft = copy(groups());
  const sync = (d) => {
    d.querySelectorAll("[data-group-id]").forEach((row) => {
      const g = draft.find((x) => x.id === row.dataset.groupId);
      g.name = row.querySelector("[data-name]").value;
      g.color = row.querySelector("[data-color]").value;
    });
  };
  const draw = (d) => {
    d.querySelector("#settingGroups").innerHTML = draft
      .map(
        (g, i) =>
          '<div data-group-id="' +
          g.id +
          '" class="settings-group-row"><span class="ui-caption">' +
          t("msgGroupSlot", i + 1) +
          '</span><input data-name aria-label="' +
          escapeHtml(t("msgGroupSlot", i + 1) + " " + t("msgName")) +
          '" maxlength="60" value="' +
          escapeHtml(g.name) +
          '"><input data-color aria-label="' +
          escapeHtml(t("msgGroupSlot", i + 1) + " " + t("msgColor")) +
          '" type="color" value="' +
          g.color +
          '"><button type="button" class="btn" data-remove="' +
          g.id +
          '">' +
          t("msgRemove") +
          "</button></div>",
      )
      .join("");
    d.querySelector("#addSettingGroup").disabled = draft.length >= MAX_GROUPS;
    d.querySelectorAll("[data-remove]").forEach(
      (button) =>
        (button.onclick = () => {
          sync(d);
          draft = draft.filter((g) => g.id !== button.dataset.remove);
          draw(d);
        }),
    );
  };
  return showDialog({
    title: t("msgProjectSettingsAndGroups"),
    size: "wide",
    bodyHtml:
      '<div class="form-grid"><div class="form-field full"><label for="settingName">' +
      t("msgProjectName") +
      '</label><input id="settingName" value="' +
      escapeHtml(projectMeta.name) +
      '"></div><div class="form-field full"><label for="settingPeople">' +
      t("msgPeopleSemicolonSeparated") +
      '</label><input id="settingPeople" value="' +
      escapeHtml(projectSettings.people.join("; ")) +
      '"></div></div><h3 class="ui-heading settings-subhead">' +
      t("msgGroupsHeading") +
      '</h3><p class="ui-caption">' +
      t("msgUpTo10GroupsIdsAre") +
      '</p><div id="settingGroups"></div><button type="button" class="btn" id="addSettingGroup">' +
      t("msgAddGroup") +
      '</button><div class="form-field full no-enter-submit"><label for="settingAliases">' +
      t("msgPeopleAliasesJson") +
      '</label><textarea id="settingAliases" rows="5">' +
      escapeHtml(JSON.stringify(projectSettings.personAliases, null, 2)) +
      "</textarea></div>",
    actions: [
      { label: t("msgCancel"), value: null },
      {
        label: t("msgSave"),
        kind: "primary",
        onClick(d) {
          if (storageReadBlocked) throw inputError("msgStoragePausedExportABackupAnd");
          sync(d);
          const b = currentBundle();
          b.metadata.name = d.querySelector("#settingName").value.trim();
          b.metadata.customName = true;
          b.settings.groups = draft.map((g) => ({ ...g, name: g.name.trim() }));
          b.settings.people = d
            .querySelector("#settingPeople")
            .value.split(";")
            .map((p) => p.trim())
            .filter(Boolean);
          try {
            b.settings.personAliases = JSON.parse(d.querySelector("#settingAliases").value || "{}");
          } catch (e) {
            throw inputError("msgAliasesJsonInvalid");
          }
          validateBundle(b);
          const next = copy(workspace);
          next.projects[projectId] = b;
          commitWorkspace(next);
          selectBundle(b);
          applyStaticI18n();
          renderAll();
        },
      },
    ],
    onOpen(d) {
      draw(d);
      d.querySelector("#addSettingGroup").onclick = () => {
        sync(d);
        const id = GROUP_IDS.find((x) => !draft.some((g) => g.id === x));
        if (id) {
          draft.push({
            id,
            name: "Group " + (GROUP_IDS.indexOf(id) + 1),
            color: GROUP_COLORS[GROUP_IDS.indexOf(id)],
          });
          draw(d);
        }
      };
    },
  });
}
