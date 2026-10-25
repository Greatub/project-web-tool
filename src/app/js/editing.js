function transactionalEdit(edit) {
  const candidate = JSON.parse(JSON.stringify(projectData));
  try {
    edit(candidate);
    validateProject(candidate);
    recalculateSchedule(candidate);
  } catch (e) {
    alert(e.message);
    return false;
  }
  projectData = candidate;
  return true;
}

let dragState = null;

function startBarDrag(e, wbs, mode, dayWidth) {
  if (e.button !== 0) return;
  const st = findSubtaskByWbs(wbs);
  if (!st || !st.start) return;
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
    origWidth: parseFloat(barEl.style.width),
    barEl,
    deltaDays: 0,
  };
  document.addEventListener("mousemove", onBarDragMove);
  document.addEventListener("mouseup", onBarDragEnd);
}

function onBarDragMove(e) {
  if (!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dDays = Math.round(dx / dragState.dayWidth);
  dragState.deltaDays = dDays;
  const tooltip = document.getElementById("dragTooltip");
  tooltip.style.display = "block";
  tooltip.style.left = e.clientX + 14 + "px";
  tooltip.style.top = e.clientY - 28 + "px";

  if (dragState.mode === "move") {
    dragState.barEl.style.left = dragState.origLeft + dDays * dragState.dayWidth + "px";
    const newStart = addDays(dragState.origStart, dDays);
    const newFinish = addDays(newStart, dragState.origDays - 1);
    tooltip.textContent = `${dragState.wbs}: ${newStart} ~ ${newFinish} (${dragState.origDays}${t("daysUnit")})`;
  } else {
    const newDays = Math.max(1, dragState.origDays + dDays);
    dragState.barEl.style.width = newDays * dragState.dayWidth + "px";
    const newFinish = addDays(dragState.origStart, newDays - 1);
    tooltip.textContent = `${dragState.wbs}: ${newDays}${t("daysUnit")} (-> ${newFinish})`;
  }
}

function onBarDragEnd() {
  if (!dragState) return;
  const { st, mode, deltaDays, origStart, origDays } = dragState;
  document.getElementById("dragTooltip").style.display = "none";
  document.removeEventListener("mousemove", onBarDragMove);
  document.removeEventListener("mouseup", onBarDragEnd);

  if (deltaDays !== 0) {
    if (mode === "move") {
      const nextStart = addDays(origStart, deltaDays);
      recordAudit(st.wbs, "Drag Move / 拖拽改期", `Start: ${origStart} → ${nextStart}`);
      st.start = nextStart;
      if (st.pred) {
        const predTask = findSubtaskByWbs(st.pred);
        if (predTask && predTask.finish) {
          st.lag = diffDays(predTask.finish, st.start) - 2;
        }
      }
    } else if (mode === "resize") {
      const nextDays = Math.max(1, origDays + deltaDays);
      recordAudit(st.wbs, "Resize Days / 调整工期", `Days: ${origDays}d → ${nextDays}d`);
      st.days = nextDays;
    }
    recalculateSchedule();
    renderAll();
  }
  dragState = null;
}

function openVersionModal() {
  // Suggest next minor version tag automatically
  const nums = versionList.map((v) => parseFloat(v.tag.replace(/^V/i, ""))).filter((n) => !isNaN(n));
  const nextVer = nums.length ? "V" + (Math.max(...nums) + 0.1).toFixed(1) : "V1.0";
  document.getElementById("verTagInput").value = nextVer;
  document.getElementById("verNoteInput").value = "";
  document.getElementById("versionModal").classList.add("open");
}

function closeVersionModal() {
  document.getElementById("versionModal").classList.remove("open");
}

function confirmSaveVersion() {
  const tag = document.getElementById("verTagInput").value.trim() || "V1.0";
  const author = document.getElementById("verAuthorInput").value.trim() || "PM";
  const note = document.getElementById("verNoteInput").value.trim() || "Schedule & resource update";
  const span = document.getElementById("kpiSpan").textContent;
  const progress = document.getElementById("kpiProgress").textContent;

  if (!/^[A-Za-z0-9._ -]+$/.test(tag)) {
    alert(t("msgInvalidVersionTag"));
    return;
  }
  if (versionList.some((v) => v.tag === tag)) {
    alert(t("msgVersionTagAlreadyExists"));
    return;
  }
  versionList.unshift({
    tag,
    time: nowTimestamp(),
    author,
    note,
    span,
    progress,
    data: compactData(projectData),
  });
  activeVersionTag = tag;
  saveState();

  recordAudit("-", "Save Version / 保存版本快照", `${tag} (${author}): ${note}`);
  closeVersionModal();
  renderAll();
}

function inlineUpdateSubtask(wbs, field, val) {
  if (!["start", "days", "pct"].includes(field)) return;
  const oldVal = findSubtaskByWbs(wbs)?.[field];
  if (
    transactionalEdit((data) => {
      const st = allItems(data).find((s) => s.wbs === wbs);
      if (!st) throw inputError("msgTaskNotFound");
      st[field] = field === "start" ? val : field === "days" && val === "" ? null : Number(val);
      if (field === "start" && st.pred) {
        const pred = allItems(data).find((s) => s.wbs === st.pred);
        if (!val || !pred?.finish) throw inputError("msgStartIsDeterminedByThePredecessor");
        st.lag = diffDays(pred.finish, val) - 2;
      }
    })
  )
    recordAudit(wbs, "Inline Edit (" + field + ")", String(oldVal) + " → " + val);
  renderAll();
}

function populatePredOptions(excludeWbs) {
  const sel = document.getElementById("mdPred");
  let html = `<option value="">${t("noPredOpt")}</option>`;
  projectData.forEach((fam) => {
    fam.mainTasks.forEach((mt) => {
      mt.subtasks.forEach((st) => {
        if (st.wbs !== excludeWbs) {
          html += `<option value="${escapeHtml(st.wbs)}">${escapeHtml(st.wbs)} - ${escapeHtml(st.name.slice(0, 36))} (${st.finish || "TBC"})</option>`;
        }
      });
    });
  });
  sel.innerHTML = html;
}

function onModalTypeChange() {
  const type = document.getElementById("mdType").value;
  const parentSel = document.getElementById("mdParent");
  const subFields = document.getElementById("mdSubtaskFields");
  if (type === "Main Task") {
    document.getElementById("mdParentLabel").textContent = t("lblMdParentFam");
    parentSel.innerHTML = projectData
      .map((f) => `<option value="${f.wbs}">${f.wbs}. ${escapeHtml(f.name)}</option>`)
      .join("");
    subFields.style.display = "none";
  } else {
    document.getElementById("mdParentLabel").textContent = t("lblMdParentMain");
    let opts = "";
    projectData.forEach((f) => {
      f.mainTasks.forEach((mt) => {
        opts += `<option value="${mt.wbs}">${mt.wbs} - ${escapeHtml(mt.name.slice(0, 40))}</option>`;
      });
    });
    parentSel.innerHTML = opts;
    subFields.style.display = "grid";
  }
}

function openAddModal(defaultType) {
  document.getElementById("mdMode").value = "add";
  document.getElementById("mdOrigWbs").value = "";
  document.getElementById("modalTitle").textContent =
    defaultType === "Main Task" ? t("mdAddMain") : t("mdAddSub");
  document.getElementById("mdType").value = defaultType;
  document.getElementById("mdType").disabled = false;
  document.getElementById("mdParentWrap").style.display = "flex";
  document.getElementById("mdDeleteBtn").style.display = "none";
  onModalTypeChange();
  populatePredOptions("");

  document.getElementById("mdWbs").value = "";
  document.getElementById("mdName").value = "";
  document.getElementById("mdPrio").value = "1";
  document.getElementById("mdPred").value = "";
  document.getElementById("mdLag").value = "0";
  document.getElementById("mdStart").value = today();
  document.getElementById("mdDays").value = "7";
  document.getElementById("mdFinish").value = addDays(today(), 6);
  document.getElementById("mdPct").value = "0";

  renderGroupInputs(
    document.getElementById("mdType").value === "Sub-task" &&
      document.getElementById("mdMode").value === "edit"
      ? findSubtaskByWbs(document.getElementById("mdOrigWbs").value)
      : {},
  );
  document.getElementById("taskModal").classList.add("open");
}

function openEditModal(type, wbs) {
  if (type === "Family") return;
  document.getElementById("mdMode").value = "edit";
  document.getElementById("mdOrigWbs").value = wbs;
  document.getElementById("mdType").value = type;
  document.getElementById("mdType").disabled = true;
  document.getElementById("mdParentWrap").style.display = "none";
  document.getElementById("mdDeleteBtn").style.display = "inline-flex";
  onModalTypeChange();

  if (type === "Main Task") {
    let foundMt = null;
    projectData.forEach((f) =>
      f.mainTasks.forEach((m) => {
        if (m.wbs === wbs) foundMt = m;
      }),
    );
    if (!foundMt) return;
    document.getElementById("modalTitle").textContent = `${t("mdEditMain")} [${foundMt.wbs}]`;
    document.getElementById("mdWbs").value = foundMt.wbs;
    document.getElementById("mdName").value = foundMt.name;
    document.getElementById("mdPrio").value = foundMt.prio || "";
  } else {
    const st = findSubtaskByWbs(wbs);
    if (!st) return;
    populatePredOptions(wbs);
    document.getElementById("modalTitle").textContent = `${t("mdEditSub")} [${st.wbs}]`;
    document.getElementById("mdWbs").value = st.wbs;
    document.getElementById("mdName").value = st.name;
    document.getElementById("mdPrio").value = st.prio || "";
    document.getElementById("mdPred").value = st.pred || "";
    document.getElementById("mdLag").value = st.lag || 0;
    document.getElementById("mdStart").value = st.start || "";
    document.getElementById("mdDays").value = st.days || "";
    document.getElementById("mdFinish").value = st.finish || "";
    document.getElementById("mdPct").value = st.pct || 0;
  }
  renderGroupInputs(
    document.getElementById("mdType").value === "Sub-task" &&
      document.getElementById("mdMode").value === "edit"
      ? findSubtaskByWbs(document.getElementById("mdOrigWbs").value)
      : {},
  );
  document.getElementById("taskModal").classList.add("open");
}

function onModalPredChange() {
  const predWbs = document.getElementById("mdPred").value;
  const lag = Number(document.getElementById("mdLag").value || 0);
  if (predWbs) {
    const predTask = findSubtaskByWbs(predWbs);
    if (predTask && predTask.finish) {
      document.getElementById("mdStart").value = addDays(predTask.finish, 1 + lag);
      onModalStartOrDaysChange("start");
    }
  }
}

function onModalStartOrDaysChange() {
  const s = document.getElementById("mdStart").value;
  const d = Number(document.getElementById("mdDays").value || 0);
  if (s && d > 0) {
    document.getElementById("mdFinish").value = addDays(s, d - 1);
  } else {
    document.getElementById("mdFinish").value = "";
  }
}

function saveModalTask() {
  const value = (id) => document.getElementById(id).value.trim();
  const mode = value("mdMode"),
    type = value("mdType"),
    wbs = value("mdWbs"),
    name = value("mdName"),
    orig = value("mdOrigWbs");
  if (!name || !wbs) {
    alert(t("msgWbsAndNameAreRequired"));
    return;
  }
  const ok = transactionalEdit((data) => {
    const items = allItems(data);
    if (items.some((it) => it.wbs === wbs && (mode === "add" || it.wbs !== orig)))
      throw inputError("msgDuplicateWbs2");
    if (type === "Main Task") {
      if (mode === "add") {
        const parent = data.find((f) => f.wbs === value("mdParent"));
        if (!parent) throw inputError("msgParentNotFound");
        parent.mainTasks.push({
          wbs,
          name,
          collapsed: false,
          subtasks: [
            {
              wbs: wbs + ".1",
              name: name + " - 1",
              start: "",
              days: null,
              pct: 0,
              pred: "",
              lag: 0,
              prio: null,
              group1: "",
              group2: "",
              group3: "",
            },
          ],
        });
      } else {
        const mt = data.flatMap((f) => f.mainTasks).find((m) => m.wbs === orig);
        if (!mt) throw inputError("msgTaskNotFound");
        const renames = new Map([[orig, wbs]]);
        mt.subtasks.forEach((s) => {
          if (s.wbs.startsWith(orig + ".")) renames.set(s.wbs, wbs + s.wbs.slice(orig.length));
        });
        items.forEach((it) => {
          if (renames.has(it.wbs)) it.wbs = renames.get(it.wbs);
          if (renames.has(it.pred)) it.pred = renames.get(it.pred);
        });
        mt.name = name;
      }
    } else {
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
        const mt = data.flatMap((f) => f.mainTasks).find((m) => m.wbs === value("mdParent"));
        if (!mt) throw inputError("msgParentNotFound");
        mt.subtasks.push(input);
      } else {
        const st = data.flatMap((f) => f.mainTasks.flatMap((m) => m.subtasks)).find((s) => s.wbs === orig);
        if (!st) throw inputError("msgTaskNotFound");
        Object.assign(st, input);
        items.forEach((it) => {
          if (it.pred === orig) it.pred = wbs;
        });
      }
    }
  });
  if (!ok) return;
  recordAudit(wbs, mode === "add" ? "Add task" : "Update task", name);
  closeModal();
  renderAll();
}

