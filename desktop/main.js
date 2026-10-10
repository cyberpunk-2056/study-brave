// Focus Study Desktop — a locked-down browser that only opens the Focus Study website.
//
//  * Always full-screen. F11 / Esc never leave it, and if anything forces it out it jumps back in.
//  * While a focus timer runs the website asks this app to "lock": always on top, cannot be closed,
//    minimized or alt-tabbed away (it takes focus back and the website pauses the timer + logs it).
//  * The lock only ends when the website says so: the server confirmed the timer really finished, or a
//    parent/admin unlock code was entered.
//  * Starts by itself when Windows starts / the user signs in. If the PC is shut down mid-session the website
//    resumes the session where it stopped (the server only credits time it actually saw).
//  * Works offline too: when the internet is gone the window switches to a bundled offline screen (timer + downloaded
//    videos). Offline sessions are timed by this process, signed, queued on disk and synced when the internet returns.
//  * Anti-tamper: dev tools off, remote-debugging switches refused, only the Focus Study site (+ YouTube
//    player frames) can load, and every request to the site carries a secret key so the server can tell
//    this app apart from an ordinary browser.

const { app, BrowserWindow, WebContentsView, webContents, ipcMain, Menu, session, dialog, protocol, safeStorage } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createStore } = require("./store");
const { OfflineSessions, mono } = require("./offline-session");
const { createSysHelper } = require("./sysaudio");
const { createWifi } = require("./wifi");
const { createTasks } = require("./tasks");
const { createInbox } = require("./inbox");


const DEFAULT_URL = "http://localhost:3000";
const DEBUG = process.env.FOCUS_DEBUG === "1" && !app.isPackaged; // debug helpers never work in the installed app

// Refuse to run if someone launches the installed app with debugging switches (they would allow tampering).
if (app.isPackaged) {
  const bad = ["remote-debugging-port", "remote-debugging-pipe", "inspect", "inspect-brk", "inspect-port", "js-flags", "no-sandbox", "disable-web-security"];
  if (bad.some((s) => app.commandLine.hasSwitch(s)) || process.env.NODE_OPTIONS) app.exit(1);
}

// Hosts a frame may load: our site + the YouTube player. Top-level pages: only our site.
const FRAME_HOSTS = ["youtube.com", "youtube-nocookie.com", "google.com", "gstatic.com", "doubleclick.net", "googlesyndication.com", "ytimg.com"];

function readConfig() {
  const files = [path.join(app.getPath("userData"), "config.json"), path.join(process.resourcesPath ?? "", "config.json"), path.join(__dirname, "config.json")];
  let cfg = {};
  for (const f of files) {
    try {
      cfg = { ...JSON.parse(fs.readFileSync(f, "utf8")), ...cfg }; // earlier files win
    } catch {
      /* missing or invalid: ignore */
    }
  }
  let url = DEFAULT_URL;
  for (const c of [process.env.FOCUS_URL, cfg.url]) {
    try {
      const u = new URL(c);
      if (u.protocol === "http:" || u.protocol === "https:") {
        url = u.href;
        break;
      }
    } catch {
      /* try next */
    }
  }
  return { url, appKey: process.env.FOCUS_APP_KEY || cfg.appKey || "" };
}

let APP_URL;
let APP_ORIGIN;
let APP_KEY = "";
let win = null;
let locked = false;
let htmlFullscreen = false; // a video is full-screen inside the page (Esc must work to leave THAT)
let watchdog = null;
let quitting = false;
let lockedAt = 0; // when the lock engaged (focus-loss in the first seconds is not counted: Windows may not hand a freshly started app the foreground yet)
const FOCUS_GRACE_MS = 6000;

// ----- offline support state -----
let store; // crash-safe JSON files (queue, active session, cached profile)
let sessions; // offline session engine
let profileCache = null; // who is logged in + offline unlock secret (cached from the last online visit)
let online = true;
let forceOffline = false; // self-test only: pretend the internet is gone
let showingOffline = false;
let offlineFails = 0;
let lastBootstrap = 0;
let bootstrapping = false;
let syncing = false;
let lockMono = 0; // monotonic time the current lock began
let lockedWallAt = 0; // wall-clock time the current lock began
let lockSaved = false; // the current lock's block was already recorded by offline:complete
// ----- taskbar state -----
const BAR_H = 52; // height of the strip; panels temporarily enlarge the bar view to the whole window
let mainView = null; // shows the website / offline screen
let barView = null; // shows the taskbar
let barOpen = false;
let sys; // volume + battery helper (PowerShell)
let wifi; // Wi-Fi via netsh
let tasks; // to-do list (offline-first)
let inbox; // messages from admin / parent
let notifs = []; // notification list shown in the taskbar
const mainWC = () => (mainView && !mainView.webContents.isDestroyed() ? mainView.webContents : null);
const barWC = () => (barView && !barView.webContents.isDestroyed() ? barView.webContents : null);
const CHECK_EVERY_MS = 8000; // how often we look (cheap while offline)
const ONLINE_PING_EVERY_MS = 20000; // while online, only really ping this often (each ping is one request to the server)
let lastPing = 0;
const OFFLINE_WINDOW_MS = 15 * 60 * 1000;

