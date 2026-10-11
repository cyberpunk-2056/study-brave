# Focus Study Desktop

A locked-down Windows browser for the Focus Study website. It has no address bar and can only open the
Focus Study site (plus the embedded YouTube player, admin-approved course sites, and the built-in Gmail utility).
F11, Alt+F4 and the window's own close button never work — the app stays running, full-screen, the entire time it's
open, not just during a timer; see `winlock.js` for the matching lockout of the real Windows key, taskbar and Task
Manager. While a focus timer runs, the website additionally tells the app to **lock**: always on top, Esc / Ctrl+W /
F5 / back-forward are also blocked and the window can't be minimized either. It unlocks when the timer finishes or a
parent/admin unlock code is entered. The only way to actually quit the app at all is a hidden combo (Ctrl+I then
Ctrl+O within about a second, either order) — see "Quitting the app" below.

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

## Quitting the app
Alt+F4, the window's close button, and the taskbar's own close/right-click-close are all permanently dead (see
`win.on("close")` and `guardKeys` in `main.js`) — this isn't a timer-lock thing, it's true the whole time the app is
open. The one way out is a hidden combo: **Ctrl+I then Ctrl+O** (or the other order), within about 1.2 seconds of
each other — meant for a parent/admin, not something a student skimming the keyboard is likely to land on by
accident. It quits the app the normal way (`app.quit()`), so `winlock.js`'s restore-on-quit still runs and hands
back the real taskbar/Windows key/Task Manager properly. Ctrl+Alt+Delete itself still can't be touched by any
app (see `winlock.js`), but the Start menu, taskbar, Win+L, and Task Manager launched from anywhere are all covered
now — see "Windows key / real taskbar lockout" below.

## Limits
If the window loses focus (Alt+Tab physically switching to another already-running app, say) the app re-takes focus
within about a second and tells the website, which pauses the timer and logs the event for the admin. For a fully
locked PC, combine with a standard (non-administrator) Windows account and Windows "Assigned Access" (kiosk) mode —
`winlock.js`'s Task Manager kill and `DisableTaskMgr` policy are real but are software running as that user, not a
substitute for an actual restricted OS account.
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

## Auto-start, uninstall protection, and shutdown / restart (v1.2)
- **Installed for all users, needs an administrator to install or uninstall.** The installer is `perMachine`, into
  Program Files, with a fixed location (no "choose a folder" step). A standard (non-admin) student account cannot
  write there, so it cannot modify or delete the installed files directly — only Windows' own uninstaller can remove
  it, and that needs an administrator's UAC approval.
- **Starts with Windows.** The installer adds a machine-wide startup entry (`HKLM\...\Run`, name "Focus Study") with
  `--autostart`, so the app opens full-screen as soon as any student account signs in. It skips itself automatically
  inside an administrator account (checked with `whoami /groups`), so it never gets in the parent's way on their own
  login.
- **Uninstalling needs the parent/admin code.** Before Windows' uninstaller removes anything, it runs the installed
  app with `--uninstall-gate`, which shows a small window asking for a 6-digit code — the same "offline code" the
  admin panel already shows next to the emailed unlock code (works with or without internet; up to 5 tries). Only a
  correct code lets the uninstall continue; closing the window or running out of tries cancels it. If no student has
  ever signed in on this install there is nothing to protect yet, so it skips straight through.
- **Shutdown never blocked.** The app does not veto Windows shutdown / restart / sign-out.
- **Resume where it stopped.** The server only counted time it saw (heartbeats). After the PC starts again the app
  re-locks at once, takes the server's credited time, and continues the timer automatically (a banner says so).
  The time the PC was off earns nothing. The admin log shows "App restarted mid-session".
- **Not tracked in dev runs.** Auto-start and the uninstall gate only apply to the installed/packaged app, never to
  `npm start`.

Limits: a student with administrator rights on the PC can always remove any software, including this one — the
protection above assumes the student's Windows account is a **standard** account and the parent/admin keeps the only
administrator account's password. Windows can only start apps after sign-in; enable Windows automatic sign-in for the
student account if you want the app to appear right at boot instead of after they log in.

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

