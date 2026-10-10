// Development-only end-to-end test of the offline features (never packaged).
//   FOCUS_SELFTEST=offline FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SELFTEST_ADMIN_COOKIE=<admin session> electron .
// It caches the student profile, tests the website-timer fallback, then pretends the internet is gone, records
// offline sessions (strict + relaxed), tampers with a record, and syncs everything when "online" again.

module.exports = function runOfflineTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 240000); // never leave a locked window behind
  const report = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const wc = () => ctx.wc();
  const loaded = () => new Promise((r) => wc().once("did-finish-load", r));
  const js = (code) => wc().executeJavaScript(code);

  (async () => {
    try {
      const ORIGIN = ctx.origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await loaded();

      // ---- 1. the app caches the profile and the encrypted offline-unlock secret ----
      await ctx.refreshBootstrap(true);
      const prof = ctx.profile();
      report.bootstrap = { user: prof && prof.user.name, strictMode: prof && prof.user.strictMode, secretStoredEncrypted: !!(prof && prof.secretEnc && prof.secretEnc.startsWith("enc:")) };

      // ---- 2. website-timer fallback: locked block ends while the server cannot be reached ----
      await js("window.focusShell.lock()");
      await wait(12000);
      report.websiteFallback = await js(`window.focusShell.offlineComplete({ subject: 'Maths', startedAt: Date.now() - 12000, plannedSec: 60, claimedSec: 600, runId: null })`);
      report.claimCappedToLockTime = ctx.store.readQueue().sessions.slice(-1).map((s) => s.runSec <= 20 && s.runSec >= 10)[0] === true; // asked for 600 s, only ~12 s were locked
      report.secondCompleteRefused = (await js(`window.focusShell.offlineComplete({ subject: 'Maths', startedAt: Date.now(), plannedSec: 60, claimedSec: 60, runId: null })`)).ok === false;
      await js("window.focusShell.unlock()");
      await wait(500);

      // ---- 6. internet "goes away": the app switches to the offline screen ----
      ctx.setForceOffline(true);
      await ctx.checkConnection(true);
      await ctx.checkConnection(true);
      report.offlineDetected = ctx.online() === false;
      ctx.showOfflineUI();
      await loaded();
      report.offlinePage = (await js("location.protocol + ' ' + document.title")).toString();

      // ---- 7. offline STRICT session: lock, violation, wrong code, right code ----
      const startA = await js(`window.focusShell.offline.start({ subject: 'Physics', minutes: 1 })`);
      await wait(900);
      report.strictStart = { ok: startA.ok, locked: ctx.locked(), alwaysOnTop: ctx.win().isAlwaysOnTop(), closable: ctx.win().isClosable() };
      await wait(7500); // past the 6 s focus grace
      ctx.win().emit("blur"); // student alt-tabs away
      await wait(600);
      report.violationPausedTimer = (await js(`window.focusShell.offline.state()`)).running === false;
      await js(`window.focusShell.offline.resume()`);
      await wait(4000);
      report.wrongCode = await js(`window.focusShell.offline.stop('000000')`);
      report.rightCode = await js(`window.focusShell.offline.stop(${JSON.stringify(ctx.currentCode())})`);
      await wait(600);
      report.unlockedAfterStop = ctx.locked() === false;

      // ---- 8. offline NON-strict session that finishes by itself ----
      ctx.profile().user.strictMode = 0;
      const startB = await js(`window.focusShell.offline.start({ subject: 'Chemistry', minutes: 1 })`);
      report.relaxedStart = { ok: startB.ok, locked: ctx.locked() };
      await wait(63500);
      report.finishedByItself = (await js(`window.focusShell.offline.state()`)).active === false;

      // ---- 9. queue contents ----
      const q = ctx.store.readQueue();
      report.queued = q.sessions.map((s) => ({ subject: s.subject, runSec: s.runSec, violations: s.violations, signed: !!s.sig }));
      report.queuedEvents = q.events.map((e) => e.kind);
      const copy = JSON.parse(JSON.stringify(q));

      // ---- 10. tampering: raise minutes by hand but keep the old signature ----
      const forged = { ...q.sessions[0], runSec: 3500, plannedSec: 3600, clientId: "forged-" + Date.now() };
      const fr = await session.defaultSession.fetch(ORIGIN + "/api/offline/sync", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-focus-app-key": ctx.appKey() }, body: JSON.stringify({ sessions: [forged], events: [] }) });
      report.forgedRecord = (await fr.json()).results.map((x) => ({ ok: x.ok, reason: x.reason }));

      // ---- 11. internet is back: automatic sync ----
      ctx.setForceOffline(false);
      await ctx.checkConnection(true);
      await wait(4000);
      const after = ctx.store.readQueue();
      report.afterSync = { sessionsLeft: after.sessions.length, eventsLeft: after.events.length };

      // ---- 12. the same data sent twice must not be counted twice ----
      const again = await session.defaultSession.fetch(ORIGIN + "/api/offline/sync", { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-focus-app-key": ctx.appKey() }, body: JSON.stringify({ sessions: copy.sessions, events: [] }) });
      report.resend = (await again.json()).results.map((x) => x.reason);
    } catch (err) {
      if (!String(err).includes('__video_only__')) report.error = String((err && err.stack) || err);
    }
    try {
      await session.defaultSession.cookies.remove(ctx.origin(), "fs_session");
    } catch {
      /* cleanup is best effort */
    }
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
