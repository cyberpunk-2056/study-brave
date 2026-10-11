// Development-only test of the Windows-key / taskbar / Task Manager lockout (winlock.js).
//   FOCUS_SELFTEST=winlock FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SELFTEST_OUT=<result.json> npx electron .
// Checks real OS state from an independent PowerShell call (not something the locked-down app itself could fake):
// the real Shell_TrayWnd taskbar must actually disappear while the app runs, come back once it quits, and an
// actual attempt to launch Taskmgr.exe must get killed within a second or so instead of staying open.
const fs = require("node:fs");
const { execFile, spawn } = require("node:child_process");

const PS_CHECK = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class T {
  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string wnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
'@
$h = [T]::FindWindow("Shell_TrayWnd", $null)
if ($h -eq [IntPtr]::Zero) { Write-Output "missing" } elseif ([T]::IsWindowVisible($h)) { Write-Output "visible" } else { Write-Output "hidden" }
`;

function trayState() {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_CHECK], { windowsHide: true, timeout: 10000 }, (err, stdout) => {
      resolve(err ? "error:" + err.message : stdout.trim());
    });
  });
}

function taskmgrAlive() {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "if (Get-Process Taskmgr -ErrorAction SilentlyContinue) { 'alive' } else { 'gone' }"], { windowsHide: true, timeout: 10000 }, (err, stdout) => {
      resolve(err ? "error:" + err.message : stdout.trim());
    });
  });
}

module.exports = function runWinlockTest(ctx) {
  const { app, session, wc, origin, quit } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 60000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = {};

  (async () => {
    try {
      const ORIGIN = origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => wc().once("did-finish-load", r));

      // Give the winlock helper (spawned at app startup) time to come up and engage.
      await wait(3000);
      report.trayWhileRunning = await trayState();

      // A real attempt to open Task Manager, exactly like a student pressing Ctrl+Alt+Delete and clicking it
      // (that specific path can't be scripted — it's an unbypassable secure-desktop UI — but once Task Manager
      // actually launches, from there or from anywhere else, this is the mechanism that has to stop it).
      const tm = spawn("taskmgr.exe", [], { windowsHide: false, detached: true, stdio: "ignore" });
      tm.unref();
      await wait(1500);
      report.taskmgrAfterLaunchAttempt = await taskmgrAlive();

    } catch (err) {
      report.error = String((err && err.stack) || err);
    }
    try {
      const outFile = process.env.FOCUS_SELFTEST_OUT;
      if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    } catch {}
    clearTimeout(failsafe);
    // quit() below runs app.exit(), which ends this process immediately — whether the real taskbar comes back
    // afterwards has to be checked by whatever launched this test, once the process has actually exited.
    quit();
  })();
};
