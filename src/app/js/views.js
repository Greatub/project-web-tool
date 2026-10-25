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

    if (matchingMainTasks.length === 0) return;

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

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    const item = r.obj;
    tr.className =
      r.type === "Family" ? "row-family" : r.type === "Main Task" ? "row-maintask" : "row-subtask";
    tr.dataset.wbs = item.wbs;
    tr.ondblclick = () => openEditModal(r.type, item.wbs);

    let nameCellHtml = "";
    if (r.type === "Family") {
      const icon = item.collapsed ? "+" : "−";
      nameCellHtml = `<span class="tree-toggle" onclick="event.stopPropagation();toggleCollapse('Family','${item.wbs}')">${icon}</span><span>${escapeHtml(item.wbs)}. ${escapeHtml(item.name)}</span>`;
    } else if (r.type === "Main Task") {
      const icon = item.collapsed ? "+" : "−";
      nameCellHtml = `<span style="padding-left:10px"></span><span class="tree-toggle" onclick="event.stopPropagation();toggleCollapse('Main Task','${item.wbs}')">${icon}</span><span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
    } else {
      nameCellHtml = `<span style="padding-left:28px;color:var(--text-muted)">·</span> <span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>`;
    }

    const prioHtml = item.prio
      ? `<span class="prio-badge prio-${item.prio}">${item.prio}</span>`
      : `<span style="color:var(--text-muted)">-</span>`;
    const predHtml =
      r.type === "Sub-task"
        ? item.pred
          ? `<span style="color:var(--sage-dark)">${escapeHtml(item.pred)}${item.lag ? (item.lag > 0 ? `+${item.lag}d` : `${item.lag}d`) : ""}</span>`
          : `<span style="color:var(--border-soft)">-</span>`
        : `<span style="font-size:10.5px;color:var(--text-muted)">${t("autoRollup")}</span>`;

    const startHtml =
      r.type === "Sub-task"
        ? `<input type="date" class="inline-input" aria-label="${escapeHtml(item.wbs)} ${t("lblMdStart")}" value="${item.start || ""}" onchange="inlineUpdateSubtask('${item.wbs}','start',this.value)">`
        : `<span>${item.start || "TBC"}</span>`;

    // Baseline finish variance badge
    let diffBadge = "";
    if (baseMap && baseMap.has(item.wbs)) {
      const baseIt = baseMap.get(item.wbs).item;
      if (baseIt.finish && item.finish) {
        const slip = diffDays(baseIt.finish, item.finish) - 1;
        if (slip > 0)
          diffBadge = `<span class="diff-tag diff-delay" title="Baseline: ${baseIt.finish}">+${slip}d</span>`;
        else if (slip < 0)
          diffBadge = `<span class="diff-tag diff-early" title="Baseline: ${baseIt.finish}">${slip}d</span>`;
      }
    }
    const finishHtml = `<span>${item.finish || "TBC"}</span>${diffBadge}`;

    const daysHtml =
      r.type === "Sub-task"
        ? `<input type="number" class="inline-input" aria-label="${escapeHtml(item.wbs)} ${t("lblMdDays")}" style="text-align:center" min="1" value="${item.days || ""}" placeholder="-" onchange="inlineUpdateSubtask('${item.wbs}','days',this.value)">`
        : `<span>${item.days || "-"}</span>`;

    const pctHtml =
      r.type === "Sub-task"
        ? `<input type="number" class="inline-input" aria-label="${escapeHtml(item.wbs)} ${t("lblMdPct")}" style="text-align:center" min="0" max="100" value="${item.pct || 0}" onchange="inlineUpdateSubtask('${item.wbs}','pct',this.value)">`
        : `<span>${item.pct || 0}%</span>`;

    tr.innerHTML = `
      <td style="text-align:center">${escapeHtml(item.wbs)}</td>
      <td>${nameCellHtml}</td>
      <td style="text-align:center">${predHtml}</td>
      <td style="text-align:center">${prioHtml}</td>
      <td style="text-align:center">${startHtml}</td>
      <td style="text-align:center">${finishHtml}</td>
      <td style="text-align:center">${daysHtml}</td>
      <td style="text-align:center">${pctHtml}</td>
      ${groupCells(item)}
    `;
    tbody.appendChild(tr);
  });

  for (const table of document.querySelectorAll("#leftHeader table,#wbsBodyTable")) {
    table.querySelector("colgroup").innerHTML = [
      58,
      245,
      64,
      46,
      132,
      105,
      50,
      52,
      ...groups().map(() => 130),
    ]
      .map((w) => '<col style="width:' + w + 'px">')
      .join("");
    table.style.width = 752 + groups().length * 130 + "px";
  }

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

        if (r.type === "Family" || r.type === "Main Task") {
          const sumClass = r.type === "Family" ? "family-bar" : "maintask-bar";
          const leadText = splitPeople(item.group1).map(shortenName).join(", ");
          barHtml += `
            <div class="gantt-bar-summary ${sumClass}" data-wbs="${escapeHtml(item.wbs)}" style="left:${left}px;width:${width}px;background:${groupColor(item)}"
                 title="${escapeHtml(item.wbs)} ${escapeHtml(item.name)} (${item.start} ~ ${item.finish}, ${item.days}d) | ${escapeHtml(groupNamesLabel())}"
                 ondblclick="openEditModal('${r.type}','${item.wbs}')">
              <div class="summary-progress" style="width:${pct}%"></div>
              <span class="bar-label" style="top:-5px">${escapeHtml(item.wbs)} (${item.days}d) ${leadText ? "· " + escapeHtml(leadText) : ""}</span>
            </div>`;
        } else {
          const shortLead = shortenName(item.group1 || "");
          barHtml += `
            <div class="gantt-bar-subtask" style="left:${left}px;width:${width}px;background:${groupColor(item)}"
                 data-wbs="${item.wbs}"
                 onmousedown="startBarDrag(event, '${item.wbs}', 'move', ${dayWidth})"
                 ondblclick="event.stopPropagation();openEditModal('Sub-task','${item.wbs}')"
                 title="${escapeHtml(item.wbs)} ${escapeHtml(item.name)} | ${item.start} ~ ${item.finish} (${item.days}${t("daysUnit")}) | ${escapeHtml(
                   groups()
                     .map((g) => g.name + ": " + (item[g.id] || ""))
                     .join(" / "),
                 )} | ${escapeHtml(groupNamesLabel())}">
              <div class="subtask-progress" style="width:${pct}%"></div>
              <span style="position:relative;z-index:2;padding-left:6px;font-size:10px;color:#fff;overflow:hidden;text-overflow:ellipsis">${pct > 0 ? pct + "%" : ""}</span>
              <div class="bar-resize-handle" onmousedown="event.stopPropagation();startBarDrag(event, '${item.wbs}', 'resize', ${dayWidth})"></div>
              <span class="bar-label">${escapeHtml(item.wbs)} ${shortLead ? "· " + escapeHtml(shortLead) : ""}</span>
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
  renderAll();
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
  document.getElementById("uiTitle").textContent = projectMeta.name;
  document.title = projectMeta.name;
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
  document.getElementById("uiTitle").textContent = projectMeta.name;
  document.title = projectMeta.name;
}

