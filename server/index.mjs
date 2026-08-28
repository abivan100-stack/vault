import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";

const port = Number(process.env.PORT || 8787);
const apiKey = process.env.VAULT_DEVICE_KEY || "";
const dbPath = process.env.VAULT_DB_PATH || join(process.cwd(), "data", "vault.db");
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    box TEXT NOT NULL,
    batch TEXT NOT NULL,
    product TEXT NOT NULL,
    doses TEXT NOT NULL,
    corridor TEXT NOT NULL,
    route TEXT NOT NULL,
    started_at TEXT NOT NULL,
    handed_off_at TEXT
  );
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL REFERENCES shipments(id),
    device_id TEXT NOT NULL,
    temperature REAL NOT NULL,
    humidity REAL,
    status TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ledger (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL REFERENCES shipments(id),
    event TEXT NOT NULL,
    detail TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    hash TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    telegram_chat_id TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('VIEWER', 'OPERATOR', 'ADMIN')),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS device_alarm_state (
    shipment_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 0,
    acknowledgement_state TEXT NOT NULL DEFAULT 'NONE',
    requested_at TEXT,
    acknowledged_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (shipment_id, device_id)
  );
`);
try { db.exec("ALTER TABLE organizations ADD COLUMN telegram_chat_id TEXT"); } catch { /* already present */ }

const json = (value) => JSON.stringify(value);
const send = (response, status, body) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-api-key",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  response.end(json(body));
};

const readBody = async (request) => {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request body too large");
  }
  return raw ? JSON.parse(raw) : {};
};

const statusFor = (temperature) => temperature < 2 ? "TOO_COLD" : temperature > 8 ? "TOO_HOT" : "SAFE";
const hashEntry = (body) => createHash("sha256").update([body.sequence, body.shipmentId, body.event, body.recordedAt, body.detail, body.previousHash].join("\0")).digest("hex");
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const hashPassword = (password, salt) => scryptSync(password, salt, 64).toString("hex");

function appendLedger(shipmentId, event, detail, recordedAt) {
  const previous = db.prepare("SELECT hash FROM ledger WHERE shipment_id = ? ORDER BY sequence DESC LIMIT 1").get(shipmentId);
  const previousHash = previous?.hash || "0".repeat(64);
  const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM ledger").get().next);
  const body = { sequence, shipmentId, event, recordedAt, detail, previousHash };
  const hash = hashEntry(body);
  db.prepare("INSERT INTO ledger (sequence, shipment_id, event, detail, recorded_at, previous_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?)").run(sequence, shipmentId, event, detail, recordedAt, previousHash, hash);
  return { ...body, hash };
}

function ensureShipment(shipmentId) {
  const existing = db.prepare("SELECT id FROM shipments WHERE id = ?").get(shipmentId);
  if (existing) return;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO shipments (id, box, batch, product, doses, corridor, route, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(shipmentId, "ESP32-BOX-01", "UNASSIGNED", "Unspecified payload", "—", "2–8 °C", "Unknown → Unknown", now);
  appendLedger(shipmentId, "SHIPMENT_CREATE", "Created by device ingestion", now);
}

function updateAlarmState(shipmentId, deviceId, status, recordedAt) {
  const existing = db.prepare("SELECT active FROM device_alarm_state WHERE shipment_id = ? AND device_id = ?").get(shipmentId, deviceId);
  if (status === "SAFE") {
    if (existing) {
      db.prepare("UPDATE device_alarm_state SET active = 0, acknowledgement_state = 'NONE', requested_at = NULL, acknowledged_at = NULL, updated_at = ? WHERE shipment_id = ? AND device_id = ?").run(recordedAt, shipmentId, deviceId);
    }
    return;
  }
  if (existing?.active) {
    db.prepare("UPDATE device_alarm_state SET updated_at = ? WHERE shipment_id = ? AND device_id = ?").run(recordedAt, shipmentId, deviceId);
    return;
  }
  db.prepare("INSERT INTO device_alarm_state (shipment_id, device_id, active, acknowledgement_state, requested_at, acknowledged_at, updated_at) VALUES (?, ?, 1, 'UNACKNOWLEDGED', NULL, NULL, ?) ON CONFLICT(shipment_id, device_id) DO UPDATE SET active = 1, acknowledgement_state = 'UNACKNOWLEDGED', requested_at = NULL, acknowledged_at = NULL, updated_at = excluded.updated_at").run(shipmentId, deviceId, recordedAt);
}

function alarmState(shipmentId, deviceId) {
  return db.prepare("SELECT active, acknowledgement_state, requested_at, acknowledged_at, updated_at FROM device_alarm_state WHERE shipment_id = ? AND device_id = ?").get(shipmentId, deviceId)
    || { active: 0, acknowledgement_state: "NONE", requested_at: null, acknowledged_at: null, updated_at: null };
}

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, organizationId: user.organization_id };
}

function sessionUser(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  return db.prepare("SELECT users.*, organizations.telegram_chat_id FROM users JOIN organizations ON organizations.id = users.organization_id JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = ?").get(hashToken(token));
}

async function sendTelegramAlert(chatId, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return { sent: false, skipped: true };
  const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  return { sent: result.ok, skipped: false };
}

// Keep excursion notifications useful without flooding the chat. Each shipment
// gets an immediate alert, then may send another alert once every 30 seconds.
const TELEGRAM_ALERT_INTERVAL_MS = 30_000;
const lastTelegramAlertAt = new Map();
// Learned from each device upload, so DHCP address changes do not require a
// frontend rebuild or a hard-coded ESP32 address in the browser.
const deviceHosts = new Map();

function normalizeDeviceHost(remoteAddress) {
  if (!remoteAddress) return null;
  const host = remoteAddress.startsWith("::ffff:") ? remoteAddress.slice(7) : remoteAddress;
  return host === "::1" ? "127.0.0.1" : host;
}

async function deliverDeviceAcknowledgement(deviceId) {
  const configured = String(process.env.VAULT_DEVICE_URL || "").trim();
  const learnedHost = deviceHosts.get(deviceId);
  if (!configured && !learnedHost) throw new Error("Waiting for the next ESP32 upload to learn its address");

  const origin = configured ? new URL(configured).origin : `http://${learnedHost}`;
  const response = await fetch(`${origin}/ack`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`ESP32 returned HTTP ${response.status}`);
  const body = await response.json().catch(() => ({}));
  if (body.success === false) throw new Error(body.message || "ESP32 rejected the acknowledgement");
  return origin;
}

