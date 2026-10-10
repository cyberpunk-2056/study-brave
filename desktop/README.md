# Focus Study Desktop

A locked-down Windows browser for the Focus Study website. It has no address bar and can only open the
Focus Study site (plus the embedded YouTube player). While a focus timer runs, the website tells the app to
**lock**: kiosk full-screen, always on top, F11 / Esc / Alt+F4 / Ctrl+W / F5 / back-forward are blocked and the
window cannot be closed or minimized. It unlocks when the timer finishes or a parent/admin unlock code is entered.

## Install (students)
Run `dist/Focus-Study-Setup-1.0.0-x64.exe` (normal PCs) or `...-arm64.exe` (Windows on ARM), or
`Focus-Study-Setup-1.0.0.exe` which contains both and picks the right one.

## Point it at your website
The app opens the URL from the first of these that exists:
1. environment variable `FOCUS_URL`
2. `%APPDATA%\focus-study-desktop\config.json`  →  `{ "url": "https://your-site.example" }`
3. `config.json` next to the installed app (`resources\config.json`)
4. default `http://localhost:3000`

Edit `config.json` in this folder **before** building to bake in your public address.

## Develop / build
```
npm install
npm start                       # run from source (dev tools allowed)
npm run dist                    # build installers into dist/
```
Terminal note: if `ELECTRON_RUN_AS_NODE` is set (VS Code sets it), run with `env -u ELECTRON_RUN_AS_NODE` or clear it first.

Self-test of the lock logic (briefly goes full-screen, force-quits after 20 s):
`FOCUS_SELFTEST=1 npx electron .`

## Limits
Windows keeps some keys for itself: Ctrl+Alt+Del / Task Manager, Win+L, power button. If the window loses focus
(Alt+Tab, Win key) the app re-takes focus within about a second and tells the website, which pauses the timer and
logs the event for the admin. For a fully locked PC, combine with a standard (non-admin) Windows account and
Windows "Assigned Access" (kiosk) mode.
The installer is unsigned, so Windows SmartScreen shows "unknown publisher" (More info → Run anyway) until you
buy a code-signing certificate.

## Anti-cheat (v1.1)
- **Always full-screen.** F11 does nothing, and if the window is forced out of full-screen it re-enters immediately.
- **Server-timed study.** The website no longer reports study minutes. The server counts time itself from a
  heartbeat (every 5 s) and credits it only while the timer is running. A block counts as finished only when the
  server has credited the whole length, so changing the PC clock, editing the page or killing the app earns nothing.
- **No early stop without a code.** Stopping a locked block needs an unlock code (emailed to parent + admin) verified
  in the last 2 minutes; the server checks this itself.
- **Desktop app required (optional per student).** Admin → student → Study lock → "Desktop app required". The app adds a
  secret header (`x-focus-app-key`, value `DESKTOP_APP_KEY` in `app/.env`, also stored in `config.json`) to every request.
  Keep that key private: whoever has it can pretend to be the app.
- **Hardened app.** No dev tools, `--inspect` / remote-debugging refused, the .exe cannot run as Node, only the Focus Study
  site and the YouTube player can load.
- **Admin log** records: left full-screen, switched tab, reloaded, lost contact mid-session (app closed / offline),
  tried to study outside the desktop app, code requested / used.

After changing `DESKTOP_APP_KEY` or the site address, edit `config.json` and rebuild (`npm run dist`).

## Auto-start and shutdown / restart (v1.2)
- **Starts with Windows.** On every launch the installed app registers itself in the user's Windows startup
  (`HKCU\...\Run`, name "Focus Study"), so it opens full-screen as soon as the student signs in.
- **Shutdown never blocked.** The app does not veto Windows shutdown / restart / sign-out.
- **Resume where it stopped.** The server only counted time it saw (heartbeats). After the PC starts again the app
  re-locks at once, takes the server's credited time, and continues the timer automatically (a banner says so).
  The time the PC was off earns nothing. The admin log shows "App restarted mid-session".
