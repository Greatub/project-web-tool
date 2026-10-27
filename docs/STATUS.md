# Current status

Updated: 2026-10-27 (Asia/Shanghai).

## Implemented

- Offline project workspace with project-scoped tasks, settings, snapshots, audit, active versions and recovery points; atomic persistent writes and failure protection.
- Natural-day FS/Lag scheduling, three task levels, weighted progress, Gantt, cards and people participation; 1–10 configurable groups with stable IDs.
- English initial UI, English built-in project/sample/group values in both interface languages. Existing built-in blank-name placeholders are normalized; explicitly custom names and user task text are preserved.
- Controlled Excel v3, protected calculated cells, explicit 21/22-field mappings, group configuration, preview, source revision checks and downloads as new files. Legacy 14-column spreadsheet import remains positionally compatible; source-specific aliases have been removed. Legacy JSON requires a declared three-slot mapping.
- Public source allowlist and irreversible identifier fingerprints with submission/push hooks. Historical source files, old templates, development images, raw audit records and old Git backups have been removed under explicit user authorization. The public repository was deleted and recreated under the same name, with a new repository identity and clean Git history; only the 13 reviewed files were uploaded.

## Current change: Microsoft Project XML

- Ported onto latest main (`1ae5106`) without overwriting the merged source split, English-first UI, compact storage, undo/history and shared dialogs. XML implementation lives in `src/app/js/exchange.js`; all 59 new messages use the shared bilingual dictionary. Generated `src/index.html` is rebuilt from sources.
- Import XML via the existing action, review mapped fields and create an independent project. Export Project XML under Data & versions, using the shared dialog/inline errors, SVG button and typography. No new CSS or standalone page. Source files stay read-only and downloads have unique filenames.
- Explicit v1 mappings cover current fields, elapsed 24-hour durations, one FS predecessor, signed calendar Lag and Text1–Text10 groups. Exchange notes retain group configuration and inactive Lag. Unsupported rules, conflicting schedules, malformed XML/DTDs and truncation reject before mutation. Native MPP is not implemented.
- Current verification: 84 logic checks (67 latest-main regressions + 17 Project XML checks), build freshness and privacy scans pass. XML parsing tests use Python's independent standard-library parser; cancellation, isolation, concurrent writes, failed persistence and bilingual shared preview configuration are covered. Fictional full/blank/unknown-date outputs pass an assembled subset of Microsoft-published mapped-field schema definitions; this is not full-schema or native application certification.
- GitHub Actions `verify` and the existing 25-check `browser-smoke` job passed for implementation commit `e80b4a9`; this is a browser regression result, not native Project certification.
- Pending: native Microsoft Project open/save/MPP conversion and live 1024/1440 px English/Chinese browser acceptance. Browser file access is restricted here; the existing CI smoke remains the remote browser regression gate. No new live visual acceptance is claimed.

## Previous change: project conventions aligned with merged updates

- Baseline: `c0f73fa` on main, including the data-safety/source restructuring and workflow/interface changes merged through pull requests #2 and #3.
- Expanded `docs/PUBLIC.md` in English and Chinese with source ownership, generated build rules, task editing, session history boundaries, archive/deletion behavior, compact storage, save failures, interaction/accessibility and validation gates. README links to these rules.
- Documents the existing implementation; does not change application behavior, the bundle schema or the Excel contract. Historical verification below belongs to its original change and is not a new test result.
- This change: all 67 logic checks, `pnpm build`, build freshness, privacy scans, release generation and `git diff --check` passed. `pnpm lint` and `pnpm typecheck` are undefined. Browser smoke was attempted but Playwright is not installed in this isolated checkout; no new browser acceptance is claimed. When available, run the pinned Playwright setup above and review the 1024/1440 px English/Chinese screenshots.

## Previous change: audit #1 workflow and interface items