const hostIn = (host, list) => list.some((d) => host === d || host.endsWith("." + d));

const sesn = () => session.defaultSession;
const broadcast = (channel, payload) => webContents.getAllWebContents().forEach((w) => !w.isDestroyed() && w.send(channel, payload));

/** Adds a line to the taskbar's notification list (and shows it briefly in the bar). */
function pushNotif(title, body = "", kind = "info") {
  const item = { id: crypto.randomUUID(), title: String(title).slice(0, 80), body: String(body).slice(0, 160), kind, at: Date.now(), read: false };
  notifs = [item, ...notifs].slice(0, 50);
  if (store) store.write("notifs.json", notifs);
  const b = barWC();
  if (b) b.send("bar:event", { type: "notif", item });
}

/** Calls our server as the logged-in user (cookies) and marks the request as coming from the desktop app. */
async function serverJson(urlPath, { method = "GET", body } = {}) {
  if (forceOffline) throw new Error("offline");
  const res = await sesn().fetch(APP_ORIGIN + urlPath, {
    method,
    credentials: "include",
    headers: { "x-focus-app-key": APP_KEY, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/** Lays out the two views: website on top, taskbar strip below (or the whole window while a panel is open). */
function layout() {
  if (!win || win.isDestroyed() || !mainView || !barView) return;
  const [w, h] = win.getContentSize();
  mainView.setBounds({ x: 0, y: 0, width: w, height: Math.max(0, h - BAR_H) });
  barView.setBounds(barOpen ? { x: 0, y: 0, width: w, height: h } : { x: 0, y: Math.max(0, h - BAR_H), width: w, height: BAR_H });
}

// Same keyboard rules for both views. Escape is allowed in the taskbar (it closes panels).
function guardKeys(contents, isBar) {
  contents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key;
    const ctrl = input.control || input.meta;
    if (key === "F11") return e.preventDefault();
    if ((key === "F12" || (ctrl && input.shift && ["I", "J", "C"].includes(key.toUpperCase()))) && !(DEBUG || !app.isPackaged)) return e.preventDefault();
    if (!locked) return;
    const blocked =
      key === "F5" || (key === "F4" && input.alt) ||
      (key === "Escape" && !isBar && !htmlFullscreen) ||
      (ctrl && ["w", "r", "t", "n", "l", "q", "p", "u", "s"].includes(key.toLowerCase())) ||
      (input.alt && ["ArrowLeft", "ArrowRight", "Home"].includes(key)) ||
      key === "BrowserBack" || key === "BrowserHome" || key === "BrowserRefresh";
    if (blocked) e.preventDefault();
  });
}

const offlineDirUrl = () => pathToFileURL(path.join(__dirname, "offline") + path.sep).href;
function showOfflineUI() {
  if (!win || win.isDestroyed() || !mainWC()) return;
  showingOffline = true;
  mainWC().loadFile(path.join(__dirname, "offline", "index.html"));
}

// The cached secret never sits in plain text on disk (Windows DPAPI via safeStorage when available).
function sealSecret(plain) {
  if (!plain) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) return "enc:" + safeStorage.encryptString(plain).toString("base64");
  } catch {
    /* fall back */
  }
  return "raw:" + plain;
}
function openSecret(sealed) {
  if (!sealed) return null;
  try {
    return sealed.startsWith("enc:") ? safeStorage.decryptString(Buffer.from(sealed.slice(4), "base64")) : sealed.slice(4);
  } catch {
    return null;
  }
}
// Same formula as the server (lib/lock.ts offlineCode): HMAC-SHA256(secret, window) -> 6 digits.
function offlineCodeFor(secret, windowIndex) {
  const mac = crypto.createHmac("sha256", secret).update(String(windowIndex)).digest();
  return String(mac.readUInt32BE(0) % 1000000).padStart(6, "0");
}
function verifyOfflineCode(code) {
  const secret = openSecret(profileCache && profileCache.secretEnc);
  if (!secret || !/^[0-9]{6}$/.test(code)) return false;
  const w = Math.floor(Date.now() / OFFLINE_WINDOW_MS);
  return [w, w - 1].some((i) => offlineCodeFor(secret, i) === code);
}