**Right side:** a screenshot button (captures the whole screen instantly and saves it to the student's own
**Pictures\Focus Study Screenshots** folder — a real file, not hidden in app data — with a toast confirming it),
Wi-Fi (current network, signal, internet status; click to list nearby networks, connect or disconnect),
volume (slider + mute), battery (laptops only, hidden on desktops), live clock (click for a calendar), and a
**Power** button (Restart / Shut down the real PC — see below).
**Left side:** a **Home** button (takes the student straight to the Home screen's icon grid — see below — from
wherever they are, refused while a strict block is locked, same as opening a new course site), notifications,
messages (admin / parent / announcements) and the to-do list (works offline, syncs later).

How it works
- Wi-Fi uses Windows' own `netsh wlan` (no admin rights). Commands run with an argument array, never through a shell;
  profile XML is escaped and written to a private temp file that is deleted at once. WPA2-Personal and open networks are
  supported; company/school (802.1X) and WPA3-only networks are shown but must be set up in Windows.
- Volume and battery come from one long-running PowerShell helper (Windows Core Audio + WMI). If exact volume control is
  not available on a PC, the panel shows Down / Mute / Up buttons that press the keyboard volume keys.
- Messages: the admin sends a message from a student's page (Admin -> Users -> student). Parents have no account; the
  emails we send them contain a private link (`/parent/<token>`) to leave a short message (max 5 per hour).
  The app fetches messages every 30 s and keeps them cached for offline reading. A student's own replies from the
  **Contact support** page (see the main app README) show up here too, read-only — replying happens on that page.
- To-do: the app keeps its own list and replays add / tick / delete on the server (`/api/offline/tasks`) when online.
- The website can add a line to the notification list with `window.focusShell.notify(title, body)`.
- The screenshot button runs the same PowerShell capture the `screenshot` self-test below uses, saves the PNG, and
  calls the normal notification system itself — no bridge method on the website side is involved.
- The Home button sends `home:go`, which minimizes any maximized course site and navigates the website straight to
  `/dashboard` — the actual navigation happens in the main process (`mainWC().loadURL(...)`), not by asking the
  website to do it, so it still works even if the website's own JS were somehow stuck.
- The website's own header still has its own menu button that opens the same slide-out `SideMenu` independently —
  the taskbar has no part in that anymore; see `selftest-menu.js`.
- "My Files" on the Home screen opens `/files`, an in-app gallery that shows the student's real screenshots as
  thumbnails right inside the website — no Windows Explorer window ever opens, not even as an option. The thumbnails
  are served by a dedicated `focusfile://` protocol registered in the main process (`ses.protocol.handle`), which
  reads the actual PNG bytes from `Pictures\Focus Study Screenshots` after checking the filename against a strict
  `screenshot-<timestamp>.png` allowlist — the page never gets a raw filesystem path. `shell:list-files` and
  `shell:delete-file` (IPC, origin-checked like every other bridge call) back the list and the delete button.
- The Power button opens a small flyout with Restart / Shut down, exactly like the real Windows power button —
  clicking one runs `shutdown.exe /r` or `/s` (with `/f` to force-close anything in the way) right away, no extra
  confirm step, since that is how the real one behaves too. It is **not** refused while a strict block is locked,
  unlike Home or opening a new course site: an offline-session restart already earns no credit for the time the
  PC was off and simply resumes, still locked, on the next boot (see `offline-session.js`), so there is nothing to
  gain by power-cycling — and with the real Start menu and taskbar both unreachable while this app runs (see
  `winlock.js` below), this is the only way left to shut down or restart the PC at all, so it shouldn't also trap
  the student from doing that.

Self-test (dev only): `FOCUS_SELFTEST=taskbar FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .`
drives every panel and takes real screenshots. `FOCUS_SELFTEST=screenshot FOCUS_SELFTEST_COOKIE=<student session> npx electron .`
clicks the screenshot button and checks a new PNG actually landed in Pictures\Focus Study Screenshots.
`FOCUS_SELFTEST=home FOCUS_SELFTEST_COOKIE=<student session> npx electron .` checks the taskbar's Home button
actually navigates to `/dashboard` from elsewhere in the site. `FOCUS_SELFTEST=gallery FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> FOCUS_SELFTEST_OUT=<result.json> npx electron .`
takes two real screenshots, opens "My Files", and checks the in-app gallery actually lists them with working
`focusfile://` thumbnails (not a broken image) and that there is no Explorer button at all, and that delete removes
a file. `FOCUS_SELFTEST=menu FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .`
checks the website's own header menu button, independent of the taskbar. `FOCUS_SELFTEST=power FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SELFTEST_OUT=<result.json> npx electron .`
opens the Power flyout and clicks both Restart and Shut down for real, confirming via `shutdown /a` (which only
succeeds if one is actually pending) that Windows really scheduled each one, then aborts it immediately — **only
safe to run against a build of `main.js` with a non-zero `/t` delay** (e.g. `/t 120` instead of the shipped `/t 0`)
so there's a window to abort in; never run this test as-is against the real build, it will shut the machine down.