- Structure editing: phases can be renamed (child WBS numbers and predecessors follow), reordered and deleted; main tasks and sub-tasks can be reordered and moved to another parent. Empty phases now stay visible in the table (they were hidden before, so a new phase could not be filled). WBS numbers are suggested when adding.
- Projects: delete from the Project menu (JSON backup offered first; at least one project always remains). Archived projects are read-only, grouped under "Archived" in the switcher and restorable from a notice bar.
- Versions & change log dialog: list versions, compare one as baseline, restore (undoable) or delete (undoable); browse the recorded change log. Version tags may use any script (for example Chinese).
- Undo / redo: in-memory steps for task, phase and version changes (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, header buttons with the step name); cleared when another project opens.
- Language is a per-browser preference; switching projects no longer switches the interface language.
- Empty projects show a three-step guide (Add phase, Import, Fill with fictional demo). Native alert/confirm/prompt are gone: every prompt, confirmation and error uses one shared dialog component built on `<dialog>` (Esc closes, focus moves in and back, errors shown inline).
- Header: project name first; switcher, Project menu, Undo/Redo and save status on one row; height is the same for empty and filled projects.
- Table: columns are chosen under Filters & display (combined People column, optional per-group columns and priority); the name column takes the remaining width; defaults fit duration and progress at 1024 and 1440 px; the column choice and split width are remembered. Tree toggles are buttons.
- Dates are shown and entered as YYYY-MM-DD everywhere, with a calendar button that opens the browser picker. After an inline edit, Tab and Enter keep focus on the next field, including when typing continues before the re-render.
- Gantt: bars are focusable; arrow keys move by a day, Shift+arrow changes duration, Enter opens the task; drag uses pointer events (touch works). Delayed bars and rows are marked in red, priorities are labelled P1–P3, and bar labels list people from every group.
- Tests: 67 logic checks (new `tests/public/workflow.cjs`, 11 checks) and a 25-check browser smoke test that also fails if any native dialog appears; the smoke test passed 10 consecutive runs.

## Previous change: audit #1 fixes (data safety and maintainability)

- Storage growth: version snapshots and Excel recovery points now store only user-entered fields; dates, roll-ups and statuses are recalculated when used. Recovery points no longer embed version history or the audit log, and restoring one keeps the current snapshots and audit. Existing workspaces are compacted when loaded. Measured with 800 sub-tasks and 3 recovery points: 4 snapshots took 4.1 MB before (the next save exceeded the browser limit) and now take 1.2 MB; 8 snapshots take 1.8 MB.
- Save failures: the one-time alert is replaced by a persistent banner with "Export JSON backup" and "Retry save"; it stays until a save succeeds. The header shows storage usage, and a warning banner appears above 80%.
- People view: the assignment matrix header now includes the timeline column, so person columns line up (renamed from "RACI", which it was not).
- Maintainability: `src/index.html` is generated by `scripts/build.cjs` from readable sources in `src/app/` (markup, styles and seven scripts). Removed unused code (v1 workbook export and its embedded template, the unused v2 workbook builder, hidden legacy inputs, legacy three-role roll-ups, about 50 unused text keys). CSS override layers were merged; computed styles of every element were compared before and after in 15 browser scenarios with zero differences. All interface text and messages, including over 80 previously English-only errors, now come from one bilingual dictionary. The stale design comment and the third-party theme name in the old workbook template are gone.
- Tests: `npm test` checks that the build is current and runs 56 logic checks (new: storage, banner, matrix and translation-key checks). `npm run test:e2e` adds a 15-check Playwright smoke test (two widths, all views, inline edit, drag, dialogs, language, save-failure banner, reload), also run in CI with screenshots uploaded.
- Not changed: the scheduling rules, Excel v3 contract and project data model. Workbooks exported before this change may be reported as stale once, because snapshot compaction changes the revision digest; export a fresh workbook.

## Previous change: English-first repository

- README and public release conventions now present English first, followed by Simplified Chinese. Existing Chinese guidance is retained in the same allowlisted files.
- Initial HTML language and fallback labels use English. English remains the default interface language; saved Chinese preferences and user-entered text are preserved. Excel continues to provide English data sheets and separate Chinese instructions.
- Validation: all 47 automated checks, privacy scanning and release generation passed. Static checks confirm English HTML, unchanged application JavaScript, English-first documents and retained Chinese guidance. The repository has no lint, typecheck or build scripts; those pnpm commands report missing commands. No new browser or native Excel visual acceptance is claimed.

## Previous change: stable sidebar icons

- Unified expanded/collapsed pane padding and icon alignment. Heading, view and language buttons keep 44 px height in both states; icon centers remain 28 px from the pane's left edge. Single-line navigation labels prevent language-dependent row growth.
- Reviewed the CSS box geometry for the toggle, active/inactive view buttons and language button. All 47 automated checks and privacy checks pass. Source and public-release copies are synchronized.
- Browser rendering and English/Chinese layouts at 1024/1440 px remain unverified because local file pages are blocked by browser security policy. The geometry review does not constitute live visual acceptance.

## Previous change: project selector typography

