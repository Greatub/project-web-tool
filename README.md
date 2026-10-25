# Project Workspace

[English](#english) · [简体中文](#简体中文)

## English

An offline project management web tool. Public source: [Greatub/project-web-tool](https://github.com/Greatub/project-web-tool).

### Quick start

Open `src/index.html` in a modern Edge or Chrome browser. No installation, dependencies or server are required. You can also serve `src/` as a static website.

English is the primary language; Simplified Chinese is available from the language button at the bottom of the sidebar. Saved language preferences are respected. Built-in project names, sample tasks and default groups use English in both languages. User-entered project names, task names and people are preserved without translation.

Data stays in the current browser. Copying the HTML does not copy your projects: export a JSON bundle regularly for backup. There is no login, server sync, collaboration or access isolation.

### Features and workflow

- Create a blank project or a fictional sample; duplicate, switch, configure or archive projects. Archiving is a reversible marker and still allows viewing and editing.
- Create a top-level family with **New phase**, then add main tasks and subtasks from the sidebar. Scheduling uses calendar days, finish-to-start dependencies and positive or negative lag.
- Review weighted progress, the Gantt chart, task cards, people participation and baseline comparisons. Snapshots and audit records stay in the project bundle; they have no separate browsing page.
- Configure 1–10 groups with names and colors in project settings. The defaults are Group 1–3. Stable IDs preserve people assignments when a group is renamed; clear assignments before removing a group. Personnel aliases are configured in JSON.

### Excel and JSON exchange

Use **Export Excel** to download a blank creation template or a copy of the current project. Edit only pale orange input cells. Import the workbook, review field changes and schedule recalculations, then confirm to apply the whole batch. After web edits, export a new file with a timestamp and random suffix; the app has no write access to the original file.

The controlled v3 template includes Project, Plan, NewTasks, Groups, Instructions and hidden Metadata sheets, plus Instructions_zh for Chinese guidance. Project contains the name and status date. Plan has 21 columns: A:K for scheduling and L:U for group1–group10. NewTasks adds column V, Parent WBS, to specify hierarchy. Groups configures ten stable slots. WBS uniquely matches workbook rows to web tasks; calculated fields are read-only.

Wrong projects, stale revisions, changed read-only fields, missing rows, formulas and invalid values reject the entire import. A failed save preserves existing data. Up to three recovery points are retained in each project before updates and can be restored from the export panel. Keep separate JSON backups for long-term storage.

Data sheets and Instructions use English in Arial 9 pt. Instructions_zh provides the Chinese translation in DengXian 9 pt, regardless of the interface language. User input is preserved. Empty Plan sheets omit empty data-validation nodes to avoid Excel repair prompts.

Legacy v1/v2 workbooks retain their original 14-column meaning and map the three personnel columns to the first three groups without clearing additional groups. Full exports use v3. JSON bundles use schemaVersion=2; legacy bundles require an explicit three-field mapping through legacyGroupFields or roleLabels. Browser migration backs up the original bytes and validates every project before one atomic write; failures preserve the original storage. JSON imports are validated and previewed, create independent copies and initiate a backup download of the current project.

See the [Excel v3.0 contract](docs/PUBLIC.md#excel-v30-controlled-exchange) for field rules and compatibility.

### Development and validation

Node.js 22 or newer is required. There are no third-party dependencies.

```sh
npm test
npm run privacy
npm run release
```

`public-release/` is an allowlisted copy for public distribution. Review it before publishing. Original cases, screenshots, old templates and development records were removed from this workspace under prior authorization. Keep user data and browser exports outside the repository; publish from the reviewed copy rather than an entire local working directory.

After initializing Git in a reviewed public copy, run `npm run prepare-hooks` to enable commit and push checks. GitHub Actions runs the same checks. The allowlist, one-way identifier fingerprints and credential scanning help block known leaks; new business data, documents and logs still require review. Do not bypass ignore rules with force-add. Exported JSON and Excel files may contain private data.

See [Current status](docs/STATUS.md) for scope and verification and [Public release and interface conventions](docs/PUBLIC.md) for the release contract.

## 简体中文

英语为仓库主要语言，简体中文为第二语言。下方保留中文说明；界面语言可在侧栏底部切换，已保存的语言偏好及用户输入原文保留。

公开源码：[Greatub/project-web-tool](https://github.com/Greatub/project-web-tool)。

通用项目管理 Web 工具。用现代 Edge / Chrome 打开 `src/index.html` 即可离线使用，无需安装依赖。也可将 `src/` 作为静态网站根目录。数据保存在当前浏览器；复制 HTML 不包含用户数据，请定期导出 JSON 版本包。

支持空白项目、虚构示例、复制、切换、归档标记、项目配置、三级任务、FS 自然日排程、正负 Lag、加权进度、甘特图、任务卡片、人员参与统计、中英文、版本快照及基线比较。版本与审计保留在数据包中，没有独立浏览页面。

首次打开为英文界面，默认项目名为 Untitled project；组名和虚构示例的默认数据也统一为英文。界面可切换中文，用户原文保留。使用“新建阶段”建立顶层，再从左侧添加主任务和子任务。项目设置提供 1–10 个自定义组，可增减、改名和选色；默认 Group 1–3，不绑定固定职位。稳定组编号保持人员关联，已分配人员的组必须先清空才能移除。人员别名仍以 JSON 配置。归档是可恢复标记，仍允许查看与编辑。

Excel 默认使用受控 v3.0 模板：从“导出 Excel”下载空白创建模板或当前项目副本，只修改浅橙色输入格；导入时先查看逐字段变更及排程重算，确认后整批应用。网页修改后重新导出带时间和随机后缀的新文件，应用没有原文件写入权限。项目不匹配、源版本过期、只读字段被改、缺行、公式或无效值均拒绝导入；保存失败不改变当前数据。更新前保留项目内最近 3 个恢复点，可从导出面板恢复。

Project 表填写名称与状态日期；Plan 修改已有任务；NewTasks 新增任务，使用 Parent WBS 明确层级；Groups 配置 10 个稳定组槽位的启用、名称和颜色。v3 Plan 有 21 列（A:K 排程字段、L:U 对应 group1–group10），NewTasks 增加 V 列 Parent WBS。Instructions 提供规则，隐藏 Metadata 明确版本、字段映射及项目身份。v1/v2 导入保留原 14 列语义，旧三个人员列映射到前三个组，额外组不会被旧导入清除；完整导出统一用 v3。详细约束见 [Excel 交换规范](docs/PUBLIC.md#excel-v30-受控交换)。JSON 项目包升级为 schemaVersion=2，旧 JSON 包按其 legacyGroupFields 或原 roleLabels 声明的三个字段顺序显式迁移；浏览器旧工作区先保存原始字节备份，校验全部项目后一次提交，失败保留原值。JSON 文件导入经校验和预览后创建独立副本，并发起当前项目备份下载。

Excel 数据表和 Instructions 固定为英文、Arial 9 号；新增 Instructions_zh 中文翻译说明表，使用等线 9 号。用户输入原文保留。按唯一 WBS 一一对应网页任务，字段与单位映射写在说明表；计算结果只读。空白 Plan 不输出空的数据验证节点，避免 Excel 修复提示。

## 开发与验证

需要 Node.js 22 或更新版本，无第三方依赖。

```sh
npm test
npm run privacy
npm run release
```

`public-release/` 是面向公开仓库的白名单副本。历史案例、截图、旧模板和开发记录已按授权从当前目录清理；用户数据与浏览器导出不应上传。应从该副本建立公开仓库，避免直接同步整个本地工作目录。

在公开副本初始化 Git 后，运行 `npm run prepare-hooks` 启用提交/推送检查。GitHub Actions 在提交后运行同样检查。白名单、单向标识指纹和凭据扫描帮助阻断已知泄漏；新加入的业务数据、文档及日志仍需人工审核，不要使用强制添加绕过忽略规则。用户导出的 JSON / Excel 可能包含私有数据，应留在仓库外。

范围与本次验证见 [状态](docs/STATUS.md)，公开及视觉约定见 [公开约定](docs/PUBLIC.md)。本工具尚无登录、服务端同步、多人协作或权限隔离。
