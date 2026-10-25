// One dialog component for every modal in the app: a title bar with a close button, a body, an inline
// error line and a footer of actions. It is built on <dialog>, so Esc closes it, focus moves into it,
// and focus returns to the control that opened it. Native alert/confirm/prompt are not used.

const CLOSE_ICON =
  '<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
let dialogSequence = 0;

// Wires a <dialog class="app-dialog"> (static or created on the fly) and returns helpers.
function enhanceDialog(d, { onClose } = {}) {
  if (d.dataset.enhanced) return d;
  d.dataset.enhanced = "true";
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeAppDialog(d, null);
  });
  d.addEventListener("click", (e) => {
    if (e.target.closest("[data-dialog-close]")) closeAppDialog(d, null);
  });
  d.addEventListener("keydown", (e) => {
    // Enter in a single-line field submits the primary action, as in a form.
    if (e.key !== "Enter" || e.isComposing || e.shiftKey) return;
    const field = e.target.closest("input:not([type=checkbox]):not([type=color]), select");
    if (!field || field.closest(".no-enter-submit")) return;
    const primary = d.querySelector(".app-dialog-ftr .btn-primary:not(:disabled)");
    if (primary) {
      e.preventDefault();
      primary.click();
    }
  });
  d._onClose = onClose;
  return d;
}

function openAppDialog(d) {
  enhanceDialog(d);
  d._opener = document.activeElement;
  setDialogError(d, "");
  if (!d.open) d.showModal();
  const first =
    d.querySelector("[autofocus]") ||
    d.querySelector(".app-dialog-body :is(input,select,textarea,button):not([disabled]):not([type=hidden])");
  first?.focus();
  return d;
}

function closeAppDialog(d, value) {
  if (!d) return;
  if (d.open) d.close();
  const opener = d._opener;
  d._opener = null;
  if (opener && document.contains(opener)) opener.focus?.();
  d._onClose?.(value);
  if (d.dataset.temporary) d.remove();
}

function setDialogError(d, message) {
  const line = d?.querySelector(".app-dialog-error");
  if (!line) return;
  line.textContent = message || "";
  line.hidden = !message;
}

// Builds and opens a temporary dialog. actions: [{ label, value, kind: "primary"|"danger"|"", align: "start", onClick }]
// onClick may return false to keep the dialog open; a thrown error is shown inline.
function showDialog({ title, bodyHtml = "", actions = [], size = "", id = "", onOpen }) {
  return new Promise((resolve) => {
    if (id) document.getElementById(id)?.remove();
    const d = document.createElement("dialog");
    const titleId = "dialogTitle" + ++dialogSequence;
    if (id) d.id = id;
    d.dataset.temporary = "true";
    d.className = "app-dialog" + (size ? " app-dialog-" + size : "");
    d.setAttribute("aria-labelledby", titleId);
    const button = (a, i) =>
      '<button type="button" class="btn' +
      (a.kind ? " btn-" + a.kind : "") +
      '" data-action="' +
      i +
      '">' +
      escapeHtml(a.label) +
      "</button>";
    const start = actions.map((a, i) => (a.align === "start" ? button(a, i) : "")).join("");
    const end = actions.map((a, i) => (a.align === "start" ? "" : button(a, i))).join("");
    d.innerHTML =
      '<div class="app-dialog-hdr"><h2 class="ui-heading" id="' +
      titleId +
      '">' +
      escapeHtml(title) +
      '</h2><button type="button" class="btn btn-icon" data-dialog-close aria-label="' +
      escapeHtml(t("closeLabel")) +
      '" title="' +
      escapeHtml(t("closeLabel")) +
      '">' +
      CLOSE_ICON +
      '</button></div><div class="app-dialog-body">' +
      bodyHtml +
      '</div><p class="app-dialog-error" role="alert" hidden></p><div class="app-dialog-ftr"><div class="app-dialog-ftr-start">' +
      start +
      '</div><div class="app-dialog-ftr-end">' +
      end +
      "</div></div>";
    enhanceDialog(d, { onClose: resolve });
    d.addEventListener("click", async (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) return;
      const action = actions[Number(target.dataset.action)];
      try {
        setDialogError(d, "");
        const keepOpen = action.onClick ? (await action.onClick(d)) === false : false;
        if (!keepOpen) closeAppDialog(d, action.value);
      } catch (err) {
        setDialogError(d, err.message);
      }
    });
    document.body.append(d);
    onOpen?.(d);
    openAppDialog(d);
  });
}

