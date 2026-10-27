function getSelectedBaselineMap() {
  const selTag = document.getElementById("fltBaseline")?.value || "NONE";
  if (selTag === "NONE") return null;
  const verObj = versionList.find((v) => v.tag === selTag);
  if (!verObj) return null;
  return buildTaskLookupMap(verObj.data);
}

function getVisibleRows() {
  const fltFam = document.getElementById("fltFamily").value || "ALL";
  const fltPerson = document.getElementById("fltPerson").value || "ALL";
  const fltRole = document.getElementById("fltRole").value || "ALL";

  const rows = [];
  projectData.forEach((fam) => {
    if (fltFam !== "ALL" && fam.wbs !== fltFam) return;

    const matchingMainTasks = [];
    fam.mainTasks.forEach((mt) => {
      const matchingSubs = mt.subtasks.filter((st) => personMatches(st, fltPerson, fltRole));
      if (matchingSubs.length > 0 || fltPerson === "ALL") {
        matchingMainTasks.push({ mt, matchingSubs });
      }
    });

    // Empty phases stay visible (so new phases can be filled); a person filter hides phases without matches.
    if (matchingMainTasks.length === 0 && fltPerson !== "ALL") return;

    rows.push({ level: 0, type: "Family", obj: fam, fam });
    if (!fam.collapsed) {
      matchingMainTasks.forEach(({ mt, matchingSubs }) => {
        rows.push({ level: 1, type: "Main Task", obj: mt, fam });
        if (!mt.collapsed) {
          matchingSubs.forEach((st) => {
            rows.push({ level: 2, type: "Sub-task", obj: st, mt, fam });
          });
        }
      });
    }
  });
  return rows;
}

function renderPills(str, cssClass) {
  const list = splitPeople(str);
  if (!list.length) return '<span style="color:var(--text-muted)">-</span>';
  return list
    .map(
      (p) => `<span class="pill ${cssClass}" title="${escapeHtml(p)}">${escapeHtml(shortenName(p))}</span>`,
    )
    .join("");
}

function onZoomSliderChange(val) {
  const dayW = Number(val) || 24;
  document.getElementById("zoomPctLabel").textContent = Math.round((dayW / 24) * 100) + "%";
  renderGanttAndTable();
}

function stepZoom(delta) {
  const slider = document.getElementById("ganttZoomSlider");
  const nextVal = Math.min(48, Math.max(10, Number(slider.value) + delta));
  slider.value = nextVal;
  onZoomSliderChange(nextVal);
}

function roundedOrthogonalPath(points, radius) {
  const p = points.filter((v, i) => !i || v[0] !== points[i - 1][0] || v[1] !== points[i - 1][1]);
  let d = "M " + p[0].join(" ");
  for (let i = 1; i < p.length - 1; i++) {
    const [ax, ay] = p[i - 1],
      [x, y] = p[i],
      [bx, by] = p[i + 1];
    const before = Math.abs(x - ax) + Math.abs(y - ay),
      after = Math.abs(bx - x) + Math.abs(by - y);
    const r = Math.min(radius, before / 2, after / 2);
    const x0 = x - Math.sign(x - ax) * r,
      y0 = y - Math.sign(y - ay) * r;
    const x3 = x + Math.sign(bx - x) * r,
      y3 = y + Math.sign(by - y) * r;
    d += " L " + x0 + " " + y0 + " Q " + x + " " + y + " " + x3 + " " + y3;
  }
  return d + " L " + p[p.length - 1].join(" ");
}

// ---- WBS table columns ----
// Column widths are fixed except the name column, which takes the remaining width of the left pane.
const INLINE_LABELS = { start: "lblMdStart", days: "lblMdDays", pct: "lblMdPct" };
const BASE_COLUMNS = [
  { key: "wbs", label: "thWbs", width: 56, always: true },
  { key: "name", label: "thName", width: 0, min: 150, always: true },
  { key: "pred", label: "thPred", width: 64, wide: true },
  { key: "prio", label: "thPrio", width: 44, optional: true },
  { key: "start", label: "thStart", width: 108 },
  { key: "finish", label: "thFinish", width: 104 },
  { key: "days", label: "thDays", width: 52 },
  { key: "pct", label: "thPct", width: 56 },
  { key: "people", label: "thPeople", width: 130, wide: true },
];
const COLUMN_PREF_KEY = "project-web-tool:columns";
const SPLIT_PREF_KEY = "project-web-tool:split";
let columnPrefs = null;

