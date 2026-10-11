// Development-only FULL functional test of a deployed site, run in a real browser window (never packaged).
//   FOCUS_SELFTEST=livefull FOCUS_URL=https://your-site FOCUS_APP_KEY=<DESKTOP_APP_KEY> FOCUS_APP_DIR=<path to app/>
//   FOCUS_ADMIN_EMAIL=<temporary admin> FOCUS_ADMIN_PASSWORD=<its password> DATABASE_URL=<site's database> npx electron .
// It signs up a TEMPORARY student, exercises the website and the desktop-app APIs, then uses a TEMPORARY admin.
// No emails are sent: forgot-password uses an unknown address and the reset token is inserted directly in the database.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");

module.exports = function runLiveFull(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => {
    console.log("SELFTEST_RESULT " + JSON.stringify({ timedOut: true, partial: report }));
    app.exit(2);
  }, 420000);
  const report = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const wc = () => ctx.wc();
  const js = (code) => wc().executeJavaScript(code);
  const path = () => js("location.pathname + location.search");
  const text = () => js("document.body.innerText");
  const waitFor = async (fn, ms = 25000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        const v = await fn();
        if (v) return v;
      } catch {
        /* page is navigating */
      }
      await wait(300);
    }
    return false;
  };
  const go = async (p) => {
    const t0 = Date.now();
    wc().loadURL(new URL(p, ctx.origin()).href);
    await new Promise((r) => wc().once("did-finish-load", r));
    await wait(700);
    return Date.now() - t0;
  };
  const fill = (id, value) =>
    js(`(() => { const el = document.getElementById(${JSON.stringify(id)}); const set = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const setField = (selector, value) =>
    js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const clickText = (label) =>
    js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === ${JSON.stringify(label)} || x.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const submit = () => js(`document.querySelector('main form button.btn, form button.btn')?.click() ?? false`);
  const api = (p, init) =>
    js(`fetch(${JSON.stringify(p)}, ${JSON.stringify(init || {})}).then(async (r) => ({ status: r.status, body: await r.text() }))`);
  const json = (r) => {
    try {
      return JSON.parse(r.body);
    } catch {
      return null;
    }
  };
  const helper = (...args) =>
    execFileSync(process.env.ComSpec || "cmd.exe", ["/c", "npx", "tsx", "--env-file=.env", "scripts/live-helper.ts", ...args], { cwd: process.env.FOCUS_APP_DIR, env: process.env, encoding: "utf8", timeout: 90000 }).trim().split(/\r?\n/).pop();

  const stamp = Date.now();
  const email = `live-${stamp}@example.invalid`;
  const pass1 = "LiveCheck!234";
  const pass2 = "LiveCheck!567";
  const adminEmail = process.env.FOCUS_ADMIN_EMAIL;
  const adminPass = process.env.FOCUS_ADMIN_PASSWORD;
  const logout = async () => {
    await clickText("Log out");
    await waitFor(async () => (await path()).startsWith("/login"));
  };
  const login = async (e, p) => {
    await go("/login");
    await fill("email", e);
    await fill("password", p);
    await submit();
  };

  (async () => {
    try {
      await session.defaultSession.clearStorageData();
      report.timings = {};

      // ---------- 1. sign up ----------
      await go("/signup");
      await fill("name", "Live Tester");
      await fill("email", email);
      await fill("phone", "+91 98765 43210");
      await fill("parentEmail", `parent-${stamp}@example.invalid`);
      await fill("password", pass1);
      const t0 = Date.now();
      await submit();
      report.signupToDashboard = !!(await waitFor(async () => (await path()) === "/dashboard"));
      report.timings.signupMs = Date.now() - t0;
      report.dashboardGreeting = (await text()).includes("Live");

      // ---------- 2. desktop-app APIs (the app adds its key to every request) ----------
      const appCheck = json(await api("/app-check"));
      report.appKeyRecognised = appCheck && appCheck.desktop === true;
      const boot = json(await api("/api/offline/bootstrap"));
      report.bootstrap = { user: boot && boot.user && boot.user.name, strictMode: boot && boot.user && boot.user.strictMode, hasOfflineSecret: !!(boot && boot.offlineSecret), noLibraryField: !!boot && !("library" in boot) };
      const tasks1 = json(await api("/api/offline/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops: [{ op: "add", localId: "l-1", title: "From the app" }, { op: "toggle", id: "l-1" }] }) }));
      report.tasksApi = tasks1 && { mapped: Object.keys(tasks1.idMap || {}).length, tasks: (tasks1.tasks || []).map((t) => `${t.title}:${t.done}`) };
      const inbox0 = json(await api("/api/offline/inbox"));
      report.inboxEmptyAtFirst = !!inbox0 && inbox0.messages.length === 0;
      // offline-session sync: one valid signed record, then a forged one, then a repeat
      const rec = { clientId: crypto.randomUUID(), userId: boot.user.id, kind: "FOCUS", subject: "SyncTest", startedAt: Date.now() - 30000, plannedSec: 60, runSec: 12, wallSec: 15, violations: 0, runId: null };
      const sign = (r) => crypto.createHmac("sha256", process.env.FOCUS_APP_KEY).update([r.clientId, r.userId, r.kind, r.subject, r.startedAt, r.plannedSec, r.runSec, r.wallSec, r.violations, r.runId ?? ""].join("|")).digest("hex");
      const post = (sessions) => api("/api/offline/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessions, events: [{ kind: "TAB_SWITCH", at: Date.now() - 20000 }] }) });
      const s1 = json(await post([{ ...rec, sig: sign(rec) }]));
      const forged = { ...rec, clientId: crypto.randomUUID(), runSec: 3500, plannedSec: 3600 };
      const s2 = json(await post([{ ...forged, sig: sign(rec) }]));
      const s3 = json(await post([{ ...rec, sig: sign(rec) }]));
      report.syncValidRecord = s1 && s1.results.map((x) => ({ ok: x.ok, credited: x.creditedSec }));
      report.syncForgedRecord = s2 && s2.results.map((x) => ({ ok: x.ok, reason: x.reason }));
      report.syncResendNotDoubled = s3 && s3.results.map((x) => x.reason);

      // ---------- 3. planner + profile ----------
      await go("/planner");
      await js(`(() => { const i = document.querySelector('input[name="title"]'); const set = Object.getOwnPropertyDescriptor(i.__proto__, 'value').set; set.call(i, 'Read chapter 5'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); })()`);
      report.taskAdded = !!(await waitFor(async () => (await text()).includes("Read chapter 5")));
      await js(`document.querySelector('button[aria-label="Mark as done"]')?.click()`);
      report.taskTicked = !!(await waitFor(() => js(`!!document.querySelector('button[aria-label="Mark as not done"]')`)));
      await js(`(() => { const n = document.querySelector('input[name="name"]'); const d = document.querySelector('input[name="examDate"]');
        const set = Object.getOwnPropertyDescriptor(n.__proto__, 'value').set; set.call(n, 'Maths final'); n.dispatchEvent(new Event('input', { bubbles: true }));
        set.call(d, '2999-05-01'); d.dispatchEvent(new Event('input', { bubbles: true })); n.form.requestSubmit(); })()`);
      report.examAdded = !!(await waitFor(async () => (await text()).includes("Maths final")));
      report.timings.plannerPageMs = await go("/planner");
      await go("/profile");
      await fill("name", "Live Tester Renamed");
      await js(`document.querySelector('#name').form.requestSubmit()`);
      report.profileSaved = !!(await waitFor(async () => (await text()).includes("Profile updated")));
      report.analyticsPageLoads = (await go("/analytics"), (await text()).includes("Your analytics"));
      report.videosPageLoads = (await go("/videos"), (await text()).includes("My channels"));
      report.discoverPageLoads = (await go("/discover"), (await text()).includes("Find study channels"));

      // ---------- 4. logout, wrong password, forgot (no email), reset with a database-made token ----------
      await go("/dashboard");
      await logout();
      await login(email, "wrong-password");
      report.wrongPasswordMessage = !!(await waitFor(async () => (await text()).includes("Wrong email or password")));
      await go("/forgot-password");
      await fill("email", `nobody-${stamp}@example.invalid`);
      await submit();
      report.forgotGenericMessage = !!(await waitFor(async () => (await text()).includes("a reset link has been sent")));
      const token = helper("reset-token", email);
      await go("/reset-password?token=" + token);
      await fill("password", pass2);
      await submit();
      report.resetRedirects = !!(await waitFor(async () => (await path()).startsWith("/login?reset=1")));
      await go("/reset-password?token=" + token);
      await fill("password", "Another!Pass999");
      await submit();
      report.resetLinkSingleUse = !!(await waitFor(async () => (await text()).includes("invalid or expired")));
      await login(email, pass1);
      report.oldPasswordRejected = !!(await waitFor(async () => (await text()).includes("Wrong email or password")));
      await fill("email", email);
      await fill("password", pass2);
      await submit();
      report.newPasswordLogsIn = !!(await waitFor(async () => (await path()) === "/dashboard"));
      await logout();

      // ---------- 5. admin ----------
      await login(adminEmail, adminPass);
      report.adminLoginToAdmin = !!(await waitFor(async () => (await path()) === "/admin"));
      report.adminOverviewShows = (await text()).includes("Students");
      const csv = await api("/admin/export");
      report.csvExport = { status: csv.status, headerOk: csv.body.startsWith('"Name","Email"'), includesStudent: csv.body.includes(email) };
      await go("/admin/users?q=" + encodeURIComponent(email.toUpperCase()));
      report.adminSearchCaseInsensitive = !!(await waitFor(async () => (await text()).includes("Live Tester Renamed")));
      const href = await js(`[...document.querySelectorAll('a')].find((a) => a.textContent.includes('Live Tester Renamed'))?.getAttribute('href')`);
      await go(href);
      report.studentPageShowsParentLink = (await text()).includes("/parent/");
      await js(`(() => { const t = document.getElementById('msgbody'); const set = Object.getOwnPropertyDescriptor(t.__proto__, 'value').set; set.call(t, 'Hello from the admin (live test)'); t.dispatchEvent(new Event('input', { bubbles: true })); t.form.requestSubmit(); })()`);
      report.adminMessageSent = !!(await waitFor(async () => (await text()).includes("Message sent")));
      await clickText("Desktop app required");
      report.strictModeSet = !!(await waitFor(() => js(`!![...document.querySelectorAll('button[aria-pressed="true"]')].find((b) => b.textContent.includes('Desktop app required'))`)));
      await clickText("Off");
      report.strictModeOff = !!(await waitFor(() => js(`!![...document.querySelectorAll('button[aria-pressed="true"]')].find((b) => b.textContent.trim() === 'Off')`)));
      await go("/admin/announcements");
      await js(`(() => { const t = document.querySelector('textarea[name="message"]'); const set = Object.getOwnPropertyDescriptor(t.__proto__, 'value').set; set.call(t, 'LIVECHECK announcement'); t.dispatchEvent(new Event('input', { bubbles: true })); t.form.requestSubmit(); })()`);
      report.announcementPosted = !!(await waitFor(async () => (await text()).includes("LIVECHECK announcement")));
      await logout();

      // ---------- 6. student sees the admin's message, then runs a study timer ----------
      await login(email, pass2);
      report.studentLoginAgain = !!(await waitFor(async () => (await path()) === "/dashboard"));
      report.announcementOnDashboard = !!(await waitFor(async () => (await text()).includes("LIVECHECK announcement")));
      const inbox1 = json(await api("/api/offline/inbox"));
      report.inboxHasAdminMessageAndAnnouncement = !!inbox1 && inbox1.messages.some((m) => m.body.includes("Hello from the admin")) && inbox1.messages.some((m) => m.announcement);
      // timer (strict mode is Off for this student, so the screen is NOT locked): start, two heartbeats, stop
      const subjectBox = 'input[placeholder^="What are you studying"]';
      if (!(await waitFor(() => js(`!!document.querySelector('${subjectBox}')`), 8000))) await clickText("Open study timer"); // widget was collapsed
      report.timerWidgetVisible = !!(await waitFor(() => js(`!!document.querySelector('${subjectBox}')`), 15000));
      await setField(subjectBox, "LiveTimer");
      await clickText("Start");
      report.timerStarted = !!(await waitFor(() => js(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pause')`), 20000));
      await wait(26000); // two heartbeats (every 10 s)
      await clickText("Stop");
      report.timerStopped = !!(await waitFor(() => js(`!![...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Start')`), 20000));
      await wait(2500);
      await logout();

      // ---------- 7. admin disables the student ----------
      await login(adminEmail, adminPass);
      await waitFor(async () => (await path()) === "/admin");
      await go("/admin/users?q=" + encodeURIComponent(email));
      await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Disable')?.click()`);
      report.studentDisabled = !!(await waitFor(async () => (await text()).includes("Disabled")));
      await logout();
      await login(email, pass2);
      report.disabledStudentBlocked = !!(await waitFor(async () => (await text()).includes("disabled")));

      // ---------- 8. speed ----------
      report.timings.loginPageMs = await go("/login");
    } catch (err) {
      report.error = String((err && err.stack) || err).slice(0, 600);
    }
    report.testEmail = email;
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
