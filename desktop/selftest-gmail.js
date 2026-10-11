// Development-only test of the new Gmail desktop icon (opens in its own in-app view, not a browser).
//   FOCUS_SELFTEST=gmail FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SELFTEST_OUT=<result.json> npx electron .
const fs = require("node:fs");
const path = require("node:path");

function shot(name) {
  const dir = process.env.FOCUS_SHOT_DIR;
  return new Promise((resolve) => {
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
    require("node:child_process").execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true, timeout: 20000 }, (err) => resolve(!err));
  });
}

module.exports = function runGmailTest(ctx) {
  const { app, session, wc, bar, origin, quit, courseWC, courseBounds, courseCount } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 60000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = {};

  (async () => {
    try {
      const ORIGIN = origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });
      wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => wc().once("did-finish-load", r));
      await wait(1000);

      report.gmailIconPresent = await wc().executeJavaScript(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Gmail')`);
      await wc().executeJavaScript(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Gmail').click()`);
      await wait(4000); // real network load of mail.google.com, give it time

      report.courseCount = courseCount();
      const gwc = courseWC("gmail");
      report.gmailViewExists = !!gwc;
      report.gmailUrl = gwc ? gwc.getURL() : null;
      report.gmailBoundsVisible = (() => {
        const b = courseBounds("gmail");
        return !!b && b.width > 0 && b.height > 0;
      })();

      // Confirm the taskbar actually shows a Gmail chip, independent of the main-process view state above.
      report.taskbarHasGmailChip = await bar().executeJavaScript(`[...document.querySelectorAll('.course-chip .label')].some(s => s.textContent === 'Gmail')`);
      report.screenshot = await shot("gmail");
    } catch (err) {
      report.error = String((err && err.stack) || err);
    }
    try {
      const outFile = process.env.FOCUS_SELFTEST_OUT;
      if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    } catch {}
    clearTimeout(failsafe);
    quit();
  })();
};
