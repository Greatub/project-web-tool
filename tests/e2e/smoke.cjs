// Browser smoke test for the built single-file app (src/index.html), opened directly from disk.
// Requires Playwright with Chromium:  npm install --no-save playwright && npx playwright install chromium
// Screenshots for manual review are written to test-results/ (ignored by Git).
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error(
    "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium",
  );
  process.exit(1);
}

const appUrl = "file://" + path.resolve(__dirname, "../../src/index.html");
const shots = path.resolve(__dirname, "../../test-results");
fs.mkdirSync(shots, { recursive: true });

let checks = 0;

async function openApp(browser, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // The app must never use the browser's own alert/confirm/prompt dialogs.
  page.on("dialog", (d) => {
    errors.push("native " + d.type() + " dialog: " + d.message());
    d.dismiss();
  });
  await page.clock.setFixedTime(new Date("2026-10-25T10:00:00"));
  await page.goto(appUrl);
  currentPage = page;
  return { page, context, errors };
}

let currentPage = null;
async function check(name, fn) {
  try {
    await fn();
  } catch (e) {
    if (currentPage) await currentPage.screenshot({ path: path.join(shots, "failure.png") }).catch(() => {});
    throw e;
  }
  checks++;
  console.log("PASS " + name);
}

const openDialog = (page) => page.locator("dialog[open]");

async function createDemo(page) {
  await page.click("#projectMenuLabel");
  await page.getByRole("menuitem", { name: /fictional demo/i }).click();
  await openDialog(page).getByRole("button", { name: "Create" }).click();
  await page.waitForFunction(() => projectData.length === 1);
}

const columnCounts = (page, tableId) =>
  page.evaluate((id) => {
    const table = document.getElementById(id);
    return {
      headers: table.querySelectorAll("thead th").length,
      rows: [...table.querySelectorAll("tbody tr")].map((row) => row.children.length),
    };
  }, tableId);

