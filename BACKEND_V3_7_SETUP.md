# Forge Command V3.7 — deployment note

## What's new
- **Actions:** a Project dropdown populated from the live Projects register, with a blank option.
- **Actions:** Delete from the list or edit form. This is a reversible soft delete in the To Do sheet; logged time remains.
- **Projects:** Delete from list, edit form, or project details. It removes the project from the active list but **does not trash the separately created Google Drive workbook**. Linked actions are retained and disconnected from the project; project workbook sync stops.
- Project-workbook-synchronized actions are intentionally not deletable in Forge Command; remove them at the source project workbook.

## Important: one manual backend upgrade is required

The existing live Google Apps Script deployment does not implement the new delete operations or persist a manually selected Project ID. **GitHub alone is insufficient.**

1. In Apps Script, make a backup copy of the currently deployed `Code.gs`.
2. Replace `Code.gs` with the companion **Forge_Command_Code_v3_7.gs** supplied privately with this update. Do **not** paste a version with another spreadsheet or project-template ID. Never publish private keys or sheet IDs to this public repository.
3. Deploy > Manage deployments > Edit your current web app deployment > Version: New version > Deploy. Keep the same deployment URL, execution permissions and API key.
4. Reload Forge Command. The sidebar should show **V3.7.0**. The Delete controls and enabled project selector appear once `getBootstrap().app.capabilities` reports all three new capabilities.
5. Test with a disposable action and project. Use one project link and delete an action; confirm it stays gone after reload. Deleting a project preserves the project's actual workbook and its historical actions.

**Safety:** Project delete marks the project register row `Status=Deleted` and disconnects linked actions. To restore the project list entry, change that row's status back to Active in Sheets. The original action-to-project associations are *not automatically restored* and must be reassigned as needed.

The backend contains private spreadsheet/template IDs and is not committed to this public GitHub repository. All front-end controls are disabled until the upgraded backend is deployed; existing V3.6 functionality remains available.