function deleteModalTask() {
  const id = document.getElementById("mdOrigWbs").value;
  const type = document.getElementById("mdType").value;
  const removed = new Set([id]);
  if (type === "Main Task")
    projectData.forEach((f) =>
      f.mainTasks.filter((m) => m.wbs === id).forEach((m) => m.subtasks.forEach((s) => removed.add(s.wbs))),
    );
  const dependents = allItems(projectData).filter((s) => !removed.has(s.wbs) && removed.has(s.pred));
  if (dependents.length) {
    alert(t("msgRemoveTheseDependenciesBeforeDeletion") + dependents.map((s) => s.wbs).join(", "));
    return;
  }
  if (!confirm(t("msgDelete") + id + "?")) return;
  if (
    !transactionalEdit((data) =>
      data.forEach((f) => {
        if (type === "Main Task") f.mainTasks = f.mainTasks.filter((m) => m.wbs !== id);
        else f.mainTasks.forEach((m) => (m.subtasks = m.subtasks.filter((s) => s.wbs !== id)));
      }),
    )
  )
    return;
  recordAudit(id, "Delete task", id);
  closeModal();
  renderAll();
}

function closeModal() {
  document.getElementById("taskModal").classList.remove("open");
}

function projectAction(action) {
  try {
    if (action === 0 || action === 1) {
      const name = prompt(t("msgProjectName"));
      if (!name?.trim()) return;
      addProject(newProject(name.trim(), action === 1 ? syntheticData() : []));
    }
    if (action === 2) {
      const name = prompt(t("msgNameOfDuplicate"), projectMeta.name + " " + "copy");
      if (!name?.trim()) return;
      const b = currentBundle();
      assignProjectIdentity(b, crypto.randomUUID());
      b.metadata = { name: name.trim(), archived: false, customName: true };
      addProject(b);
    }
    if (action === 3) openProjectSettings();
    if (action === 4) {
      const previous = projectMeta.archived;
      projectMeta.archived = !previous;
      if (!saveState()) projectMeta.archived = previous;
      renderProjectControls();
    }
    if (action === 5) {
      const wbs = prompt(t("msgPhaseWbs"));
      if (!wbs?.trim()) return;
      const name = prompt(t("msgPhaseName"));
      if (!name?.trim()) return;
      if (transactionalEdit((data) => data.push({ wbs: wbs.trim(), name: name.trim(), mainTasks: [] }))) {
        recordAudit(wbs, "Add phase", name);
        renderAll();
      }
    }
  } catch (e) {
    alert(e.message);
  }
}

