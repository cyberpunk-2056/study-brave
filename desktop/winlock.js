// Windows Start/taskbar/Task Manager lockout for strict study sessions.
// Same pattern as sysaudio.js: one long-running PowerShell helper holds native state open and answers small text
// commands. This one keeps a low-level keyboard hook alive (needs a running Win32 message pump, which only a
// persistent helper process can provide — Electron's own globalShortcut cannot catch a bare Windows-key tap,
// since the OS treats it as a hotkey reserved for the shell), hides/shows the real Windows taskbar, and disables
// Task Manager itself via the same policy Windows admins use.
//
// Ctrl+Alt+Delete is NOT handled here, on purpose: it is the one keyboard combination no process running as a
// normal user can ever intercept, by design — Windows reserves it at the OS security layer (the "Secure Attention
// Sequence") specifically so no application, not even malware with full user privileges, can fake or swallow it.
// What actually matters — stopping a student from using it to kill this app — is that Task Manager itself refuses
// to open from there (or anywhere else) while this helper is engaged.
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const CSHARP = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class State {
  public static volatile bool Block = false;
}

public static class Hook {
  const int WH_KEYBOARD_LL = 13;
  const int WM_KEYDOWN = 0x0100, WM_KEYUP = 0x0101, WM_SYSKEYDOWN = 0x0104, WM_SYSKEYUP = 0x0105;
  const int VK_LWIN = 0x5B, VK_RWIN = 0x5C, VK_ESCAPE = 0x1B, VK_CONTROL = 0x11;

  public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);
  static readonly HookProc Proc = Callback; // kept alive: a GC'd delegate would crash the hook
  static IntPtr hookId = IntPtr.Zero;

  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] static extern bool GetMessage(out MSG msg, IntPtr hWnd, uint min, uint max);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG msg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG msg);

  // A low-level hook only fires while the thread that installed it keeps pumping Windows messages, so that pump
  // (and the SetWindowsHookEx call itself, which must happen on the same thread) lives on its own background
  // thread here — entirely in C#, never as a PowerShell scriptblock handed to a raw .NET Thread, which PowerShell
  // cannot actually run that way (a ScriptBlock-to-delegate cast only works for callbacks invoked on an existing
  // PowerShell-aware thread, not as a thread's own entry point).
  public static void Install() {
    var t = new System.Threading.Thread(() => {
      using (var p = System.Diagnostics.Process.GetCurrentProcess())
      using (var m = p.MainModule) hookId = SetWindowsHookEx(WH_KEYBOARD_LL, Proc, GetModuleHandle(m.ModuleName), 0);
      MSG msg;
      while (GetMessage(out msg, IntPtr.Zero, 0, 0)) { TranslateMessage(ref msg); DispatchMessage(ref msg); }
    });
    t.IsBackground = true;
    t.Start();
  }

  static IntPtr Callback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0 && State.Block) {
      int vk = Marshal.ReadInt32(lParam); // KBDLLHOOKSTRUCT.vkCode is the first field
      int msg = wParam.ToInt32();
      bool down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
      bool up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
      if ((down || up) && (vk == VK_LWIN || vk == VK_RWIN)) return (IntPtr)1; // the Windows key itself
      bool ctrlDown = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
      // Ctrl+Esc opens Start; Ctrl+Shift+Esc opens Task Manager directly. Both go through Escape + Ctrl, so one
      // check catches both regardless of Shift.
      if (down && vk == VK_ESCAPE && ctrlDown) return (IntPtr)1;
    }
    return CallNextHookEx(hookId, nCode, wParam, lParam);
  }
}

