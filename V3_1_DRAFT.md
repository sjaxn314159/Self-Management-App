# Self Management V3.1 — Hardening + Notes

Draft branch. `main` remains the stable V3 build.

Planned/implemented in the V3.1 draft package:

- Permanent `ACT-######` Action IDs instead of row-addressed actions.
- Verified writes using a request ID plus transaction-status confirmation.
- Daily derived read token so the permanent API key is not placed in normal GET/JSONP query strings.
- Eastern home timezone normalization (`America/New_York`).
- Activity Log with request/source/entity/operation/before/after/status.
- Notes section: lightweight notes, optional title/tags/project/pin; no action/status workflow.

The master Google Sheet has already been prepared in a backwards-compatible way with the Action ID column, Notes sheet, Activity Log sheet, Daily Log Action ID header, and timezone change.

Do not merge/deploy this branch until the V3.1 Apps Script backend and front end are deployed together and tested.