const ACTION_ICONS = {
  btnLangToggle:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z"/>',
  btnSaveVer: '<path d="M6 3h10l4 4v14H4V3h2ZM8 3v6h8V3M8 21v-8h8v8"/>',
  btnAddSub: '<path d="M5 4v8h7M12 9v6M9 12h6M5 19h14"/>',
  btnAddMain: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M8 12h8M12 8v8"/>',
  btnImportXls: '<path d="M12 3v12M8 11l4 4 4-4M4 15v6h16v-6"/>',
  btnExportXls: '<path d="M12 16V4M8 8l4-4 4 4M4 15v6h16v-6"/>',
  btnExportJson: '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l9 4"/>',
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
  renderActionButton("btnLangToggle", "langBtn");
  document.getElementById("actionMenuLabel").innerHTML =
    '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span class="action-label">' +
    t("msgMoreActions") +
    '</span><svg class="action-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>';
  document.getElementById("uiTitle").textContent = t("uiTitle");
  document.getElementById("uiSubtitle").textContent = t("uiSubtitle");
  document.getElementById("lblKpiSpan").textContent = t("lblKpiSpan");
  document.getElementById("lblKpiCounts").textContent = t("lblKpiCounts");
  document.getElementById("lblKpiProg").textContent = t("lblKpiProg");
  renderActionButton("btnSaveVer", "btnSaveVer");
  renderActionButton("btnAddSub", "btnAddSub");
  renderActionButton("btnAddMain", "btnAddMain");
  renderActionButton("btnImportXls", "btnImportXls");
  renderActionButton("btnExportXls", "btnExportXls");
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

  `;
  document.getElementById("legendTipBox").textContent = t("legTip");

  document.getElementById("wbsTheadRow").innerHTML = `
    <th>${t("thWbs")}</th>
    <th>${t("thName")}</th>
    <th>${t("thPred")}</th>
    <th>${t("thPrio")}</th>
    <th>${t("thStart")}</th>
    <th>${t("thFinish")}</th>
    <th>${t("thDays")}</th>
    <th>${t("thPct")}</th>
    ${groupHeaders()}
  `;

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
  document.querySelectorAll(".btn-icon").forEach((button) => {
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
  document.getElementById("uiTitle").textContent = projectMeta.name;
  document.title = projectMeta.name;
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
  document.getElementById("kpiSpan").textContent = `${sMin} ~ ${fMax.slice(5)} (${totDays}d)`;
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

function renderProjectControls() {
  const box = document.getElementById("projectControls");
  if (!box) return;
  const labels = [
    "lblProject",
    "btnNewProject",
    "btnDemoProject",
    "btnDuplicateProject",
    "btnProjectSettings",
    "btnArchiveProject",
    "btnAddPhase",
  ].map((key) => t(key));
  box.innerHTML =
    '<label class="ui-caption" for="projectSelect">' +
    labels[0] +
    '</label><select class="ui-control ui-select" id="projectSelect" onchange="switchProject(this.value)">' +
    Object.values(workspace.projects)
      .map(
        (b) =>
          '<option value="' +
          escapeHtml(b.projectId) +
          '" ' +
          (b.projectId === projectId ? "selected" : "") +
          ">" +
          escapeHtml(b.metadata.name) +
          (b.metadata.archived ? " • " + t("msgArchived") : "") +
          "</option>",
      )
      .join("") +
    "</select>" +
    labels
      .slice(1)
      .map((v, i) => '<button class="btn" onclick="projectAction(' + i + ')">' + v + "</button>")
      .join("") +
    statusCaption();
  updateSaveBanner();
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
    '<span class="ui-caption" role="status" title="' +
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