async function ping() {
  if (forceOffline) return false;
  try {
    const r = await sesn().fetch(APP_ORIGIN + "/app-check", { signal: AbortSignal.timeout(4000), headers: { "x-focus-app-key": APP_KEY } });
    return r.ok;
  } catch {
    return false;
  }
}

/** Keeps the cached profile fresh while online. */
async function refreshBootstrap(force = false) {
  if (!online || bootstrapping || (!force && Date.now() - lastBootstrap < 60000)) return;
  bootstrapping = true;
  try {
    const r = await sesn().fetch(APP_ORIGIN + "/api/offline/bootstrap", { credentials: "include", headers: { "x-focus-app-key": APP_KEY }, signal: AbortSignal.timeout(8000) });
    lastBootstrap = Date.now();
    if (r.status === 200) {
      const j = await r.json();
      profileCache = { user: j.user, secretEnc: sealSecret(j.offlineSecret), savedAt: Date.now() };
      store.write("profile.json", profileCache);
      broadcast("offline:event", { type: "profile" });
    }
  } catch {
    /* offline or server down: keep the old cache */
  } finally {
    bootstrapping = false;
  }
}

/** Sends finished offline sessions (and violation events) to the server. Safe to call any time. */
async function syncNow() {
  if (syncing || !online) return;
  const q = store.readQueue();
  if (!q.sessions.length && !q.events.length) return;
  syncing = true;
  try {
    const r = await sesn().fetch(APP_ORIGIN + "/api/offline/sync", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-focus-app-key": APP_KEY },
      body: JSON.stringify(q),
      signal: AbortSignal.timeout(15000),
    });
    if (r.status !== 200) return; // 401 = not logged in yet; try again later
    const { results } = await r.json();
    // Keep only records that belong to a different account (they sync when that person logs in).
    const finished = new Set(results.filter((x) => x.ok || x.reason !== "belongs to another account").map((x) => x.clientId));
    const sent = new Set(q.sessions.map((x) => x.clientId));
    const cur = store.readQueue();
    cur.sessions = cur.sessions.filter((x) => !(sent.has(x.clientId) && finished.has(x.clientId)));
    cur.events = cur.events.slice(q.events.length);
    store.writeQueue(cur);
    const n = results.filter((x) => x.ok && x.reason !== "already synced").length;
    if (n) {
      broadcast("offline:event", { type: "synced", count: n });
      pushNotif("Offline sessions synced", `${n} session${n > 1 ? "s" : ""} added to your account.`, "sync");
    }
  } catch {
    /* try again on the next check */
  } finally {
    syncing = false;
  }
}

/** Runs every few seconds: detects internet loss / return and switches between the website and the offline screen. */
async function checkConnection(force = false) {
  const was = online;
  if (online && !force && Date.now() - lastPing < ONLINE_PING_EVERY_MS) return online;
  lastPing = Date.now();
  online = await ping();
  offlineFails = online ? 0 : offlineFails + 1;
  if (online !== was) {
    broadcast("offline:event", { type: "net", online });
    broadcast("bar:event", { type: "net", online });
    pushNotif(online ? "Back online" : "No internet connection", online ? "Offline work is being synced." : "You can keep studying offline.", "net");
  }
  if (online) {
    void refreshBootstrap();
    void syncNow();
    void tasks.sync();
    if (showingOffline && !sessions.active && win && !win.isDestroyed()) {
      showingOffline = false;
      mainWC().loadURL(APP_URL); // internet is back and no offline session is running: return to the website
    }
  } else if (!showingOffline && !locked && offlineFails >= 2 && win && !win.isDestroyed()) {
    showOfflineUI();
  }
  return online;
}

