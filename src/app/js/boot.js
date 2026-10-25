// Synchronize scroll between the WBS table and the Gantt timeline.
const leftBody = document.getElementById("leftBody");
const rightBody = document.getElementById("rightBody");
const rightHeader = document.getElementById("rightHeader");
const leftHeader = document.getElementById("leftHeader");

leftBody.addEventListener("scroll", () => {
  if (rightBody.scrollTop !== leftBody.scrollTop) rightBody.scrollTop = leftBody.scrollTop;
  if (leftHeader.scrollLeft !== leftBody.scrollLeft) leftHeader.scrollLeft = leftBody.scrollLeft;
});
rightBody.addEventListener("scroll", () => {
  if (leftBody.scrollTop !== rightBody.scrollTop) leftBody.scrollTop = rightBody.scrollTop;
  if (rightHeader.scrollLeft !== rightBody.scrollLeft) rightHeader.scrollLeft = rightBody.scrollLeft;
});

// Support Ctrl + Mouse Wheel smooth zoom on Gantt Chart
document.getElementById("rightPane").addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 2 : -2);
    }
  },
  { passive: false },
);

// Split pane resizer (the chosen width is remembered in this browser).
const resizer = document.getElementById("paneResizer");
resizer.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  resizer.classList.add("dragging");
  const rect = document.getElementById("view-gantt").getBoundingClientRect();
  let percent = null;
  const moveFn = (ev) => {
    percent = Math.min(80, Math.max(30, ((ev.clientX - rect.left) / rect.width) * 100));
    applySplit(percent);
    applyColumnLayout();
  };
  const upFn = () => {
    resizer.classList.remove("dragging");
    document.removeEventListener("pointermove", moveFn);
    document.removeEventListener("pointerup", upFn);
    if (percent) writePref(SPLIT_PREF_KEY, Math.round(percent));
  };
  document.addEventListener("pointermove", moveFn);
  document.addEventListener("pointerup", upFn);
});
window.addEventListener("resize", () => applyColumnLayout());

// Inline table inputs: Enter commits and moves to the same field on the next row (Shift+Enter: previous).
document.getElementById("wbsTbody").addEventListener("keydown", (e) => {
  const input = e.target.closest(".inline-input");
  if (!input || e.key !== "Enter") return;
  e.preventDefault();
  const fields = [...document.querySelectorAll('.inline-input[data-field="' + input.dataset.field + '"]')];
  const next = fields[fields.indexOf(input) + (e.shiftKey ? -1 : 1)];
  if (next) next.focus();
  else input.blur();
});

// Date fields: ISO text input plus a button that opens the browser's date picker.
const datePickerProxy = document.createElement("input");
datePickerProxy.type = "date";
datePickerProxy.className = "date-proxy";
datePickerProxy.tabIndex = -1;
datePickerProxy.setAttribute("aria-hidden", "true");
document.addEventListener("click", (e) => {
  const button = e.target.closest(".date-picker-btn");
  if (!button) return;
  const field = document.getElementById(button.dataset.dateFor);
  button.after(datePickerProxy);
  datePickerProxy.value = parseDate(field.value.trim()) ? field.value.trim() : today();
  datePickerProxy.onchange = () => {
    field.value = datePickerProxy.value;
    field.dispatchEvent(new Event("change", { bubbles: true }));
    field.focus();
  };
  try {
    datePickerProxy.showPicker();
  } catch (err) {
    field.focus();
  }
});

// Undo / redo shortcuts (not while typing in a field or when a dialog is open).
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (document.querySelector("dialog[open]")) return;
  if (e.target.closest("input:not([type=checkbox]),textarea,select")) return;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((key === "z" && e.shiftKey) || key === "y") {
    e.preventDefault();
    redo();
  }
});

// Menus close on outside click and Esc.
document.addEventListener("click", (e) => {
  for (const menu of document.querySelectorAll("details.menu[open]"))
    if (!menu.contains(e.target)) menu.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const menu = document.querySelector("details.menu[open]");
  if (menu) {
    menu.open = false;
    menu.querySelector("summary").focus();
  }
});

for (const d of document.querySelectorAll("dialog.app-dialog")) enhanceDialog(d);

// Bind existing visible labels to their controls without changing the workflow.
document.querySelectorAll(".form-field,.filter-item").forEach((field) => {
  const label = field.querySelector("label"),
    control = field.querySelector("input,select,textarea");
  if (label && control?.id) label.htmlFor = control.id;
});
const actionMenu = document.getElementById("actionMenu");
actionMenu.addEventListener("click", (e) => {
  if (sidebarCollapsed && e.target.closest("button")) actionMenu.open = false;
});
document.addEventListener("click", (e) => {
  if (sidebarCollapsed && !actionMenu.contains(e.target)) actionMenu.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && sidebarCollapsed && actionMenu.open) {
    actionMenu.open = false;
    actionMenu.querySelector("summary").focus();
  }
});
try {
  sidebarCollapsed = localStorage.getItem("project-web-tool:sidebar") === "true";
} catch (e) {}
// Boot application
applySplit();
loadState();
applyStaticI18n();
renderAll();
