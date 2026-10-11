// Development-only test of the taskbar's Home button (never packaged).
//   FOCUS_SELFTEST=home FOCUS_SELFTEST_COOKIE=<student session> npx electron .
module.exports = function runHomeTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 30000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = {};

  (async () => {
    try {
      const ORIGIN = ctx.origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });

      // Navigate somewhere that is NOT the home screen first.
      ctx.wc().loadURL(new URL("/planner", ORIGIN).href);
      await new Promise((r) => ctx.wc().once("did-finish-load", r));
      await wait(1500);
      report.startedAt = ctx.wc().getURL();

      report.hasHomeButton = await ctx.bar().executeJavaScript(`!!document.getElementById("home-btn")`);
      await ctx.bar().executeJavaScript(`document.getElementById("home-btn").click()`);
      await wait(2000);
      report.endedAt = ctx.wc().getURL();
      report.onDashboard = await ctx.wc().executeJavaScript(`!!document.querySelector('[class*="Apps"],h2')`); // loose sanity check
      report.appsHeadingPresent = await ctx.wc().executeJavaScript(`[...document.querySelectorAll('h2')].some(h => h.textContent.trim() === 'Apps')`);

      console.log("SELFTEST_RESULT " + JSON.stringify(report));
    } catch (err) {
      console.log("SELFTEST_RESULT " + JSON.stringify({ ...report, error: String((err && err.stack) || err) }));
    }
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
