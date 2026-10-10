// Wi-Fi for the taskbar, using Windows' own `netsh wlan` tool (no admin rights needed for the current user).
// Every command is run with execFile and an argument array, never through a shell, so a network name or password
// can never be turned into a command. Profile XML is built with escaping and written to a private temp file that is
// deleted right after use.
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const netsh = (args, timeout = 9000) =>
  new Promise((resolve) => {
    execFile("netsh", args, { windowsHide: true, timeout, encoding: "utf8", maxBuffer: 4_000_000 }, (err, stdout, stderr) =>
      resolve({ ok: !err, out: String(stdout || ""), err: String(stderr || "") + (err ? String(err.message) : "") }),
    );
  });

// "Key : value" lines. The key/value separator is a colon followed by a space, so MAC addresses (aa:bb:cc) stay intact.
const kv = (line) => {
  const m = /^\s*(.+?)\s*:\s(.*)$/.exec(line);
  return m ? [m[1].trim(), m[2].trim()] : null;
};

/** `netsh wlan show interfaces` -> the connection of the first Wi-Fi adapter. */
function parseInterfaces(text) {
  const result = { available: false, connected: false, ssid: "", signal: 0, adapter: "" };
  for (const line of text.split(/\r?\n/)) {
    const pair = kv(line);
    if (!pair) continue;
    const [key, value] = pair;
    result.available = true;
    if (!result.adapter && /^(name|nom|nombre)$/i.test(key)) result.adapter = value;
    if (/^ssid$/i.test(key) && value) {
      result.ssid = value;
      result.connected = true;
    }
    if (/^\d+%$/.test(value)) result.signal = parseInt(value, 10);
  }
  return result;
}

/** `netsh wlan show networks mode=bssid` -> [{ssid, signal, auth, secure, enterprise}] strongest first. */
function parseNetworks(text) {
  const nets = [];
  let cur = null;
  let fields = 0;
  let seenBssid = false;
  for (const line of text.split(/\r?\n/)) {
    const head = /^SSID\s+\d+\s*:\s?(.*)$/.exec(line.trim());
    if (head) {
      cur = { ssid: head[1].trim(), signal: 0, auth: "", enc: "" };
      nets.push(cur);
      fields = 0;
      seenBssid = false;
      continue;
    }
    if (!cur) continue;
    if (/^\s*BSSID\s+\d+/i.test(line)) seenBssid = true;
    const pair = kv(line);
    if (!pair) continue;
    const [, value] = pair;
    if (/^\d+%$/.test(value)) cur.signal = Math.max(cur.signal, parseInt(value, 10));
    if (!seenBssid) {
      fields += 1; // order is fixed: 1 network type, 2 authentication, 3 encryption
      if (fields === 2) cur.auth = value;
      if (fields === 3) cur.enc = value;
    }
  }
  const best = new Map();
  for (const n of nets) {
    if (!n.ssid) continue; // hidden networks
    const prev = best.get(n.ssid);
    if (!prev || n.signal > prev.signal) best.set(n.ssid, n);
  }
  return [...best.values()]
    .map((n) => {
      const open = /^(open|offen|abiert|ouvert|aberto|aperto)/i.test(n.auth) || /^(none|keine|ninguno|aucun|nenhum)/i.test(n.enc);
      const enterprise = /enterprise|802\.1x|1x/i.test(n.auth);
      const wpa3Only = /wpa3/i.test(n.auth) && !/wpa2/i.test(n.auth) && !/transition/i.test(n.auth);
      return { ssid: n.ssid, signal: n.signal, auth: n.auth, secure: !open, enterprise, wpa3Only };
    })
    .sort((a, b) => b.signal - a.signal);
}

/** `netsh wlan show profiles` -> names of networks this user has connected to before. */
function parseProfiles(text) {
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const pair = kv(line);
    if (pair && /profil/i.test(pair[0]) && pair[1]) names.push(pair[1]);
  }
  return names;
}

const xmlEscape = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

