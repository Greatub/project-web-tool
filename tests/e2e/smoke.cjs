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

async function openApp(browser, { width = 1440, height = 900, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Smoke project" : undefined));
  await page.clock.setFixedTime(new Date("2026-10-25T10:00:00"));
  if (init) await page.addInitScript(init);
  await page.goto(appUrl);
  return { page, context, errors };
}

async function check(name, fn) {
  await fn();
  checks++;
  console.log("PASS " + name);
}

const columnCounts = (page, tableId) =>
  page.evaluate((id) => {
    const table = document.getElementById(id);
    return {
      headers: table.querySelectorAll("thead th").length,
      rows: [...table.querySelectorAll("tbody tr")].map((row) => row.children.length),
    };
  }, tableId);

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 1024]) {
      const { page, context, errors } = await openApp(browser, { width });

      await check(`${width}px: boots without errors and shows an empty project`, async () => {
        assert.equal(await page.locator("#wbsTbody tr").count(), 0);
        assert.match(await page.locator("#uiTitle").textContent(), /Untitled project/);
        await page.screenshot({ path: path.join(shots, `blank-${width}.png`) });
      });

      await check(`${width}px: fictional demo renders table rows, bars and dependency lines`, async () => {
        await page.evaluate(() => projectAction(1));
        assert.equal(await page.locator("#wbsTbody tr").count(), 4);
        assert.equal(await page.locator(".gantt-bar-subtask").count(), 2);
        assert.equal(await page.locator("svg.dep-svg path").count(), 1);
        await page.screenshot({ path: path.join(shots, `gantt-${width}.png`) });
      });

      await check(`${width}px: page itself never scrolls horizontally`, async () => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 0, "horizontal overflow " + overflow + "px");
      });

      await check(`${width}px: cards and people views render; matrix columns line up`, async () => {
        await page.evaluate(() => switchView("cards"));
        assert.equal(await page.locator(".mt-card").count(), 1);
        await page.evaluate(() => switchView("people"));
        const summary = await columnCounts(page, "peopleSummaryTable");
        const matrix = await columnCounts(page, "raciMatrixTable");
        for (const table of [summary, matrix])
          for (const cells of table.rows) assert.equal(cells, table.headers);
        await page.screenshot({ path: path.join(shots, `people-${width}.png`) });
        await page.evaluate(() => switchView("gantt"));
      });

      await context.close();
      assert.deepEqual(errors, []);
    }

    const { page, context, errors } = await openApp(browser);
    await page.evaluate(() => projectAction(1));

    await check("inline duration edit recalculates the dependent task", async () => {
      const before = await page.evaluate(() => findSubtaskByWbs("1.1.2").start);
      await page.fill('input[aria-label="1.1.1 Duration (Days)"]', "5");
      await page.keyboard.press("Tab");
      const after = await page.evaluate(() => findSubtaskByWbs("1.1.2").start);
      assert.notEqual(after, before);
      assert.equal(after, "2026-10-30");
    });

    await check("dragging a bar moves its start date and records an audit entry", async () => {
      const bar = await page.locator('.gantt-bar-subtask[data-wbs="1.1.1"]').boundingBox();
      await page.mouse.move(bar.x + 10, bar.y + bar.height / 2);
      await page.mouse.down();
      await page.mouse.move(bar.x + 10 + 48, bar.y + bar.height / 2, { steps: 5 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => findSubtaskByWbs("1.1.1").start), "2026-10-27");
      assert.match(await page.evaluate(() => auditLog[0].action), /Drag/);
    });

    await check("task dialog opens with the task values and closes", async () => {
      await page.evaluate(() => openEditModal("Sub-task", "1.1.1"));
      assert.ok(await page.locator("#taskModal.open").isVisible());
      assert.equal(await page.inputValue("#mdWbs"), "1.1.1");
      await page.screenshot({ path: path.join(shots, "task-dialog.png") });
      await page.evaluate(() => closeModal());
      assert.equal(await page.locator("#taskModal.open").count(), 0);
    });

    await check("language switch translates labels and keeps user text", async () => {
      await page.evaluate(() => toggleLanguage());
      assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
      assert.match(await page.locator("#tab-gantt").textContent(), /甘特/);
      assert.equal(await page.evaluate(() => projectData[0].name), "Example phase");
      await page.screenshot({ path: path.join(shots, "gantt-zh.png") });
      await page.evaluate(() => toggleLanguage());
    });

    await check("collapsed sidebar keeps icon navigation", async () => {
      await page.evaluate(() => toggleSidebar());
      const width = await page.locator("#projectSidebar").evaluate((el) => el.getBoundingClientRect().width);
      assert.equal(Math.round(width), 56);
      await page.evaluate(() => toggleSidebar());
    });

    await check("a failed save shows a persistent banner and recovers after retry", async () => {
      await page.evaluate(() => {
        window.__realSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
          throw new Error("QuotaExceededError");
        };
      });
      await page.fill('input[aria-label="1.1.1 % Complete (0~100)"]', "60");
      await page.keyboard.press("Tab");
      const banner = page.locator("#saveBanner");
      assert.ok(await banner.isVisible());
      assert.match(await banner.textContent(), /NOT saved/);
      await page.screenshot({ path: path.join(shots, "save-failed.png") });
      await page.evaluate(() => (Storage.prototype.setItem = window.__realSetItem));
      await banner.getByRole("button", { name: "Retry save" }).click();
      assert.ok(await banner.isHidden());
      const stored = await page.evaluate(
        () => JSON.parse(localStorage.getItem(WORKSPACE_KEY)).projects[projectId],
      );
      assert.equal(stored.currentData[0].mainTasks[0].subtasks[0].pct, 60);
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