function readPref(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch (e) {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function allColumns() {
  return [
    ...BASE_COLUMNS,
    ...groups().map((g) => ({ key: g.id, labelText: g.name, width: 120, group: true, optional: true })),
  ];
}

// Defaults: wide screens show the core columns plus predecessor and a combined people column;
// narrow screens keep dates, duration and progress. Separate group columns and priority are opt-in
// (priority is shown as a badge next to the name and on the Gantt bar).
function defaultColumnVisible(column) {
  if (column.always) return true;
  if (column.optional) return false;
  if (column.wide) return (window.innerWidth || 1440) >= 1280;
  return true;
}

function columnVisible(column) {
  if (column.always) return true;
  const pref = (columnPrefs ??= readPref(COLUMN_PREF_KEY) || {});
  return column.key in pref ? !!pref[column.key] : defaultColumnVisible(column);
}

function visibleColumns() {
  return allColumns().filter(columnVisible);
}

function setColumnVisible(key, visible) {
  columnPrefs = { ...(columnPrefs ?? readPref(COLUMN_PREF_KEY) ?? {}), [key]: visible };
  writePref(COLUMN_PREF_KEY, columnPrefs);
  renderTableHeader();
  renderGanttAndTable();
}

function columnLabel(column) {
  return column.labelText ?? t(column.label);
}

function renderTableHeader() {
  document.getElementById("wbsTheadRow").innerHTML = visibleColumns()
    .map((c) => "<th>" + escapeHtml(columnLabel(c)) + "</th>")
    .join("");
  renderColumnPicker();
}

function renderColumnPicker() {
  const host = document.getElementById("columnPicker");
  if (!host) return;
  host.innerHTML = allColumns()
    .filter((c) => !c.always)
    .map(
      (c) =>
        '<label class="check-field"><input type="checkbox" data-column="' +
        escapeHtml(c.key) +
        '"' +
        (columnVisible(c) ? " checked" : "") +
        ' onchange="setColumnVisible(this.dataset.column, this.checked)"> ' +
        escapeHtml(columnLabel(c)) +
        "</label>",
    )
    .join("");
}

function applyColumnLayout(columns = visibleColumns()) {
  const pane = document.getElementById("leftPane");
  const fixed = columns.reduce((sum, c) => sum + c.width, 0);
  const nameColumn = columns.find((c) => c.key === "name");
  const nameWidth = Math.max(nameColumn.min, (pane?.clientWidth || 0) - fixed - 2);
  const widths = columns.map((c) => (c.key === "name" ? nameWidth : c.width));
  const total = widths.reduce((a, b) => a + b, 0);
  for (const table of document.querySelectorAll("#leftHeader table,#wbsBodyTable")) {
    table.querySelector("colgroup").innerHTML = widths.map((w) => '<col style="width:' + w + 'px">').join("");
    table.style.width = total + "px";
  }
}

function defaultSplitPercent() {
  return 64;
}

function applySplit(percent) {
  const pane = document.getElementById("leftPane");
  const value = percent || readPref(SPLIT_PREF_KEY) || defaultSplitPercent();
  if (pane) pane.style.width = Math.min(80, Math.max(30, value)) + "%";
}

function peoplePillsHtml(item) {
  const pills = groups()
    .flatMap((g) =>
      splitPeople(item[g.id]).map(
        (p) =>
          `<span class="pill pill-person" style="--pill-color:${g.color}" title="${escapeHtml(g.name + ": " + p)}">${escapeHtml(shortenName(p))}</span>`,
      ),
    )
    .join("");
  return pills || '<span class="muted-dash">-</span>';
}

function nameCellHtml(r, item) {
  const toggle = (type) =>
    `<button type="button" class="tree-toggle" aria-expanded="${!item.collapsed}" aria-label="${escapeHtml(t(item.collapsed ? "msgExpandRow" : "msgCollapseRow", item.name))}" data-focus-key="toggle:${escapeHtml(item.wbs)}" onclick="event.stopPropagation();toggleCollapse('${type}','${item.wbs}')">${item.collapsed ? "+" : "−"}</button>`;
  const showPrioBadge = r.type === "Sub-task" && item.prio && !columnVisible(BASE_COLUMNS[3]);
  const prio = showPrioBadge
    ? `<span class="prio-badge prio-${item.prio}" title="${t("thPrio")} ${item.prio}">P${item.prio}</span>`
    : "";
  if (r.type === "Family")
    return `${toggle("Family")}<span class="name-text">${escapeHtml(item.name)}</span>`;
  if (r.type === "Main Task")
    return `<span class="indent-1"></span>${toggle("Main Task")}<span class="name-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
  return `<span class="indent-2" aria-hidden="true">·</span>${prio}<span class="name-text" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
}

function baselineBadge(baseMap, item) {
  if (!baseMap || !baseMap.has(item.wbs)) return "";
  const baseIt = baseMap.get(item.wbs).item;
  if (!baseIt.finish || !item.finish) return "";
  const slip = diffDays(baseIt.finish, item.finish) - 1;
  if (slip > 0)
    return `<span class="diff-tag diff-delay" title="Baseline: ${baseIt.finish}">+${slip}d</span>`;
  if (slip < 0) return `<span class="diff-tag diff-early" title="Baseline: ${baseIt.finish}">${slip}d</span>`;
  return "";
}

// Re-render after the current event so focus has already moved (Tab / Enter), then restore it.
let renderTimer = null,
  suppressInlineChanges = false;
function scheduleRender() {
  if (typeof setTimeout !== "function") return renderAll();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderAllKeepingFocus();
  }, 0);
}

function renderAllKeepingFocus(key) {
  const active = document.activeElement;
  const focusKey = key || active?.dataset?.focusKey;
  // Keep anything typed into the focused field before this render ran.
  const typing = active?.tagName === "INPUT" && active.value !== active.defaultValue;
  const typed = typing
    ? { value: active.value, start: active.selectionStart, end: active.selectionEnd }
    : null;
  // Removing a focused input can fire "change" for a half-typed value; ignore it, the value is carried over.
  suppressInlineChanges = true;
  try {
    renderAll();
  } finally {
    suppressInlineChanges = false;
  }
  if (!focusKey) return;
  const target = [...document.querySelectorAll("[data-focus-key]")].find(
    (el) => el.dataset.focusKey === focusKey,
  );
  if (!target) return;
  target.focus({ preventScroll: true });
  if (target.tagName !== "INPUT") return;
  if (typed) {
    target.value = typed.value;
    target.setSelectionRange(typed.start, typed.end);
    // A value set by script does not fire "change" on blur, so commit it explicitly.
    target.addEventListener("blur", () => target.dispatchEvent(new Event("change")), { once: true });
  } else target.select();
}