function validSsid(ssid) {
  return typeof ssid === "string" && ssid.length > 0 && Buffer.byteLength(ssid, "utf8") <= 32 && !/[\u0000-\u001f\u007f]/.test(ssid);
}
function validPassword(p) {
  return typeof p === "string" && ((p.length >= 8 && p.length <= 63 && /^[ -~]+$/.test(p)) || /^[0-9a-fA-F]{64}$/.test(p));
}

/** WLAN profile XML for an open or WPA2-Personal network. */
function buildProfile(ssid, password) {
  const name = xmlEscape(ssid);
  const security = password
    ? `<authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption>
      <sharedKey><keyType>${/^[0-9a-fA-F]{64}$/.test(password) ? "networkKey" : "passPhrase"}</keyType><protected>false</protected><keyMaterial>${xmlEscape(password)}</keyMaterial></sharedKey>`
    : `<authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption>`;
  return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${name}</name>
  <SSIDConfig><SSID><name>${name}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>auto</connectionMode>
  <MSM><security>${security}</security></MSM>
</WLANProfile>`;
}

function createWifi() {
  let lastScan = [];

  async function status() {
    const r = await netsh(["wlan", "show", "interfaces"]);
    if (!r.ok && !r.out) return { available: false, connected: false, ssid: "", signal: 0 };
    return parseInterfaces(r.out);
  }

  async function scan() {
    const [nets, profiles] = await Promise.all([netsh(["wlan", "show", "networks", "mode=bssid"]), netsh(["wlan", "show", "profiles"])]);
    if (!nets.ok && !nets.out) return { ok: false, error: "No Wi-Fi adapter was found.", networks: [] };
    const known = new Set(parseProfiles(profiles.out));
    const current = (await status()).ssid;
    lastScan = parseNetworks(nets.out).map((n) => ({ ...n, known: known.has(n.ssid), connected: n.ssid === current }));
    return { ok: true, networks: lastScan };
  }

  async function waitConnected(ssid, ms = 12000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await status();
      if (s.connected && s.ssid === ssid) return true;
      await new Promise((r) => setTimeout(r, 800));
    }
    return false;
  }

  /** Connect to a network from the last scan. A password is only needed the first time for a secured network. */
  async function connect({ ssid, password }) {
    if (!validSsid(ssid)) return { ok: false, error: "Invalid network name." };
    const net = lastScan.find((n) => n.ssid === ssid);
    if (!net) return { ok: false, error: "Network not found. Refresh the list and try again." };
    if (net.enterprise) return { ok: false, error: "Company/school (802.1X) networks cannot be set up here." };

    if (!net.known) {
      if (net.secure) {
        if (net.wpa3Only) return { ok: false, error: "This network needs WPA3 only, which is not supported here." };
        if (!validPassword(password)) return { ok: false, error: "Enter the network password (8–63 characters)." };
      }
      const file = path.join(os.tmpdir(), `fs-wlan-${crypto.randomBytes(8).toString("hex")}.xml`);
      try {
        fs.writeFileSync(file, buildProfile(ssid, net.secure ? password : ""), { mode: 0o600 });
        const added = await netsh(["wlan", "add", "profile", `filename=${file}`, "user=current"]);
        if (!added.ok) return { ok: false, error: "Windows would not save this network." };
      } finally {
        fs.rmSync(file, { force: true });
      }
    }
    const c = await netsh(["wlan", "connect", `name=${ssid}`, `ssid=${ssid}`]);
    if (!c.ok) return { ok: false, error: "Could not start the connection." };
    if (await waitConnected(ssid)) return { ok: true };
    // A wrong password leaves a bad saved profile behind; remove it so the next try asks again.
    if (!net.known) await netsh(["wlan", "delete", "profile", `name=${ssid}`]);
    return { ok: false, error: net.known ? "Could not connect. Check the network is in range." : "Could not connect. The password may be wrong." };
  }

  async function disconnect() {
    const r = await netsh(["wlan", "disconnect"]);
    return { ok: r.ok };
  }

  return { status, scan, connect, disconnect };
}

module.exports = { createWifi, parseInterfaces, parseNetworks, parseProfiles, buildProfile, validSsid, validPassword, xmlEscape };
