# Barcode Alarm

An alarm that only stops when you scan a specific, registered barcode. The idea: put the barcode far from the bed (e.g. the basement) so you're awake by the time you've walked there.

## Current state: web concept
- Plain HTML/CSS/JS with no build step: `index.html`, `app.js`, `style.css`, `manifest.json`, `icon.svg`.
- Barcodes are read with html5-qrcode 2.3.8 from unpkg. Audio is generated with the Web Audio API, and the Screen Wake Lock API keeps the screen on.
- Live at https://adri-saha.github.io/barcode-alarm/ (public repo `adri-saha/barcode-alarm`, GitHub Pages from `main` root). A `git push` deploys it.
- **Known limit:** it can't ring if the iPhone locks or Safari is closed, because iOS suspends web pages.

## Environment
- Windows only, no Mac. The iPhone runs iOS 26+.
- The `python` command is the Windows Store stub. Serve locally with `npx http-server -p 8000 -c-1`.
- `git` and `gh` are installed and logged in as `adri-saha`.

## Planned next step: native app that rings while locked
- SwiftUI app using **AlarmKit** (iOS 26+). It rings on the lock screen and through Silent mode and Focus.
- The alarm screen's secondary button is "Scan": an App Intent that opens the app to a VisionKit `DataScannerViewController`.
- The system Stop button can't be removed. To work around it, schedule backup alarms every ~2 minutes; only a successful scan of the registered code cancels them.
- Build on a GitHub Actions macOS runner (XcodeGen `project.yml`, unsigned IPA artifact), then install from Windows with **Sideloadly** using a free Apple ID. The app expires every 7 days; a paid developer account ($99/yr) removes that, and the user hasn't decided yet.
- No simulator is available, so each test is a cloud build plus a sideload.

## Future ideas
Puzzles or math problems as another way to stop it, several barcodes in a row, and repeating alarms on certain days.
