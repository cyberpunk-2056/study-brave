// Development-only test of the website's own header menu button opening its slide-out navigation (never
// packaged). The taskbar used to have its own button for this too; it's now the Home button instead (see
// selftest-home.js), so this only checks the website's side, same as a normal browser would see it.
//   FOCUS_SELFTEST=menu FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .
const { execFile } = require("node:child_process");
const path = require("node:path");

module.exports = function runMenuTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 60000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dir = process.env.FOCUS_SHOT_DIR;
  const report = {};

  const shot = (name) =>
    new Promise((resolve) => {
      if (!dir) return resolve(false);
      const file = path.join(dir, name + ".png").replace(/'/g, "''");
      const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type 'using System.Runtime.InteropServices; public class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }'
[Dpi]::SetProcessDPIAware() | Out-Null
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
$bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png)`;
      execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true, timeout: 20000 }, (err) => resolve(!err));
    });

  (async () => {
    try {
      const ORIGIN = ctx.origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      ctx.wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => ctx.wc().once("did-finish-load", r));
      await wait(2000);

      report.menuOpenBefore = await ctx.wc().executeJavaScript(`!!document.querySelector('[aria-label="Navigation"]')`);
      await ctx.wc().executeJavaScript(`document.querySelector('[aria-label="Open menu"]').click()`);
      await wait(700);
      report.menuOpenAfterClick = await ctx.wc().executeJavaScript(`!!document.querySelector('[aria-label="Navigation"]')`);
      report.navLinkCount = await ctx.wc().executeJavaScript(`document.querySelectorAll('[aria-label="Navigation"] a').length`);
      await shot("menu-from-header");

      await ctx.wc().executeJavaScript(`document.querySelector('[aria-label="Close"]').click()`);
      await wait(500);
      report.menuOpenAfterClose = await ctx.wc().executeJavaScript(`!!document.querySelector('[aria-label="Navigation"]')`);

      console.log("SELFTEST_RESULT " + JSON.stringify(report));
    } catch (err) {
      console.log("SELFTEST_RESULT " + JSON.stringify({ ...report, error: String((err && err.stack) || err) }));
    }
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