function renderGanttAndTable() {
  const rows = getVisibleRows();
  const baseMap = getSelectedBaselineMap();
  const tbody = document.getElementById("wbsTbody");
  tbody.innerHTML = "";

  let minDateStr = today();
  let maxDateStr = addDays(today(), 30);
  const allStarts = [],
    allFinishes = [];
  projectData.forEach((f) => {
    if (f.start) allStarts.push(f.start);
    if (f.finish) allFinishes.push(f.finish);
  });
  if (allStarts.length) {
    allStarts.sort();
    minDateStr = addDays(allStarts[0], -2);
  }
  if (allFinishes.length) {
    allFinishes.sort();
    maxDateStr = addDays(allFinishes[allFinishes.length - 1], 4);
  }
  const totalTimelineDays = Math.max(30, diffDays(minDateStr, maxDateStr));
  const dayWidth = Number(document.getElementById("ganttZoomSlider").value) || 24;
  const totalWidth = totalTimelineDays * dayWidth;

  const columns = visibleColumns();
  const readOnly = !!projectMeta.archived;
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const item = r.obj;
    const isSub = r.type === "Sub-task";
    tr.className =
      r.type === "Family" ? "row-family" : r.type === "Main Task" ? "row-maintask" : "row-subtask";
    tr.dataset.wbs = item.wbs;
    tr.ondblclick = (e) => {
      if (!e.target.closest("input,button")) openEditModal(r.type, item.wbs);
    };
    if (isSub && item.status?.code === "delay") tr.classList.add("is-delayed");
    const inline = (field, value, extra) =>
      `<input type="text" class="inline-input${field === "start" ? " date-text" : ""}" data-field="${field}" data-focus-key="${escapeHtml(item.wbs)}:${field}" aria-label="${escapeHtml(item.wbs)} ${t(INLINE_LABELS[field])}" value="${escapeHtml(String(value ?? ""))}"${readOnly ? " disabled" : ""} ${extra} onchange="inlineUpdateSubtask('${item.wbs}','${field}',this.value)">`;
    const cells = {
      wbs: `<td class="cell-center">${escapeHtml(item.wbs)}</td>`,
      name: `<td>${nameCellHtml(r, item)}</td>`,
      pred: `<td class="cell-center">${
        isSub
          ? item.pred
            ? `<span class="pred-ref">${escapeHtml(item.pred)}${item.lag ? (item.lag > 0 ? `+${item.lag}d` : `${item.lag}d`) : ""}</span>`
            : '<span class="muted-dash">-</span>'
          : `<span class="rollup-note">${t("autoRollup")}</span>`
      }</td>`,
      prio: `<td class="cell-center">${item.prio ? `<span class="prio-badge prio-${item.prio}">${item.prio}</span>` : '<span class="muted-dash">-</span>'}</td>`,
      start: `<td class="cell-center">${isSub ? inline("start", item.start, 'inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD"') : `<span class="cell-date">${item.start || "TBC"}</span>`}</td>`,
      finish: `<td class="cell-center"><span class="cell-date">${item.finish || "TBC"}</span>${baselineBadge(baseMap, item)}</td>`,
      days: `<td class="cell-center">${isSub ? inline("days", item.days || "", 'inputmode="numeric" placeholder="-"') : `<span>${item.days || "-"}</span>`}</td>`,
      pct: `<td class="cell-center">${isSub ? inline("pct", item.pct || 0, 'inputmode="decimal"') : `<span>${item.pct || 0}%</span>`}</td>`,
      people: `<td>${peoplePillsHtml(item)}</td>`,
    };
    tr.innerHTML = columns
      .map((c) => (c.group ? `<td>${renderPills(item[c.key], "pill-group1")}</td>` : cells[c.key]))
      .join("");
    tbody.appendChild(tr);
  });
  applyColumnLayout(columns);
  document.getElementById("emptyState").hidden = projectData.length > 0;

  // Render Right Gantt Header
  const headerTrack = document.getElementById("ganttHeaderTrack");
  headerTrack.style.width = totalWidth + "px";
  let monthHtml = "",
    dayHtml = "",
    weekendColsHtml = "";

  const startDt = parseDate(minDateStr);
  const weekDays = I18N[curLang].weekDays;
  let curMonthLabel = "";
  let curMonthStartLeft = 0;

  for (let i = 0; i < totalTimelineDays; i++) {
    const dt = new Date(startDt.getTime() + i * 86400000);
    const mLabel = I18N[curLang].monthFmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1);
    const left = i * dayWidth;
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;

    if (mLabel !== curMonthLabel) {
      if (curMonthLabel) {
        const w = left - curMonthStartLeft;
        monthHtml += `<div class="gantt-month-cell" style="left:${curMonthStartLeft}px;width:${w}px">${curMonthLabel}</div>`;
      }
      curMonthLabel = mLabel;
      curMonthStartLeft = left;
    }
    if (i === totalTimelineDays - 1) {
      const w = totalWidth - curMonthStartLeft;
      monthHtml += `<div class="gantt-month-cell" style="left:${curMonthStartLeft}px;width:${w}px">${curMonthLabel}</div>`;
    }

    const dayNum = String(dt.getUTCDate()).padStart(2, "0");
    dayHtml += `<div class="gantt-day-cell ${isWeekend ? "weekend" : ""}" style="left:${left}px;width:${dayWidth}px">
      <span>${dayWidth >= 14 ? dayNum : dt.getUTCDate() % 2 === 1 ? dayNum : ""}</span>
      <span style="font-size:8.5px">${dayWidth >= 22 ? weekDays[dow] : ""}</span>
    </div>`;

    if (isWeekend) {
      weekendColsHtml += `<div class="gantt-weekend-col" style="left:${left}px;width:${dayWidth}px"></div>`;
    }
  }
  headerTrack.innerHTML = `<div class="gantt-month-row">${monthHtml}</div><div class="gantt-day-row">${dayHtml}</div>`;

  // Render Right Gantt Canvas Rows & Bars
  const canvas = document.getElementById("ganttCanvas");
  canvas.style.width = totalWidth + "px";
  canvas.style.height = rows.length * 36 + "px";

  const statusDate = document.getElementById("statusDateInput").value;
  let todayLineHtml = "";
  const todayOffset = diffDays(minDateStr, statusDate);
  if (todayOffset && todayOffset >= 1 && todayOffset <= totalTimelineDays) {
    const tLeft = (todayOffset - 1) * dayWidth + dayWidth / 2;
    todayLineHtml = `<div class="gantt-today-line" style="left:${tLeft}px"><div class="gantt-today-tag">${t("todayTag")} ${statusDate.slice(5)}</div></div>`;
  }

  let rowsHtml = "";
  const barCoords = new Map();

  rows.forEach((r, rowIdx) => {
    const item = r.obj;
    const rowBgClass =
      r.type === "Family" ? "row-family-bg" : r.type === "Main Task" ? "row-maintask-bg" : "";
    let barHtml = "";

    // Render Baseline Ghost Bar if baseline comparison is enabled
    if (baseMap && baseMap.has(item.wbs)) {
      const bItem = baseMap.get(item.wbs).item;
      if (bItem.start && bItem.finish) {
        const bsOff = diffDays(minDateStr, bItem.start) - 1;
        const bDur = diffDays(bItem.start, bItem.finish);
        if (bsOff >= 0 && bDur > 0) {
          const bLeft = bsOff * dayWidth;
          const bWidth = Math.max(6, bDur * dayWidth);
          barHtml += `<div class="gantt-bar-baseline" style="left:${bLeft}px;width:${bWidth}px" title="Baseline: ${bItem.start} ~ ${bItem.finish}"></div>`;
        }
      }
    }

    if (item.start && item.finish) {
      const sOff = diffDays(minDateStr, item.start) - 1;
      const dur = diffDays(item.start, item.finish);
      if (sOff >= 0 && dur > 0) {
        const left = sOff * dayWidth;
        const width = Math.max(8, dur * dayWidth);
        const yCenter = rowIdx * 36 + 16;
        barCoords.set(item.wbs, { xStart: left, xEnd: left + width, yCenter, rowIdx });

        const pct = Math.min(100, Math.max(0, Number(item.pct) || 0));

        const delayed = item.status?.code === "delay";
        const prioMark = item.prio ? `<span class="bar-prio prio-${item.prio}">P${item.prio}</span>` : "";
        if (r.type === "Family" || r.type === "Main Task") {
          const sumClass =
            (r.type === "Family" ? "family-bar" : "maintask-bar") + (delayed ? " is-delayed" : "");
          const leadText = groups()
            .flatMap((g) => splitPeople(item[g.id]).map(shortenName))
            .filter((p, i, all) => all.indexOf(p) === i)
            .slice(0, 4)
            .join(", ");
          barHtml += `
            <div class="gantt-bar-summary ${sumClass}" data-wbs="${escapeHtml(item.wbs)}" style="left:${left}px;width:${width}px;background:${groupColor(item)}"
                 title="${escapeHtml(item.wbs)} ${escapeHtml(item.name)} (${item.start} ~ ${item.finish}, ${item.days}d) | ${escapeHtml(groupNamesLabel())}"
                 ondblclick="openEditModal('${r.type}','${item.wbs}')">
              <div class="summary-progress" style="width:${pct}%"></div>
              <span class="bar-label" style="top:-5px">${delayed ? `<span class="bar-delay">${t("st_delay")}</span>` : ""}${escapeHtml(item.wbs)} (${item.days}d) ${leadText ? "· " + escapeHtml(leadText) : ""}</span>
            </div>`;
        } else {
          const people = groups()
            .map((g) => splitPeople(item[g.id]).map(shortenName).join(", "))
            .filter(Boolean)
            .join(" · ");
          const statusText = item.status?.text || "";
          const description = `${item.wbs} ${item.name}, ${item.start} – ${item.finish} (${item.days}${t("daysUnit")}), ${statusText}${item.prio ? ", P" + item.prio : ""}`;
          barHtml += `
            <div class="gantt-bar-subtask${delayed ? " is-delayed" : ""}${readOnly ? " is-readonly" : ""}" style="left:${left}px;width:${width}px;background:${groupColor(item)}"
                 data-wbs="${item.wbs}" data-focus-key="bar:${escapeHtml(item.wbs)}" tabindex="0" role="button"
                 aria-label="${escapeHtml(description + ". " + t("msgBarKeyboardHint"))}"
                 onpointerdown="startBarDrag(event, '${item.wbs}', 'move', ${dayWidth})"
                 onkeydown="onBarKeydown(event, '${item.wbs}')"
                 ondblclick="event.stopPropagation();openEditModal('Sub-task','${item.wbs}')"
                 title="${escapeHtml(description)} | ${escapeHtml(
                   groups()
                     .map((g) => g.name + ": " + (item[g.id] || ""))
                     .join(" / "),
                 )}">
              <div class="subtask-progress" style="width:${pct}%"></div>
              <span style="position:relative;z-index:2;padding-left:6px;font-size:10px;color:#fff;overflow:hidden;text-overflow:ellipsis">${pct > 0 ? pct + "%" : ""}</span>
              <div class="bar-resize-handle" onpointerdown="event.stopPropagation();startBarDrag(event, '${item.wbs}', 'resize', ${dayWidth})"></div>
              <span class="bar-label">${prioMark}${delayed ? `<span class="bar-delay">${t("st_delay")}</span>` : ""}${escapeHtml(item.wbs)} ${people ? "· " + escapeHtml(people) : ""}</span>
            </div>`;
        }
      }
    }

    rowsHtml += `<div class="gantt-grid-row ${rowBgClass}">${barHtml}</div>`;
  });

  // Smooth Curved SVG Dependency Lines (0.85px cubic Bezier)
  let svgPaths = "";
  rows.forEach((r) => {
    if (r.type === "Sub-task" && r.obj.pred) {
      const fromCoord = barCoords.get(r.obj.pred);
      const toCoord = barCoords.get(r.obj.wbs);
      if (fromCoord && toCoord) {
        const x1 = fromCoord.xEnd;
        const y1 = fromCoord.yCenter;
        const x2 = toCoord.xStart;
        const y2 = toCoord.yCenter;
        const end = x2 - 3;
        const points =
          x2 - x1 >= 28
            ? [
                [x1, y1],
                [(x1 + end) / 2, y1],
                [(x1 + end) / 2, y2],
                [end, y2],
              ]
            : [
                [x1, y1],
                [x1 + 12, y1],
                [x1 + 12, y1 + (y2 > y1 ? 18 : -18)],
                [x2 - 15, y1 + (y2 > y1 ? 18 : -18)],
                [x2 - 15, y2],
                [end, y2],
              ];
        const pathD = roundedOrthogonalPath(points, 5);
        svgPaths += `<path d="${pathD}" fill="none" stroke="#666666" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrowHead)"/>`;
      }
    }
  });

  const svgHtml = `<svg class="dep-svg" width="${totalWidth}" height="${rows.length * 36}">
    <defs>
      <marker id="arrowHead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
        <polygon points="0 0, 5 2.5, 0 5" fill="#666666"/>
      </marker>
    </defs>
    ${svgPaths}
  </svg>`;

  canvas.innerHTML = weekendColsHtml + todayLineHtml + svgHtml + rowsHtml;
}

