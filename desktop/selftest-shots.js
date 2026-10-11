// Development-only responsive / glitch check (never packaged).
//   FOCUS_SELFTEST=shots FOCUS_URL=<site> FOCUS_SELFTEST_COOKIE=<student> FOCUS_SELFTEST_ADMIN_COOKIE=<admin>
//   FOCUS_STUDENT_ID=<student id> FOCUS_SHOT_DIR=<folder> npx electron .
// Opens every page in a browser-like window at several screen sizes, in light and dark mode, and reports:
// sideways overflow, console errors/warnings, hydration problems. Saves screenshots of key combinations.
const { BrowserWindow, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const VIEWPORTS = [
  { name: "phone", w: 390, h: 844 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "laptop", w: 1366, h: 768 },
  { name: "desktop", w: 1920, h: 1080 },
];
const SHOT_VIEWPORTS = new Set(["phone", "laptop"]);

module.exports = function runShots(ctx) {
  const { app } = ctx;
  const failsafe = setTimeout(() => {
    console.log("SELFTEST_RESULT " + JSON.stringify({ timedOut: true }));
    app.exit(2);
  }, 900000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ORIGIN = ctx.origin();
  const dir = process.env.FOCUS_SHOT_DIR;
  const studentId = process.env.FOCUS_STUDENT_ID;

  const ROLES = [
    { role: "public", cookie: null, pages: ["/", "/login", "/signup", "/forgot-password", "/reset-password?token=abc", "/parent/garbage", "/no-such-page"] },
    { role: "student", cookie: process.env.FOCUS_SELFTEST_COOKIE, pages: ["/dashboard", "/videos", "/discover", "/discover?q=khan", "/saved", "/history", "/planner", "/analytics", "/profile"] },
    { role: "admin", cookie: process.env.FOCUS_SELFTEST_ADMIN_COOKIE, pages: ["/admin", "/admin/users", `/admin/users/${studentId}`, "/admin/channels", "/admin/announcements"] },
  ];

  (async () => {
    const report = { checked: 0, overflow: [], consoleProblems: [], failedToLoad: [], shots: 0 };
    try {
      const ses = session.fromPartition("shots-" + Date.now());
      const win = new BrowserWindow({ show: false, width: 1366, height: 768, useContentSize: true, webPreferences: { session: ses, sandbox: true, contextIsolation: true, backgroundThrottling: false } });
      const wc = win.webContents;
      let consoleBuf = [];
      wc.on("console-message", (_e, level, message) => {
        if (level >= 2 && !/favicon|Failed to load resource.*(404|401)|net::ERR_ABORTED/.test(message)) consoleBuf.push(String(message).slice(0, 200));
      });
      const js = (code) => wc.executeJavaScript(code);

      if (process.env.FOCUS_SHOTS_ONLY) {
        const KEY_PAGES = {
          public: ["/", "/login", "/signup"],
          student: ["/dashboard", "/planner", "/videos", "/analytics", "/profile", "/saved"],
          admin: ["/admin", "/admin/users", `/admin/users/${studentId}`],
        };
        for (const R of ROLES) {
          await ses.clearStorageData();
          if (R.cookie) await ses.cookies.set({ url: ORIGIN, name: "fs_session", value: R.cookie, httpOnly: true, path: "/" });
          for (const vp of VIEWPORTS.filter((v) => SHOT_VIEWPORTS.has(v.name))) {
            win.setContentSize(vp.w, vp.h);
            for (const theme of ["light", "dark"]) {
              await Promise.race([wc.loadURL(new URL("/no-such-page", ORIGIN).href), wait(20000)]).catch(() => {});
              await js(`localStorage.setItem('fs_theme', '${theme}')`);
              for (const page of KEY_PAGES[R.role]) {
                if (theme === "dark" && !["/dashboard", "/admin", "/planner", "/login"].includes(page)) continue;
                await Promise.race([wc.loadURL(new URL(page, ORIGIN).href), wait(30000)]).catch(() => {});
                await wait(1400);
                await wc.insertCSS("*, *::before, *::after { transition: none !important; animation: none !important; }");
                await wait(300);
                const shown = await js("document.documentElement.dataset.theme");
                const img = await wc.capturePage();
                fs.writeFileSync(path.join(dir, `${R.role}-${page.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${vp.name}-${theme}.png`), img.toPNG());
                report.shots++;
                if (shown !== theme) (report.wrongTheme = report.wrongTheme || []).push(`${R.role} ${page} ${vp.name} wanted ${theme} got ${shown}`);
              }
            }
          }
        }
        win.destroy();
        console.log("SELFTEST_RESULT " + JSON.stringify(report));
        clearTimeout(failsafe);
        return ctx.quit();
      }

      for (const R of ROLES) {
        await ses.clearStorageData();
        if (R.cookie) await ses.cookies.set({ url: ORIGIN, name: "fs_session", value: R.cookie, httpOnly: true, path: "/" });
        for (const vp of VIEWPORTS) {
          win.setContentSize(vp.w, vp.h);
          for (const page of R.pages) {
            consoleBuf = [];
            try {
              await Promise.race([wc.loadURL(new URL(page, ORIGIN).href), wait(30000)]);
            } catch {
              /* 404 pages still render */
            }
            await wait(1100);
            await wc.insertCSS('*, *::before, *::after { transition: none !important; animation: none !important; }'); // theme switches instantly: no half-faded frames in screenshots
            for (const theme of ["light", "dark"]) {
              await js(`document.documentElement.dataset.theme = '${theme}'`);
              await wait(500);
              const m = await js(`(() => {
                const vw = document.documentElement.clientWidth;
                const scrollable = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true; } return false; };
                const bad = [];
                for (const el of document.querySelectorAll('body *')) {
                  const b = el.getBoundingClientRect();
                  if (b.width > 0 && (b.right > vw + 1 || b.left < -1) && getComputedStyle(el).position !== 'fixed' && !scrollable(el)) {
                    bad.push(el.tagName.toLowerCase() + '.' + String(el.className || '').slice(0, 50).replace(/\\s+/g, '.') + ' right=' + Math.round(b.right));
                    if (bad.length >= 4) break;
                  }
                }
                const small = [...document.querySelectorAll('button, a, input, select, textarea')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.height < 28 || b.width < 28) && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'; }).length;
                return { vw, docW: document.documentElement.scrollWidth, bad, textLen: document.body.innerText.length, smallTargets: small, title: document.title };
              })()`);
              report.checked++;
              const label = `${R.role} ${page} @${vp.name} ${theme}`;
              if (m.docW > m.vw + 1 || m.bad.length) report.overflow.push({ where: label, docW: m.docW, vw: m.vw, elements: m.bad });
              if (m.textLen < 20) report.failedToLoad.push(label);
              if (theme === "dark" && consoleBuf.length) report.consoleProblems.push({ where: `${R.role} ${page} @${vp.name}`, messages: [...new Set(consoleBuf)].slice(0, 3) });
              if (dir && SHOT_VIEWPORTS.has(vp.name) && (theme === "light" || page === "/dashboard" || page === "/admin")) {
                const img = await wc.capturePage();
                const file = `${R.role}-${page.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home"}-${vp.name}-${theme}.png`;
                fs.writeFileSync(path.join(dir, file), img.toPNG());
                report.shots++;
              }
            }
          }
        }
      }
      win.destroy();
    } catch (err) {
      report.error = String((err && err.stack) || err).slice(0, 500);
    }
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
