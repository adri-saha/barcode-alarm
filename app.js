// Barcode Alarm: the alarm only stops when you scan your registered barcode.

const KEY_CODE = 'ba.code';     // { text, format }
const KEY_TIME = 'ba.time';     // "HH:MM"
const KEY_TARGET = 'ba.target'; // ms timestamp while armed

const $ = (id) => document.getElementById(id);

// ---------- storage ----------
function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function save(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable: app still works for this session */ }
}

// ---------- screens ----------
let state = 'setup'; // setup | armed | ringing | done
function show(name) {
  state = name;
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ---------- audio ----------
// iOS only allows sound after a user tap, so unlockAudio() runs inside tap handlers.
let ctx = null;
let keepAlive = null;
let ringTimer = null;
let ringStart = 0;

function unlockAudio() {
  // Play through the Silent switch where Safari supports it (iOS 17+).
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  // Play a silent buffer to fully unlock output on iOS.
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}

// A near-silent tone while armed keeps the audio session from going idle.
function startKeepAlive() {
  if (!ctx || keepAlive) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  osc.frequency.value = 40;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  keepAlive = osc;
}
function stopKeepAlive() {
  if (keepAlive) { try { keepAlive.stop(); } catch {} keepAlive = null; }
}

function beep(at, freq, dur, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(vol, at + 0.01);
  gain.gain.setValueAtTime(vol, at + dur - 0.02);
  gain.gain.linearRampToValueAtTime(0, at + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.01);
}

function startRinging() {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  stopRinging();
  ringStart = Date.now();
  const pattern = () => {
    // Volume climbs from 30% to 100% over the first minute.
    const elapsed = (Date.now() - ringStart) / 1000;
    const vol = Math.min(1, 0.3 + elapsed / 60 * 0.7);
    const t = ctx.currentTime + 0.05;
    beep(t, 880, 0.12, vol);
    beep(t + 0.18, 880, 0.12, vol);
    beep(t + 0.36, 1320, 0.2, vol);
  };
  pattern();
  ringTimer = setInterval(pattern, 1000);
}
function stopRinging() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
}

// ---------- wake lock ----------
let wakeLock = null;
async function requestWakeLock() {
  const status = $('wake-status');
  if (!('wakeLock' in navigator)) {
    status.textContent = 'Screen wake lock not supported: turn off Auto-Lock in Settings.';
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    status.textContent = 'Screen will stay on. Keep the phone plugged in.';
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) {
    status.textContent = 'Could not keep the screen on (' + e.message + ').';
  }
}
function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (state === 'armed' || state === 'ringing') {
    requestWakeLock();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    tick(); // catch up if the page was paused past the alarm time
  }
});

// ---------- scanner ----------
let scanner = null;
let onScan = null;
let lastWrong = { text: '', at: 0 };

async function openScanner(title, handler) {
  $('scanner-title').textContent = title;
  $('scanner-msg').textContent = '';
  $('scanner-msg').className = 'msg';
  $('scanner').classList.remove('hidden');
  onScan = handler;

  if (typeof Html5Qrcode === 'undefined') {
    setScannerMsg('Scanner library failed to load. Check your connection.', 'bad');
    return;
  }
  if (!scanner) {
    scanner = new Html5Qrcode('reader', {
      verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
  }
  try {
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(h * 0.5) }) },
      (text, result) => {
        const format = result?.result?.format?.formatName || 'unknown';
        if (onScan) onScan(text, format);
      },
      () => {} // per-frame "not found" errors are normal
    );
  } catch (e) {
    setScannerMsg('Camera unavailable: ' + (e.message || e), 'bad');
  }
}

async function closeScanner() {
  onScan = null;
  $('scanner').classList.add('hidden');
  if (scanner && scanner.isScanning) {
    try { await scanner.stop(); } catch {}
  }
}

