// Development-only test of the taskbar's new Power button (restart / shut down).
//   FOCUS_SELFTEST=power FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SELFTEST_OUT=<result.json> npx electron .
// IMPORTANT: this is only safe to run while main.js's power:shutdown/power:restart handlers use a non-zero delay
// (e.g. "/t 120") so the test can confirm a real shutdown/restart was actually scheduled (via `shutdown /a`,
// which only succeeds if one is pending) and then abort it — never let this run against the real "/t 0" build.
const fs = require("node:fs");
const { execFile } = require("node:child_process");

function shutdownAbort() {
  return new Promise((resolve) => {
    execFile("shutdown.exe", ["/a"], { windowsHide: true, timeout: 8000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, message: err ? String(stderr || err.message) : stdout.trim() });
    });
  });
}

module.exports = function runPowerTest(ctx) {
  const { app, session, wc, bar, origin, quit } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 60000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = {};

  (async () => {
    try {
      const ORIGIN = origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => wc().once("did-finish-load", r));
      await wait(1000);

      // Open the power panel and confirm both options are present (the real UI, not a direct IPC call).
      await bar().executeJavaScript(`document.getElementById("power-btn").click()`);
      await wait(300);
      report.panelOpen = await bar().executeJavaScript(`!document.getElementById("panel-power").hidden`);
      report.hasRestartBtn = await bar().executeJavaScript(`!!document.getElementById("power-restart")`);
      report.hasShutdownBtn = await bar().executeJavaScript(`!!document.getElementById("power-shutdown")`);

      // Click "Shut down" for real, then immediately confirm Windows actually scheduled one (via /a succeeding),
      // and abort it at once — this build is running with a safety delay, not the real /t 0.
      await bar().executeJavaScript(`document.getElementById("power-shutdown").click()`);
      await wait(800);
      const abort1 = await shutdownAbort();
      report.shutdownWasScheduledAndAborted = abort1.ok;

      // Same for Restart.
      await bar().executeJavaScript(`document.getElementById("power-btn").click()`); // reopen panel (click toggles closed after the shutdown click's panel stayed open, but be safe)
      await wait(300);
      await bar().executeJavaScript(`document.getElementById("power-restart").click()`);
      await wait(800);
      const abort2 = await shutdownAbort();
      report.restartWasScheduledAndAborted = abort2.ok;
    } catch (err) {
      report.error = String((err && err.stack) || err);
      // Safety net: whatever happened, make sure nothing is left pending before this process exits.
      await shutdownAbort().catch(() => {});
    }
    try {
      const outFile = process.env.FOCUS_SELFTEST_OUT;
      if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    } catch {}
    clearTimeout(failsafe);
    quit();
  })();
};