function renderMainTaskCards() {
  const container = document.getElementById("mtCardsContainer");
  const fltFam = document.getElementById("fltFamily").value || "ALL";
  const fltPerson = document.getElementById("fltPerson").value || "ALL";
  const fltRole = document.getElementById("fltRole").value || "ALL";

  let html = "";
  projectData.forEach((fam) => {
    if (fltFam !== "ALL" && fam.wbs !== fltFam) return;
    fam.mainTasks.forEach((mt) => {
      if (!personMatches(mt, fltPerson, fltRole)) return;
      const subRowsHtml = mt.subtasks
        .map(
          (st) => `
        <tr ondblclick="openEditModal('Sub-task','${st.wbs}')" style="cursor:pointer">
          <td>${escapeHtml(st.wbs)}</td>
          <td>${escapeHtml(st.name)}</td>
          <td style="text-align:center">${st.pred ? `<span style="color:var(--sage-dark)">${st.pred}</span>` : "-"}</td>
          <td class="cell-date" style="text-align:center">${st.start || "TBC"}</td>
          <td class="cell-date" style="text-align:center">${st.finish || "TBC"}</td>
          <td style="text-align:center">${st.days || "-"}</td>
          ${groupCells(st)}
        </tr>
      `,
        )
        .join("");

      html += `
        <div class="mt-card">
          <div class="mt-card-hdr">
            <div>
              <div class="ui-caption">${escapeHtml(fam.wbs)}. ${escapeHtml(fam.name)}</div>
              <div class="ui-heading card-title">[${escapeHtml(mt.wbs)}] ${escapeHtml(mt.name)}</div>
            </div>
            <span class="status-badge st-${mt.status.code}">${mt.status.text}</span>
          </div>
          <div class="mt-card-body">
            <div class="mt-meta-row">
              <div><span>${t("cardSpan")}</span>${mt.start || "TBC"} ~ ${mt.finish || "TBC"} (${mt.days ? mt.days + t("daysUnit") : "TBC"})</div>
              <div><span>${t("cardPrio")}</span>${mt.prio ? "P" + mt.prio : "-"}</div>
              <div><span>${t("cardProg")}</span>${mt.pct}%</div>
            </div>
            <div class="mt-meta-row">
              ${groupBadges(mt)}
            </div>
            <table class="data-grid">
              <thead>
                <tr>
                  <th style="width:48px">WBS</th>
                  <th>${t("cardSubCol")}</th>
                  <th style="width:52px">${t("cardPredCol")}</th>
                  <th style="width:82px">${t("cardStartCol")}</th>
                  <th style="width:82px">${t("cardFinCol")}</th>
                  <th style="width:44px">${t("cardDaysCol")}</th>
                  ${groupHeaders()}
                </tr>
              </thead>
              <tbody>${subRowsHtml}</tbody>
            </table>
          </div>
        </div>
      `;
    });
  });
  container.innerHTML =
    html ||
    `<div style="padding:30px;text-align:center;color:var(--text-secondary)">${t("emptyFilter")}</div>`;
}

