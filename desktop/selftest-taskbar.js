// Development-only test of the taskbar (never packaged).
//   FOCUS_SELFTEST=taskbar FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> electron .
// Drives the real taskbar page, checks every panel, and takes real screenshots of the screen.
const { execFile } = require("node:child_process");
const path = require("node:path");

module.exports = function runTaskbarTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 120000);
  const report = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const bar = () => ctx.bar();
  const js = (code) => bar().executeJavaScript(code);
  const shotDir = process.env.FOCUS_SHOT_DIR;

  // Real screenshot of the whole screen (the app is full-screen), DPI-aware.
  const shot = (name) =>
    new Promise((resolve) => {
      if (!shotDir) return resolve(false);
      const file = path.join(shotDir, name + ".png").replace(/'/g, "''");
      const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type 'using System.Runtime.InteropServices; public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[Dpi]::SetProcessDPIAware() | Out-Null
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`;
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true, timeout: 20000 }, (err) => resolve(!err));
    });

  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const text = (selector) => js(`(document.querySelector(${JSON.stringify(selector)}) || {}).textContent || ''`);
  const count = (selector) => js(`document.querySelectorAll(${JSON.stringify(selector)}).length`);

  (async () => {
    try {
      const ORIGIN = ctx.origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      ctx.wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => ctx.wc().once("did-finish-load", r));
      await ctx.refreshBootstrap(true);
      await ctx.inbox.refresh();
      await wait(1500);

      // ---- diagnostics: is the bridge there, and do calls get answered? ----
      report.console = [];
      bar().on('console-message', (_e, level, message) => level >= 2 && report.console.push(String(message).slice(0, 220)));
      report.debug = await js(`(async () => ({ bridge: typeof window.focusBar, keys: window.focusBar ? Object.keys(window.focusBar) : null, url: location.href,
        online: await Promise.race([window.focusBar.online(), new Promise(r => setTimeout(() => r('TIMEOUT'), 3000))]),
        battery: await Promise.race([window.focusBar.battery.get(), new Promise(r => setTimeout(() => r('TIMEOUT'), 6000))]),
        wifi: await Promise.race([window.focusBar.wifi.status(), new Promise(r => setTimeout(() => r('TIMEOUT'), 6000))]) }))()`);

      // ---- layout: the bar is a strip, the website sits above it ----
      const [W, H] = ctx.win().getContentSize();
      const bb = ctx.barView().getBounds();
      report.stripLayout = { barHeight: bb.height, barAtBottom: bb.y + bb.height === H, fullWidth: bb.width === W };
      report.mainViewAboveBar = ctx.wc() && true;

      // ---- right side: clock, battery, wifi, volume ----
      report.clock = { time: await text("#time"), date: await text("#date") };
      report.batteryShown = await js(`!document.getElementById('battery-btn').hidden`);
      report.batteryLabel = await text("#battery-label");
      report.wifiLabel = (await text("#wifi-label")).slice(0, 1) + "***"; // do not print the real network name
      await shot("1-bar-closed");

      // ---- left side badges (messages were created on the server by the test runner) ----
      report.badges = { notifs: await text("#b-notifs"), messages: await text("#b-messages"), todo: await text("#b-todo") };

      // ---- messages panel ----
      await click('[data-panel="messages"]');
      await wait(900);
      const open = ctx.barView().getBounds();
      report.panelOpensFullWindow = open.height === H && open.width === W;
      report.messageItems = await count("#messages-list .item");
      report.messageSenders = await js(`[...document.querySelectorAll('#messages-list .tag')].map(t => t.textContent)`);
      report.unreadBefore = await count("#messages-list .item.unread");
      await shot("2-messages-panel");
      await js(`document.getElementById('messages-readall').click()`);
      await wait(700);
      report.unreadAfterMarkAll = await count("#messages-list .item.unread");
      report.messagesBadgeAfter = (await js(`document.getElementById('b-messages').hidden`)) ? "hidden" : await text("#b-messages");

      // ---- to-do panel: add, toggle, delete, offline queue, sync ----
      await click('[data-panel="todo"]');
      await wait(500);
      await js(`(() => { const i = document.getElementById('todo-input'); i.value = 'Finish Chapter 4'; document.getElementById('todo-form').requestSubmit(); })()`);
      await wait(1500);
      await js(`(() => { const i = document.getElementById('todo-input'); i.value = 'Revise formulas'; document.getElementById('todo-form').requestSubmit(); })()`);
      await wait(1500);
      report.todoAfterAdd = await js(`[...document.querySelectorAll('#todo-list .name')].map(n => n.textContent)`);
      report.todoSynced = await text("#todo-sync");
      await js(`document.querySelector('#todo-list .check').click()`); // tick the first task
      await wait(900);
      await shot("3-todo-panel");

      // offline: add a task with no internet, it must wait in the queue
      ctx.setForceOffline(true);
      await ctx.checkConnection(true);
      await js(`(() => { const i = document.getElementById('todo-input'); i.value = 'Added while offline'; document.getElementById('todo-form').requestSubmit(); })()`);
      await wait(800);
      report.offlineTaskVisible = (await js(`[...document.querySelectorAll('#todo-list .name')].map(n => n.textContent)`)).includes("Added while offline");
      report.offlineQueueText = await text("#todo-sync");
      ctx.setForceOffline(false);
      await ctx.checkConnection(true);
      await wait(3000);
      await js(`document.querySelector('[data-panel="todo"]').click()`); // close
      await wait(300);
      await click('[data-panel="todo"]');
      await wait(900);
      report.afterReconnect = { queue: await text("#todo-sync"), tasks: await js(`[...document.querySelectorAll('#todo-list .name')].map(n => n.textContent)`) };

      // ---- wifi panel (read-only: lists networks, never connects) ----
      await click('[data-panel="wifi"]');
      await wait(3500);
      report.wifiPanel = { status: (await text("#wifi-status")).replace(/to .* ·/, "to *** ·"), networks: await count("#wifi-list .net"), error: (await text("#wifi-error")) || null };
      await shot("4-wifi-panel");

      // ---- volume panel ----
      await click('[data-panel="volume"]');
      await wait(900);
      report.volumePanel = { exactSlider: await js(`!document.getElementById('vol-exact').hidden`), keyButtons: await js(`!document.getElementById('vol-steps').hidden`) };
      await shot("5-volume-panel");

      // ---- battery + clock panels ----
      await click('[data-panel="battery"]');
      await wait(700);
      report.batteryPanel = await text("#battery-text");
      await click('[data-panel="clock"]');
      await wait(900);
      report.calendarCells = await count("#cal span");
      await shot("6-clock-panel");

      // ---- notifications panel ----
      await click('[data-panel="notifs"]');
      await wait(800);
      report.notifications = await js(`[...document.querySelectorAll('#notifs-list .t')].map(n => n.textContent)`);
      await shot("7-notifications-panel");

      // ---- Pomodoro timer: website sidebar <-> taskbar chip ----
      const page = (code) => ctx.wc().executeJavaScript(code);
      const clickStartInPage = `(() => { const sec = document.querySelector('aside [aria-label="Pomodoro timer"], [aria-label="Pomodoro timer"]'); const b = [...document.querySelectorAll('button')].find((x) => /^\s*(Start|Resume)\s*$/.test(x.textContent) && x.closest('aside')); if (!b) return false; b.click(); return true; })()`;
      report.timerSidebarPresent = await page(`!!document.querySelector('aside [aria-label="Pomodoro timer"]')`);
      report.timerChipBefore = { hidden: await js(`document.getElementById('timer-btn').hidden`), time: await text("#timer-time") };
      report.timerStartClicked = await page(clickStartInPage);
      await wait(2600);
      report.timerChipRunning = { hidden: await js(`document.getElementById('timer-btn').hidden`), time: await text("#timer-time"), running: await js(`document.getElementById('timer-btn').classList.contains('running')`) };
      await click("#timer-btn");
      await wait(900);
      report.timerPanel = { big: await text("#timer-big"), toggle: await text("#timer-toggle"), enabled: await js(`!document.getElementById('timer-toggle').disabled`) };
      await shot("9-timer-panel");
      await click("#timer-toggle"); // pause from the taskbar
      await wait(1800);
      report.timerAfterPause = { toggle: await text("#timer-toggle"), pageSaysPaused: await page(`!![...document.querySelectorAll('aside button')].find((x) => /Resume/.test(x.textContent))`) };
      await click("#timer-toggle"); // resume
      await wait(1500);
      report.timerAfterResume = await text("#timer-toggle");
      report.timerAfterResumePage = await page(`[...document.querySelectorAll('aside button')].map((x) => x.textContent.trim()).filter(Boolean).slice(0, 6)`);
      await wait(2500);
      report.timerAfterResumeLater = await text("#timer-toggle");
      await click("#timer-toggle"); // pause again so nothing keeps running
      await wait(800);

      // ---- Escape closes a panel and the bar shrinks back ----
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
      await wait(700);
      const closed = ctx.barView().getBounds();
      report.escapeClosesPanel = closed.height === bb.height;
      await shot("8-closed-again");
    } catch (err) {
      report.error = String((err && err.stack) || err);
    }
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
