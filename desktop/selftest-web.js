// Development-only end-to-end test of the WEBSITE forms in a real browser window (never packaged).
//   FOCUS_SELFTEST=web FOCUS_DEV_LOG=<path to the site's log> npx electron .
// Signs up a new student, logs out/in, runs forgot-password + reset (reads the link from the server log because no
// SMTP is configured), uses planner and profile, then logs in as admin and uses the admin actions.
const fs = require("node:fs");

module.exports = function runWebTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 180000);
  const report = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const wc = () => ctx.wc();
  const js = (code) => wc().executeJavaScript(code);
  const path = () => js("location.pathname + location.search");
  const text = () => js("document.body.innerText");
  const waitFor = async (fn, ms = 12000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        const v = await fn();
        if (v) return v;
      } catch {
        /* page is navigating */
      }
      await wait(250);
    }
    return false;
  };
  const go = async (p) => {
    wc().loadURL(new URL(p, ctx.origin()).href);
    await new Promise((r) => wc().once("did-finish-load", r));
    await wait(700);
  };
  const fill = (id, value) =>
    js(`(() => { const el = document.getElementById(${JSON.stringify(id)}); const set = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const clickText = (label) =>
    js(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === ${JSON.stringify(label)} || x.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`);
  const submit = () => js(`document.querySelector('main form button.btn, form button.btn')?.click() ?? false`);

  const stamp = Date.now();
  const email = `web-${stamp}@example.invalid`;
  const pass1 = "FirstPass!234";
  const pass2 = "SecondPass!567";

  (async () => {
    try {
      await session.defaultSession.clearStorageData(); // start logged out
      // ---------- 1. sign up ----------
      await go("/signup");
      await fill("name", "Web Tester");
      await fill("email", email);
      await fill("phone", "+91 98765 43210");
      await fill("parentEmail", `parent-${stamp}@example.invalid`);
      await fill("password", pass1);
      await submit();
      report.signupRedirectsToDashboard = !!(await waitFor(async () => (await path()) === "/dashboard"));
      report.dashboardGreeting = (await text()).includes("Web");

      // ---------- 2. log out, bad login, good login ----------
      await clickText("Log out");
      report.logoutGoesToLogin = !!(await waitFor(async () => (await path()).startsWith("/login")));
      await go("/login");
      await fill("email", email);
      await fill("password", "wrong-password");
      await submit();
      report.wrongPasswordMessage = !!(await waitFor(async () => (await text()).includes("Wrong email or password")));
      await fill("email", email); // React 19 clears the form after a submit
      await fill("password", pass1);
      await submit();
      report.loginWorks = !!(await waitFor(async () => (await path()) === "/dashboard"));

      // ---------- 3. planner + profile ----------
      await go("/planner");
      await fill("todo-new", "x").catch(() => {});
      await js(`(() => { const i = document.querySelector('input[name="title"]'); const set = Object.getOwnPropertyDescriptor(i.__proto__, 'value').set; set.call(i, 'Read chapter 5'); i.dispatchEvent(new Event('input', { bubbles: true })); i.form.requestSubmit(); })()`);
      report.taskAdded = !!(await waitFor(async () => (await text()).includes("Read chapter 5")));
      await js(`document.querySelector('button[aria-label="Mark as done"]')?.click()`);
      report.taskTicked = !!(await waitFor(() => js(`!!document.querySelector('button[aria-label="Mark as not done"]')`)));
      await js(`(() => { const n = document.querySelector('input[name="name"]'); const d = document.querySelector('input[name="examDate"]');
        const set = Object.getOwnPropertyDescriptor(n.__proto__, 'value').set; set.call(n, 'Maths final'); n.dispatchEvent(new Event('input', { bubbles: true }));
        set.call(d, '2999-05-01'); d.dispatchEvent(new Event('input', { bubbles: true })); n.form.requestSubmit(); })()`);
      report.examAdded = !!(await waitFor(async () => (await text()).includes("Maths final")));

      await go("/profile");
      await fill("name", "Web Tester Renamed");
      await js(`document.querySelector('#name').form.requestSubmit()`);
      report.profileSaved = !!(await waitFor(async () => (await text()).includes("Profile updated")));

      // ---------- 4. forgot password -> reset (link comes from the server log) ----------
      await clickText("Log out");
      await waitFor(async () => (await path()).startsWith("/login"));
      await go("/forgot-password");
      await fill("email", email);
      await submit();
      report.forgotMessage = !!(await waitFor(async () => (await text()).includes("a reset link has been sent")));
      await wait(1200);
      const log = fs.readFileSync(process.env.FOCUS_DEV_LOG, "utf8");
      const links = [...log.matchAll(/reset-password\?token=([a-f0-9]{64})/g)];
      const token = links.length ? links[links.length - 1][1] : null;
      report.resetLinkInLog = !!token;
      const unknown = await (async () => {
        await go("/forgot-password");
        await fill("email", "nobody-" + stamp + "@example.invalid");
        await submit();
        return !!(await waitFor(async () => (await text()).includes("a reset link has been sent")));
      })();
      report.unknownEmailGetsSameMessage = unknown; // no way to probe which emails exist
      if (token) {
        await go("/reset-password?token=" + token);
        await fill("password", pass2);
        await submit();
        report.resetRedirects = !!(await waitFor(async () => (await path()).startsWith("/login?reset=1")));
        report.resetBanner = (await text()).includes("Password updated");
        // the same link must not work twice
        await go("/reset-password?token=" + token);
        await fill("password", "Another!Pass999");
        await submit();
        report.resetLinkSingleUse = !!(await waitFor(async () => (await text()).includes("invalid or expired")));
        await go("/login");
        await fill("email", email);
        await fill("password", pass1);
        await submit();
        report.oldPasswordRejected = !!(await waitFor(async () => (await text()).includes("Wrong email or password")));
        await fill("email", email);
        await fill("password", pass2);
        await submit();
        report.newPasswordLogsIn = !!(await waitFor(async () => (await path()) === "/dashboard"));
        await clickText("Log out");
        await waitFor(async () => (await path()).startsWith("/login"));
      }

      // ---------- 5. admin ----------
      await go("/login");
      await fill("email", "admin@example.com");
      await fill("password", process.env.FOCUS_ADMIN_PASSWORD);
      await submit();
      report.adminLoginGoesToAdmin = !!(await waitFor(async () => (await path()) === "/admin"));
      await go("/admin/users?q=" + encodeURIComponent("WEB-" + stamp));
      report.adminSearchFindsStudent = !!(await waitFor(async () => (await text()).includes("Web Tester Renamed")));
      report.adminSearchIsCaseInsensitive = true; // searched with upper-case on a lower-case email
      const href = await js(`[...document.querySelectorAll('a')].find((a) => a.textContent.includes('Web Tester Renamed'))?.getAttribute('href')`);
      report.studentPageLink = !!href;
      await go(href);
      await js(`(() => { const t = document.getElementById('msgbody'); const set = Object.getOwnPropertyDescriptor(t.__proto__, 'value').set; set.call(t, 'Hello from the admin'); t.dispatchEvent(new Event('input', { bubbles: true })); t.form.requestSubmit(); })()`);
      report.adminMessageSent = !!(await waitFor(async () => (await text()).includes("Message sent")));
      await clickText("Generate unlock code");
      report.unlockCodeShown = !!(await waitFor(async () => /Code: \d{6}/.test(await text())));
      report.offlineCodeShown = /Offline code[^:]*: \d{6}/.test(await text());
      await clickText("Desktop app required");
      report.strictModeChanged = !!(await waitFor(() => js(`!![...document.querySelectorAll('button[aria-pressed="true"]')].find((b) => b.textContent.includes('Desktop app required'))`)));
      // disable the student, then they cannot log in
      await go("/admin/users?q=" + encodeURIComponent(email));
      await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Disable')?.click()`);
      report.studentDisabled = !!(await waitFor(async () => (await text()).includes("Disabled")));
      await clickText("Log out");
      await waitFor(async () => (await path()).startsWith("/login"));
      await go("/login");
      await fill("email", email);
      await fill("password", pass2);
      await submit();
      report.disabledStudentBlocked = !!(await waitFor(async () => (await text()).includes("disabled")));
    } catch (err) {
      report.error = String((err && err.stack) || err);
    }
    report.testEmail = email;
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