function onStatusDateChange(input) {
  const value = input.value.trim();
  if (value && !parseDate(value)) {
    input.value = projectSettings.statusDate;
    showError(t("msgDateFormat"));
    return;
  }
  input.value = value || today();
  renderAll();
}

function filterByPersonAndGoGantt(personKey) {
  document.getElementById("fltPerson").value = personKey;
  switchView("gantt");
  renderAll();
}

function toggleCollapse(type, wbs) {
  projectData.forEach((fam) => {
    if (type === "Family" && fam.wbs === wbs) fam.collapsed = !fam.collapsed;
    fam.mainTasks.forEach((mt) => {
      if (type === "Main Task" && mt.wbs === wbs) mt.collapsed = !mt.collapsed;
    });
  });
  renderAllKeepingFocus("toggle:" + wbs);
}

function expandCollapseAll(level) {
  projectData.forEach((fam) => {
    fam.collapsed = false;
    fam.mainTasks.forEach((mt) => {
      mt.collapsed = level === 1;
    });
  });
  renderAll();
}

let sidebarCollapsed = false;

const SIDEBAR_ICONS = {
  gantt: '<path d="M4 4v16h16M8 7h9M8 11h5M12 15h8"/>',
  cards: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1"/>',
};

function refreshSidebar() {
  const sidebar = document.getElementById("projectSidebar"),
    toggle = document.getElementById("sidebarToggle");
  sidebar.classList.toggle("is-collapsed", sidebarCollapsed);
  toggle.setAttribute("aria-expanded", String(!sidebarCollapsed));
  const label = t(sidebarCollapsed ? "msgExpandNavigation" : "msgCollapseNavigation");
  toggle.setAttribute("aria-label", label);
  toggle.title = label;
  document.getElementById("sidebarHeadingLabel").textContent = t("msgProjectNavigation");
  document.getElementById("sidebarFiltersLabel").textContent = t("msgFiltersDisplay");
  document.getElementById("sidebarFilters").hidden = sidebarCollapsed;
  const menu = document.getElementById("actionMenu");
  if (menu.dataset.collapsed !== String(sidebarCollapsed)) {
    ["taskActions", "dataActions"].forEach((id) => {
      const group = document.getElementById(id);
      if (sidebarCollapsed) {
        group.dataset.expanded = String(group.open);
        group.open = true;
      } else if (group.dataset.expanded != null) group.open = group.dataset.expanded === "true";
    });
    menu.open = !sidebarCollapsed;
    menu.dataset.collapsed = String(sidebarCollapsed);
  }
  const more = t("msgMoreActions");
  document.getElementById("actionMenuLabel").setAttribute("aria-label", more);
  document.getElementById("actionMenuLabel").title = more;
  document.getElementById("taskActionsLabel").textContent = t("msgTaskActions");
  document.getElementById("dataActionsLabel").textContent = t("msgDataVersions");
  ["gantt", "cards", "people"].forEach((view, i) => {
    const button = document.getElementById("tab-" + view),
      text = t("tab" + (i + 1)).replace(/^\d+\.\s*/, "");
    button.innerHTML =
      '<svg class="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true">' +
      SIDEBAR_ICONS[view] +
      '</svg><span class="sidebar-view-label">' +
      escapeHtml(text) +
      "</span>";
    button.title = text;
    button.setAttribute("aria-label", text);
    button.setAttribute("aria-current", button.classList.contains("active") ? "page" : "false");
  });
}

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  try {
    localStorage.setItem("project-web-tool:sidebar", String(sidebarCollapsed));
  } catch (e) {}
  refreshSidebar();
  renderProjectControls();
  applyColumnLayout();
}

function switchView(viewName) {
  ["gantt", "cards", "people"].forEach((v) => {
    document.getElementById("tab-" + v).classList.toggle("active", v === viewName);
  });
  document.getElementById("view-gantt").style.display = viewName === "gantt" ? "flex" : "none";
  document.getElementById("view-cards").classList.toggle("active", viewName === "cards");
  document.getElementById("view-people").classList.toggle("active", viewName === "people");
  refreshSidebar();
  renderProjectControls();
  applyColumnLayout();
}