/** Start with Windows (when the user signs in). Re-asserted on every launch, so removing it only lasts until the next run. */
function ensureAutoStart() {
  if (!app.isPackaged || process.platform !== "win32") return;
  try {
    app.setLoginItemSettings({ openAtLogin: true, name: "Focus Study", path: process.execPath, args: [] });
  } catch {
    /* not fatal */
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: true,
    fullscreen: true,
    title: "Focus Study",
    backgroundColor: "#0c0e1a",
    autoHideMenuBar: true,
  });
  Menu.setApplicationMenu(null);

  // Two views inside the window: the website / offline screen on top, the taskbar along the bottom.
  const prefs = {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    devTools: DEBUG || !app.isPackaged,
    spellcheck: false,
  };
  mainView = new WebContentsView({ webPreferences: prefs });
  barView = new WebContentsView({ webPreferences: prefs });
  barView.setBackgroundColor("#00000000");
  win.contentView.addChildView(mainView);
  win.contentView.addChildView(barView);
  layout();
  ["resize", "enter-full-screen", "leave-full-screen", "maximize", "unmaximize", "restore", "show"].forEach((ev) => win.on(ev, () => setTimeout(layout, 30)));

  const wc = mainView.webContents;
  wc.setUserAgent(`${wc.getUserAgent()} FocusStudyDesktop/${app.getVersion()}`);

  // The taskbar page: local file only, no popups, no navigation away.
  const bar = barView.webContents;
  bar.setWindowOpenHandler(() => ({ action: "deny" }));
  bar.on("will-navigate", (e) => e.preventDefault());
  guardKeys(bar, true);
  bar.loadFile(path.join(__dirname, "taskbar", "index.html"));

  // The window can only show our site (the offline page is a local file).
  wc.on("will-navigate", (e, url) => {
    if (url.startsWith("file://")) return;
    try {
      if (new URL(url).origin === APP_ORIGIN) return;
    } catch {
      /* fall through */
    }
    e.preventDefault();
  });
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-prevent-unload", (e) => e.preventDefault()); // ignore the page's "are you sure?" so shutdown is never blocked
  wc.on("enter-html-full-screen", () => (htmlFullscreen = true));
  wc.on("leave-html-full-screen", () => (htmlFullscreen = false));

  wc.on("did-navigate", (_e, url) => (showingOffline = url.startsWith("file://")));
  wc.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = aborted (normal during redirects)
    if (url && url.startsWith("file://")) return;
    online = false; // the site could not be loaded: show the offline screen
    showOfflineUI();
  });

  // Keyboard: F11 never works. While locked, navigation / tab / close shortcuts are dead too.
  guardKeys(wc, false);

  win.on("close", (e) => {
    if (locked && !quitting) e.preventDefault(); // Alt+F4 / taskbar close / X are ignored while locked
  });
  // Windows shutdown / restart / sign-out: never veto it (that would show "this app is preventing shutdown").
  // The timer simply stops counting; after the next start the session continues from there.
  win.on("query-session-end", () => (quitting = true));
  win.on("session-end", () => (quitting = true));

  win.on("blur", () => {
    if (!locked || !win) return;
    if (Date.now() - lockedAt > FOCUS_GRACE_MS) {
      wc.send("shell:violation", "focus-lost");
      // Offline session: the app itself pauses the timer and remembers the violation.
      if (sessions.active && sessions.state().running && sessions.pause(true)) store.addEvent("TAB_SWITCH");
    }
    setTimeout(() => grabFocus(), 150);
  });
  // Full-screen cannot be removed by the user: whatever leaves it, we go straight back in.
  win.on("leave-full-screen", () => {
    if (!win || win.isDestroyed() || quitting) return;
    setTimeout(() => win && !win.isDestroyed() && !win.isFullScreen() && win.setFullScreen(true), 60);
  });
  win.on("minimize", () => {
    if (locked && win) win.restore();
  });
  win.on("closed", () => {
    win = null;
    stopWatchdog();
  });

  if (sessions.active) showOfflineUI(); // an offline session was running when the app was closed: continue it
  else wc.loadURL(APP_URL);
}

function grabFocus() {
  if (!locked || !win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isFullScreen() && !win.isKiosk()) win.setKiosk(true);
  win.setAlwaysOnTop(true, "screen-saver");
  win.show();
  win.moveTop();
  win.focus();
}

function startWatchdog() {
  stopWatchdog();
  watchdog = setInterval(() => {
    if (locked && win && !win.isDestroyed() && (!win.isFocused() || !win.isFullScreen() || win.isMinimized())) grabFocus();
  }, 1000);
}
function stopWatchdog() {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
}