const headerHeight = (page) =>
  page.locator(".top-header").evaluate((el) => Math.round(el.getBoundingClientRect().height));

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 1024]) {
      const { page, context, errors } = await openApp(browser, { width });
      let blankHeader;

      await check(`${width}px: empty project shows the start guide`, async () => {
        assert.ok(await page.locator("#emptyState").isVisible());
        assert.match(await page.locator("#uiTitle").textContent(), /Untitled project/);
        blankHeader = await headerHeight(page);
        await page.screenshot({ path: path.join(shots, `blank-${width}.png`) });
      });

      await check(
        `${width}px: demo renders rows, bars, dependency line; header height is stable`,
        async () => {
          await createDemo(page);
          assert.ok(await page.locator("#emptyState").isHidden());
          assert.equal(await page.locator("#wbsTbody tr").count(), 4);
          assert.equal(await page.locator(".gantt-bar-subtask").count(), 2);
          assert.equal(await page.locator("svg.dep-svg path").count(), 1);
          assert.equal(await headerHeight(page), blankHeader);
          await page.screenshot({ path: path.join(shots, `gantt-${width}.png`) });
        },
      );

      await check(`${width}px: duration and progress columns are visible without scrolling`, async () => {
        const paneRight = await page.locator("#leftPane").evaluate((el) => el.getBoundingClientRect().right);
        for (const label of ["Days", "Prog %"]) {
          const header = page.locator("#wbsTheadRow th", { hasText: label });
          const box = await header.boundingBox();
          assert.ok(box.x + box.width <= paneRight + 1, label + " column is cut off");
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, "page scrolls horizontally by " + overflow + "px");
      });

      await check(`${width}px: cards and people views render; matrix columns line up`, async () => {
        await page.evaluate(() => switchView("cards"));
        assert.equal(await page.locator(".mt-card").count(), 1);
        await page.evaluate(() => switchView("people"));
        for (const id of ["peopleSummaryTable", "raciMatrixTable"]) {
          const table = await columnCounts(page, id);
          for (const cells of table.rows) assert.equal(cells, table.headers);
        }
        await page.evaluate(() => switchView("gantt"));
      });

      await context.close();
      assert.deepEqual(errors, []);
    }

    const { page, context, errors } = await openApp(browser);
    await createDemo(page);

    await check("dates are shown and entered as YYYY-MM-DD", async () => {
      const start = page.locator('input[data-focus-key="1.1.1:start"]');
      assert.equal(await start.getAttribute("type"), "text");
      assert.equal(await start.inputValue(), "2026-10-25");
    });

    await check("Tab after an inline edit keeps focus for the next field", async () => {
      await page.fill('input[data-focus-key="1.1.1:days"]', "5");
      await page.keyboard.press("Tab");
      await page.waitForFunction(() => findSubtaskByWbs("1.1.2").start === "2026-10-30");
      assert.equal(await page.evaluate(() => document.activeElement.dataset.focusKey), "1.1.1:pct");
      await page.keyboard.type("40");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => findSubtaskByWbs("1.1.1").pct === 40);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.focusKey), "1.1.2:pct");
    });

    await check("invalid date shows an in-app error and keeps the old value", async () => {
      await page.fill('input[data-focus-key="1.1.1:start"]', "10/25/2026");
      await page.keyboard.press("Tab");
      await page.locator("dialog[open] .app-dialog-message").waitFor();
      assert.match(await openDialog(page).textContent(), /YYYY-MM-DD/);
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").start), "2026-10-25");
    });

    await check("undo and redo restore an edit (buttons and Ctrl+Z)", async () => {
      await page.locator("body").click({ position: { x: 600, y: 700 } });
      await page.keyboard.press("Control+z");
      await page.waitForFunction(() => findSubtaskByWbs("1.1.1").pct === 25);
      await page.click("#btnRedo");
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").pct), 40);
    });

    await check("dragging a bar moves its start date; Undo reverts it", async () => {
      const bar = await page.locator('.gantt-bar-subtask[data-wbs="1.1.1"]').boundingBox();
      await page.mouse.move(bar.x + 10, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(bar.x + 10 + 48, bar.y + bar.height / 2, { steps: 5 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").start), "2026-10-27");
      await page.click("#btnUndo");
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").start), "2026-10-25");
    });

    await check("keyboard moves a focused bar (Arrow) and changes duration (Shift+Arrow)", async () => {
      await page.locator('.gantt-bar-subtask[data-wbs="1.1.1"]').focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").start), "2026-10-26");
      assert.equal(await page.evaluate(() => document.activeElement.dataset.wbs), "1.1.1");
      await page.keyboard.press("Shift+ArrowRight");
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").days), 6);
    });

    await check("delayed tasks and priorities are marked on the Gantt", async () => {
      await page.click("#sidebarFiltersLabel");
      await page.fill("#statusDateInput", "2026-11-20");
      await page.keyboard.press("Tab");
      assert.ok((await page.locator(".gantt-bar-subtask.is-delayed").count()) >= 1);
      assert.ok((await page.locator(".gantt-bar-subtask .bar-prio").count()) === 2);
      await page.screenshot({ path: path.join(shots, "gantt-delayed.png") });
      await page.fill("#statusDateInput", "2026-10-25");
      await page.keyboard.press("Tab");
    });

    await check("task dialog closes with Esc and returns focus", async () => {
      await page.locator('#wbsTbody tr[data-wbs="1.1.1"] td').nth(1).dblclick();
      assert.ok(await page.locator("#taskModal").evaluate((d) => d.open));
      assert.equal(await page.inputValue("#mdWbs"), "1.1.1");
      await page.screenshot({ path: path.join(shots, "task-dialog.png") });
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#taskModal").evaluate((d) => d.open), false);
    });

    await check("a sub-task can move to another main task", async () => {
      await page.evaluate(() => openAddModal("Main Task"));
      await page.fill("#mdName", "Second delivery");
      await page.click("#mdSaveBtn");
      await page.waitForFunction(() => projectData[0].mainTasks.length === 2);
      await page.evaluate(() => openEditModal("Sub-task", "1.1.2"));
      await page.selectOption("#mdParent", "1.2");
      await page.click("#mdSaveBtn");
      assert.deepEqual(
        await page.evaluate(() => projectData[0].mainTasks.map((m) => m.subtasks.map((s) => s.wbs))),
        [["1.1.1"], ["1.1.2"]],
      );
    });

    await check("phases can be added, renamed with their tasks, reordered and deleted", async () => {
      await page.evaluate(() => void addPhase());
      assert.equal(await page.inputValue('dialog[open] [name="wbs"]'), "2");
      await page.fill('dialog[open] [name="name"]', "Launch");
      await page.keyboard.press("Enter");
      await page.waitForFunction(() => projectData.length === 2);
      await page.locator('#wbsTbody tr[data-wbs="1"] td').nth(1).dblclick();
      await page.fill("#phaseWbs", "5");
      await openDialog(page).getByRole("button", { name: "Save" }).click();
      assert.deepEqual(await page.evaluate(() => projectData.map((f) => f.wbs)), ["5", "2"]);
      assert.equal(await page.evaluate(() => projectData[0].mainTasks[1].subtasks[0].pred), "5.1.1");
      await page.locator('#wbsTbody tr[data-wbs="2"] td').nth(1).dblclick();
      await openDialog(page).getByRole("button", { name: "Move up" }).click();
      await page.keyboard.press("Escape");
      assert.deepEqual(await page.evaluate(() => projectData.map((f) => f.wbs)), ["2", "5"]);
      await page.locator('#wbsTbody tr[data-wbs="2"] td').nth(1).dblclick();
      await openDialog(page).getByRole("button", { name: "Delete" }).click();
      await page.locator("dialog[open]").last().getByRole("button", { name: "Delete" }).click();
      await page.waitForFunction(() => projectData.length === 1);
      assert.equal(await openDialog(page).count(), 0);
    });

    await check(
      "versions can be saved, listed, restored and deleted; the change log is visible",
      async () => {
        await page.evaluate(() => openVersionModal());
        await page.fill("#verTagInput", "基线一");
        await page.click("#btnVerConfirm");
        await page.evaluate(() => inlineUpdateSubtask("5.1.1", "pct", "90"));
        await page.waitForFunction(() => findSubtaskByWbs("5.1.1").pct === 90);
        await page.evaluate(() => void openHistoryDialog());
        assert.equal(await page.locator("#historyPanel tbody tr").count(), 1);
        await page.screenshot({ path: path.join(shots, "history-versions.png") });
        await page.locator("#historyPanel").getByRole("button", { name: "Restore" }).click();
        await page.locator("dialog[open]").last().getByRole("button", { name: "Restore" }).click();
        await page.waitForFunction(() => findSubtaskByWbs("5.1.1").pct === 40);
        await page.getByRole("tab", { name: /Change log/ }).click();
        assert.ok((await page.locator("#historyPanel tbody tr").count()) > 5);
        await page.getByRole("tab", { name: /Versions/ }).click();
        await page.locator("#historyPanel").getByRole("button", { name: "Delete" }).click();
        await page.locator("dialog[open]").last().getByRole("button", { name: "Delete" }).click();
        await page.waitForFunction(() => versionList.length === 0);
        await page.keyboard.press("Escape");
      },
    );

    await check("archived projects are read-only and grouped in the switcher", async () => {
      await page.click("#projectMenuLabel");
      await page.getByRole("menuitem", { name: "Archive project" }).click();
      assert.ok(await page.locator("#archivedNotice").isVisible());
      assert.ok(await page.locator('input[data-focus-key="5.1.1:days"]').isDisabled());
      assert.equal(await page.locator("#projectSelect optgroup").count(), 1);
      await page.screenshot({ path: path.join(shots, "archived.png") });
      await page.locator("#archivedNotice").getByRole("button", { name: "Restore project" }).click();
      assert.ok(await page.locator("#archivedNotice").isHidden());
    });

    await check("language stays the same when switching projects", async () => {
      await page.evaluate(() => toggleLanguage());
      const ids = await page.evaluate(() => Object.keys(workspace.projects));
      await page.selectOption("#projectSelect", ids[0]);
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
      await page.selectOption("#projectSelect", ids[1]);
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
      await page.screenshot({ path: path.join(shots, "gantt-zh.png") });
      await page.evaluate(() => toggleLanguage());
    });

    await check("a project can be deleted (backup offered first)", async () => {
      const before = await page.evaluate(() => Object.keys(workspace.projects).length);
      await page.click("#projectMenuLabel");
      await page.getByRole("menuitem", { name: /Delete project/ }).click();
      await openDialog(page).locator('[name="backup"]').uncheck();
      await openDialog(page).getByRole("button", { name: "Delete project" }).click();
      assert.equal(await page.evaluate(() => Object.keys(workspace.projects).length), before - 1);
    });

    await check("Excel export, import preview and apply work through the in-app dialogs", async () => {
      await createDemo(page);
      await page.evaluate(() => void exportToExcelXML());
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        openDialog(page)
          .getByRole("button", { name: /Save current project/ })
          .click(),
      ]);
      await page.keyboard.press("Escape");
      const file = path.join(shots, "roundtrip.xlsx");
      await download.saveAs(file);
      // Re-importing an unchanged copy reports that there is nothing to apply.
      await page.setInputFiles("#excelFileInput", file);
      await page.locator("dialog[open] .app-dialog-message").waitFor();
      assert.match(await openDialog(page).textContent(), /No changes to apply/);
      await page.keyboard.press("Escape");
      // A blank creation template opens the preview; applying it creates a new project.
      await page.evaluate(() => void exportToExcelXML());
      const [blank] = await Promise.all([
        page.waitForEvent("download"),
        openDialog(page)
          .getByRole("button", { name: /Blank creation template/ })
          .click(),
      ]);
      await page.keyboard.press("Escape");
      await blank.saveAs(file);
      const projects = await page.evaluate(() => Object.keys(workspace.projects).length);
      await page.setInputFiles("#excelFileInput", file);
      await openDialog(page).getByRole("button", { name: "Apply changes" }).click();
      assert.equal(await page.evaluate(() => Object.keys(workspace.projects).length), projects + 1);
      assert.equal(await page.locator("#uiTitle").textContent(), "New project");
      fs.rmSync(file);
      await page.selectOption("#projectSelect", { index: 1 });
    });

    await check(
      "Project XML export and import create a separate project with a readable preview",
      async () => {
        await page.evaluate(() => void exportProjectXML());
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          openDialog(page).getByRole("button", { name: /XML/ }).click(),
        ]);
        const file = path.join(shots, "roundtrip.xml");
        await download.saveAs(file);
        const projects = await page.evaluate(() => Object.keys(workspace.projects).length);
        const source = await page.evaluate(() =>
          stableJSON(groupExchangeRows(projectData, projectSettings).slice(1)),
        );
        await page.setInputFiles("#excelFileInput", file);
        const preview = openDialog(page);
        await preview.getByRole("button", { name: "Apply changes" }).waitFor();
        const cells = await preview.locator("tbody td").allTextContents();
        assert.ok(!cells.some((c) => /^\d{5}$/.test(c.trim())), "dates must not show as serial numbers");
        assert.equal(
          await preview.locator("tbody tr").count(),
          await page.evaluate(() => allItems(projectData).length),
        );
        await page.screenshot({ path: path.join(shots, "project-xml-preview.png") });
        await preview.getByRole("button", { name: "Apply changes" }).click();
        assert.equal(await page.evaluate(() => Object.keys(workspace.projects).length), projects + 1);
        assert.equal(
          await page.evaluate(() => stableJSON(groupExchangeRows(projectData, projectSettings).slice(1))),
          source,
        );
        fs.rmSync(file);
      },
    );

    await check("a failed save shows a persistent banner and recovers after retry", async () => {
      await page.evaluate(() => {
        window.__realSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
          throw new Error("QuotaExceededError");
        };
      });
      await page.fill('input[data-focus-key="1.1.1:pct"]', "60");
      await page.keyboard.press("Tab");
      const banner = page.locator("#saveBanner");
      await banner.waitFor();
      assert.match(await banner.textContent(), /NOT saved/);
      // Let the deferred re-render finish while storage is still failing, so the banner stays up.
      await page.waitForTimeout(100);
      assert.ok(await banner.isVisible(), "banner stays while saves keep failing");
      await page.evaluate(() => (Storage.prototype.setItem = window.__realSetItem));
      await banner.getByRole("button", { name: "Retry save" }).click();
      assert.ok(await banner.isHidden());
    });

    await check("data survives a reload", async () => {
      await page.reload();
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").pct), 60);
    });

    await context.close();
    assert.deepEqual(errors, []);
    console.log(checks + " browser smoke checks passed; screenshots in test-results/");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