function renderGroupInputs(item = {}) {
  const host = document.getElementById("taskGroupInputs");
  if (!host) return;
  host.innerHTML = groups()
    .map(
      (g) =>
        '<div class="form-field full"><label for="md_' +
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
  document.getElementById("projectSettingsDialog")?.remove();
  const d = document.createElement("dialog");
  d.id = "projectSettingsDialog";
  d.className = "project-dialog";
  d.innerHTML =
    '<h2 class="ui-heading">' +
    t("msgProjectSettingsAndGroups") +
    '</h2><label for="settingName">' +
    t("msgProjectName") +
    '</label><input id="settingName"><label for="settingPeople">' +
    t("msgPeopleSemicolonSeparated") +
    '</label><input id="settingPeople"><p class="ui-caption">' +
    t("msgUpTo10GroupsIdsAre") +
    '</p><div id="settingGroups"></div><button class="btn" id="addSettingGroup">' +
    t("msgAddGroup") +
    '</button><label for="settingAliases">' +
    t("msgPeopleAliasesJson") +
    '</label><textarea id="settingAliases"></textarea><p id="settingsError" role="alert" class="ui-caption"></p><div class="dialog-actions"><button class="btn" id="settingsCancel">' +
    t("msgCancel") +
    '</button><button class="btn btn-primary" id="settingsSave">' +
    t("msgSave") +
    "</button></div>";
  document.body.append(d);
  d.querySelector("#settingName").value = projectMeta.name;
  d.querySelector("#settingPeople").value = projectSettings.people.join("; ");
  d.querySelector("#settingAliases").value = JSON.stringify(projectSettings.personAliases, null, 2);
  let draft = copy(groups());
  const sync = () => {
    d.querySelectorAll("[data-group-id]").forEach((row) => {
      const g = draft.find((g) => g.id === row.dataset.groupId);
      g.name = row.querySelector("[data-name]").value;
      g.color = row.querySelector("[data-color]").value;
    });
  };
  const draw = () => {
    d.querySelector("#settingGroups").innerHTML = draft
      .map(
        (g) =>
          '<div data-group-id="' +
          g.id +
          '" class="settings-group-row"><span class="ui-caption">' +
          g.id +
          '</span><input data-name aria-label="' +
          g.id +
          " " +
          t("msgName") +
          '" maxlength="60" value="' +
          escapeHtml(g.name) +
          '"><input data-color aria-label="' +
          g.id +
          " " +
          t("msgColor") +
          '" type="color" value="' +
          g.color +
          '"><button class="btn" data-remove="' +
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
          sync();
          draft = draft.filter((g) => g.id !== button.dataset.remove);
          draw();
        }),
    );
  };
  draw();
  d.querySelector("#addSettingGroup").onclick = () => {
    sync();
    const id = GROUP_IDS.find((id) => !draft.some((g) => g.id === id));
    if (id) {
      draft.push({ id, name: id.replace("group", "Group "), color: GROUP_COLORS[GROUP_IDS.indexOf(id)] });
      draw();
    }
  };
  const close = () => {
    d.close();
    d.remove();
  };
  d.querySelector("#settingsCancel").onclick = close;
  d.addEventListener("cancel", () => d.remove());
  d.querySelector("#settingsSave").onclick = () => {
    try {
      if (storageReadBlocked) throw inputError("msgStoragePausedExportABackupAnd");
      sync();
      const b = currentBundle();
      b.metadata.name = d.querySelector("#settingName").value.trim();
      b.metadata.customName = true;
      b.settings.groups = draft.map((g) => ({ ...g, name: g.name.trim() }));
      b.settings.people = d
        .querySelector("#settingPeople")
        .value.split(";")
        .map((p) => p.trim())
        .filter(Boolean);
      b.settings.personAliases = JSON.parse(d.querySelector("#settingAliases").value);
      validateBundle(b);
      const next = copy(workspace);
      next.projects[projectId] = b;
      commitWorkspace(next);
      selectBundle(b);
      applyStaticI18n();
      renderAll();
      close();
    } catch (e) {
      d.querySelector("#settingsError").textContent = e.message;
    }
  };
  d.showModal();
}