## Windows key / real taskbar lockout (`winlock.js`)
The whole point of the app is to be the only thing on screen, so for as long as it is running — not only during a
strict timer — the real Windows Start menu and the real Windows taskbar are both put out of reach:
- The Windows key (and Ctrl+Esc, the other way to open Start) stop doing anything, via a low-level keyboard hook
  (`SetWindowsHookEx(WH_KEYBOARD_LL, ...)`) that swallows those key events system-wide before Explorer ever sees
  them. Electron's own `globalShortcut` cannot do this: a bare Windows-key tap is a hotkey reserved by the shell,
  never delivered to any app's accelerator table, so only a real hook can intercept it.
- The real taskbar (`Shell_TrayWnd`, plus one `Shell_SecondaryTrayWnd` per extra monitor) is hidden outright
  with `ShowWindow(SW_HIDE)` — not just covered by the fullscreen window, actually not shown, so it can't flash
  into view on a hover or a dropped frame.

Both run inside one long-running PowerShell helper (same pattern as `sysaudio.js`): the hook needs a live Win32
message pump to keep firing, which only a persistent process can provide, and it runs on its own background thread
(written in C#, not as a PowerShell scriptblock handed to a raw .NET `Thread` — that doesn't actually work, a
scriptblock-to-delegate cast only runs on a thread the PowerShell engine already knows about).

Getting the lockout back off is handled three different ways, because a before-quit handler is not something you
can always count on running:
1. A normal app quit (`app.quit()`) fires Electron's `before-quit`, which calls `winlock.stop()`.
2. `winlock.stop()` closes the helper's stdin rather than just killing it — the helper treats reaching end-of-input
   as "the app is gone" and restores everything itself before exiting. This also covers `app.exit()` (a fast quit
   used by the self-tests, among other things), which Electron explicitly does **not** fire `before-quit` for.
3. A background watchdog thread inside the helper polls once a second whether the process that spawned it
   (by PID) still exists at all. If the whole app is killed outright — Task Manager "End task", a crash, anything
   that runs no app code whatsoever — the helper notices on its own within about a second, restores the Windows
   key and the taskbar, and exits itself. No orphaned helper is ever left running, and the lockout can outlive the
   app it's protecting for at most ~1 second, never indefinitely.

Self-test (dev only): `FOCUS_SELFTEST=winlock FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SELFTEST_OUT=<result.json> npx electron .`
checks the real `Shell_TrayWnd` is actually hidden (`IsWindowVisible`) while the app is running — not a UI
assertion, a real OS-level check of the real window, from an independent PowerShell call the locked-down app itself
has no way to influence.

Opening a panel enlarges the taskbar view so there is room for it above the bar (the website's own view never moves).
The panel's content is rendered **before** that resize is requested, so the newly-enlarged view always has the right
content ready instead of a brief empty/stale frame — on some GPUs doing it the other way round shows up as a
flicker of the bar. `FOCUS_SELFTEST=flicker FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .`
takes real screenshots of the screen (not `capturePage()`, which can't see two composited views reliably on every
machine) every 16 ms right after a panel is opened and closed, to check for exactly that.

## Course sites (v1.6): purchased courses from other websites
A student can also open a course platform they've bought elsewhere (Udemy, Coursera, their school's LMS, …) —
Admin panel → Course sites → approve a domain (for one student or everyone). It then shows up on the student's
"Course sites" page with an **Open** button.

- **Never a free address bar.** Only domains an admin approved can be opened; the student picks from a list, never
  types a URL. Approving `udemy.com` also covers its subdomains, since real platforms use several.
- **Several can be open at once, like running apps on a Linux/Windows taskbar.** Each approved site gets its own
  view (so its state survives being minimized) and its own chip on the taskbar — up to 6 at a time. Click a chip:
  if that site is the one currently showing, it minimizes (back to Focus Study); otherwise it's brought to the
  front, minimizing whatever was showing. Hover a chip to reveal a small **×** that closes that one site for good.
  Opening a site that's already open just brings its existing view forward — it never creates a second copy.