- Fixed the project selector falling back to the browser's native font size. It now uses ui-control with the same system-font/12 px/400/1.4 tokens as buttons, and ui-select for themed border, color and spacing. Project actions retain their compact 36 px height; dialog inputs keep the 13 px body role.
- Reviewed the selector/button cascade, filter controls, navigation and dialog input roles. The shared component structural check and all 47 automated checks pass. Source and public-release copies are synchronized.
- Live computed styles and English/Chinese layouts at 1024/1440 px remain unverified: browser security policy prevents access to the local file page. No visual acceptance is claimed for this change.

## Previous cleanup verification

- 47 automated checks: 17 scheduling/workspace/default-value checks and 30 Excel/group contract checks. Includes fresh English boot, built-in placeholder migration, custom text preservation, both UI languages and legacy mappings.
- 17 actual ZIP/XML integration checks retain v1/v2 coverage and verify all ten groups through v3 import/export, isolation and recovery.
- Microsoft Open XML SDK validates v3 blank/full, v2 blank/summary and v1 blank output with zero errors in all five workbooks.
- Local file contents, decompressed workbook parts and every object in the fresh Git repository were scanned without matches for the two blocked identifiers. Git integrity check found no unreachable objects. All seven known old commit API endpoints and their raw source URLs returned anonymous HTTP 404 after repository recreation.
- No new native Excel open/save or browser desktop layout acceptance has been completed during this cleanup.

## Remaining limits

- Browser data is stored per origin/browser; file cleanup cannot erase other browser profiles, external downloads, the parent directory or third-party clones. Existing user data and project backups are not silently erased by the application.
- Group names and personnel aliases are project configuration; aliases remain JSON-edited. No cloud sync, authentication, collaboration, work calendars, multi-predecessor scheduling or resource-capacity calculation.
- Anonymous checks cover the seven known historical commits and source endpoints. Other platform caches and third-party copies are outside these verified endpoints.

## 简体中文

更新：2026-10-27（Asia/Shanghai）。

### 本次变更：Project XML 导入与导出

- 基于远端最新 main 移植，保留模块化源码、统一对话框、紧凑存储和现有流程；新增文案全部进入中英文词典，不增加样式覆盖或独立页面。
- 导入先预览，再以独立项目保存；导出当前字段并另存新文件。支持三级任务、整自然日、单一 FS 前置及 Lag、进度、优先级和 10 个组，不直接读写 MPP。
- 本次验证：84 项逻辑检查（现有 67 项 + XML 17 项）、构建一致性及隐私扫描通过；完整/空白/未定日期三类输出通过映射字段 Schema 子集校验。提交 `e80b4a9` 的 GitHub CI 校验和现有 25 项浏览器冒烟通过；Microsoft Project 桌面打开、另存及新增 XML 流程的实际布局仍待验收。

### 上次变更：按已合并更新补齐项目规范

- 基于 main 的 `c0f73fa`，包含 PR #2 的数据安全/源码拆分及 PR #3 的流程/界面更新。
- `docs/PUBLIC.md` 同步补齐中英文源码职责、生成构建、任务编辑、会话历史边界、归档/删除、紧凑存储、保存失败、交互无障碍及验证门禁；README 增加规范入口。
- 本次仅记录现有实现，不改变应用行为、项目包 schema 或 Excel 合约。下方历史验证仍属于原变更，不作为本次新执行结果。
- 本次验证：67 项逻辑检查、`pnpm build`、构建一致性、隐私扫描、发布生成及 `git diff --check` 通过。`pnpm lint`、`pnpm typecheck` 未定义；浏览器冒烟已尝试，但隔离工作区未安装 Playwright，不宣称新的浏览器验收。后续按规范安装固定版本后运行，并人工查看 1024/1440 px 中英文截图。

### 上次变更：审计 #1 流程与界面改进