function showMessage(message, { title = t("msgNotice"), kind = "info" } = {}) {
  return showDialog({
    title,
    bodyHtml:
      '<p class="app-dialog-message' +
      (kind === "error" ? " is-error" : "") +
      '">' +
      escapeHtml(message) +
      "</p>",
    actions: [{ label: t("msgOk"), value: true, kind: "primary" }],
  });
}

function showError(message) {
  return showMessage(message, { title: t("msgSomethingWentWrong"), kind: "error" });
}

async function askConfirm(
  message,
  { title = t("msgPleaseConfirm"), confirmLabel = t("msgOk"), danger = false, detailHtml = "" } = {},
) {
  const value = await showDialog({
    title,
    bodyHtml: '<p class="app-dialog-message">' + escapeHtml(message) + "</p>" + detailHtml,
    actions: [
      { label: t("msgCancel"), value: false },
      { label: confirmLabel, value: true, kind: danger ? "danger" : "primary" },
    ],
  });
  return value === true;
}

// fields: [{ name, label, type: "text"|"checkbox"|"select", value, required, hint, options: [{value,label}], placeholder }]
// validate(values) may throw to keep the dialog open with an inline error.
function askForm({ title, intro = "", fields, submitLabel = t("msgSave"), validate }) {
  let values = null;
  const fieldHtml = (f) => {
    const id = "formField_" + f.name;
    if (f.type === "checkbox")
      return (
        '<label class="check-field"><input type="checkbox" id="' +
        id +
        '" name="' +
        f.name +
        '"' +
        (f.value ? " checked" : "") +
        "> " +
        escapeHtml(f.label) +
        "</label>"
      );
    const control =
      f.type === "select"
        ? '<select id="' +
          id +
          '" name="' +
          f.name +
          '">' +
          f.options
            .map(
              (o) =>
                '<option value="' +
                escapeHtml(o.value) +
                '"' +
                (o.value === f.value ? " selected" : "") +
                ">" +
                escapeHtml(o.label) +
                "</option>",
            )
            .join("") +
          "</select>"
        : '<input type="text" id="' +
          id +
          '" name="' +
          f.name +
          '" value="' +
          escapeHtml(f.value ?? "") +
          '"' +
          (f.placeholder ? ' placeholder="' + escapeHtml(f.placeholder) + '"' : "") +
          (f.required ? " required" : "") +
          ">";
    return (
      '<div class="form-field full"><label for="' +
      id +
      '">' +
      escapeHtml(f.label) +
      "</label>" +
      control +
      (f.hint ? '<span class="ui-caption">' + escapeHtml(f.hint) + "</span>" : "") +
      "</div>"
    );
  };
  return showDialog({
    title,
    bodyHtml:
      (intro ? '<p class="app-dialog-message">' + escapeHtml(intro) + "</p>" : "") +
      '<div class="form-grid">' +
      fields.map(fieldHtml).join("") +
      "</div>",
    actions: [
      { label: t("msgCancel"), value: null },
      {
        label: submitLabel,
        kind: "primary",
        value: "submit",
        onClick(d) {
          const read = {};
          for (const f of fields) {
            const el = d.querySelector('[name="' + f.name + '"]');
            read[f.name] = f.type === "checkbox" ? el.checked : el.value.trim();
            if (f.required && !read[f.name]) {
              el.focus();
              throw inputError("msgFieldRequired", f.label);
            }
          }
          validate?.(read);
          values = read;
        },
      },
    ],
  }).then((result) => (result === "submit" ? values : null));
}
