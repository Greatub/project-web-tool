# Public release and interface conventions

[English](#english) · [简体中文](#简体中文)

## English

English is the primary repository and documentation language. Simplified Chinese is the secondary language. The interface starts in English unless a saved language preference applies. User text is preserved in its original language.

### Public release

Only files listed in `PUBLIC_FILES` in `scripts/privacy-check.cjs` may be published. Ignore rules exclude everything by default and allow reviewed files individually; additions require review and an allowlist update. Original sources, historical evidence, Excel cases, exports, screenshots, temporary files, machine configuration and personal context stay local.

`src/index.html` is generated from the sources in `src/app/` by `npm run build`; commit both, and `npm test` fails when they differ. Run `npm test`, `npm run privacy` and `npm run release`. Review `public-release/` and initialize the public repository from that independent, scanned copy without the original directory's history. Run `npm run prepare-hooks`: commits scan staged contents, and pushes check tracked files and all local commit history. CI runs after upload and cannot replace local scanning.

The scanner checks the allowlist, credentials, email addresses and local paths. One-way fingerprints block known source identifiers without reconstructing their names in code or tests. Embedded Excel XML in older revisions is decoded during history scans too. Public source excludes original cases, people and task data. Scanning cannot cover every future input; user JSON and Excel exports are private exchange files and must stay outside the source repository.

### Source and build contract

The application remains an offline, framework-free single HTML file with no runtime dependencies. Development uses the readable sources below; `src/index.html` is the generated distribution, not the editing entry point. Edit sources, run `npm run build`, and commit sources and generated output together. Do not add remote scripts, fonts or runtime services to the offline build.

| Source | Responsibility |
| --- | --- |
| `src/app/shell.html`, `src/app/styles.css` | Markup, design tokens, shared components and layout |
| `src/app/js/i18n.js` | English and Chinese interface strings and messages through `t(key, ...args)` |
| `src/app/js/model.js` | Date rules, validation, scheduling, groups and bundle schema |
| `src/app/js/storage.js` | Workspace persistence, project selection, compact stored data and save status |
| `src/app/js/dialogs.js` | Shared application dialogs, confirmations, prompts and inline errors |
| `src/app/js/exchange.js` | Excel/JSON validation, preview, import, export and recovery |
| `src/app/js/views.js` | Header/sidebar, table, Gantt, cards, people view and display preferences |
| `src/app/js/history.js` | Session undo/redo, saved versions and change log dialog |
| `src/app/js/editing.js` | Task/phase edits, project actions, inline editing and Gantt interaction |
| `src/app/js/boot.js` | Event wiring and initialization; keep it last |
| `scripts/build.cjs` | Deterministic source assembly and generated-file freshness check |

Keep the script order declared in `scripts/build.cjs`; these scripts share application state and are not independently loaded modules. The shell must retain exactly one styles marker and one scripts marker. Additions to the build sources must also be reviewed in the public allowlist and ignore rules. Never hand-patch only the generated HTML. Every new interface string, error, accessible label or dialog action must have both English and Chinese entries; preserve user text rather than translating it.

### Editing, history and data safety contract

- Keep three task levels: phase (Family), main task and sub-task. Empty phases must remain visible and usable. Suggest WBS values when adding items; retain validation for uniqueness, hierarchy, dates and dependencies.
- Task-data edits use the candidate-copy validation and scheduling path in `transactionalEdit` before replacing live tasks. A rejected edit must not change live task data or add an undo step. Renaming a WBS must update matching descendant prefixes and predecessor references together; reordering and reparenting must preserve valid task relationships and scheduling.
- Undo/redo covers task, phase and version changes in the current session, with at most 50 undo steps. A new recorded edit clears redo; opening a project clears history. It is not a persistent backup or a workspace-wide undo for project deletion, settings or imports. Do not intercept native text editing or run history shortcuts while an application dialog is open.
- Saved versions support non-Latin tags, baseline comparison, restore and deletion. Restore and deletion are undoable. Keep versions and the recorded change log in the sidebar's shared dialog. The people assignment matrix describes actual assignments; do not label it RACI without a responsibility model.
- Archived projects are read-only until restored; guard mutation paths as well as visible controls. Group them in the switcher and expose restoration. Project deletion requires an application confirmation and offers a JSON backup first; deleting the last project creates a blank replacement. Session undo is not deletion recovery.
- Workspace persistence is an atomic write. Failed writes preserve the previous saved workspace; in-memory edits may remain unsaved. Keep the failure banner visible until a successful save, with JSON backup and retry actions. Corrupted storage must remain intact with automatic saving paused. Preserve the header's usage indicator and warn at or above 80% of the application's estimated storage budget; it is not a guaranteed browser quota measurement.
- Store only input fields in version and recovery task data; recalculate derived dates, status and roll-ups when used. Recovery points must not recursively embed versions or audit history. Restoring an Excel recovery point retains current versions and audit, as well as the pre-restore recovery state. Structural compaction can change source revision digests: instruct users to export a fresh update workbook when an old one is stale.
- Language, column visibility and split width are browser preferences. Opening another project must not change the interface language. Project data and group configuration remain isolated; preserve schemaVersion=2, the ten stable group IDs and the Excel compatibility rules below.

### Interaction and accessibility acceptance

Keep the project name prominent, with project selection, Project menu, undo/redo and save status in a stable header for both empty and populated projects. An empty workspace offers Add phase, Import and fictional demo actions. Use the shared `<dialog>` component for every message, confirmation and prompt; Esc closes it, focus enters and returns to the opener, and validation errors stay inline. Do not reintroduce browser-native dialogs.

Dates display and accept YYYY-MM-DD in both languages, with a calendar action opening the browser picker. After inline edits, Tab and Enter retain the next field's focus and any typing entered before re-render. Table columns are configurable, including combined People, optional per-group columns and priority; the name column fills remaining space. Preserve remembered column/split preferences, visible duration/progress at 1024 and 1440 px, and real tree-toggle buttons with expanded state.

Gantt bars remain keyboard-focusable: arrow keys move by one calendar day, Shift+arrow adjusts duration, and Enter opens the task. Pointer dragging and keyboard edits share validated scheduling behavior, including predecessor lag. Preserve touch input, delayed row/bar marking, P1–P3 priority labels and people from every group in labels. New interactions must remain usable in both languages with visible focus and the shared sizing tokens.

### Validation and release acceptance

Use Node.js 22 or newer. The current baseline has 67 logic checks and a 25-check browser smoke suite; record the actual counts and results for each change rather than treating these numbers as fixed requirements.

| Gate | Command and acceptance |
| --- | --- |
| Generated distribution | `npm run build`, then `npm run check:build`; generated output must match sources |
| Logic and contracts | `npm test`; build freshness, core/scheduling, Excel, storage and workflow checks must pass |
| Browser behavior | `npm run test:e2e`; check 1024/1440 px, all views, language, edits, Gantt, dialogs, storage failure and reload; native dialogs and browser errors fail the suite |
| Public contents | `npm run privacy`; scan every allowlisted source and generated file |
| Commit/push | `node scripts/privacy-check.cjs --staged`, `--tracked` and `--history` at their corresponding Git stages; enable hooks with `npm run prepare-hooks` |
| Release copy | `npm run release`; creates a fresh allowlisted `public-release/` and refuses an existing directory; review the result before publishing |

Playwright is test-only. Match CI's pinned setup: `npm install --no-save playwright@1.55.0` and `npx playwright install chromium` locally; CI installs Chromium with `--with-deps` on Ubuntu 24.04. The `verify` job runs logic and privacy gates; `browser-smoke` runs browser checks and uploads `test-results/` screenshots even on failure. Screenshots, browser downloads and dependencies remain outside the public allowlist. `npm run format` is optional formatting, not a lint or type-check gate. The repository currently defines build but no lint or typecheck scripts; report unavailable commands and remaining manual checks explicitly. Passing automation does not establish native Excel acceptance or replace manual screenshot review for visual changes.

### Data and compatibility

A random projectId identifies each project; its name is not a storage key. Tasks, configuration, snapshots and audit records live inside the project bundle. Workspace writes are atomic. Failed writes do not switch the active project. Corrupted storage is preserved and automatic saving pauses. Legacy application storage is not automatically adopted.

Project bundle schemaVersion=2 uses stable group1–group10 task fields and settings.groups for enabled group names and colors. Three neutral groups are enabled by default. Renaming preserves assignments; settings are isolated per project. Legacy schemaVersion=1 bundles migrate tasks, snapshots and recovery points using the three-field order declared by legacyGroupFields or roleLabels. Missing or ambiguous mappings reject import.

Legacy browser workspaces are backed up byte-for-byte; every project is validated before a single write. Failed backup or commit preserves storage and pauses automatic saving. Structural upgrades can invalidate old update workbook digests; re-export after upgrading.

Excel v1.0 retains 14 columns and their meanings: WBS, Level, Task / Sub-task, Predecessor, Lag, Priority, Starting Date, Delivery Date, Days, % Complete, Status and three original personnel-role columns. Display names are configurable; legacy headers are read from the input and validated without embedding source-specific names. New formats require a version marker and explicit mappings.

### Excel v3.0 controlled exchange

Use **Export Excel** for a blank creation template or a current-project copy. Keep the six required sheets and their headers: Project, Plan, NewTasks, Groups, Instructions and Metadata. New exports also include Instructions_zh. Edit only pale orange cells. Save a working copy in Excel before importing it. The app reads the selected file and downloads exports under new filenames; it has no source-file write handle. Sheet protection prevents accidental editing; it is not encryption. External manual overwrites are outside the app's control.

Data sheets and Instructions use English, Arial 9 pt. Instructions_zh is a Chinese translation in DengXian 9 pt. Both are independent of the interface language. Earlier v2 files without the Chinese sheet remain importable. Instructions_zh is read-only and excluded from business-field mappings, but formulas and errors in it still reject import. User project names, task names and people are never automatically translated.

WBS uniquely matches each record to a web task. Parent WBS defines hierarchy rather than row position. Instructions explains all 21 columns and stable group IDs. Progress is stored as 0–1 in Excel and 0–100 internally; dates map to the same ISO calendar day. Delivery dates, statuses, summaries and start dates with predecessors are calculated by the same scheduler and exported as gray read-only values.

| Sheet | Editable inputs and constraints |
| --- | --- |
| Project | B2 project name; B3 status date as an Excel date or YYYY-MM-DD. Keep field names unchanged. |
| Plan | 21 columns. C names are editable. Subtasks also allow D:F, I:J and L:U; G only if the original task has no predecessor. A/B identity, H delivery, K status and other summary fields are read-only. Keep every original row. |
| NewTasks | 21 columns plus V Parent WBS; 200 prepared rows. WBS must be unique text. Level is Family / Main Task / Sub-task. Families have no parent, main tasks belong to families, and subtasks belong to main tasks. Row order is flexible. Summary rows accept only A:C/V. Subtasks leave H/K blank and G blank when a predecessor exists. |
| Groups | Fixed group1–group10 IDs are read-only. Enabled is Yes/No; Name and Color are editable. Enable 1–10 groups, with unique names of 1–60 characters and #RRGGBB colors. Disabled groups must have no personnel assignments. |
| Instructions | Read-only input formats, workflow and limitations. |
| Instructions_zh | Read-only Chinese translation in DengXian 9 pt; excluded from business data import. |
| Metadata | Hidden JSON contract: format, version=3, mode, projectId, baseRevision, explicit 21/22-column headers and mappings, maxGroups=10. Do not edit. |

Enter progress as 25% or 0.25, not numeric 25. Lag is a signed integer, duration a positive integer, priority 1/2/3 and people separated by semicolons. Blank subtask people clear assignments; blank dates/durations mean TBC, and blank lag/progress mean zero. Scheduling uses calendar days and FS/Lag. Formulas, external links, error cells, duplicate IDs, invalid hierarchy, dependency cycles, missing rows and edited read-only cells reject the whole batch. Deleting Plan rows cannot delete tasks.

Update templates bind projectId and a SHA-256 source revision digest. Re-export after changes to web data, configuration, versions or audit. Each blank creation template import creates an independent project. Import validates and recalculates a candidate copy, then previews before/after values and derived changes. Cancellation does not save. Changes to memory or saved workspace during preview reject the commit.

Each project retains up to three recovery points before updates. A recovery point stores project data and settings only (user-entered task fields; derived dates and roll-ups are recalculated); version snapshots are stored the same compact way. Restoring keeps the current snapshots and audit log and also preserves the state before restoration. Candidate data, recovery points and audit commit through a single localStorage write; failures never partially update data. Recovery points still depend on browser storage, so export JSON for long-term backups.

v1.0 has no project identity or revision digest and only updates existing subtasks after an explicit target choice, retaining its 14-column contract. v2 retains the 14/15-column, three-role contract and explicitly adapts it to the first three stable groups. v3 uses 21/22 columns and all ten groups as the current full export format. None of these formats accepts formula inputs, Excel macros or external connections.

### Visual and language conventions

Keep the established design: system fonts; page titles 18px/500, or 16px on narrow desktops; section/dialog headings 13px/500; body and inputs 13px/400; controls 12px/400; hints and table headings 11px/400. Use shared `.ui-title`, `.ui-heading`, `.ui-caption` and `.btn` classes. Preserve the warm-stone Gantt background, 36px rows and capsule task bars. A single group uses its configured color; multiple groups use stripes in their configured colors. Names and colors come from project settings.

Keep the full-height sidebar, three views and language switch at the bottom. Versions and the change log open in a dialog from the sidebar; do not add separate version/audit pages. All prompts, confirmations and errors use the shared in-app dialog (`src/app/js/dialogs.js`); never the browser's alert/confirm/prompt. Dates are displayed and entered as YYYY-MM-DD in every language. The interface language is a per-browser preference, not a project setting. Archived projects are read-only. Standard editing and dialog actions are at least 44px; Gantt inline inputs remain 28px and lightweight people-navigation actions 32px. Wide tables scroll inside their containers, dates stay on one line and focus remains visible. English and Chinese share components; user data is not translated.

Original local designs are reference material only. This public contract excludes source people, organizations, tasks and personal paths.

## 简体中文

公开仓库仅允许 `scripts/privacy-check.cjs` 中 PUBLIC_FILES 列出的文件。忽略规则默认排除所有内容，再逐项开放；新文件需要审核并修改白名单。原始来源、历史证据、Excel 案例、导出包、截图、临时文件、机器配置和个人上下文保留本地。

`src/index.html` 由 `npm run build` 从 `src/app/` 源码生成，两者需一并提交，不一致时 `npm test` 失败。运行 `npm test`、`npm run privacy`、`npm run release`，审核 `public-release/` 后从该副本建立公开仓库。执行 `npm run prepare-hooks`，提交时扫描暂存内容，推送前检查已跟踪内容及所有本地提交历史。CI 在上传后运行，不能代替本地扫描。公开仓库必须从已扫描的独立副本初始化，不携带原始目录的历史。

扫描采用白名单和凭据、邮箱、本机路径规则；以单向指纹阻断已知来源标识，不在程序或测试中拼接还原旧名称。扫描历史修订时同时解码旧 HTML 内嵌的 Excel XML。公开源码不包含原始案例、人员或任务数据。扫描不能覆盖所有未来输入；用户 JSON / Excel 是私有交换文件，不应上传源码仓库。

## 源码与构建规范

应用继续作为离线、无框架、无运行时依赖的单文件 HTML 分发。开发入口为 `src/app/` 的可读源码，`src/index.html` 是构建产物。修改源码后运行 `npm run build`，源码与产物一并提交；不得仅手改生成 HTML，也不向离线构建加入远程脚本、字体或运行时服务。

| 源码 | 职责 |
| --- | --- |
| `src/app/shell.html`、`src/app/styles.css` | 页面结构、设计令牌、共享组件及布局 |
| `src/app/js/i18n.js` | 经 `t(key, ...args)` 提供中英文界面文案及提示 |
| `src/app/js/model.js` | 日期、校验、排程、组及项目包模型 |
| `src/app/js/storage.js` | 工作区持久化、项目切换、紧凑存储及保存状态 |
| `src/app/js/dialogs.js` | 应用内对话框、确认、输入提示及就地报错 |
| `src/app/js/exchange.js` | Excel/JSON 校验、预览、导入导出及恢复 |
| `src/app/js/views.js` | 头部、侧栏、表格、甘特、卡片、人员视图及显示偏好 |
| `src/app/js/history.js` | 会话撤销/重做、版本及变更记录对话框 |
| `src/app/js/editing.js` | 任务/阶段编辑、项目操作、行内编辑及甘特交互 |
| `src/app/js/boot.js` | 事件绑定与初始化，必须最后加载 |
| `scripts/build.cjs` | 确定性源码拼装及产物一致性检查 |

保持构建脚本中的加载顺序；各脚本共享应用状态，并非独立加载的模块。页面模板必须各保留一个样式和脚本构建标记。新增构建源码须同步审核公开白名单及忽略规则。所有新增界面文字、错误、无障碍标签和操作均须提供中英文；用户输入原文不翻译。

## 编辑、历史与数据安全规范

- 保持阶段（Family）、主任务、子任务三级结构，空阶段必须可见且可继续添加内容。新增时建议 WBS 编号，并保留唯一性、层级、日期及依赖校验。
- 任务数据变更须经 `transactionalEdit` 的候选副本校验与排程后才替换当前数据；拒绝的编辑不得改变当前任务或新增撤销步骤。WBS 改名须同步更新匹配的子级前缀和前置引用；排序和更换父级须保持有效层级及排程。
- 撤销/重做只覆盖当前会话的任务、阶段和版本操作，最多保留 50 步撤销。新增已记录编辑清空重做，打开项目清空历史；不作为持久备份，也不覆盖项目删除、设置或导入等整个工作区操作。输入框原生编辑及应用对话框打开时不得被历史快捷键干扰。
- 保存版本允许中文等非拉丁字符标签，支持基线比较、恢复和删除；恢复和删除可撤销。版本和变更记录保留在侧栏打开的共享对话框中。人员矩阵反映实际分工，没有职责模型时不得称为 RACI。
- 归档项目恢复前只读，既约束可见控件，也约束数据变更入口；切换框分组显示并提供恢复入口。删除项目须在应用内确认并先提供 JSON 备份；删除最后一个项目时创建空白替代项目。会话撤销不作为项目删除恢复途径。
- 工作区持久化为原子写入，失败时保留上次已保存的工作区；内存编辑可能尚未保存。失败横幅保持到保存成功，提供 JSON 备份和重试；存储损坏保留原值并暂停自动保存。头部显示用量，达到应用估算预算的 80% 时提醒；估算值不代表浏览器保证的实际配额。
- 版本和恢复点的任务数据只存输入字段，使用时重算派生日期、状态和汇总；恢复点不得递归包含版本和审计历史。恢复 Excel 恢复点时保留当前版本、审计及恢复前状态。结构压缩可能改变源版本摘要，旧工作簿提示过期时须引导重新导出。
- 语言、列显示和分栏宽度属于浏览器偏好，打开其他项目不得改变界面语言。项目数据和组配置继续隔离，保持 schemaVersion=2、十个稳定组编号及下方 Excel 兼容规则。

## 交互与无障碍验收规范

突出项目名称，项目切换、项目菜单、撤销/重做及保存状态位于稳定头部，空项目和有数据时高度一致。空项目提供新建阶段、导入、虚构示例引导。所有消息、确认和输入均使用共享 `<dialog>`：Esc 关闭、焦点进入并返回打开控件、校验错误就地显示，不恢复浏览器原生弹窗。

中英文日期均以 YYYY-MM-DD 显示和输入，日历按钮打开浏览器选择器。行内编辑后 Tab/回车保持下一字段焦点及重绘前继续输入的内容。表格支持合并人员列、各组单独列、优先级等列配置，名称列占剩余空间；保留列选择和分栏宽度，1024/1440 px 下默认可见工期及进度，树形展开使用带展开状态的真正按钮。

甘特条可键盘聚焦：方向键按自然日移动、Shift+方向键调工期、回车打开任务；Pointer 拖拽和键盘编辑共享经校验的排程逻辑（含前置 Lag）。保留触控、延期行/条标记、P1–P3 标签以及全部组的人员标签。新增交互须在双语下可用，并遵循焦点和共享尺寸规则。

## 验证与发布验收规范

使用 Node.js 22 或更新版本。目前基线为 67 项逻辑检查和 25 项浏览器冒烟检查；每次记录实际执行的数量和结果，不将数量固定为验收条件。

| 检查 | 命令与验收要求 |
| --- | --- |
| 构建产物 | `npm run build` 后运行 `npm run check:build`，产物必须与源码一致 |
| 逻辑及合约 | `npm test`，通过构建一致性、核心排程、Excel、存储及流程检查 |
| 浏览器行为 | `npm run test:e2e`，覆盖 1024/1440 px、各视图、语言、编辑、甘特、对话框、保存失败及刷新；原生弹窗或浏览器报错即失败 |
| 公开文件 | `npm run privacy`，扫描全部白名单源码及产物 |
| 提交/推送 | 在相应 Git 阶段执行 `node scripts/privacy-check.cjs --staged`、`--tracked`、`--history`；用 `npm run prepare-hooks` 启用钩子 |
| 发布副本 | `npm run release`，创建新的白名单 `public-release/`，已有目录时拒绝覆盖；发布前审核结果 |

Playwright 仅用于测试。对齐 CI 固定配置：本地执行 `npm install --no-save playwright@1.55.0` 及 `npx playwright install chromium`；CI 在 Ubuntu 24.04 使用 `--with-deps` 安装 Chromium。`verify` 执行逻辑和隐私门禁，`browser-smoke` 执行浏览器检查，并在失败时也上传 `test-results/` 截图。截图、浏览器下载及依赖不纳入公开白名单。`npm run format` 仅为可选格式化，不能替代 lint 或类型检查。仓库目前有 build，无 lint/typecheck 脚本，必须明确记录无法执行项及人工检查。自动化通过不代表原生 Excel 验收，视觉变更仍须人工查看截图。

## 数据与兼容

projectId 为随机身份，名称不作为存储键。任务、配置、快照、审计在项目包内，工作区一次写入提交；写入失败不切换目标项目。存储损坏保留原值，暂停自动保存。不自动接管旧程序存储。

项目包 schemaVersion=2：任务使用 group1–group10 稳定字段，settings.groups 保存启用的组名称及配色，默认仅三个中性组。组改名不修改人员关联；配置按项目隔离。旧 schemaVersion=1 按 legacyGroupFields 或其 roleLabels 声明的三个字段顺序迁移任务、快照和恢复点；缺少或含糊的映射拒绝导入。旧浏览器工作区先按原始字节备份，所有项目校验成功后整批写入；备份或提交失败时保留原存储并暂停自动保存。旧更新工作簿的摘要可能因结构升级过期，升级后请重新导出更新模板。

Excel v1.0 保留 14 列顺序和语义：WBS、Level、Task / Sub-task、Predecessor、Lag、Priority、Starting Date、Delivery Date、Days、% Complete、Status、原有三个人员角色列。界面名称配置化，旧表头从输入文件读取并验证，不内嵌来源名称。新格式必须有版本标记和显式映射。

### Excel v3.0 受控交换

从工具的“导出 Excel”选择空白创建模板或当前项目副本。保留 Project、Plan、NewTasks、Groups、Instructions、Metadata 六张必要工作表及表头，新导出另附 Instructions_zh 中文说明表，仅编辑浅橙色格。请先在 Excel 中另存为工作副本，再导入工具；应用只读取所选文件内容，并以新文件名下载导出结果，没有源文件写入句柄。工作表保护用于防误操作，不是加密。浏览器或用户在外部手动覆盖文件的行为不由应用控制。

数据表及 Instructions 固定使用英文、Arial 9 pt；Instructions_zh 为对应的中文翻译，整表使用等线 9 pt，两者与网页当前语言无关。此前不含中文说明表的 v2 文件仍可导入。中文说明表只读且不参与业务字段映射，表内公式和错误值仍会被拒绝。用户填写的项目、任务和人员原文保留，不自动翻译。以 WBS 为唯一对应键，每条输入记录对应一个网页任务；Parent WBS 只决定层级，不按行号绑定。Instructions 内列明 21 列与稳定组编号的映射。进度在 Excel 存储为 0–1，在网页内部为 0–100；日期转换为同一天的 ISO 日期。交付日期、状态、汇总及有前置任务的开始日期由同一排程逻辑计算，作为灰色只读结果导出。

| 工作表 | 允许输入与约束 |
| --- | --- |
| Project | B2 项目名称，B3 状态日期（Excel 日期或 YYYY-MM-DD）；字段名不可改 |
| Plan | 21 列；C 名称可编辑；子任务另可修改 D:F、I:J、L:U，G 仅原任务无前置时可修改。A/B 身份、H 交付日期、K 状态及其余汇总字段只读；保留所有原行 |
| NewTasks | 21 列加 V Parent WBS，预置 200 行；WBS 必须为唯一文本编号，Level 为 Family / Main Task / Sub-task。Family 无父级，Main Task 父级为 Family，Sub-task 父级为 Main Task；输入顺序不限。汇总级只填 A:C/V；子任务 H/K 留空，有前置时 G 留空 |
| Groups | 固定 group1–group10，编号只读；Enabled 为 Yes/No，Name 和 Color 可编辑。启用 1–10 个组，名称唯一且 1–60 字符，颜色为 #RRGGBB；禁用组不可有人员分配 |
| Instructions | 输入格式、流程及限制，只读 |
| Instructions_zh | Instructions 的中文翻译（等线 9 pt），只读说明，不参与数据导入 |
| Metadata | 隐藏 JSON 合约；format、version=3、mode、projectId、baseRevision、21/22 列表头及字段显式映射、maxGroups=10。不可改 |

进度输入 25% 或 0.25，不能填数值 25；Lag 为有符号整数，工期为正整数，Priority 为 1/2/3；人员用分号分隔。子任务空人员清除值，空日期/工期为未定，空 Lag/进度为零。任务日期按自然日和 FS/Lag 重算。公式、外链、错误单元格、重复编号、错误层级、循环依赖、缺行或只读格改动均整批拒绝；不能通过删 Plan 行删除任务。

更新模板绑定 projectId 与导出时的 SHA-256 源版本摘要；网页数据、配置、版本或审计变化后须重新导出。空白创建模板每次创建独立项目。导入在候选副本中校验和重算，预览包含修改前后值及派生变化；取消不保存。预览期间内存或已保存工作区变化时拒绝提交。导入前最多保留三个项目内恢复点，恢复也保留恢复前状态；候选数据、恢复点和审计通过一次 localStorage 写入提交，写入失败不部分更新。恢复点仍依赖浏览器存储，长期备份应另存 JSON。

v1.0 无项目身份和源版本摘要，只允许明确选择目标后更新既有子任务；保留 14 列兼容性。v2 保留 14/15 列及原三角色语义，通过显式适配映射前三个稳定组；v3 为 21/22 列，支持全部 10 组，作为当前统一导出格式。三种格式都不支持以公式作为输入，也不导入 Excel 宏或外部连接。

## 视觉与文字

继承来源最新设计契约：系统字体；页面标题 18px/500、窄桌面 16px；章节/弹窗 13px/500；正文与输入 13px/400；控件 12px/400；说明/表头 11px/400。共享 `.ui-title`、`.ui-heading`、`.ui-caption`、`.btn`。暖石甘特背景、36px 行高、胶囊任务条保留；单组显示配置颜色，多组采用对应颜色条纹，组名和颜色来自项目配置。

全高侧栏、三个视图、底部语言切换；版本与变更记录在侧栏打开的对话框中查看，不另设独立页面；所有提示、确认和报错统一使用应用内对话框（`src/app/js/dialogs.js`），不使用浏览器 alert/confirm/prompt。日期在各语言下均以 YYYY-MM-DD 显示和输入。界面语言是浏览器偏好，不随项目变化。归档项目为只读。标准编辑及弹窗操作至少 44px；甘特行内输入保留 28px；轻量人员跳转操作 32px。宽表在容器内滚动、日期不换行、焦点可见。中英文共享组件，用户数据不翻译。

本地原始设计仅供参考；此公开约定不包含来源人员、组织、任务或个人路径。