- **Not tracked in dev runs.** Auto-start is only registered by the installed/packaged app, never by `npm start`.

Limits: a student can switch the startup entry off in Windows (Task Manager → Startup apps) or uninstall the app; the
app registers itself again the next time it is opened. For a stricter setup an admin can install it for all users and
create a scheduled task "At log on" (needs administrator rights), and use a standard (non-admin) student account.
Windows can only start apps after sign-in; enable Windows automatic sign-in for the student account if you want it to
start right at boot.

## Offline mode (v1.3)
**Offline study sessions.** When the server cannot be reached the window switches to a bundled offline screen:
timer, downloaded videos, sync status. The app's main process times the session on a monotonic clock, applies the same
strict lock, and saves a signed record in `%APPDATA%\focus-study-desktop\offline\queue.json`. When the internet returns
the app syncs automatically (every 8 s check). The server credits min(measured, planned, wall-clock) time, checks the
signature, accepts each record once, and shows "Offline session synced / flagged" in the admin log.

**Offline unlock code.** The admin panel shows an extra "offline code" (time-based, 15-minute windows) when generating a
code. The app verifies it without internet using a per-student secret that was cached (encrypted with Windows DPAPI) at the
last online visit. Five wrong tries lock the box for 15 minutes.

**Log in once online first** on each PC so the app can cache the profile; after that offline mode works by itself.

Self-tests (dev only, not shipped): `FOCUS_SELFTEST=offline ... npx electron .` (see selftest-offline.js).

## Taskbar (v1.4)
The real Windows taskbar is hidden while the app is full-screen, so the app has its own, always visible at the bottom.
The window holds two views: the website / offline screen on top and the taskbar strip below (`taskbar/`). Opening a
panel enlarges the taskbar view over the window with a dim backdrop; click outside or press Esc to close.

**Right side:** Wi-Fi (current network, signal, internet status; click to list nearby networks, connect or disconnect),
volume (slider + mute), battery (laptops only, hidden on desktops), live clock (click for a calendar).
**Left side:** notifications, messages (admin / parent / announcements) and the to-do list (works offline, syncs later).

How it works
- Wi-Fi uses Windows' own `netsh wlan` (no admin rights). Commands run with an argument array, never through a shell;
  profile XML is escaped and written to a private temp file that is deleted at once. WPA2-Personal and open networks are
  supported; company/school (802.1X) and WPA3-only networks are shown but must be set up in Windows.
- Volume and battery come from one long-running PowerShell helper (Windows Core Audio + WMI). If exact volume control is
  not available on a PC, the panel shows Down / Mute / Up buttons that press the keyboard volume keys.
- Messages: the admin sends a message from a student's page (Admin -> Users -> student). Parents have no account; the
  emails we send them contain a private link (`/parent/<token>`) to leave a short message (max 5 per hour).
  The app fetches messages every 30 s and keeps them cached for offline reading.
- To-do: the app keeps its own list and replays add / tick / delete on the server (`/api/offline/tasks`) when online.
- The website can add a line to the notification list with `window.focusShell.notify(title, body)`.

Self-test (dev only): `FOCUS_SELFTEST=taskbar FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .`
drives every panel and takes real screenshots.

## Update (v1.5): no video library
The offline video library (upload by admin, download in the app, local player) was removed. Offline mode now covers
study sessions, the to-do list and messages only. The website runs on Vercel + Supabase; see `../DEPLOY.md`.
The app's connection check pings the server at most every 20 s while online (every 8 s while offline) to keep the
number of server requests low. Study-time heartbeats are sent every 10 s.

## Setting up from a fresh copy of the repository
`config.json` is not stored in git (it contains the app key). Copy `config.example.json` to `config.json`, fill in your
website address and the same `appKey` that is in the website's `DESKTOP_APP_KEY`, then `npm install` and `npm run dist`.
