# Self Management V3

V3 separates the visible app from Google Apps Script:

- **GitHub Pages** hosts the UI/PWA.
- **Google Apps Script** is the backend API.
- **Google Sheets** remains the source of truth.

## Backend

Use the V3 `apps-script/Code.gs` in the existing Self Management Apps Script project.

1. Run `generateApiKey()` once and store the new key privately.
2. Deploy a **new Web App** version.
3. Execute as **Me**.
4. Access: **Anyone**.
5. Copy the deployed `/exec` URL.

The API key is stored in Apps Script Script Properties. Do not commit the key to GitHub.

## Front end

`config.js` contains the Apps Script `/exec` URL only. The API key is entered once in the app and stored locally on that device.

Enable GitHub Pages from the `main` branch/root after these files are committed.

## iPhone

Open the GitHub Pages URL in Safari, use **Share → Add to Home Screen**, then launch it from the Home Screen. The PWA manifest and standalone display mode remove normal browser chrome and give the mobile UI the full screen.

## Architecture

GitHub Pages UI → Apps Script Web API → Google Sheets / project workbooks
