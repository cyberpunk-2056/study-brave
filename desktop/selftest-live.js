// Development-only, READ-ONLY check of a deployed site (never packaged). It creates nothing:
//   FOCUS_SELFTEST=live FOCUS_URL=https://your-site.vercel.app npx electron .
// Tries a login with an account that does not exist and a password reset for an unknown address. Both only READ the
// database, so a correct answer proves the website can reach it.
module.exports = function runLiveTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => { console.log('SELFTEST_RESULT ' + JSON.stringify({ timedOut: true })); app.exit(2); }, 110000);
  const report = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = (m) => console.log('LIVE_STEP ' + m);
  const wc = () => ctx.wc();
  const js = (code) => wc().executeJavaScript(code);
  const text = () => js("document.body.innerText");
  const go = async (p) => {
    wc().loadURL(new URL(p, ctx.origin()).href);
    await new Promise((r) => wc().once("did-finish-load", r));
    await wait(800);
  };
  const fill = (id, value) =>
    js(`(() => { const el = document.getElementById(${JSON.stringify(id)}); const set = Object.getOwnPropertyDescriptor(el.__proto__, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const submit = () => js(`document.querySelector('main form button.btn, form button.btn')?.click()`);
  const waitText = async (needle, ms = 20000) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      try {
        if ((await text()).includes(needle)) return Date.now() - start;
      } catch {
        /* navigating */
      }
      await wait(200);
    }
    return null;
  };

  (async () => {
    try {
      step('start, url=' + ctx.origin());
      wc().on('did-fail-load', (_e, code, desc, url) => step('did-fail-load ' + code + ' ' + desc + ' ' + url));
      wc().on('did-navigate', (_e, url) => step('navigated ' + url));
      await session.defaultSession.clearStorageData();
      const stamp = Date.now();
      step("loading /login");
      await go("/login");
      step("loaded");
      report.loginPageLoads = (await text()).includes("Welcome back");
      await fill("email", `nobody-${stamp}@example.invalid`);
      await fill("password", "not-a-real-password");
      await submit();
      const consoleLines = [];
      wc().on('console-message', (_e, level, message) => level >= 2 && consoleLines.push(String(message).slice(0, 250)));
      const t1 = await waitText("Wrong email or password");
      report.consoleErrors = consoleLines.slice(0, 6);
      report.loginQuery = t1 === null ? "NO ANSWER (database unreachable or server error)" : `answered in ${t1} ms = database reachable`;
      const err = await text();
      if (t1 === null) report.pageTextAfterSubmit = err.replace(/\s+/g, " ").slice(0, 400);

      await go("/forgot-password");
      await fill("email", `nobody-${stamp}@example.invalid`);
      await submit();
      const t2 = await waitText("a reset link has been sent");
      report.forgotPasswordQuery = t2 === null ? "NO ANSWER" : `answered in ${t2} ms`;

      await go("/signup");
      report.signupPageLoads = (await text()).includes("Parent");
      await go("/login");
      await fill("email", `nobody2-${stamp}@example.invalid`);
      await fill("password", "x");
      await submit();
      const t3 = await waitText("Wrong email or password");
      report.secondLoginQuery = t3 === null ? "NO ANSWER" : `answered in ${t3} ms`;
    } catch (err) {
      report.error = String((err && err.stack) || err);
    }
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
