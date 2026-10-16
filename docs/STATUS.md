# Current status

Updated: 2026-10-17 (Asia/Shanghai).

## Implemented

- Offline project workspace with project-scoped tasks, settings, snapshots, audit, active versions and recovery points; atomic persistent writes and failure protection.
- Natural-day FS/Lag scheduling, three task levels, weighted progress, Gantt, cards and people participation; 1–10 configurable groups with stable IDs.
- English initial UI, English built-in project/sample/group values in both interface languages. Existing built-in blank-name placeholders are normalized; explicitly custom names and user task text are preserved.
- Controlled Excel v3, protected calculated cells, explicit 21/22-field mappings, group configuration, preview, source revision checks and downloads as new files. Legacy 14-column spreadsheet import remains positionally compatible; source-specific aliases have been removed. Legacy JSON requires a declared three-slot mapping.
- Public source allowlist and irreversible identifier fingerprints with submission/push hooks. Historical source files, old templates, development images, raw audit records and old Git backups have been removed under explicit user authorization. The public repository was deleted and recreated under the same name, with a new repository identity and clean Git history; only the 13 reviewed files were uploaded.

## Current change: stable sidebar icons

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
