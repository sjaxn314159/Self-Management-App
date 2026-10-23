# Atlas Command V3.6

**Personal Operations System** — calendar-first time blocking, action management,
goals, routines, notes, work logs, and recurring meetings.

## Architecture

- **GitHub Pages:** web application/PWA and installed home-screen icons.
- **Google Apps Script:** existing authenticated API bridge (no V3.6 redeploy required).
- **Google Sheets:** source of truth for actions, notes, goals and schedule.
- **Offline:** static app assets are cached. Google Sheets writes require a network connection.
- **Outlook:** not connected in V3.6. Meetings created here do not appear in Outlook.

## Meeting and protected-prep recurrence

Create a Meeting or Protected Prep from Today / Calendar. Set **Repeats** to Yes,
choose Daily, Weekly, Biweekly, Monthly, Quarterly or Annually, the repeat
interval, and optionally the end date. Weekly and biweekly meetings support
multiple weekdays.

When editing a recurring meeting choose:
- **This occurrence only:** overrides this date, time, title or duration.
- **This and future occurrences:** begins a new schedule rule from the selected
  meeting, leaving earlier events unchanged.
- **Entire series:** replaces the original rule (including exceptions).

Delete offers the same occurrence/future/entire-series scope. Recurring meetings
reserve time in the auto-scheduler. A new series with a collision against an
existing time block cannot be saved until that collision is resolved. Hours are
scheduled between **8:00 AM and 5:00 PM** and lunch (12–12:30 PM) is excluded
from automatic action scheduling.

## Storage details

Recurring meetings are **virtual instances** generated from a single tagged
entry in the existing `Notes` Google Sheet. A JSON recurrence rule and
exceptions are stored under tag `SMA35-SCHEDULE`. They are hidden from the
normal Notes screen, but remain accessible in the original Sheet. This avoids
creating hundreds of duplicate rows, preserves V3.5 appointments and requires
no Apps Script code changes.

## Backend setup (existing installs only)

The existing `apps-script/Code.gs` bridge must remain deployed. The API key is
stored in Apps Script Script Properties and is entered privately on each device,
never in GitHub. Do not run `generateApiKey()` again on an existing working
deployment; that would invalidate previously connected devices.

## GitHub Pages / mobile app

Enable Pages from `main` root. Open the Pages URL in your browser and refresh
to load the new V3.6 assets. On iPhone, use Safari > Share > Add to Home Screen.
If the old home-screen icon remains cached, remove that shortcut and re-add it.