function lock() {
  if (!win || locked) return;
  locked = true;
  lockedAt = Date.now();
  lockedWallAt = lockedAt;
  lockMono = mono();
  lockSaved = false;
  win.setMinimizable(false);
  win.setMovable(false);
  win.setResizable(false);
  win.setClosable(false);
  win.setAlwaysOnTop(true, "screen-saver");
  win.setKiosk(true);
  win.focus();
  startWatchdog();
}

function unlock() {
  if (!win || !locked) return;
  locked = false;
  stopWatchdog();
  win.setClosable(true);
  win.setAlwaysOnTop(false);
  win.setMinimizable(true);
  win.setMovable(true);
  win.setResizable(true);
  win.setKiosk(false);
  setTimeout(() => win && !win.isDestroyed() && win.setFullScreen(true), 150); // stays in normal full-screen
}

// Only the main page of our own site may drive the lock (not YouTube frames, not other pages).
const trusted = (e) => {
  try {
    return new URL(e.senderFrame.url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
};
ipcMain.handle("shell:lock", (e) => (trusted(e) ? (lock(), true) : false));
ipcMain.handle("shell:unlock", (e) => (trusted(e) ? (unlock(), true) : false));
ipcMain.handle("shell:status", (e) => (trusted(e) ? { locked, version: app.getVersion() } : null));

// The website OR the bundled offline screen may use the offline APIs.
const trustedUI = (e) => {
  try {
    const u = e.senderFrame.url;
    return new URL(u).origin === APP_ORIGIN || u.startsWith(offlineDirUrl());
  } catch {
    return false;
  }
};

// ----- taskbar -----
const barDirUrl = () => pathToFileURL(path.join(__dirname, "taskbar") + path.sep).href;
const trustedBar = (e) => {
  try {
    return e.senderFrame.url.startsWith(barDirUrl());
  } catch {
    return false;
  }
};
const bar = (channel, fn) => ipcMain.handle(channel, (e, ...args) => (trustedBar(e) ? fn(...args) : { error: "Not allowed." }));

bar("bar:setOpen", (open) => {
  barOpen = !!open;
  layout();
  if (barOpen && barWC()) barWC().focus();
  else if (mainWC()) mainWC().focus();
  return true;
});
bar("bar:online", () => online);
bar("wifi:status", () => wifi.status());
bar("wifi:scan", () => wifi.scan());
bar("wifi:connect", (opts) => wifi.connect({ ssid: opts && opts.ssid, password: opts && opts.password }));
bar("wifi:disconnect", () => wifi.disconnect());
bar("volume:get", () => sys.getVolume());
bar("volume:set", (n) => sys.setVolume(n));
bar("volume:mute", (m) => sys.setMute(!!m));
bar("volume:key", (which) => sys.pressKey(String(which)));
bar("battery:get", () => sys.battery());
bar("tasks:list", () => tasks.list());
bar("tasks:add", (title) => tasks.add(title));
bar("tasks:toggle", (id) => tasks.toggle(String(id)));
bar("tasks:remove", (id) => tasks.remove(String(id)));
bar("inbox:list", () => inbox.list());
bar("inbox:refresh", () => inbox.refresh());
bar("inbox:markRead", (ids) => inbox.markRead(ids));
bar("notifs:list", (markRead) => {
  const before = notifs.map((n) => ({ ...n })); // returned as-is so the panel can highlight what was new
  if (markRead) {
    notifs = notifs.map((n) => ({ ...n, read: true }));
    store.write("notifs.json", notifs);
  }
  return before;
});
bar("notifs:clear", () => {
  notifs = [];
  store.write("notifs.json", notifs);
  return true;
});
// The website may add a line to the notification list (rate limited so it cannot flood the bar).
let lastWebsiteNotif = 0;
ipcMain.handle("shell:notify", (e, title, body) => {
  if (!trusted(e) || Date.now() - lastWebsiteNotif < 1500) return false;
  lastWebsiteNotif = Date.now();
  pushNotif(title, body, "info");
  return true;
});

ipcMain.handle("offline:profile", (e) =>
  trustedUI(e) && profileCache ? { user: profileCache.user, savedAt: profileCache.savedAt } : null,
);
ipcMain.handle("offline:state", (e) => (trustedUI(e) ? { ...sessions.state(), online } : null));
ipcMain.handle("offline:start", (e, opts) => {
  if (!trustedUI(e)) return { ok: false, error: "Not allowed." };
  if (!profileCache) return { ok: false, error: "Log in once while online first." };
  const strict = profileCache.user.strictMode || 0;
  const r = sessions.start({ userId: profileCache.user.id, subject: opts && opts.subject, plannedSec: Number(opts && opts.minutes) * 60, strict });
  if (r.ok && strict >= 1) lock();
  return r;
});
ipcMain.handle("offline:resume", (e) => {
  if (!trustedUI(e)) return false;
  sessions.resume();
  return true;
});
ipcMain.handle("offline:stop", (e, code) => {
  if (!trustedUI(e)) return { ok: false, error: "Not allowed." };
  const a = sessions.active;
  if (!a) return { ok: false, error: "No session is running." };
  if (a.strict >= 1) {
    if (Date.now() < a.lockUntil) return { ok: false, error: "Too many wrong codes. Try again later." };
    if (!verifyOfflineCode(String(code || "").trim())) {
      a.attempts += 1;
      if (a.attempts >= 5) {
        a.attempts = 0;
        a.lockUntil = Date.now() + 15 * 60000;
      }
      sessions.persist(true);
      return { ok: false, error: a.lockUntil > Date.now() ? "Too many wrong codes. Try again in 15 minutes." : "Wrong code." };
    }
  }
  sessions.finish();
  if (locked) unlock();
  void syncNow();
  return { ok: true };
});
ipcMain.handle("offline:retry", async (e) => (trustedUI(e) ? await checkConnection(true) : false));
ipcMain.handle("offline:goOnline", (e) => {
  if (!trustedUI(e)) return { ok: false };
  if (sessions.active) return { ok: false, error: "Finish your session first." };
  if (!online || !win) return { ok: false, error: "Not connected." };
  showingOffline = false;
  mainWC().loadURL(APP_URL);
  return { ok: true };
});
// The website's own locked timer could not reach the server when it ended: record it from the app's lock timing.
ipcMain.handle("offline:complete", (e, s) => {
  if (!trusted(e)) return { ok: false, error: "Not allowed." };
  if (!locked || lockSaved || !profileCache || !s) return { ok: false, error: "Nothing to record." };
  const r = sessions.recordFromLock({
    userId: profileCache.user.id,
    subject: s.subject,
    plannedSec: Number(s.plannedSec),
    claimedSec: Number(s.claimedSec),
    runId: s.runId,
    lockedSince: lockedWallAt,
    lockedMonoMs: mono() - lockMono,
  });
  if (r.ok) {
    lockSaved = true;
    void syncNow();
  }
  return r;
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    ({ url: APP_URL, appKey: APP_KEY } = readConfig());
    APP_ORIGIN = new URL(APP_URL).origin;
    const appHost = new URL(APP_URL).hostname;
    const ses = session.defaultSession;

    // Pages: only our site. Frames: our site + the YouTube player.
    ses.webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, cb) => {
      if (details.resourceType === "mainFrame" || details.resourceType === "subFrame") {
        let host = "";
        try {
          host = new URL(details.url).hostname;
        } catch {
          return cb({ cancel: true });
        }
        const ok = details.resourceType === "mainFrame" ? host === appHost : host === appHost || hostIn(host, FRAME_HOSTS);
        return cb({ cancel: !ok });
      }
      cb({ cancel: false });
    });
    // Every request to our site carries the app key: this is how the server knows it is the desktop app.
    if (APP_KEY) {
      ses.webRequest.onBeforeSendHeaders({ urls: [`${APP_ORIGIN}/*`] }, (details, cb) => {
        details.requestHeaders["x-focus-app-key"] = APP_KEY;
        cb({ requestHeaders: details.requestHeaders });
      });
    }
    ses.setPermissionRequestHandler((_wc, permission, cb) => cb(["fullscreen", "notifications", "clipboard-sanitized-write"].includes(permission)));
    ses.on("will-download", (e) => e.preventDefault());

    // Offline support: local store and session engine.
    store = createStore(path.join(app.getPath("userData"), "offline"), () => APP_KEY);
    profileCache = store.read("profile.json", null);
    sessions = new OfflineSessions({ store, appVersion: app.getVersion() });
    const restored = sessions.restore();

    // Taskbar services.
    notifs = store.read("notifs.json", []);
    if (!Array.isArray(notifs)) notifs = [];
    sys = createSysHelper();
    wifi = createWifi();
    const taskbarEvents = (e) => barWC() && barWC().send("bar:event", e);
    tasks = createTasks({ store, request: serverJson, isOnline: () => online, emit: taskbarEvents });
    inbox = createInbox({
      store,
      request: serverJson,
      isOnline: () => online,
      emit: (e) => {
        taskbarEvents(e);
        if (e.type === "inbox" && e.fresh && e.fresh.length) {
          const m = e.fresh[0];
          pushNotif(m.announcement ? "New announcement" : `New message from ${m.fromRole === "PARENT" ? "your parent" : m.fromName || "your admin"}`, m.body, "info");
        }
      },
    });
    void sys.start(); // compile the audio helper in the background so the first click is instant
    setInterval(() => void inbox.refresh(), 30000);
    setInterval(() => void tasks.sync(), 60000);

    ensureAutoStart();
    createWindow();
    if (restored.restored) {
      // Carry on after a restart: the time the PC was off earns nothing.
      if (sessions.active.strict >= 1) lock();
      if (restored.wasRunning || sessions.active.strict < 1) sessions.resume();
    }
    setInterval(() => {
      const rec = sessions.tick();
      if (rec) {
        if (locked) unlock();
        broadcast("offline:event", { type: "finished" });
        pushNotif("Offline session saved", `${Math.round(rec.runSec / 60) || "<1"} min of ${rec.subject}. It syncs when you are online.`, "sync");
        void syncNow();
      }
    }, 500);
    setInterval(() => void checkConnection(), CHECK_EVERY_MS);
    void checkConnection();
    if (process.env.FOCUS_SELFTEST === "web" && !app.isPackaged) {
      require("./selftest-web")({ app, session, wc: () => mainWC(), origin: () => APP_ORIGIN, quit: () => { quitting = true; app.exit(0); } });
    }
    if (process.env.FOCUS_SELFTEST === "taskbar" && !app.isPackaged) {
      require("./selftest-taskbar")({
        app, session, tasks, inbox, sys, wifi,
        win: () => win, wc: () => mainWC(), bar: () => barWC(), barView: () => barView, origin: () => APP_ORIGIN,
        refreshBootstrap, checkConnection, setForceOffline: (v) => (forceOffline = v), online: () => online,
        quit: () => { quitting = true; app.exit(0); },
      });
    }
    if (process.env.FOCUS_SELFTEST === "offline" && !app.isPackaged) {
      require("./selftest-offline")({
        app, session, store, userData: app.getPath("userData"),
        win: () => win, wc: () => mainWC(), origin: () => APP_ORIGIN, appKey: () => APP_KEY, profile: () => profileCache,
        currentCode: () => offlineCodeFor(openSecret(profileCache.secretEnc), Math.floor(Date.now() / OFFLINE_WINDOW_MS)),
        refreshBootstrap, checkConnection, syncNow, showOfflineUI,
        setForceOffline: (v) => (forceOffline = v), online: () => online, locked: () => locked,
        quit: () => { quitting = true; app.exit(0); },
      });
    }
    if (process.env.FOCUS_SELFTEST === "1" && !app.isPackaged) runSelfTest();
    if (process.env.FOCUS_SELFTEST === "restart" && !app.isPackaged) runRestartTest();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("before-quit", () => sys && sys.stop());
  app.on("window-all-closed", () => app.quit());
  app.on("web-contents-created", (_e, contents) => {
    contents.on("will-attach-webview", (e) => e.preventDefault());
  });
}

process.on("uncaughtException", (err) => {
  if (DEBUG) dialog.showErrorBox("Focus Study", String(err));
});

// `FOCUS_SELFTEST=1 npx electron .` (unpackaged only): exercises the lock end-to-end and prints a report.
function runSelfTest() {
  const failsafe = setTimeout(() => app.exit(2), 25000); // never leave a locked window behind
  const report = {};
  const wc = mainWC();
  const startedFullScreen = win.isFullScreen();
  const key = (k, extra = {}) => {
    const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    wc.emit("before-input-event", ev, { type: "keyDown", key: k, control: false, alt: false, shift: false, meta: false, ...extra });
    return ev.defaultPrevented;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  wc.once("did-finish-load", async () => {
    try {
      report.page = wc.getURL();
      report.bridge = await wc.executeJavaScript("typeof window.focusShell + ':' + (window.focusShell && window.focusShell.isDesktop)");
      report.startedFullScreen = startedFullScreen;
      report.appKeyConfigured = APP_KEY.length > 0;
      report.serverRecognisesApp = await wc.executeJavaScript("fetch('/app-check').then(r => r.json()).then(j => j.desktop)");
      // Full-screen is permanent even with NO timer lock
      report.F11BlockedUnlocked = key("F11");
      win.setFullScreen(false);
      await wait(700);
      report.reEntersFullScreenWhenForcedOut = win.isFullScreen();
      // Lock
      report.lockResult = await wc.executeJavaScript("window.focusShell.lock()");
      await wait(800);
      report.locked = locked;
      report.alwaysOnTop = win.isAlwaysOnTop();
      report.closable = win.isClosable();
      report.F11Blocked = key("F11");
      report.EscBlocked = key("Escape");
      report.CtrlWBlocked = key("w", { control: true });
      report.AltF4Blocked = key("F4", { alt: true });
      report.F5Blocked = key("F5");
      htmlFullscreen = true;
      report.EscAllowedInVideoFullscreen = !key("Escape");
      htmlFullscreen = false;
      win.setFullScreen(false);
      await wait(700);
      report.reEntersFullScreenWhenLocked = win.isFullScreen();
      win.close();
      await wait(300);
      report.survivedCloseAttempt = !!win && !win.isDestroyed();
      win.minimize();
      await wait(500);
      report.minimizeUndone = !win.isMinimized();
      report.unlockResult = await wc.executeJavaScript("window.focusShell.unlock()");
      await wait(800);
      report.afterUnlock = { locked, fullScreen: win.isFullScreen(), alwaysOnTop: win.isAlwaysOnTop(), closable: win.isClosable() };
    } catch (err) {
      report.error = String(err);
    }
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    quitting = true;
    app.exit(0);
  });
}

// `FOCUS_SELFTEST=restart FOCUS_SELFTEST_COOKIE=<session> npx electron .` — simulates "PC was shut down mid-session,
// Windows started again": a saved running+locked timer must re-lock by itself and carry on from where it stopped.
function runRestartTest() {
  const failsafe = setTimeout(() => app.exit(2), 40000);
  const report = {};
  const wc = mainWC();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const loaded = () => new Promise((r) => wc.once("did-finish-load", r));
  const read = async () => JSON.parse(await wc.executeJavaScript("localStorage.getItem('fs_timer_v1')"));
  report.console = [];
  wc.on("console-message", (_e, level, message) => level >= 2 && report.console.push(String(message).slice(0, 200)));
  (async () => {
    try {
      await session.defaultSession.cookies.set({ url: APP_URL, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      wc.loadURL(new URL("/dashboard", APP_URL).href);
      await loaded();
      const now = Date.now();
      // State as it was when the power went off: running + locked, 100 s done, last tick seen 30 s after the segment began.
      await wc.executeJavaScript(`localStorage.setItem('fs_timer_v1', JSON.stringify({phase:'FOCUS',running:true,segStart:${now - 60000},elapsed:100,startedAt:${now - 160000},subject:'Physics',focusMin:25,breakMin:5,cycles:0,sitStart:null,locked:true,runId:null})); localStorage.setItem('fs_timer_v1_seen', '${now - 30000}');`);
      report.lockedBeforeRestart = locked;
      wc.reload();
      await loaded();
      report.samples = [];
      for (let i = 0; i < 6; i++) {
        await wait(500);
        const x = await read();
        report.samples.push({ t: (i + 1) * 500, running: x.running, locked: x.locked, elapsed: Math.round(x.elapsed), seg: !!x.segStart });
      }
      await wait(1000);
      const a = await read();
      report.lockedByItselfAfterRestart = locked;
      report.alwaysOnTop = win.isAlwaysOnTop();
      report.closable = win.isClosable();
      report.timerRunning = a.running;
      report.elapsedAtRestart = Math.round(a.elapsed); // expected ~130 s (100 + 30 s seen), not 160 (no credit for the time off)
      report.noticeShown = (await wc.executeJavaScript("document.body.innerText")).includes("computer restarted");
      await wait(3000);
      const b = await read();
      report.keepsCounting = b.running && b.segStart > a.segStart - 1;
      report.ticksSinceRestart = Math.round((Date.now() - b.segStart) / 1000);
      // clean up
      await wc.executeJavaScript("localStorage.removeItem('fs_timer_v1'); localStorage.removeItem('fs_timer_v1_seen');");
      await wc.executeJavaScript("window.focusShell.unlock()");
      await session.defaultSession.cookies.remove(APP_URL, "fs_session");
    } catch (err) {
      report.error = String(err);
    }
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    quitting = true;
    app.exit(0);
  })();
}
