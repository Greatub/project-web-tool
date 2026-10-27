# Project Workspace

[English](#english) · [简体中文](#简体中文)

## English

An offline project management web tool. Public source: [Greatub/project-web-tool](https://github.com/Greatub/project-web-tool).

Maintainers: start with the [handoff guide](docs/HANDOFF.md) for the verified baseline, source map, safety contracts and next steps.

### Quick start

Open `src/index.html` in a modern Edge or Chrome browser. No installation, dependencies or server are required. You can also serve `src/` as a static website.

English is the primary language; Simplified Chinese is available from the language button at the bottom of the sidebar. The language is a preference of this browser and does not change when you switch projects. Built-in project names, sample tasks and default groups use English in both languages. User-entered project names, task names and people are preserved without translation.

Data stays in the current browser. Copying the HTML does not copy your projects: export a JSON bundle regularly for backup. The header shows how much browser storage is used. A red banner appears when a save fails and stays until data is saved again; a yellow banner warns when storage is more than 80% full. There is no login, server sync, collaboration or access isolation.

The workflow strip above the plan provides **1. Import → 2. Edit → 3. Export** help. It also shows when this project was saved in this browser and whether the current data matches the last JSON download request. A download request is not proof that the file reached disk: check your Downloads folder. Later edits require a fresh backup; Excel/XML exchanges are not full backups. Import failures include available location details, repair advice and a corrected-file picker.

### Features and workflow

- Use the **Project** menu next to the project switcher to create, duplicate, configure, archive or delete projects. Archived projects are read-only, listed under "Archived" in the switcher, and can be restored. Deleting offers a JSON backup first; the workspace always keeps at least one project.
- An empty project shows a short guide. Start with **Add phase**, then add main tasks and sub-tasks from **Task actions** in the sidebar; WBS numbers are suggested. Double-click a phase or task to edit it: rename (child WBS numbers follow), move up or down, move a task to another parent, or delete it. Scheduling uses calendar days, finish-to-start dependencies and positive or negative lag.
- Dates are shown and entered as YYYY-MM-DD; the calendar button opens the browser's date picker. In the table, Tab and Enter move to the next field after an edit. On the Gantt chart, drag a bar or focus it and use the arrow keys (Shift+arrow changes duration); delayed bars are outlined in red and priorities are labelled P1–P3.
- Undo and redo (Ctrl+Z, Ctrl+Shift+Z or the header buttons) cover task, phase and version changes made since the project was opened.
- **Versions & history** in the sidebar lists saved versions (compare as baseline, restore, delete) and the change log. Choose table columns, including a combined People column and per-group columns, under **Filters & display**; the column choice and the table/Gantt split are remembered in this browser.
- Review weighted progress, the Gantt chart, task cards, people participation and baseline comparisons. All prompts, confirmations and errors appear in the app's own dialogs.
- Configure 1–10 groups with names and colors in project settings. The defaults are Group 1–3. Stable IDs preserve people assignments when a group is renamed; clear assignments before removing a group. Personnel aliases are configured in JSON.

### Excel and JSON exchange

Use **Export Excel** to download a blank creation template or a copy of the current project. Edit only pale orange input cells. Import the workbook, review field changes and schedule recalculations, then confirm to apply the whole batch. After web edits, export a new file with a timestamp and random suffix; the app has no write access to the original file.

The controlled v3 template includes Project, Plan, NewTasks, Groups, Instructions and hidden Metadata sheets, plus Instructions_zh for Chinese guidance. Project contains the name and status date. Plan has 21 columns: A:K for scheduling and L:U for group1–group10. NewTasks adds column V, Parent WBS, to specify hierarchy. Groups configures ten stable slots. WBS uniquely matches workbook rows to web tasks; calculated fields are read-only.

Wrong projects, stale revisions, changed read-only fields, missing rows, formulas and invalid values reject the entire import. A failed save preserves existing data. Up to three recovery points are retained in each project before updates and can be restored from the export panel. A recovery point holds project data and settings only; restoring it keeps the current version snapshots and audit log. Keep separate JSON backups for long-term storage.

Data sheets and Instructions use English in Arial 9 pt. Instructions_zh provides the Chinese translation in DengXian 9 pt, regardless of the interface language. User input is preserved. Empty Plan sheets omit empty data-validation nodes to avoid Excel repair prompts.

Legacy v1/v2 workbooks retain their original 14-column meaning and map the three personnel columns to the first three groups without clearing additional groups. Full exports use v3. JSON bundles use schemaVersion=2; legacy bundles require an explicit three-field mapping through legacyGroupFields or roleLabels. Browser migration backs up the original bytes and validates every project before one atomic write; failures preserve the original storage. JSON imports are validated and previewed, create independent copies and initiate a backup download of the current project.

See the [Excel v3.0 contract](docs/PUBLIC.md#excel-v30-controlled-exchange) for field rules and compatibility.

### Microsoft Project XML exchange

Use **Import** to read a Microsoft Project XML (`.xml`) file, preview the mapped fields and create an independent project. Use **Data & versions → Export Project XML** to download a new file; source files are never overwritten. Native `.mpp` requires conversion to XML in Microsoft Project first.

The limited mapping supports three task levels, calendar dates, positive whole elapsed-day durations, single FS links, signed whole-day Lag, integer progress, priorities and ten custom groups. Group assignments use Text1–Text10; retain project/task exchange notes for configuration and inactive Lag. Files that use working time, times of day, milestones, date constraints, task calendars or leveling delays are converted to calendar days: the file's start and finish dates are kept, durations and Lag become calendar days (weekends and holidays count), and every converted task is listed in the preview. Unsupported hierarchy, multi-predecessor/non-FS links and finish-scheduled projects are still rejected. Other Project data is not retained. Native Project open/save compatibility still needs desktop acceptance. See the [Project XML contract](docs/PUBLIC.md#project-xml-exchange).

### Development and validation

Development checks require Node.js 22+ and Python 3 (standard-library XML parsing in tests only). The app itself has no third-party dependencies.

`src/index.html` is a generated single file. Edit the readable sources in `src/app/` and rebuild:

| Source | Contents |
| --- | --- |
| `src/app/shell.html` | Page markup |
| `src/app/styles.css` | Design tokens and styles |
| `src/app/js/i18n.js` | All interface text and messages (English and Chinese), `t(key, ...args)` |
| `src/app/js/model.js` | Dates, validation, scheduling, groups, project bundles |
| `src/app/js/storage.js` | Browser workspace, saving, storage usage and save banner |
| `src/app/js/dialogs.js` | Shared dialog component, messages, confirmations and form prompts |
| `src/app/js/exchange.js` | Excel and JSON import/export |
| `src/app/js/views.js` | Gantt, table and columns, cards, people views, header and sidebar |
| `src/app/js/history.js` | Undo/redo and the versions & change log dialog |
| `src/app/js/editing.js` | Task and phase editing, inline edits, Gantt drag and keys, project actions |
| `src/app/js/boot.js` | Event wiring and start-up (must stay last) |

```sh
npm run build        # regenerate src/index.html from src/app/
npm test             # build freshness check + 95 logic checks (Node.js + Python 3)
npm run test:e2e     # browser smoke test; needs: npm install --no-save playwright && npx playwright install chromium
npm run format       # optional: Prettier formatting for sources and tests
npm run privacy
npm run release
```

Add every new interface string to both languages in `src/app/js/i18n.js`; `npm test` fails when a key is missing in either language. Follow the [source and build contract](docs/PUBLIC.md#source-and-build-contract), [editing and data safety rules](docs/PUBLIC.md#editing-history-and-data-safety-contract), and [validation gates](docs/PUBLIC.md#validation-and-release-acceptance) when changing the application.

`public-release/` is an allowlisted copy for public distribution. Review it before publishing. Original cases, screenshots, old templates and development records were removed from this workspace under prior authorization. Keep user data and browser exports outside the repository; publish from the reviewed copy rather than an entire local working directory.

After initializing Git in a reviewed public copy, run `npm run prepare-hooks` to enable commit and push checks. GitHub Actions runs the same checks. The allowlist, one-way identifier fingerprints and credential scanning help block known leaks; new business data, documents and logs still require review. Do not bypass ignore rules with force-add. Exported JSON and Excel files may contain private data.

See [Current status](docs/STATUS.md) for scope and verification and [Public release and interface conventions](docs/PUBLIC.md) for the release contract.

## 简体中文

英语为仓库主要语言，简体中文为第二语言。下方保留中文说明；界面语言可在侧栏底部切换，已保存的语言偏好及用户输入原文保留。

维护交接请先阅读[交接文档](docs/HANDOFF.md)，包含验证基线、源码入口、安全约定与后续工作。

公开源码：[Greatub/project-web-tool](https://github.com/Greatub/project-web-tool)。

通用项目管理 Web 工具。用现代 Edge / Chrome 打开 `src/index.html` 即可离线使用，无需安装依赖。也可将 `src/` 作为静态网站根目录。数据保存在当前浏览器；复制 HTML 不包含用户数据，请定期导出 JSON 版本包。

工作区上方提供“1. 导入 → 2. 修改 → 3. 导出”指引，并分开显示浏览器保存时间和 JSON 下载备份状态。重开后会检查当前数据是否匹配上次下载；有修改时提示重新备份。下载记录不代表文件已保存到磁盘，请检查下载文件夹；Excel/XML 仅用于字段交换。导入失败会提供可用的问题定位、修正建议和重选文件入口。

支持空白项目、虚构示例、复制、切换、归档、删除、项目配置、三级任务、FS 自然日排程、正负 Lag、加权进度、甘特图、任务卡片、人员参与统计、中英文、版本快照及基线比较。

- 项目切换框旁的“项目”菜单可新建、复制、设置、归档或删除项目。归档项目为只读，在切换框中归入“已归档”，可随时恢复；删除前可先下载 JSON 备份，工作区始终至少保留一个项目。
- 空项目会显示简短引导：先“新建阶段”，再在侧栏“任务操作”中添加主任务和子任务，WBS 编号会自动建议。双击阶段或任务即可编辑：改名（子级编号随之更新）、上移/下移、移到其他父级或删除。
- 日期统一以 YYYY-MM-DD 显示和输入，日历按钮可打开浏览器日期选择器。表格中修改后按 Tab 或回车会移动到下一个字段。甘特图上可拖拽任务条，或选中后用方向键改期（Shift+方向键调整工期）；延期任务条以红框标出，优先级标为 P1–P3。
- 撤销/重做（Ctrl+Z、Ctrl+Shift+Z 或页面顶部按钮）覆盖打开项目后的任务、阶段和版本操作。
- 侧栏“版本与记录”列出已保存版本（设为对比基线、恢复、删除）和变更记录。“筛选与显示”中可选择表格列（含合并的“人员”列和各组单独列），列选择和表格/甘特分栏宽度会记在此浏览器中。
- 所有提示、确认和报错都使用应用内对话框。界面语言是此浏览器的偏好，切换项目时不会改变。

首次打开为英文界面，默认项目名为 Untitled project；组名和虚构示例的默认数据也统一为英文。界面可切换中文，用户原文保留。项目设置提供 1–10 个自定义组，可增减、改名和选色；默认 Group 1–3，不绑定固定职位。稳定组编号保持人员关联，已分配人员的组必须先清空才能移除。人员别名仍以 JSON 配置。

Excel 默认使用受控 v3.0 模板：从“导出 Excel”下载空白创建模板或当前项目副本，只修改浅橙色输入格；导入时先查看逐字段变更及排程重算，确认后整批应用。网页修改后重新导出带时间和随机后缀的新文件，应用没有原文件写入权限。项目不匹配、源版本过期、只读字段被改、缺行、公式或无效值均拒绝导入；保存失败不改变当前数据。更新前保留项目内最近 3 个恢复点，可从导出面板恢复。

Project 表填写名称与状态日期；Plan 修改已有任务；NewTasks 新增任务，使用 Parent WBS 明确层级；Groups 配置 10 个稳定组槽位的启用、名称和颜色。v3 Plan 有 21 列（A:K 排程字段、L:U 对应 group1–group10），NewTasks 增加 V 列 Parent WBS。Instructions 提供规则，隐藏 Metadata 明确版本、字段映射及项目身份。v1/v2 导入保留原 14 列语义，旧三个人员列映射到前三个组，额外组不会被旧导入清除；完整导出统一用 v3。详细约束见 [Excel 交换规范](docs/PUBLIC.md#excel-v30-受控交换)。JSON 项目包升级为 schemaVersion=2，旧 JSON 包按其 legacyGroupFields 或原 roleLabels 声明的三个字段顺序显式迁移；浏览器旧工作区先保存原始字节备份，校验全部项目后一次提交，失败保留原值。JSON 文件导入经校验和预览后创建独立副本，并发起当前项目备份下载。

Excel 数据表和 Instructions 固定为英文、Arial 9 号；新增 Instructions_zh 中文翻译说明表，使用等线 9 号。用户输入原文保留。按唯一 WBS 一一对应网页任务，字段与单位映射写在说明表；计算结果只读。空白 Plan 不输出空的数据验证节点，避免 Excel 修复提示。

## Project XML 导入与导出

在“导入”中选择 XML，预览后创建独立项目；通过“数据与版本 → 导出 Project XML”另存当前字段。源文件只读；不直接读写 MPP。支持三级结构、单一 FS 前置、Lag、进度、优先级及 10 个组。使用工作日历、时刻、里程碑、日期约束、任务日历或资源平衡延迟的文件统一换算为日历日：保留文件中的开始/完成日期，工期和 Lag 按日历日计（含周末和节假日），预览逐条列出换算。不支持的层级、非 FS/多前置和按完成日期排程的项目仍拒绝。Microsoft Project 桌面打开/另存仍待实测。详见 [Project XML 交换规范](docs/PUBLIC.md#project-xml-交换)。

## 开发与验证

开发检查需要 Node.js 22+ 和 Python 3（仅用于标准库 XML 测试），应用本身无第三方依赖。

`src/index.html` 是生成的单文件。请修改 `src/app/` 下的源码（页面结构、样式、`js/` 下按职责拆分的脚本），再运行构建：

```sh
npm run build        # 由 src/app/ 重新生成 src/index.html
npm test             # 构建一致性检查 + 95 项逻辑检查（Node.js + Python 3）
npm run test:e2e     # 浏览器冒烟测试；需先 npm install --no-save playwright && npx playwright install chromium
npm run privacy
npm run release
```

所有界面文字和提示统一写在 `src/app/js/i18n.js`，中英文必须同时提供；缺少任一语言时 `npm test` 会失败。修改应用须遵循[源码与构建规范](docs/PUBLIC.md#源码与构建规范)、[编辑及数据安全规则](docs/PUBLIC.md#编辑历史与数据安全规范)和[验证门禁](docs/PUBLIC.md#验证与发布验收规范)。页面顶部显示浏览器存储用量；保存失败时出现红色横幅并保持到再次保存成功，用量超过 80% 时出现黄色提醒。恢复点只保存项目数据和设置，恢复时保留当前的版本快照与审计记录。

`public-release/` 是面向公开仓库的白名单副本。历史案例、截图、旧模板和开发记录已按授权从当前目录清理；用户数据与浏览器导出不应上传。应从该副本建立公开仓库，避免直接同步整个本地工作目录。

在公开副本初始化 Git 后，运行 `npm run prepare-hooks` 启用提交/推送检查。GitHub Actions 在提交后运行同样检查。白名单、单向标识指纹和凭据扫描帮助阻断已知泄漏；新加入的业务数据、文档及日志仍需人工审核，不要使用强制添加绕过忽略规则。用户导出的 JSON / Excel 可能包含私有数据，应留在仓库外。

范围与本次验证见 [状态](docs/STATUS.md)，公开及视觉约定见 [公开约定](docs/PUBLIC.md)。本工具尚无登录、服务端同步、多人协作或权限隔离。
