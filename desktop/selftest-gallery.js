// Development-only test of the in-app "My Files" gallery (never packaged).
//   FOCUS_SELFTEST=gallery FOCUS_SELFTEST_COOKIE=<student session> FOCUS_SHOT_DIR=<folder> npx electron .
const fs = require("node:fs");
const path = require("node:path");

module.exports = function runGalleryTest(ctx) {
  const { app, session, wc, bar, origin, quit } = ctx;
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
      require("node:child_process").execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { windowsHide: true, timeout: 20000 }, (err) => resolve(!err));
    });

  (async () => {
    try {
      const ORIGIN = origin();
      await session.defaultSession.cookies.set({ url: ORIGIN, name: "fs_session", value: process.env.FOCUS_SELFTEST_COOKIE, httpOnly: true, path: "/" });

      // Take two real screenshots first via the real taskbar button, so the gallery has real files to show.
      wc().loadURL(new URL("/dashboard", ORIGIN).href);
      await new Promise((r) => wc().once("did-finish-load", r));
      await wait(1500);
      await bar().executeJavaScript(`document.getElementById("screenshot-btn").click()`);
      await wait(2500);
      await bar().executeJavaScript(`document.getElementById("screenshot-btn").disabled = false; document.getElementById("screenshot-btn").click()`);
      await wait(2500);

      // Open the gallery from the Home screen.
      await wc().executeJavaScript(`[...document.querySelectorAll('a')].find(a => a.textContent.includes('My Files')).click()`);
      await wait(2000);
      report.fileCount = await wc().executeJavaScript(`document.querySelectorAll('img[src^="focusfile://"]').length`);
      report.pageHasOpenFolderBtn = await wc().executeJavaScript(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Open folder in File Explorer'))`);
      report.firstImgSrc = await wc().executeJavaScript(`document.querySelector('img[src^="focusfile://"]')?.src ?? null`);

      // Confirm the image actually LOADED (naturalWidth > 0), proving focusfile:// really served real bytes.
      await wait(800);
      report.firstImgLoaded = await wc().executeJavaScript(`(document.querySelector('img[src^="focusfile://"]')?.naturalWidth ?? 0) > 0`);
      await shot("gallery");

      // Delete one and confirm the count drops.
      await wc().executeJavaScript(`document.querySelector('button[aria-label^="Delete"]').click()`);
      await wait(1200);
      report.fileCountAfterDelete = await wc().executeJavaScript(`document.querySelectorAll('img[src^="focusfile://"]').length`);

    } catch (err) {
      report.error = String((err && err.stack) || err);
    }
    try {
      const outFile = process.env.FOCUS_SELFTEST_OUT;
      if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
    } catch {}
    console.log("SELFTEST_RESULT " + JSON.stringify(report));
    clearTimeout(failsafe);
    quit();
  })();
};
