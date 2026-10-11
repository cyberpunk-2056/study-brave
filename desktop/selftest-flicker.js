// Development-only diagnostic for the taskbar panel-open flicker (never packaged).
//   FOCUS_SELFTEST=flicker FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .
// capturePage() can't see the composited result of two WebContentsView layers reliably on every machine, so this
// takes REAL screenshots of the physical screen (same technique as selftest-taskbar.js), in quick succession right
// after a taskbar click, so a transition artifact shows up as a sequence of frames instead of one lucky screenshot.
const { execFile } = require("node:child_process");
const path = require("node:path");

module.exports = function runFlickerTest(ctx) {
  const { app, session } = ctx;
  const failsafe = setTimeout(() => app.exit(2), 60000);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dir = process.env.FOCUS_SHOT_DIR;

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

      let i = 0;
      const frames = [];
      const go = async (label) => {
        const ok = await shot(`flicker-${String(i++).padStart(2, "0")}-${label}`);
        frames.push({ label, ok });
      };

      await go("before");
      ctx.bar().executeJavaScript(`document.querySelector('[data-panel="wifi"]').click()`);
      for (const delay of [0, 16, 33, 50, 66, 100, 150, 250]) {
        await wait(delay);
        await go(`open-t${delay}ms`);
      }
      ctx.bar().executeJavaScript(`document.querySelector('[data-panel="wifi"]').click()`); // close it the same way
      for (const delay of [0, 16, 33, 50, 66, 100, 150, 250]) {
        await wait(delay);
        await go(`close-t${delay}ms`);
      }

      console.log("SELFTEST_RESULT " + JSON.stringify({ frames }));
    } catch (err) {
      console.log("SELFTEST_RESULT " + JSON.stringify({ error: String((err && err.stack) || err) }));
    }
    clearTimeout(failsafe);
    ctx.quit();
  })();
};
