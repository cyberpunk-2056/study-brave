// Windows volume + battery for the taskbar.
// Electron has no API for the master volume or battery presence, so one long-running PowerShell helper holds the
// Windows Core Audio interface open and answers small text commands ("getvol", "setvol 40", "mute 1", "battery").
// It is started lazily and killed when the app quits.
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");

const CSHARP = `
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p); int GetChannelCount(out uint n);
  int SetMasterVolumeLevel(float db, Guid ctx);
  int SetMasterVolumeLevelScalar(float level, Guid ctx);
  int GetMasterVolumeLevel(out float db);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint c, float db, Guid ctx); int SetChannelVolumeLevelScalar(uint c, float l, Guid ctx);
  int GetChannelVolumeLevel(uint c, out float db); int GetChannelVolumeLevelScalar(uint c, out float l);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid ctx);
  int GetMute(out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, IntPtr activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int EnumAudioEndpoints(int flow, int mask, out IntPtr devices); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class Keys {
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  public static void Tap(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); keybd_event(vk, 0, 2, UIntPtr.Zero); }
}
public static class Audio {
  static IAudioEndpointVolume Endpoint() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice device; Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    IAudioEndpointVolume epv; Guid id = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, IntPtr.Zero, out epv));
    return epv;
  }
  public static float Volume {
    get { float v; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(value, Guid.Empty)); }
  }
  public static bool Mute {
    get { bool m; Marshal.ThrowExceptionForHR(Endpoint().GetMute(out m)); return m; }
    set { Marshal.ThrowExceptionForHR(Endpoint().SetMute(value, Guid.Empty)); }
  }
}`;

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
${CSHARP}
'@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Send($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function VolState($id) { @{ id = $id; volume = [int][Math]::Round([Audio]::Volume * 100); muted = [bool][Audio]::Mute } }
Send @{ ready = $true }
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $p = $line.Trim().Split(' ')
  try {
    switch ($p[0]) {
      'getvol'  { Send (VolState $p[1]) }
      'setvol'  { [Audio]::Volume = [single]([int]$p[2] / 100.0); Send (VolState $p[1]) }
      'mute'    { [Audio]::Mute = ($p[2] -eq '1'); Send (VolState $p[1]) }
      'key'     { $vk = @{ up = 0xAF; down = 0xAE; mute = 0xAD }[$p[2]]; if ($vk) { [Keys]::Tap([byte]$vk) }; Send @{ id = $p[1]; ok = $true } }
      'battery' {
        $b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($b) { Send @{ id = $p[1]; present = $true; level = [int]$b.EstimatedChargeRemaining; status = [int]$b.BatteryStatus } }
        else { Send @{ id = $p[1]; present = $false } }
      }
      default   { Send @{ id = $p[1]; error = 'unknown command' } }
    }
  } catch { Send @{ id = $p[1]; error = $_.Exception.Message } }
}
`;

function createSysHelper() {
  let proc = null;
  let buffer = "";
  let ready = null; // promise resolved when the helper printed {ready:true}
  const waiting = new Map(); // id -> {resolve, timer}

  function start() {
    if (proc) return ready;
    const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
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
    if (!ok || !proc) return { error: "Audio helper is not available." };
    const id = crypto.randomBytes(4).toString("hex");
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        resolve({ error: "timeout" });
      }, 8000);
      waiting.set(id, { resolve, timer });
      proc.stdin.write(`${command.replace(/\s+/g, " ").replace(/^(\w+)/, "$1 " + id)}\n`);
    });
  }

  const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
  return {
    start,
    getVolume: () => call("getvol"),
    setVolume: (n) => call(`setvol ${clamp(n)}`),
    setMute: (m) => call(`mute ${m ? 1 : 0}`),
    battery: () => call("battery"),
    // Fallback when exact volume control is unavailable: press the keyboard volume keys (up / down / mute).
    pressKey: (which) => (['up', 'down', 'mute'].includes(which) ? call(`key ${which}`) : Promise.resolve({ error: 'bad key' })),
    stop() {
      if (proc) proc.kill();
    },
  };
}

module.exports = { createSysHelper };
