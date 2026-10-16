# Current status

Updated: 2026-10-16 (Asia/Shanghai).

## Implemented

- Offline project workspace with project-scoped tasks, settings, snapshots, audit, active versions and recovery points; atomic persistent writes and failure protection.
- Natural-day FS/Lag scheduling, three task levels, weighted progress, Gantt, cards and people participation; 1–10 configurable groups with stable IDs.
- English initial UI, English built-in project/sample/group values in both interface languages. Existing built-in blank-name placeholders are normalized; explicitly custom names and user task text are preserved.
- Controlled Excel v3, protected calculated cells, explicit 21/22-field mappings, group configuration, preview, source revision checks and downloads as new files. Legacy 14-column spreadsheet import remains positionally compatible; source-specific aliases have been removed. Legacy JSON requires a declared three-slot mapping.
- Public source allowlist and irreversible identifier fingerprints with submission/push hooks. Historical source files, old templates, development images, raw audit records and old Git backups have been removed under explicit user authorization; publication result is recorded after verification.

## Current verification

- 47 automated checks: 17 scheduling/workspace/default-value checks and 30 Excel/group contract checks. Includes fresh English boot, built-in placeholder migration, custom text preservation, both UI languages and legacy mappings.
- 17 actual ZIP/XML integration checks retain v1/v2 coverage and verify all ten groups through v3 import/export, isolation and recovery.
- Microsoft Open XML SDK validates v3 blank/full, v2 blank/summary and v1 blank output with zero errors in all five workbooks. Final local residue and replacement repository checks follow publication.
- No new native Excel open/save or browser desktop layout acceptance has been completed during this cleanup.

## Remaining limits

- Browser data is stored per origin/browser; file cleanup cannot erase other browser profiles, external downloads, the parent directory or third-party clones. Existing user data and project backups are not silently erased by the application.
- Group names and personnel aliases are project configuration; aliases remain JSON-edited. No cloud sync, authentication, collaboration, work calendars, multi-predecessor scheduling or resource-capacity calculation.
- Repository deletion/recreation must be followed by anonymous checks of old commit URLs. Platform caches outside the checked endpoints cannot be certified solely by pushing Git history.