function setScannerMsg(text, kind) {
  const el = $('scanner-msg');
  el.textContent = text;
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

// ---------- setup ----------
function renderSetup() {
  const code = load(KEY_CODE);
  const reg = $('registered');
  if (code) {
    reg.innerHTML = '';
    reg.append('Registered: ');
    const b = document.createElement('b');
    b.textContent = code.text;
    reg.append(b, ' (' + code.format + ')');
    $('btn-register').textContent = 'Change barcode';
  } else {
    reg.textContent = 'No barcode registered yet.';
    $('btn-register').textContent = 'Register barcode';
  }
  $('btn-arm').disabled = !code;
  $('btn-test').disabled = !code;
  const time = load(KEY_TIME);
  if (time) $('alarm-time').value = time;
}

$('btn-register').addEventListener('click', () => {
  openScanner('Scan the barcode you want to use', (text, format) => {
    save(KEY_CODE, { text, format });
    setScannerMsg('Saved!', 'good');
    renderSetup();
    setTimeout(closeScanner, 600);
  });
});

$('alarm-time').addEventListener('change', (e) => save(KEY_TIME, e.target.value));

function nextAlarmFrom(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = new Date();
  t.setHours(h, m, 0, 0);
  if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
  return t.getTime();
}

function arm(target) {
  unlockAudio();
  startKeepAlive();
  requestWakeLock();
  save(KEY_TARGET, target);
  $('armed-for').textContent = fmtTime(new Date(target));
  show('armed');
  tick();
}

$('btn-arm').addEventListener('click', () => {
  const time = $('alarm-time').value;
  if (!time) return;
  save(KEY_TIME, time);
  arm(nextAlarmFrom(time));
});

$('btn-test').addEventListener('click', () => arm(Date.now() + 10_000));

$('btn-disarm').addEventListener('click', () => {
  save(KEY_TARGET, null);
  stopKeepAlive();
  releaseWakeLock();
  renderSetup();
  show('setup');
});

// ---------- clock loop ----------
function tick() {
  const now = new Date();
  $('clock').textContent = fmtTime(now);
  $('ring-clock').textContent = fmtTime(now);

  const target = load(KEY_TARGET);
  if (state === 'armed' && target) {
    const left = target - now.getTime();
    if (left <= 0) {
      ring();
    } else {
      const mins = Math.floor(left / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const s = Math.floor(left / 1000) % 60;
      $('armed-countdown').textContent =
        h > 0 ? `Rings in ${h}h ${m}m` : m > 0 ? `Rings in ${m}m ${s}s` : `Rings in ${s}s`;
    }
  }
}
setInterval(tick, 1000);

// ---------- ringing ----------
function ring() {
  show('ringing');
  $('ring-msg').textContent = '';
  startRinging();
}

$('btn-scan-stop').addEventListener('click', () => {
  if (ctx && ctx.state === 'suspended') ctx.resume();
  const code = load(KEY_CODE);
  openScanner('Scan your registered barcode', (text) => {
    if (code && text === code.text) {
      stopAlarm();
      return;
    }
    // Ignore repeat reads of the same wrong code for 2s so the message stays readable.
    const now = Date.now();
    if (text === lastWrong.text && now - lastWrong.at < 2000) return;
    lastWrong = { text, at: now };
    setScannerMsg('Wrong barcode. Keep looking!', 'bad');
  });
});

function stopAlarm() {
  stopRinging();
  stopKeepAlive();
  releaseWakeLock();
  save(KEY_TARGET, null);
  closeScanner();
  show('done');
}

$('btn-scanner-close').addEventListener('click', closeScanner); // closing never stops the alarm

$('btn-back').addEventListener('click', () => {
  renderSetup();
  show('setup');
});

// ---------- startup ----------
// If the page reloads while armed or ringing, restore that state.
// Sound needs a fresh tap after a reload, so show an overlay first.
function restore() {
  renderSetup();
  const target = load(KEY_TARGET);
  if (!target) { show('setup'); return; }

  $('armed-for').textContent = fmtTime(new Date(target));
  show(Date.now() >= target ? 'ringing' : 'armed');
  const overlay = $('tap-overlay');
  overlay.classList.remove('hidden');
  overlay.addEventListener('click', () => {
    overlay.classList.add('hidden');
    unlockAudio();
    startKeepAlive();
    requestWakeLock();
    if (state === 'ringing') startRinging();
    tick();
  }, { once: true });
}

restore();
tick();