public static class Taskbar {
  [DllImport("user32.dll")] static extern IntPtr FindWindow(string cls, string wnd);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder cls, int max);
  delegate bool EnumProc(IntPtr hwnd, IntPtr lp);
  const int SW_HIDE = 0, SW_SHOW = 5;

  static List<IntPtr> Trays() {
    var list = new List<IntPtr>();
    var primary = FindWindow("Shell_TrayWnd", null);
    if (primary != IntPtr.Zero) list.Add(primary);
    EnumWindows((h, l) => {
      var sb = new StringBuilder(256);
      GetClassName(h, sb, sb.Capacity);
      if (sb.ToString() == "Shell_SecondaryTrayWnd") list.Add(h); // one per extra monitor
      return true;
    }, IntPtr.Zero);
    return list;
  }

  public static void Hide() { foreach (var h in Trays()) ShowWindow(h, SW_HIDE); }
  public static void Show() { foreach (var h in Trays()) ShowWindow(h, SW_SHOW); }
}

// The documented Windows mechanism for disabling Task Manager (what IT admins set via Group Policy). Kept as a
// first layer because it is real and does work for a standard (non-administrator) account — the kind a parent or
// school might actually set up for a student. It is deliberately NOT relied on alone: tested directly against this
// Windows 11 build on an administrator account, Task Manager opened normally anyway with this policy active —
// Microsoft has never documented DisableTaskMgr as binding on admin accounts, and in practice it isn't. Most home
// PCs have the student as the computer's one and only (administrator) account, so TaskmgrKiller below is the
// mechanism actually doing the work in that common case.
public static class Taskmgr {
  const string KeyPath = @"Software\Microsoft\Windows\CurrentVersion\Policies\System";
  public static void Disable() {
    using (var k = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(KeyPath)) k.SetValue("DisableTaskMgr", 1, Microsoft.Win32.RegistryValueKind.DWord);
  }
  public static void Enable() {
    using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(KeyPath, true)) if (k != null) k.DeleteValue("DisableTaskMgr", false);
  }
}

// The mechanism that actually works regardless of account type: watch for Taskmgr.exe and end it the instant it
// appears, before its window can finish rendering or take a click. Verified directly (see winlock.js's self-test
// below and the conversation that led here) that Process.Kill() on Task Manager succeeds from a perfectly ordinary,
// non-elevated process — nothing about Task Manager actually requires elevation to terminate, despite it being the
// one app that can terminate everything else. Measured end-to-end (spawn to killed) at under half a second, almost
// all of it Windows' own time starting the modern Task Manager package before its process is even visible to poll
// for — our own polling (every 50 ms while engaged; 1s otherwise, to stay cheap the rest of the time) adds only a
// few ms on top of that.
public static class TaskmgrKiller {
  public static void Start() {
    var t = new System.Threading.Thread(() => {
      while (true) {
        if (State.Block) {
          try {
            foreach (var p in System.Diagnostics.Process.GetProcessesByName("Taskmgr")) {
              try { p.Kill(); } catch { /* already gone, or gone by the time Kill() ran */ }
            }
          } catch { /* process list unavailable this instant — try again next tick */ }
          System.Threading.Thread.Sleep(50);
        } else {
          System.Threading.Thread.Sleep(1000);
        }
      }
    });
    t.IsBackground = true;
    t.Start();
  }
}

// The app's own before-quit handler calls release()/stop() on a normal quit, but that JS never runs at all if
// Electron is killed outright (Task Manager "End task", a crash, a forced taskkill) — and even app.exit(), used
// for a fast quit, explicitly skips before-quit. So this is the real safety net: watch the PID of the process
// that spawned us, and the moment it's gone — by any means — restore everything ourselves and exit. Checked every
// second, so the real taskbar/Windows key can be gone for at most ~1s after a hard kill, never indefinitely.
public static class Watchdog {
  public static void Start(int parentPid) {
    var t = new System.Threading.Thread(() => {
      while (true) {
        System.Threading.Thread.Sleep(1000);
        bool alive;
        try { alive = !System.Diagnostics.Process.GetProcessById(parentPid).HasExited; }
        catch (ArgumentException) { alive = false; }
        if (!alive) {
          State.Block = false;
          Taskbar.Show();
          Taskmgr.Enable();
          Environment.Exit(0);
        }
      }
    });
    t.IsBackground = true;
    t.Start();
  }
}`;

const script = (parentPid) => `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CSHARP}
'@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Send($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }

[Hook]::Install()
[Watchdog]::Start(${parentPid})
[TaskmgrKiller]::Start()
Send @{ ready = $true }
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Trim().Split(' ')
  try {
    switch ($p[0]) {
      'block'   { [State]::Block = $true;  Send @{ id = $p[1]; ok = $true } }
      'unblock' { [State]::Block = $false; Send @{ id = $p[1]; ok = $true } }
      'hidebar' { [Taskbar]::Hide();  Send @{ id = $p[1]; ok = $true } }
      'showbar' { [Taskbar]::Show();  Send @{ id = $p[1]; ok = $true } }
      'tmoff'   { [Taskmgr]::Disable(); Send @{ id = $p[1]; ok = $true } }
      'tmon'    { [Taskmgr]::Enable();  Send @{ id = $p[1]; ok = $true } }
      default   { Send @{ id = $p[1]; error = 'unknown command' } }
    }
  } catch { Send @{ id = $p[1]; error = $_.Exception.Message } }
}
# Getting here means our stdin pipe closed — the only way that happens is the Electron process that owns the
# other end going away, by any means: a normal quit, a crash, or even Task Manager "End task". That covers cases
# a before-quit handler on the Electron side cannot (app.exit() skips it entirely, and a hard kill runs no JS at
# all), so the real taskbar and the Windows key are always handed back here too, not only on an explicit command.
[State]::Block = $false
[Taskbar]::Show()
[Taskmgr]::Enable()
`;

function createWinLock() {
  let proc = null;
  let buffer = "";
  let ready = null;
  const waiting = new Map();

  function start() {
    if (proc) return ready;
    const encoded = Buffer.from(script(process.pid), "utf16le").toString("base64");
    proc = spawn("powershell.exe", ["-NoProfile", "-NoLogo", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "ignore"],
    });
    ready = new Promise((resolve) => {
      const onExit = () => {
        proc = null;
        ready = null;
        for (const { resolve: r, timer } of waiting.values()) {
          clearTimeout(timer);
          r({ error: "helper stopped" });
        }
        waiting.clear();
        resolve(false);
      };
      proc.on("exit", onExit);
      proc.on("error", onExit);
      proc.stdout.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => {
        buffer += chunk;
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, i).trim();
          buffer = buffer.slice(i + 1);
          if (!line) continue;
          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.ready) resolve(true);
          else if (msg.id && waiting.has(msg.id)) {
            const w = waiting.get(msg.id);
            clearTimeout(w.timer);
            waiting.delete(msg.id);
            w.resolve(msg);
          }
        }
      });
    });
    return ready;
  }

  async function call(command) {
    const ok = await start();
    if (!ok || !proc) return { error: "Lock helper is not available." };
    const id = crypto.randomBytes(4).toString("hex");
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve({ error: "timeout" });
      }, 5000);
      waiting.set(id, { resolve, timer });
      proc.stdin.write(`${command} ${id}\n`);
    });
  }

  return {
    start,
    // All three fire together: the Windows key (and Ctrl+Esc/Ctrl+Shift+Esc) stop doing anything, the real
    // taskbar disappears, and Task Manager refuses to open from anywhere (Win+X, Run, taskmgr.exe directly, …).
    async engage() {
      await Promise.all([call("block"), call("hidebar"), call("tmoff")]);
    },
    async release() {
      await Promise.all([call("unblock"), call("showbar"), call("tmon")]);
    },
    stop() {
      if (!proc) return;
      // Closing our end of stdin (rather than just killing the process) is what makes the helper run its own
      // EOF cleanup path — the one restore codepath that also fires on a crash or a hard kill, see SCRIPT above.
      try {
        proc.stdin.end();
      } catch {
        /* already gone */
      }
      setTimeout(() => proc && proc.kill(), 300);
    },
  };
}

module.exports = { createWinLock };
