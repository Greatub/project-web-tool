# Public release and interface conventions

[English](#english) · [简体中文](#简体中文)

## English

English is the primary repository and documentation language. Simplified Chinese is the secondary language. The interface starts in English unless a saved language preference applies. User text is preserved in its original language.

### Public release

Only files listed in `PUBLIC_FILES` in `scripts/privacy-check.cjs` may be published. Ignore rules exclude everything by default and allow reviewed files individually; additions require review and an allowlist update. Original sources, historical evidence, Excel cases, exports, screenshots, temporary files, machine configuration and personal context stay local.

`src/index.html` is generated from the sources in `src/app/` by `npm run build`; commit both, and `npm test` fails when they differ. Run `npm test`, `npm run privacy` and `npm run release`. Review `public-release/` and initialize the public repository from that independent, scanned copy without the original directory's history. Run `npm run prepare-hooks`: commits scan staged contents, and pushes check tracked files and all local commit history. CI runs after upload and cannot replace local scanning.

The scanner checks the allowlist, credentials, email addresses and local paths. One-way fingerprints block known source identifiers without reconstructing their names in code or tests. Embedded Excel XML is decoded and scanned too. Public source excludes original cases, people and task data. Scanning cannot cover every future input; user JSON and Excel exports are private exchange files and must stay outside the source repository.

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

扫描采用白名单和凭据、邮箱、本机路径规则；以单向指纹阻断已知来源标识，不在程序或测试中拼接还原旧名称。同时解码 HTML 内嵌 Excel XML。公开源码不包含原始案例、人员或任务数据。扫描不能覆盖所有未来输入；用户 JSON / Excel 是私有交换文件，不应上传源码仓库。

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
