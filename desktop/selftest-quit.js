// Development-only test of the "no normal way out" lockdown: Alt+F4 / window close must never work, and the
// hidden Ctrl+I/Ctrl+O combo must be the only thing that actually quits the app.
//   FOCUS_SELFTEST=quit FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SELFTEST_OUT=<result.json> npx electron .
const fs = require("node:fs");

module.exports = function runQuitTest(ctx) {
  const { app, session, win, wc, origin, quitting } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 30000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = {};

  // Same technique runSelfTest() uses: before-input-event is a plain EventEmitter event on webContents, so calling
  // .emit() directly exercises guardKeys exactly as a real keypress would, without needing actual OS-level input.
  const key = (k, extra = {}) => {
    const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    wc().emit("before-input-event", ev, { type: "keyDown", key: k, control: false, alt: false, shift: false, meta: false, ...extra });
    return ev.defaultPrevented;
  };

  (async () => {
    try {
      const ORIGIN = origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => wc().once("did-finish-load", r));
      await wait(500);

      // Alt+F4 must never close the window — not locked, nothing special going on, just the app running normally.
      report.altF4Blocked = key("F4", { alt: true });
      const w = win();
      w.close();
      await wait(300);
      report.survivedAltF4AndCloseAttempt = !w.isDestroyed();

      // A lone Ctrl+I with no matching Ctrl+O inside the 1.2s window must NOT trigger a quit.
      key("I", { control: true });
      await wait(1500); // let the window lapse
      report.quittingAfterPartialCombo = quitting();

      // The real combo — Ctrl+I then Ctrl+O within the window, either order — must actually quit.
      key("I", { control: true });
      await wait(150);
      key("O", { control: true });
      await wait(200);
      report.quittingAfterFullCombo = quitting();
    } catch (err) {
      report.error = String((err && err.stack) || err);
    }
    try {
      const outFile = process.env.FOCUS_SELFTEST_OUT;
      if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    } catch {}
    clearTimeout(failsafe);
    // The full combo above already called the real app.quit() inside guardKeys — nothing further to do here.
    // If for some reason it didn't, force an exit so the test never hangs.
    setTimeout(() => app.exit(0), 1500);
  })();
};
