// Development-only test of admin-approved course sites — opening several at once, the taskbar showing one chip
// per open site, minimize/maximize by clicking a chip, and closing one with its hover "x" (never packaged).
//   FOCUS_SELFTEST=course FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .
//   FOCUS_COURSE_TEST_LOCK=1 ... runs the "refused while a strict block is locked" check instead.
const fs = require("node:fs");
const path = require("node:path");

module.exports = function runCourseTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 60000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dir = process.env.FOCUS_SHOT_DIR;
  const report = {};

  (async () => {
    try {
      const ORIGIN = ctx.origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });

      if (process.env.FOCUS_COURSE_TEST_LOCK) {
        // Security check: opening a NEW course site must be refused while a strict-mode block is locked and
        // running (leaving the Focus Study page would silently stop the anti-cheat checks that depend on it
        // staying loaded).
        ctx.wc().loadURL(new URL("/dashboard", ORIGIN).href);
        await new Promise((r) => ctx.wc().once("did-finish-load", r));
        await wait(3000);
        // This selftest reuses the app's real (persistent) profile, so a previous test run's timer state can still
        // be sitting in localStorage (e.g. left on "Break" or mid-run). Start clean so this check means something.
        await ctx.wc().executeJavaScript(`localStorage.removeItem("fs_timer_v1"); localStorage.removeItem("fs_timer_v1_seen")`);
        ctx.wc().loadURL(new URL("/dashboard", ORIGIN).href);
        await new Promise((r) => ctx.wc().once("did-finish-load", r));
        await wait(2000);
        report.started = await ctx.wc().executeJavaScript(`(() => { const b = document.querySelector("aside button.btn.flex-1"); if (!b) return false; b.click(); return true; })()`);
        await wait(2500);
        report.status = await ctx.wc().executeJavaScript(`window.focusShell.status()`);
        report.refusedWhileLocked = await ctx.wc().executeJavaScript(`window.focusShell.openCourseSite("example.com", "x")`);
        console.log("SELFTEST_RESULT " + JSON.stringify(report));
        clearTimeout(failsafe);
        return ctx.quit();
      }

      ctx.wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => ctx.wc().once("did-finish-load", r));
      await wait(2000);
      report.hasOpenFn = await ctx.wc().executeJavaScript(`!!window.focusShell && typeof window.focusShell.openCourseSite === "function"`);

      // Open two different sites. Each should get its own view and its own taskbar chip.
      report.openA = await ctx.wc().executeJavaScript(`window.focusShell.openCourseSite("example.com", "Example A")`);
      await wait(2500);
      report.openB = await ctx.wc().executeJavaScript(`window.focusShell.openCourseSite("example.org", "Example B")`);
      await wait(2500);
      report.courseCount = ctx.courseCount();

      const chips = () =>
        ctx.bar().executeJavaScript(`[...document.querySelectorAll('.course-chip-wrap')].map(w => ({
          title: w.querySelector('.label').textContent,
          active: w.querySelector('.course-chip').classList.contains('active'),
        }))`);
      report.chipsAfterOpeningBoth = await chips();

      // B was opened last, so it should be the one showing (front): A's view sized to nothing, B's filling the window.
      report.aBoundsWhileHidden = ctx.courseBounds("example.com");
      report.bBoundsWhileShown = ctx.courseBounds("example.org");
      const wcB = ctx.courseWC("example.org");
      report.bContent = wcB ? (await wcB.executeJavaScript(`document.title`)).slice(0, 40) : null;

      if (dir) {
        const img = await ctx.win().capturePage();
        fs.writeFileSync(path.join(dir, "course-two-open.png"), img.toPNG());
      }

      // Click A's chip: it is not front, so this should maximize it (bring it forward) instead of opening a third view.
      await ctx.bar().executeJavaScript(`[...document.querySelectorAll('.course-chip-wrap')].find(w => w.querySelector('.label').textContent === 'Example A').querySelector('.course-chip').click()`);
      await wait(1000);
      report.chipsAfterFocusingA = await chips();
      report.courseCountAfterFocusingA = ctx.courseCount(); // must still be 2 — focusing reuses the existing view

      // Click A's chip again: it is now front, so this should minimize it (back to Focus Study, nothing maximized).
      await ctx.bar().executeJavaScript(`[...document.querySelectorAll('.course-chip-wrap')].find(w => w.querySelector('.label').textContent === 'Example A').querySelector('.course-chip').click()`);
      await wait(1000);
      report.chipsAfterMinimizingA = await chips();

      // Hover-reveal close on B: closing it should drop the chip and destroy its view, leaving only A's chip.
      await ctx.bar().executeJavaScript(`[...document.querySelectorAll('.course-chip-wrap')].find(w => w.querySelector('.label').textContent === 'Example B').querySelector('.course-chip-close').click()`);
      await wait(1500);
      report.chipsAfterClosingB = await chips();
      report.courseCountAfterClosingB = ctx.courseCount();

      if (dir) {
        const img = await ctx.win().capturePage();
        fs.writeFileSync(path.join(dir, "course-after-close.png"), img.toPNG());
      }

      // Clean up: close what's left so no background view (and its course-time POST) lingers past this test.
      await ctx.bar().executeJavaScript(`[...document.querySelectorAll('.course-chip-wrap')].forEach(w => w.querySelector('.course-chip-close').click())`);
      await wait(2500); // give the fire-and-forget course-time POSTs time to land before the process exits
      report.courseCountAfterCleanup = ctx.courseCount();

      console.log("SELFTEST_RESULT " + JSON.stringify(report));
    } catch (err) {
      console.log("SELFTEST_RESULT " + JSON.stringify({ ...report, error: String((err && err.stack) || err) }));
    }
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