- 结构编辑：阶段可改名（子级 WBS 与前置关系同步）、调整顺序和删除；主任务与子任务可调整顺序、移到其他父级。空阶段现在会显示在表格中（此前会被隐藏，导致新建的阶段无法继续添加内容）。新增时自动建议 WBS 编号。
- 项目：可从“项目”菜单删除（先提供 JSON 备份，工作区至少保留一个项目）；归档项目只读、在切换框中归入“已归档”，可从提示条恢复。
- 版本与变更记录对话框：查看版本、设为对比基线、恢复（可撤销）、删除（可撤销），并浏览变更记录；版本号可使用中文等任意文字。
- 撤销/重做：覆盖任务、阶段和版本操作（Ctrl+Z、Ctrl+Shift+Z / Ctrl+Y、顶部按钮显示步骤名称），切换项目时清空。
- 界面语言改为浏览器偏好，切换项目不再改变语言。
- 空项目显示三步引导；不再使用浏览器原生 alert/confirm/prompt，所有提示、确认和报错统一使用基于 `<dialog>` 的对话框（Esc 关闭、焦点进入并返回、错误就地显示）。
- 页面顶部：项目名称在前，切换框、项目菜单、撤销/重做和保存状态在同一行，空项目与有数据时高度一致。
- 表格：可在“筛选与显示”中选择列（合并的“人员”列、可选的各组列和优先级列），名称列自动占满剩余宽度，1024 和 1440 宽度下默认可见工期与进度；列选择和分栏宽度会被记住；树形展开按钮改为真正的按钮。
- 日期统一以 YYYY-MM-DD 显示和输入，并提供日历按钮。表格中修改后按 Tab 或回车，焦点保持在下一个字段（即使在重绘前继续输入）。
- 甘特图：任务条可用键盘聚焦，方向键按天移动，Shift+方向键调整工期，回车打开任务；拖拽改用 Pointer 事件（支持触控）。延期的任务条和行用红色标出，优先级标为 P1–P3，标签显示所有组的人员。
- 测试：67 项逻辑检查（新增 `tests/public/workflow.cjs` 11 项）和 25 项浏览器冒烟测试（出现任何原生弹窗即失败），冒烟测试连续 10 次通过。

### 上次变更：审计 #1 修复（数据安全与可维护性）

- 存储增长：版本快照和 Excel 恢复点只保存用户输入的字段，日期、汇总和状态在使用时重新计算；恢复点不再包含版本历史和审计日志，恢复时保留当前快照与审计。已有工作区在加载时自动压缩。实测 800 个子任务、3 个恢复点：4 个快照原占 4.1 MB（再保存一次即超出浏览器上限），现为 1.2 MB；8 个快照为 1.8 MB。
- 保存失败：一次性弹窗改为常驻横幅，提供“导出 JSON 备份”和“重试保存”，直到保存成功才消失；头部显示存储用量，超过 80% 时显示提醒。
- 人员视图：分工矩阵补齐时间轴表头，人员列不再错位（原名 RACI 已改为“主任务 × 人员分工矩阵”）。
- 可维护性：`src/index.html` 由 `scripts/build.cjs` 从 `src/app/` 的可读源码生成；删除无用代码（v1 导出及内嵌模板、未使用的 v2 构建函数、隐藏的旧输入框、旧三角色汇总、约 50 个无用文案键）；合并 CSS 覆盖层，15 个浏览器场景下所有元素的计算样式前后完全一致；全部界面文字和提示（含 80 余条原先只有英文的报错）统一来自中英双语字典；清除过时的设计注释和旧模板中的第三方主题名。
- 测试：`npm test` 检查构建是否最新并运行 56 项逻辑检查；`npm run test:e2e` 提供 15 项 Playwright 冒烟测试，CI 同步运行并上传截图。
- 未改变：排程规则、Excel v3 合约和项目数据模型。本次之前导出的工作簿可能会被提示过期一次，重新导出即可。

### 更早变更：英语优先

- README 和公开发布约定以英语为主，随后保留完整中文说明。
- HTML 初始语言标记及初始文案改为英文；继续保留中文切换、已保存的语言偏好和用户原文。Excel 数据表维持英文，中文说明保留在 Instructions_zh。
- 不改变排程、存储、导入导出及项目配置逻辑。47 项自动检查、隐私扫描和发布生成通过；静态检查确认英文初始语言、应用脚本未变和中文说明完整保留。仓库未定义 lint、typecheck、build，相关 pnpm 命令提示不存在。本次未进行新的浏览器或原生 Excel 视觉验收。

### 功能与限制

支持离线项目、三级任务、自然日 FS/Lag 排程、加权进度、甘特图、任务卡片、人员统计、1–10 个自定义组、版本快照和恢复点。Excel v3 提供受控交换，兼容旧格式；JSON 迁移要求明确的旧字段映射。

数据按浏览器和来源存储，请定期导出 JSON。人员别名仍通过 JSON 配置；尚无云同步、登录、多人协作、工作日历、多前置任务或资源容量计算。历史验证记录及详细限制见上方英文段落。
