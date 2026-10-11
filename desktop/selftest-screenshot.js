// Development-only test of the taskbar's screenshot button (never packaged).
//   FOCUS_SELFTEST=screenshot FOCUS_SELFTEST_COOKIE=<student session> npx electron .
const fs = require("node:fs");
const path = require("node:path");

module.exports = function runScreenshotTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 30000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = {};

  (async () => {
    try {
      const ORIGIN = ctx.origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      ctx.wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => ctx.wc().once("did-finish-load", r));
      await wait(1500);

      const dir = path.join(app.getPath("pictures"), "Focus Study Screenshots");
      const before = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;

      report.hasButton = await ctx.bar().executeJavaScript(`!!document.getElementById("screenshot-btn")`);
      await ctx.bar().executeJavaScript(`document.getElementById("screenshot-btn").click()`);
      await wait(3000); // PowerShell capture + save takes a moment

      report.afterCount = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
      report.beforeCount = before;
      const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      const newest = files.sort().pop();
      report.newestFile = newest || null;
      if (newest) report.newestSizeBytes = fs.statSync(path.join(dir, newest)).size;

      report.toastAppeared = await ctx.bar().executeJavaScript(`!!document.getElementById("ticker") && !document.getElementById("ticker").hidden`);

      console.log("SELFTEST_RESULT " + JSON.stringify(report));
    } catch (err) {
      console.log("SELFTEST_RESULT " + JSON.stringify({ ...report, error: String((err && err.stack) || err) }));
    }
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
