# Project Workspace handoff

[English](#english) · [简体中文](#简体中文)

## English

Updated: 2026-10-27 (Asia/Shanghai). Application baseline: [`90168b9`](https://github.com/Greatub/project-web-tool/commit/90168b9). This handoff adds documentation and publication rules; it does not change application behavior.

### Start here

- Repository: [Greatub/project-web-tool](https://github.com/Greatub/project-web-tool), published branch `main`.
- Open `src/index.html` in modern Edge/Chrome. The app is offline and requires no installation or runtime dependencies.
- Read [README](../README.md), this handoff, [STATUS](STATUS.md) and [PUBLIC](PUBLIC.md) before changing the project. STATUS separates current verification from historical results; PUBLIC contains the public source and interface contracts.
- `src/index.html` is generated. Edit `src/app/`, then run `npm run build`. Do not edit only the generated file.
- Browser projects are user data, separate from Git. Updating or cloning the repository does not transfer them. Download a JSON backup before changing browsers, origins or file locations.

### Delivered capabilities

| Area | Current behavior |
| --- | --- |
| Projects | Create, copy, switch, configure, archive/restore and delete; keep at least one project. Archived projects are read-only. |
| Tasks | Phase → main task → sub-task; unique WBS, structural editing, natural-day scheduling, one FS predecessor, signed whole-day Lag, weighted progress. |
| Groups | 1–10 configurable groups; stable `group1`–`group10` IDs; default Group 1–3. Names/colors are configuration, not fixed roles. |
| Views | Gantt/table, task cards and people participation. Versions and change log share a dialog; do not add standalone audit/version pages without a new requirement. |
| History | Project-scoped snapshots, baselines, audit and up to three import recovery points; session undo/redo clears when switching projects. |
| Experience | Persistent Import → Edit → Export guidance; source/format explanations; import repair hints, filename and available sheet/cell/row/WBS details; corrected-file picker. |
| Save/backup | Browser save time, persistent save-failure banner, storage usage and per-project JSON download receipt. Reopening compares the receipt to current data; later edits request another backup. |
| Languages | English-first UI and built-in data, Chinese interface available. Preserve user-entered text in its original language. |

### File exchange contracts

| Format | Supported contract and limits |
| --- | --- |
| Excel | Controlled v3: Project, Plan, NewTasks, Groups, Instructions, Instructions_zh and hidden Metadata. Plan has 21 columns; NewTasks adds Parent WBS as column 22. Edit pale orange cells only. Preserve v1/v2 14-column import semantics and explicit mappings. |
| JSON | `schemaVersion=2` full project bundle: metadata, settings, current data, versions, audit, active version and recovery points. Import previews and creates an independent copy; legacy mappings must be explicit. |
| Project XML | Limited MSPDI XML mapping for current fields, three levels and one local FS predecessor per sub-task. Text1–Text10 map groups; exchange notes retain versioned configuration/mappings. Source XML stays read-only; import creates a new project. |
| MPP | No direct parser/writer. Convert through Microsoft Project XML. Native Microsoft Project open/save compatibility is not certified. |

Excel updates require the original project/revision; stale files, protected-field changes, formulas, missing rows and invalid values reject the whole batch. Validation must report the original Plan row even after summary rows are filtered. Export files have new names; the application has no source-file write handle. English workbook sheets use Arial 9 pt; Instructions_zh uses DengXian 9 pt. Workbook labels remain English regardless of UI language.

Project XML working-time schedules currently convert to calendar days using the file's start/finish dates. Preview lists conversions; milestones become one-day tasks. The app does not retain working calendars, task/resource calendar rules, date constraints or leveling behavior. Non-FS/multiple predecessors, unsupported hierarchy and finish-scheduled projects reject. XML is limited to 2 MB / 2,000 tasks; Excel input is limited to 20 MB. Read PUBLIC for detailed field/unit rules.

JSON is the full backup format. Excel/XML do not contain full project history. A JSON receipt records a **download request**, not confirmed disk persistence: the user must check the Downloads folder. Receipts store only a timestamp and SHA-256 revision under the project ID. They remain local to the browser and are not imported as proof that another browser has a backup. Language/collapse changes do not invalidate a receipt; meaningful project/history/recovery changes do. Hash or receipt-storage failure must not prevent emergency downloads.

### Source map and safety rules

| File | Responsibility / first place to inspect |
| --- | --- |
| `src/app/shell.html`, `styles.css` | Structure, design tokens and reusable components. |
| `src/app/js/i18n.js` | Both-language labels/errors through `t`; `inputError` preserves error code/arguments. |
| `src/app/js/model.js` | Validation, scheduling, compact data and bundle rules. |
| `src/app/js/storage.js` | Atomic workspace persistence, project selection, save times, JSON downloads and backup receipts. |
| `src/app/js/exchange.js` | Excel/JSON/XML exchange, preview/commit guards, workflow guides and import repair messages. |
| `src/app/js/dialogs.js` | Shared dialogs, focus handling and inline errors. |
| `src/app/js/views.js` | Rendering, translated labels, header/sidebar and display preferences. |
| `src/app/js/history.js`, `editing.js` | Undo/versions, task editing and project actions. |
| `src/app/js/boot.js` | Event wiring and initialization; keep it last in the build order. |

The scripts share state; retain the order in `scripts/build.cjs`. The workspace uses `project-web-tool:workspace:v1` with independent `projectId` bundles. Optional `workspace.savedAt` is outside exchange bundles. Candidate imports validate before a single persistent commit; guard the current project, in-memory state and saved bytes during preview. Failed persistence must not partially replace a project. Back up original bytes before migrations and validate all projects before replacing workspace storage.

Keep data, groups, versions, audit, recovery and active-version identity isolated. Async backup hashing must use the captured project/content, and stale async status results must not overwrite a newer project/status. Backup canonicalization must preserve user alias keys even when their names resemble display-state fields.

Use system fonts, shared `btn` / `ui-control`, `ui-heading` and `ui-caption`; page title 18 px/500 (16 px on narrow desktop), section title 13 px/500, body 13 px/400, controls 12 px/400, captions 11 px/400. The reusable `btn-touch` variant has a 44 px minimum height. Preserve sidebar icon alignment, 36 px task rows, capsule Gantt bars, visible focus and reduced-motion support. Switch text without changing component roles. Check English/Chinese at 1024 and 1440 px.

### Verification and development commands

Application baseline `90168b9` passed [GitHub Actions run 40461697654](https://github.com/Greatub/project-web-tool/actions/runs/40461697654):

- **95 logic checks**: 17 core, 31 Excel, 16 storage/translation/backup, 11 workflow, 20 Project XML.
- **30 browser checks**, including failed/corrected import → edit → JSON download → reload, changed-since-backup detection and bilingual control typography/geometry at two desktop widths.
- Generated-build freshness and public source/history privacy gates passed.

Manual screenshot review remains pending because CI artifact download was unavailable. Native Microsoft Project open/save/MPP conversion remains pending. Historical Open XML/Excel verification in STATUS does not constitute a new native desktop acceptance result.

Development needs Node.js 22+ and Python 3; Python is test-only. Run:

```sh
npm run prepare-hooks
npm run build
npm test
npm run privacy
node scripts/privacy-check.cjs --history
git diff --check
```

Browser tests use test-only Playwright, pinned to the CI version:

```sh
npm install --no-save playwright@1.55.0
npx playwright install chromium
npm run test:e2e
```

CI uses Ubuntu 24.04 and installs Chromium with system dependencies. Test screenshots go to ignored `test-results/`; use fictional data. Local browser/file access restrictions may prevent local acceptance: report the actual environment/results and use the existing remote CI gate, rather than claiming unperformed checks. No lint/typecheck script is currently defined.

### Publishing and continuing work

1. Inspect Git status and fetch `origin`; integrate newer `main` without overwriting local changes. The repository's public contract is the allowlist in `scripts/privacy-check.cjs`, not the entire working folder.
2. Add only reviewed generic source/docs/tests. A new public file needs both a `PUBLIC_FILES` entry and an explicit `.gitignore` exception. Do not use force-add to bypass these rules.
3. Run relevant tests and local privacy checks **before** upload. The pre-commit hook scans staged content/build freshness; pre-push scans tracked content/history and runs all logic checks. Do not bypass hooks.
4. Update STATUS with implementation, this change's actual validation and pending work. Keep historical validation clearly attributed.
5. Commit and push to the intended branch, then verify the exact pushed revision's CI. Record the commit/run when reporting completion.

The local development workspace may contain an independent Git checkout named `public-release/`. Run Git inside that checkout and keep reviewed source copies synchronized. Do not blindly initialize or upload the parent workspace. `npm run release` creates a new allowlisted `public-release/` and refuses an existing target: **do not delete an existing Git checkout to rerun it**. In a fresh clone with no target it can generate a distribution copy; it is not a substitute for committing/pushing.

Never publish real project names, task/personnel data, source workbooks, private exports, credentials, machine paths or development logs. Known-source identifier fingerprints are deliberately one-way; do not reconstruct or reintroduce removed identifiers. New data still needs review beyond scanning. Do not rewrite/delete repository history as routine maintenance; any such future operation needs its own authorization.

### Next work, in priority order

1. Manually review the English/Chinese 1024/1440 screenshots and a first-time-user walkthrough. Confirm file-picker retry, long messages, keyboard focus and backup wording.
2. Validate fictional XML in desktop Microsoft Project: open, save, convert to/from MPP, and reimport; inspect dates, Lag, groups and conversion notices. Record mismatches rather than promising a lossless round trip.
3. Custom calendars are **assessed only, not implemented**. A proposed first phase is one whole-day project calendar with weekly working days, holiday ranges and working-day exceptions, plus versioned Excel/JSON import/export and change previews. Keep existing projects on natural days by default. Decide duration/Lag units and migration rules before implementation; Project XML calendar mapping is a later phase.

## 简体中文

更新：2026-10-27（Asia/Shanghai）。应用基线为 `90168b9`；本交接阶段只更新文档及发布白名单，不改变应用行为。公开仓库分支为 `main`。

### 接手与运行

- 阅读 README、本交接文档、STATUS、PUBLIC。STATUS 区分本次与历史验证，PUBLIC 包含公开发布及设计约定。
- 用现代 Edge/Chrome 打开 `src/index.html`，即可离线使用。开发时修改 `src/app/`，执行 `npm run build`；不要只修改生成文件。
- 浏览器项目数据不在 Git 中。克隆、拉取、复制 HTML 不会迁移用户项目；换浏览器、来源或文件位置前先下载 JSON 备份。
- 本地可能同时存在开发目录与独立 Git 副本 `public-release/`。在 Git 副本内操作仓库，同步审核过的文件，不要直接上传整个上级工作目录。

### 已交付与必须保留的约束

- 支持项目创建、复制、切换、设置、归档恢复和删除；归档只读，工作区至少保留一个项目。
- 三级任务为阶段→主任务→子任务，WBS 唯一；按自然日、单一 FS 前置及整数正负 Lag 排程，进度加权汇总。组数量为 1–10，名称和颜色可自定义，稳定 ID 不随名称变化；默认 Group 1–3。
- 保留甘特图、任务卡片、人员参与三个视图。版本与变更记录使用对话框，不新增独立页面。撤销/重做限当前会话，切换项目后清空。
- 工作区上方提供导入→修改→导出指引。导入失败显示文件名和可用的表/单元格/原始行号/WBS，针对过期版本、项目不匹配和公式提供修正建议与重选文件入口。
- 显示浏览器保存时间、容量和保存失败横幅。JSON 下载状态按项目隔离，重开后比对当前内容，修改后提醒重新备份。下载记录只说明发起下载，不代表磁盘保存成功；Excel/XML 不算完整备份。
- 英文为默认界面及内置数据语言，可切中文；用户输入保持原文。沿用系统字体、统一按钮、标题、说明文字与对话框。英文/中文均检查 1024/1440 px，保留侧栏图标位置、36 px 任务行、甘特胶囊条、键盘焦点及减少动态效果支持。具体字号见上方设计约定。

### 数据交换与安全

- Excel 默认受控 v3，Plan 为 21 列，NewTasks 增加第 22 列 Parent WBS；Groups 管理 10 个稳定组槽位。保留 v1/v2 的 14 列原语义及显式映射，只修改浅橙色格。英文数据及说明使用 Arial 9 号，Instructions_zh 使用等线 9 号。
- Excel 更新须匹配原项目和版本；只读字段修改、缺行、公式、无效值等整批拒绝。错误必须使用原始表格行号，不能使用过滤汇总行后的编号。
- JSON `schemaVersion=2` 是完整项目备份，包含设置、当前数据、版本、审计及恢复点；导入预览后创建独立副本，旧格式须明确旧字段映射。
- Project XML 仅映射当前支持字段、三级结构和单一 FS 前置；Text1–Text10 对应组人员，交换备注保留带版本的配置。工作时间按源文件起止日期转换为自然日，里程碑转为一天，并在预览列出；不保留工作日历、资源日历、日期限制或资源平衡行为。非 FS、多前置、非三级结构和按完成日期排程仍拒绝。
- 不直接读写 MPP；须经 Microsoft Project 转 XML。XML 限 2 MB/2,000 个任务，Excel 输入限 20 MB。桌面 Project 打开、另存及 MPP 转换仍待实测。
- 数据、版本、审计、组、恢复点及活动版本均按 projectId 隔离。迁移先备份原始字节，全部校验通过后一次写入；导入使用候选副本并防止预览期间的数据变化，失败不能部分更新。
- JSON 下载摘要须绑定发起时的项目及内容，异步结果不能覆盖新项目状态。记录只保存时间和 SHA-256 摘要，界面语言及任务折叠不影响匹配；用户别名即使与显示状态字段同名也必须保留。摘要或记录存储失败不能阻止应急下载。
- 源文件只读，导出为新文件；真实案例、人员任务、用户导出、凭据、本机路径和开发日志不能进入公开仓库。

### 源码入口与验证

源码职责见上方表格：排程/校验在 model，持久化/备份在 storage，文件交换/引导/修正提示在 exchange，统一对话框在 dialogs，布局在 shell/styles/views，中英文文字在 i18n，历史在 history，编辑在 editing，启动在 boot。脚本共享状态，保留构建顺序。

应用基线 `90168b9` 的 [CI 40461697654](https://github.com/Greatub/project-web-tool/actions/runs/40461697654) 已通过：95 项逻辑检查、30 项浏览器检查、构建一致性及公开内容/历史脱敏扫描。浏览器场景包含错误导入→修正导入→修改→下载→重开，以及两种语言、两个桌面宽度下的控件样式和边界。人工截图复核尚未完成，因 CI 截图下载不可用；历史 Excel/Open XML 验证不能代替本次原生桌面验收。

开发需要 Node.js 22+ 与 Python 3（仅测试使用）。运行 `npm run prepare-hooks`、`npm run build`、`npm test`、`npm run privacy`、`node scripts/privacy-check.cjs --history` 和 `git diff --check`。浏览器验证使用 CI 固定的 Playwright 1.55.0，安装与命令见上方；截图和测试数据保持虚构并留在忽略目录。遇到本地浏览器访问限制时记录实际结果，使用现有远端 CI 验证，不宣称未执行的人工验收。当前未定义 lint/typecheck。

### 发布与后续

新增公开文件须同时修改 `PUBLIC_FILES` 和 `.gitignore`，禁止强制添加绕过白名单。提交前扫描，推送前通过完整回归及历史扫描，保留 hooks，更新 STATUS，推送后核对具体提交的 CI。`npm run release` 只负责生成新的白名单副本，目标已存在会拒绝；不要为了重新生成而删除已有 Git 工作副本，也不要把生成副本当成已推送。

接下来优先人工复核中英文桌面与首次使用流程，再验证 Microsoft Project 桌面往返。自定义日历目前仅完成可行性评估，尚未开发：建议第一阶段仅支持项目级整天日历、每周工作日、节假日及调休例外，增加带版本的 Excel/JSON 交换和影响预览；旧项目默认仍按自然日，先明确工期/Lag 单位及迁移规则，再考虑 XML 日历映射。

已清理的来源标识只保留单向指纹，不应重建或重新引入。扫描不替代新业务数据审核；今后重写或删除仓库历史不属于日常维护，须另有明确授权。