const ACTION_ICONS = {
  btnLangToggle:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/>',
  btnSaveVer: '<path d="M6 3h10l4 4v14H4V3h2ZM8 3v6h8V3M8 21v-8h8v8"/>',
  btnAddSub: '<path d="M5 4v8h7M12 9v6M9 12h6M5 19h14"/>',
  btnAddMain: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 12h8M12 8v8"/>',
  btnImportXls: '<path d="M12 3v12M8 11l4 4 4-4M4 15v6h16v-6"/>',
  btnExportProject: '<path d="M12 16V4M8 8l4-4 4 4M4 15v6h16v-6"/>',
  btnExportXls: '<path d="M12 16V4M8 8l4-4 4 4M4 15v6h16v-6"/>',
  btnExportJson: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l9 4"/>',
  btnHistory: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  btnAddPhase: '<path d="M4 6h16M4 12h10M4 18h6M17 15v6M14 18h6"/>',
};

function renderActionButton(id, key) {
  const button = document.getElementById(id),
    label = t(key)
      .replace(/^[^A-Za-z\u3400-\u9fff]+/u, "")
      .trim();
  button.innerHTML =
    '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    ACTION_ICONS[id] +
    '</svg><span class="action-label">' +
    escapeHtml(label) +
    "</span>";
  button.setAttribute("aria-label", label);
}

function applyStaticI18n() {
  document.getElementById("workflowGuide").setAttribute("aria-label", t("guideWorkflow"));
  renderActionButton("btnLangToggle", "langBtn");
  document.getElementById("actionMenuLabel").innerHTML =
    '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span class="action-label">' +
    t("msgMoreActions") +
    '</span><svg class="action-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>';
  document.getElementById("lblKpiSpan").textContent = t("lblKpiSpan");
  document.getElementById("lblKpiCounts").textContent = t("lblKpiCounts");
  document.getElementById("lblKpiProg").textContent = t("lblKpiProg");
  renderActionButton("btnSaveVer", "btnSaveVer");
  renderActionButton("btnHistory", "btnHistory");
  renderActionButton("btnAddPhase", "btnAddPhase");
  renderActionButton("btnAddSub", "btnAddSub");
  renderActionButton("btnAddMain", "btnAddMain");
  renderActionButton("btnImportXls", "btnImportXls");
  renderActionButton("btnExportXls", "btnExportXls");
  renderActionButton("btnExportProject", "btnExportProject");
  renderActionButton("btnExportJson", "btnExportJson");

  document.getElementById("tab-gantt").textContent = t("tab1");
  document.getElementById("tab-cards").textContent = t("tab2");
  document.getElementById("tab-people").textContent = t("tab3");

  document.getElementById("lblFltFam").textContent = t("lblFltFam");
  document.getElementById("lblFltPerson").textContent = t("lblFltPerson");
  document.getElementById("lblFltRole").textContent = t("lblFltRole");
  document.getElementById("lblBaselineCmp").textContent = t("lblBaselineCmp");
  document.getElementById("lblStatusDate").textContent = t("lblStatusDate");
  document.getElementById("lblZoom").textContent = t("lblZoom");
  document.getElementById("btnExpandAll").textContent = t("btnExpandAll");
  document.getElementById("btnCollapseSub").textContent = t("btnCollapseSub");

  const roleSel = document.getElementById("fltRole");
  const curRole = roleSel.value || "ALL";
  roleSel.innerHTML =
    '<option value="ALL">' +
    t("roleAll") +
    "</option>" +
    groups()
      .map((g) => '<option value="' + g.id + '">' + escapeHtml(g.name) + "</option>")
      .join("");
  roleSel.value = curRole;

  // Footer Legend
  document.getElementById("legendItemsBox").innerHTML = `
    <span>${t("legendTitle")}</span>
    ${groupLegend()}
    <span class="legend-dot"><span class="swatch" style="background:#9AABB8;height:4px"></span>${t("legBase")}</span>
    <span class="legend-dot"><span class="swatch swatch-delayed"></span>${t("legDelayed")}</span>
    <span class="legend-dot"><span class="bar-prio prio-1">P1</span>${t("legPriority")}</span>

  `;
  document.getElementById("legendTipBox").textContent = t("legTip");

  renderTableHeader();
  document.getElementById("lblColumns").textContent = t("lblColumns");
  for (const [id, key] of [
    ["guideImport", "guideImport"],
    ["guideEdit", "guideEdit"],
    ["guideExport", "guideExport"],
    ["guideBackup", "guideBackup"],
    ["emptyTitle", "msgEmptyTitle"],
    ["emptyIntro", "msgEmptyIntro"],
    ["emptyStep1", "msgEmptyStep1"],
    ["emptyStep2", "msgEmptyStep2"],
    ["emptyStep3", "msgEmptyStep3"],
    ["emptyAddPhase", "msgAddPhaseTitle"],
    ["emptyImport", "msgEmptyImport"],
    ["emptyDemo", "msgEmptyDemo"],
    ["mdMoveUp", "msgMoveUp"],
    ["mdMoveDown", "msgMoveDown"],
  ])
    document.getElementById(id).textContent = t(key);
  document.getElementById("btnUndo").innerHTML =
    '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg><span>' +
    escapeHtml(t("msgUndo")) +
    "</span>";
  document.getElementById("btnRedo").innerHTML =
    '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"/></svg><span>' +
    escapeHtml(t("msgRedo")) +
    "</span>";
  for (const button of document.querySelectorAll(".date-picker-btn")) {
    button.innerHTML =
      '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="1"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>';
    button.setAttribute("aria-label", t("msgPickDate"));
    button.title = t("msgPickDate");
  }

  document.getElementById("peopleSecTitle1").textContent = t("peopleSecTitle1");
  document.getElementById("peopleSecSub1").textContent = t("peopleSecSub1");
  document.getElementById("peopleSecTitle2").textContent = t("peopleSecTitle2");

  document.getElementById("lblMdType").textContent = t("lblMdType");
  document.getElementById("lblMdWbs").textContent = t("lblMdWbs");
  document.getElementById("lblMdPrio").textContent = t("lblMdPrio");
  document.getElementById("lblMdName").textContent = t("lblMdName");
  document.getElementById("lblMdPred").textContent = t("lblMdPred");
  document.getElementById("lblMdLag").textContent = t("lblMdLag");
  document.getElementById("lblMdStart").textContent = t("lblMdStart");
  document.getElementById("lblMdDays").textContent = t("lblMdDays");
  document.getElementById("lblMdFinish").textContent = t("lblMdFinish");
  document.getElementById("lblMdPct").textContent = t("lblMdPct");
  document.getElementById("mdDeleteBtn").textContent = t("mdDeleteBtn");
  document.getElementById("mdCancelBtn").textContent = t("mdCancelBtn");
  document.getElementById("mdSaveBtn").textContent = t("mdSaveBtn");
  ["verModalTitle", "lblVerTag", "lblVerAuthor", "lblVerNote", "btnVerCancel", "btnVerConfirm"].forEach(
    (id) => (document.getElementById(id).textContent = t(id)),
  );
  document.getElementById("verNoteInput").placeholder = t("verNotePlaceholder");
  document.querySelectorAll("[data-dialog-close].btn-icon").forEach((button) => {
    button.innerHTML = CLOSE_ICON;
    button.setAttribute("aria-label", t("closeLabel"));
    button.title = t("closeLabel");
  });
  const levels = document.getElementById("mdType");
  levels.options[0].text = t("levelSub");
  levels.options[1].text = t("levelMain");
  const priorities = document.getElementById("mdPrio");
  ["priorityHigh", "priorityMedium", "priorityNormal", "st_tbc"].forEach(
    (key, i) => (priorities.options[i].text = t(key)),
  );
  document.documentElement.lang = curLang === "zh" ? "zh-CN" : "en";
  refreshSidebar();
  renderProjectControls();
  applyColumnLayout();
}