function canSendTelegramAlert(shipmentId) {
  const now = Date.now();
  const lastSent = lastTelegramAlertAt.get(shipmentId) || 0;
  if (now - lastSent < TELEGRAM_ALERT_INTERVAL_MS) return false;
  lastTelegramAlertAt.set(shipmentId, now);
  return true;
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      return send(response, 200, { ok: true, service: "vault-api", database: dbPath, now: new Date().toISOString() });
    }
    if (request.method === "GET" && url.pathname === "/api/readings") {
      const shipmentId = url.searchParams.get("shipmentId");
      const rows = shipmentId ? db.prepare("SELECT * FROM readings WHERE shipment_id = ? ORDER BY recorded_at ASC").all(shipmentId) : db.prepare("SELECT * FROM readings ORDER BY recorded_at ASC").all();
      return send(response, 200, { readings: rows });
    }
    if (request.method === "GET" && url.pathname === "/api/ledger") {
      const shipmentId = url.searchParams.get("shipmentId");
      const rows = shipmentId ? db.prepare("SELECT * FROM ledger WHERE shipment_id = ? ORDER BY sequence ASC").all(shipmentId) : db.prepare("SELECT * FROM ledger ORDER BY sequence ASC").all();
      return send(response, 200, { entries: rows });
    }
    if (request.method === "GET" && url.pathname === "/api/alarms/status") {
      const shipmentId = String(url.searchParams.get("shipmentId") || "demo-shipment");
      const deviceId = String(url.searchParams.get("deviceId") || "vault-device-01");
      const state = alarmState(shipmentId, deviceId);
      return send(response, 200, {
        active: Boolean(state.active),
        acknowledgementState: state.acknowledgement_state,
        requestedAt: state.requested_at,
        acknowledgedAt: state.acknowledged_at,
      });
    }
    if (request.method === "POST" && url.pathname === "/api/alarms/acknowledge") {
      const body = await readBody(request);
      const shipmentId = String(body.shipmentId || "demo-shipment");
      const deviceId = String(body.deviceId || "vault-device-01");
      const state = alarmState(shipmentId, deviceId);
      if (!state.active) return send(response, 409, { error: "There is no active device alarm to acknowledge" });
      if (state.acknowledgement_state === "CONFIRMED") {
        return send(response, 200, { active: true, acknowledgementState: "CONFIRMED", acknowledgedAt: state.acknowledged_at });
      }
      const now = new Date().toISOString();
      if (state.acknowledgement_state === "UNACKNOWLEDGED") {
        db.prepare("UPDATE device_alarm_state SET acknowledgement_state = 'PENDING', requested_at = ?, updated_at = ? WHERE shipment_id = ? AND device_id = ?").run(now, now, shipmentId, deviceId);
        appendLedger(shipmentId, "ALARM_ACKNOWLEDGEMENT_REQUESTED", `Website acknowledgement requested for ${deviceId}`, now);
      }
      try {
        const deviceOrigin = await deliverDeviceAcknowledgement(deviceId);
        const confirmedAt = new Date().toISOString();
        db.prepare("UPDATE device_alarm_state SET acknowledgement_state = 'CONFIRMED', acknowledged_at = ?, updated_at = ? WHERE shipment_id = ? AND device_id = ?").run(confirmedAt, confirmedAt, shipmentId, deviceId);
        appendLedger(shipmentId, "ALARM_ACKNOWLEDGED", `Buzzer silenced by direct relay to ${deviceId}`, confirmedAt);
        return send(response, 200, { active: true, acknowledgementState: "CONFIRMED", acknowledgedAt: confirmedAt, deviceOrigin });
      } catch (error) {
        const pending = alarmState(shipmentId, deviceId);
        return send(response, 202, {
          active: Boolean(pending.active),
          acknowledgementState: pending.acknowledgement_state,
          requestedAt: pending.requested_at,
          acknowledgedAt: pending.acknowledged_at,
          deliveryError: error instanceof Error ? error.message : "ESP32 did not respond",
        });
      }
    }
    const deviceAlarmMatch = url.pathname.match(/^\/api\/devices\/([^/]+)\/alarm$/);
    if (deviceAlarmMatch && request.method === "GET") {
      const deviceId = decodeURIComponent(deviceAlarmMatch[1]);
      const shipmentId = String(url.searchParams.get("shipmentId") || "demo-shipment");
      const state = alarmState(shipmentId, deviceId);
      // Keep returning the command after confirmation so a rebooted ESP32 can
      // restore the silenced state while the same breach remains active.
      return send(response, 200, {
        acknowledge:
          Boolean(state.active) &&
          (state.acknowledgement_state === "PENDING" || state.acknowledgement_state === "CONFIRMED"),
      });
    }
    if (deviceAlarmMatch && request.method === "POST") {
      if (apiKey && request.headers["x-api-key"] !== apiKey) return send(response, 401, { error: "Unauthorized device" });
      const deviceId = decodeURIComponent(deviceAlarmMatch[1]);
      const body = await readBody(request);
      const shipmentId = String(body.shipmentId || "demo-shipment");
      const state = alarmState(shipmentId, deviceId);
      if (state.active && state.acknowledgement_state === "CONFIRMED") {
        return send(response, 200, { active: true, acknowledgementState: "CONFIRMED", acknowledgedAt: state.acknowledged_at });
      }
      if (!state.active || state.acknowledgement_state !== "PENDING") return send(response, 409, { error: "No pending acknowledgement" });
      const now = new Date().toISOString();
      db.prepare("UPDATE device_alarm_state SET acknowledgement_state = 'CONFIRMED', acknowledged_at = ?, updated_at = ? WHERE shipment_id = ? AND device_id = ?").run(now, now, shipmentId, deviceId);
      appendLedger(shipmentId, "ALARM_ACKNOWLEDGED", `Buzzer silenced by ${deviceId}`, now);
      return send(response, 200, { active: true, acknowledgementState: "CONFIRMED", acknowledgedAt: now });
    }
    if (request.method === "POST" && url.pathname === "/api/readings") {
      if (apiKey && request.headers["x-api-key"] !== apiKey) return send(response, 401, { error: "Unauthorized device" });
      const body = await readBody(request);
      const shipmentId = String(body.shipmentId || "demo-shipment");
      const deviceId = String(body.deviceId || "vault-device-01");
      const deviceHost = normalizeDeviceHost(request.socket.remoteAddress);
      if (deviceHost) deviceHosts.set(deviceId, deviceHost);
      const temperature = Number(body.temperature);
      const humidity = body.humidity === undefined ? null : Number(body.humidity);
      if (!Number.isFinite(temperature) || temperature < -80 || temperature > 100) return send(response, 400, { error: "temperature must be a finite value between -80 and 100" });
      if (humidity !== null && (!Number.isFinite(humidity) || humidity < 0 || humidity > 100)) return send(response, 400, { error: "humidity must be between 0 and 100" });
      const recordedAt = body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString();
      ensureShipment(shipmentId);
      const status = statusFor(temperature);
      const reading = db.prepare("INSERT INTO readings (shipment_id, device_id, temperature, humidity, status, recorded_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *").get(shipmentId, deviceId, temperature, humidity, status, recordedAt);
      updateAlarmState(shipmentId, deviceId, status, recordedAt);
      const entry = appendLedger(shipmentId, "TEMPERATURE_READING", `${temperature.toFixed(1)} °C · ${status}`, recordedAt);
      let telegram = { sent: false, skipped: true };
      if (status !== "SAFE") {
        const owner = db.prepare("SELECT telegram_chat_id, name FROM organizations WHERE telegram_chat_id IS NOT NULL ORDER BY created_at ASC LIMIT 1").get();
        const chatId = owner?.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || "";
        if (canSendTelegramAlert(shipmentId)) {
          telegram = await sendTelegramAlert(chatId, `VAULT ALERT — Shipment ${shipmentId} recorded ${status.replace("_", " ")} at ${temperature.toFixed(1)} °C (${recordedAt}).`);
        } else {
          telegram = { sent: false, skipped: true, reason: "throttled", retryAfterSeconds: 30 };
        }
      }
      return send(response, 201, { reading, ledger: entry, telegram });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const organizationName = String(body.organizationName || "").trim();
      if (!email.includes("@") || password.length < 8 || !organizationName) return send(response, 400, { error: "email, organizationName and a password of at least 8 characters are required" });
      if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) return send(response, 409, { error: "An account already exists for that email" });
      const now = new Date().toISOString();
      const organizationId = randomUUID();
      const userId = randomUUID();
      const salt = randomBytes(16).toString("hex");
      db.prepare("INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)").run(organizationId, organizationName, now);
      db.prepare("INSERT INTO users (id, organization_id, email, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(userId, organizationId, email, hashPassword(password, salt), salt, "ADMIN", now);
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)").run(hashToken(token), userId, now);
      return send(response, 201, { token, user: { id: userId, email, role: "ADMIN", organizationId } });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readBody(request);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      if (!user) return send(response, 401, { error: "Invalid email or password" });
      const expected = Buffer.from(user.password_hash, "hex");
      const actual = Buffer.from(hashPassword(password, user.password_salt), "hex");
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return send(response, 401, { error: "Invalid email or password" });
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)").run(hashToken(token), user.id, new Date().toISOString());
      return send(response, 200, { token, user: publicUser(user) });
    }
    if (request.method === "POST" && url.pathname === "/api/organizations/telegram") {
      const user = sessionUser(request);
      if (!user) return send(response, 401, { error: "Authentication required" });
      const body = await readBody(request);
      const chatId = String(body.chatId || "").trim();
      if (!chatId || chatId.length > 80) return send(response, 400, { error: "A Telegram chat ID is required" });
      db.prepare("UPDATE organizations SET telegram_chat_id = ? WHERE id = ?").run(chatId, user.organization_id);
      return send(response, 200, { ok: true, organizationId: user.organization_id, telegramConfigured: true });
    }
    return send(response, 404, { error: "Not found" });
  } catch (error) {
    return send(response, 400, { error: error instanceof Error ? error.message : "Request failed" });
  }
});

server.listen(port, "0.0.0.0", () => console.log(`Vault API listening on http://0.0.0.0:${port}`));
process.on("SIGINT", () => { db.close(); server.close(() => process.exit(0)); });
