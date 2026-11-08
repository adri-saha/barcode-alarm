# Barcode Alarm

A concept alarm web app: the alarm only stops when you scan a specific barcode. Put the barcode somewhere far from your bed (the basement, the kitchen) so you're awake by the time you get back.

Plain HTML/CSS/JS with no build step. Barcodes and QR codes are read with [html5-qrcode](https://github.com/mebjas/html5-qrcode).

## Use it
1. Open the site in Safari on your iPhone. The camera needs HTTPS, so use the GitHub Pages URL.
2. Optional: Share → **Add to Home Screen** so it runs full screen.
3. **Register barcode**: scan the item you'll need to walk to.
4. Pick a time and tap **Arm alarm**. Leave the page open with the phone plugged in.
5. When it rings, tap **Scan to stop** and scan the same barcode. Any other code is rejected.

Use **Test: ring in 10 seconds** to try it out.

## Limits (it's a web page, not a native app)
- The page must stay **open, in front, with the screen on**. The app keeps the screen awake with the Wake Lock API, but if you lock the phone or switch apps, iOS pauses the page and it can't ring.
- Sound uses media volume. On iOS 17+ it should play even with the Silent switch on.
- If you reload the page while it's ringing, it keeps ringing after you tap the screen.
- Keep a normal iPhone alarm as a backup.

A native iOS app using AlarmKit (iOS 26+) could ring from a locked phone. That would be the next step.

## Run locally
```
python -m http.server 8000
```
Then open http://localhost:8000 in Chrome on this computer. The camera works on localhost.
