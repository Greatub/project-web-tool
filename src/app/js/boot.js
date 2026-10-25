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

// Split Pane Resizer
const resizer = document.getElementById("paneResizer");
const leftPane = document.getElementById("leftPane");
resizer.addEventListener("mousedown", (e) => {
  e.preventDefault();
  resizer.classList.add("dragging");
  const moveFn = (ev) => {
    const pct = Math.min(78, Math.max(30, (ev.clientX / window.innerWidth) * 100));
    leftPane.style.width = pct + "%";
  };
  const upFn = () => {
    resizer.classList.remove("dragging");
    document.removeEventListener("mousemove", moveFn);
    document.removeEventListener("mouseup", upFn);
  };
  document.addEventListener("mousemove", moveFn);
  document.addEventListener("mouseup", upFn);
});

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
loadState();
applyStaticI18n();
renderAll();