function populateTopFilters() {
  const famSel = document.getElementById("fltFamily");
  const curFam = famSel.value || "ALL";
  famSel.innerHTML =
    `<option value="ALL">${t("fltFamAll")}</option>` +
    projectData.map((f) => `<option value="${f.wbs}">${f.wbs}. ${escapeHtml(f.name)}</option>`).join("");
  famSel.value = curFam;

  const pSel = document.getElementById("fltPerson");
  const curP = pSel.value || "ALL";
  pSel.innerHTML =
    `<option value="ALL">${t("fltPersonAll")}</option>` +
    getPeople()
      .map((p) => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.label)}</option>`)
      .join("");
  pSel.value = curP;

  const baseSel = document.getElementById("fltBaseline");
  const curB = baseSel.value || selectedBaselineTag || "NONE";
  baseSel.innerHTML =
    `<option value="NONE">${t("noBaselineOpt")}</option>` +
    versionList
      .map(
        (v) =>
          `<option value="${escapeHtml(v.tag)}">${escapeHtml(v.tag)} (${escapeHtml(v.time.slice(0, 10))})</option>`,
      )
      .join("");
  baseSel.value = curB;
}

function updateTopKpis() {
  let mtCount = 0,
    stCount = 0,
    wSum = 0,
    dSum = 0;
  const starts = [],
    finishes = [];
  projectData.forEach((f) => {
    mtCount += f.mainTasks.length;
    f.mainTasks.forEach((m) => {
      stCount += m.subtasks.length;
      m.subtasks.forEach((s) => {
        if (s.start) starts.push(s.start);
        if (s.finish) finishes.push(s.finish);
        const d = Number(s.days) || 0;
        if (d > 0) {
          wSum += d * (Number(s.pct) || 0);
          dSum += d;
        }
      });
    });
  });
  starts.sort();
  finishes.sort();
  const sMin = starts[0] || "TBC";
  const fMax = finishes[finishes.length - 1] || "TBC";
  const totDays = sMin !== "TBC" && fMax !== "TBC" ? diffDays(sMin, fMax) : 0;
  document.getElementById("kpiSpan").textContent =
    sMin === "TBC" ? "TBC" : `${sMin} ~ ${fMax} (${totDays}${t("daysUnit")})`;
  document.getElementById("kpiCounts").textContent = I18N[curLang].kpiFmtCounts(
    projectData.length,
    mtCount,
    stCount,
  );
  document.getElementById("kpiProgress").textContent = (dSum > 0 ? (wSum / dSum).toFixed(1) : "0.0") + "%";
}

function renderAll() {
  recalculateSchedule();
  populateTopFilters();
  updateTopKpis();
  renderGanttAndTable();
  renderMainTaskCards();
  renderPeopleView();
  renderProjectControls();
}

const PROJECT_MENU = [
  ["new", "btnNewProject"],
  ["demo", "btnDemoProject"],
  ["duplicate", "btnDuplicateProject"],
  ["settings", "btnProjectSettings"],
  ["archive", "btnArchiveProject"],
  ["delete", "btnDeleteProject"],
];

// Header: project name first; switcher, project menu, undo/redo and save status on one stable row.
function renderProjectControls() {
  const select = document.getElementById("projectSelect");
  if (!select) return;
  const projects = Object.values(workspace.projects);
  const option = (b) =>
    '<option value="' +
    escapeHtml(b.projectId) +
    '"' +
    (b.projectId === projectId ? " selected" : "") +
    ">" +
    escapeHtml(b.metadata.name) +
    "</option>";
  const active = projects.filter((b) => !b.metadata.archived),
    archived = projects.filter((b) => b.metadata.archived);
  select.innerHTML =
    active.map(option).join("") +
    (archived.length
      ? '<optgroup label="' +
        escapeHtml(t("msgArchivedProjects")) +
        '">' +
        archived.map(option).join("") +
        "</optgroup>"
      : "");
  select.setAttribute("aria-label", t("lblProject"));
  document.getElementById("lblProjectSelect").textContent = t("lblProject");
  document.getElementById("projectMenuLabel").textContent = t("msgProjectMenu");
  document.getElementById("projectMenuList").innerHTML = PROJECT_MENU.map(
    ([action, key]) =>
      '<button type="button" role="menuitem" class="menu-item' +
      (action === "delete" ? " is-danger" : "") +
      '" onclick="closeMenus();projectAction(\'' +
      action +
      "')\">" +
      escapeHtml(action === "archive" && projectMeta.archived ? t("msgRestoreProject") : t(key)) +
      "</button>",
  ).join("");
  document.getElementById("uiTitle").textContent = projectMeta.name;
  document.title = projectMeta.name;
  document.getElementById("archivedBadge").hidden = !projectMeta.archived;
  document.getElementById("archivedBadge").textContent = t("msgArchived");
  const notice = document.getElementById("archivedNotice");
  notice.hidden = !projectMeta.archived;
  if (projectMeta.archived)
    notice.innerHTML =
      '<span class="save-banner-text">' +
      escapeHtml(t("msgArchivedNotice")) +
      '</span><button type="button" class="btn" onclick="projectAction(\'archive\')">' +
      escapeHtml(t("msgRestoreProject")) +
      "</button>";
  document.body.classList.toggle("is-archived", !!projectMeta.archived);
  document.getElementById("projectStatus").outerHTML = statusCaption();
  refreshUndoButtons();
  updateSaveBanner();
}

function closeMenus() {
  document.querySelectorAll("details.menu[open]").forEach((menu) => (menu.open = false));
}

// Header status: where data lives, plus storage usage (spelled out once usage passes half the limit).
function statusCaption() {
  const usage = storageUsage();
  const usageText = t("msgStorageUsage", formatStorageSize(usage.used));
  const text = storageReadBlocked
    ? t("msgSavingPaused")
    : lastSaveError
      ? t("msgUnsavedExportABackup")
      : usage.ratio >= 0.5
        ? usageText
        : t("msgDataStoredInThisBrowser");
  return (
    '<span id="projectStatus" class="ui-caption project-status" role="status" title="' +
    escapeHtml(usageText) +
    '">' +
    escapeHtml(text) +
    "</span>"
  );
}

function groupCells(item) {
  return groups()
    .map((g) => "<td>" + renderPills(item[g.id], "pill-group1") + "</td>")
    .join("");
}

function groupHeaders() {
  return groups()
    .map((g) => "<th>" + escapeHtml(g.name) + "</th>")
    .join("");
}

function groupBadges(item) {
  return groups()
    .filter((g) => item[g.id])
    .map(
      (g) =>
        "<div><span>" + escapeHtml(g.name) + "</span>" + renderPills(item[g.id], "pill-group1") + "</div>",
    )
    .join("");
}

function groupColor(item) {
  const assigned = groups().filter((g) => hasCell(item[g.id]));
  if (!assigned.length) return "#92958F";
  if (assigned.length === 1) return assigned[0].color;
  return (
    "repeating-linear-gradient(135deg," +
    assigned.map((g, i) => g.color + " " + i * 8 + "px," + g.color + " " + (i + 1) * 8 + "px").join(",") +
    ")"
  );
}

function groupNamesLabel() {
  return groups()
    .map((g) => g.name)
    .join(" / ");
}

function groupLegend() {
  return groups()
    .map(
      (g) =>
        '<span class="legend-dot"><span class="swatch" style="background:' +
        g.color +
        '"></span>' +
        escapeHtml(g.name) +
        "</span>",
    )
    .join("");
}

function renderPeopleView() {
  const people = getPeople(),
    gs = groups(),
    subs = projectData.flatMap((f) => f.mainTasks.flatMap((m) => m.subtasks.map((s) => ({ s, m }))));
  const rows = people
    .map((p) => {
      const selected = subs.filter(({ s }) => gs.some((g) => hasPerson(s[g.id], p.key))),
        starts = selected
          .map(({ s }) => s.start)
          .filter(Boolean)
          .sort(),
        ends = selected
          .map(({ s }) => s.finish)
          .filter(Boolean)
          .sort();
      return (
        "<tr><td>" +
        escapeHtml(p.label) +
        "</td><td>" +
        escapeHtml(p.group) +
        "</td>" +
        gs
          .map((g) => "<td>" + selected.filter(({ s }) => hasPerson(s[g.id], p.key)).length + "</td>")
          .join("") +
        "<td>" +
        selected.length +
        '</td><td class="cell-date">' +
        (starts[0] || "TBC") +
        " ~ " +
        (ends.at(-1) || "TBC") +
        "</td><td>" +
        [...new Set(selected.map(({ m }) => m.wbs))].map(escapeHtml).join("; ") +
        '</td><td><button class="btn btn-view-gantt" onclick="filterByPersonAndGoGantt(decodeURIComponent(\'' +
        encodeURIComponent(p.key).replace(/'/g, "%27") +
        '\'))"><svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        SIDEBAR_ICONS.gantt +
        "</svg>" +
        t("pBtnFilter") +
        "</button></td></tr>"
      );
    })
    .join("");
  document.getElementById("peopleSummaryTable").innerHTML =
    "<thead><tr><th>" +
    t("pColPerson") +
    "</th><th>" +
    t("pColGroup") +
    "</th>" +
    groupHeaders() +
    "<th>" +
    t("pColTotCnt") +
    "</th><th>" +
    t("pColSpan") +
    "</th><th>" +
    t("pColMainWbs") +
    "</th><th>" +
    t("pColAction") +
    "</th></tr></thead><tbody>" +
    rows +
    "</tbody>";
  document.getElementById("raciMatrixTable").innerHTML =
    "<thead><tr><th>WBS</th><th>" +
    t("raciColMain") +
    "</th><th>" +
    t("raciColSpan") +
    "</th>" +
    people.map((p) => "<th>" + escapeHtml(p.label) + "</th>").join("") +
    "</tr></thead><tbody>" +
    projectData
      .flatMap((f) =>
        f.mainTasks.map(
          (m) =>
            "<tr><td>" +
            escapeHtml(m.wbs) +
            "</td><td>" +
            escapeHtml(m.name) +
            '</td><td class="cell-date">' +
            (m.start || "TBC") +
            " ~ " +
            (m.finish || "TBC") +
            "</td>" +
            people
              .map(
                (p) =>
                  "<td>" +
                  gs
                    .filter((g) => hasPerson(m[g.id], p.key))
                    .map((g) => '<span class="pill pill-group1">' + escapeHtml(g.name) + "</span>")
                    .join(" ") +
                  "</td>",
              )
              .join("") +
            "</tr>",
        ),
      )
      .join("") +
    "</tbody>";
}