- **Locked to its own site.** Each open course view can only navigate within its own approved domain (and
  subdomains) — the same navigation guard that normally only allows the Focus Study site + the YouTube player,
  applied per course view. A stray link to a different domain is blocked at the network level, not just hidden in
  the UI, and the Focus Study page itself never navigates away (it's simply hidden while a course site is maximized,
  so the Pomodoro timer etc. keep their state intact underneath).
- **Opening a *new* site is refused during a locked, running study block.** Leaving the Focus Study page would
  silently stop the anti-cheat checks that depend on it staying loaded, so opening one you don't already have open
  is refused while strict mode has the screen locked — the student is told to finish or unlock first. Switching
  back to one you already have open is always allowed, the same as switching to an already-running app.
- **Time is tracked only while a site is actually showing, and kept separate.** Minimizing one pauses its clock;
  maximizing it resumes it. Minutes are logged in their own "course time" bucket (`StudySession.kind = 'COURSE'`),
  never mixed into the server-verified Pomodoro focus minutes — nobody can verify what actually happened on someone
  else's website the way the app verifies its own study blocks. Visible as a total on the student's "Course sites"
  page.
- **Known limitation:** sign-in flows that require redirecting through a *different* domain (e.g. "Sign in with
  Google" with no password option) won't work, since that's exactly the kind of navigation this is designed to
  block. A course site with its own email/password login works fine.

Self-test (dev only): `FOCUS_SELFTEST=course FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .`
opens two sites at once and checks each view's on/off-screen bounds, the taskbar showing one chip per site,
clicking a chip to minimize/maximize (and that it reuses the existing view rather than opening a second one), and
the hover-close removing just that one. Add `FOCUS_COURSE_TEST_LOCK=1` to instead check that opening a *new* site
is refused while a strict block is locked and running.

## Gmail: a built-in utility, not a course site
Every student gets a **Gmail** icon on the Home screen (Tools section) — no admin approval needed, unlike course
sites. Clicking it opens Gmail in its own in-app view, with its own taskbar chip (mail icon instead of the course
sites' globe), using the exact same multi-window mechanics as course sites: its own `WebContentsView`, minimize by
clicking its chip again, close with the hover **×**, refused while a strict block is locked (same reasoning as
course sites — leaving the Focus Study page shouldn't happen mid-timer), always allowed to switch back to an
already-open one.

The one real difference from a course site: course sites' "known limitation" above (cross-domain sign-in flows get
blocked) doesn't apply here, on purpose. A course site is locked to exactly one domain because the student picked
it from an admin-approved list; Gmail is a fixed, built-in destination, so its view is instead locked to a short,
fixed list of hosts covering its whole sign-in flow (`mail.google.com`, `accounts.google.com`,
`myaccount.google.com`, `www.google.com`, `google.com`) — enough for "Sign in" to actually redirect through Google's
own login and land back on Gmail, without opening navigation up to arbitrary domains. `openOrFocusCourse` and the
Gmail opener both now call one shared `openOrFocusEntry(key, title, startUrl, hosts, isUtility)`, and the session's
page/frame filter (`ses.webRequest.onBeforeRequest`) checks every open entry's own `hosts` list rather than the map
key — a course site's key is its one domain so that's equivalent, but Gmail's key is the fixed id `"gmail"`, never
a real hostname, so checking map keys there would have silently blocked the whole sign-in redirect.
`isUtility` on an entry also skips the "course time" stat POST on close — browsing email isn't study time.

Self-test (dev only): `FOCUS_SELFTEST=gmail FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> FOCUS_SELFTEST_OUT=<result.json> npx electron .`
clicks the Home screen's Gmail icon and checks a real view opened, actually navigated to a `mail.google.com` /
`accounts.google.com` URL (proving the sign-in redirect wasn't blocked, not just that a view exists), has visible
on-screen bounds, and shows a taskbar chip — plus a real screenshot for a visual check.

## Update (v1.5): no video library
The offline video library (upload by admin, download in the app, local player) was removed. Offline mode now covers
study sessions, the to-do list and messages only. The website runs on Vercel + Supabase; see `../DEPLOY.md`.
The app's connection check pings the server at most every 20 s while online (every 8 s while offline) to keep the
number of server requests low. Study-time heartbeats are sent every 10 s.

## Setting up from a fresh copy of the repository
`config.json` is not stored in git (it contains the app key). Copy `config.example.json` to `config.json`, fill in your
website address and the same `appKey` that is in the website's `DESKTOP_APP_KEY`, then `npm install` and `npm run dist`.
