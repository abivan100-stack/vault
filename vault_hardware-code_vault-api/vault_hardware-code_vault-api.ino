#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <RTClib.h>
#include <DHT.h>
#include <LiquidCrystal_I2C.h>
#include <HTTPClient.h>

// =====================================================
// PIN CONFIG
// =====================================================
#define DHT_PIN 27
#define DHT_TYPE DHT22

#define BUZZER_PIN 25
#define GREEN_LED 18
#define RED_LED 19

// =====================================================
// SAFE TEMPERATURE RANGE
// =====================================================
#define MIN_SAFE_TEMP 2.0
#define MAX_SAFE_TEMP 8.0

// =====================================================
// WIFI
// =====================================================
const char* ssid = "Praveen_2G";
const char* password = "Jpr71281";

// Vault API: replace with the computer's IPv4 address from `ipconfig`.
const char* vaultApiUrl = "http://192.168.0.102:8787/api/readings";
const char* vaultDeviceId = "esp32-vault-01";
const char* vaultShipmentId = "TEST-01";

// =====================================================
// DEVICES
// =====================================================
DHT dht(DHT_PIN, DHT_TYPE);
RTC_DS3231 rtc;
LiquidCrystal_I2C lcd(0x27, 12, 2);
WebServer server(80);

// =====================================================
// STATE
// =====================================================
float temperature = 0.0;
float humidity = 0.0;

bool alarmAcknowledged = false;
bool previousBreach = false;
bool rtcWorking = false;

unsigned long lastDHTRead = 0;
unsigned long lastLCDUpdate = 0;

const unsigned long DHT_INTERVAL = 2000;
const unsigned long LCD_INTERVAL = 1000;
unsigned long lastVaultUpload = 0;
unsigned long lastVaultAlarmCheck = 0;
// Upload the latest sensor reading every 5 seconds so the Vault dashboard
// receives a fresh device value on each polling cycle.
const unsigned long VAULT_UPLOAD_INTERVAL = 5000;
const unsigned long VAULT_ALARM_CHECK_INTERVAL = 1000;

// =====================================================
// STATUS
// =====================================================
String getStatus() {
  if (temperature < MIN_SAFE_TEMP) {
    return "TOO COLD";
  }

  if (temperature > MAX_SAFE_TEMP) {
    return "TOO HOT";
  }

  return "SAFE";
}

// =====================================================
// TIME STRING
// =====================================================
String getTimeString() {
  if (!rtcWorking) {
    return "--:--:--";
  }

  DateTime now = rtc.now();

  char buffer[12];

  sprintf(
    buffer,
    "%02d:%02d:%02d",
    now.hour(),
    now.minute(),
    now.second()
  );

  return String(buffer);
}

// =====================================================
// DATE STRING
// =====================================================
String getDateString() {
  if (!rtcWorking) {
    return "--/--/----";
  }

  DateTime now = rtc.now();

  char buffer[16];

  sprintf(
    buffer,
    "%02d/%02d/%04d",
    now.day(),
    now.month(),
    now.year()
  );

  return String(buffer);
}

// =====================================================
// WEB PAGE
// =====================================================
void handleRoot() {

  String html = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <title>Vault Cold Chain</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: #07111f;
      color: #f8fafc;
      min-height: 100vh;
    }

    .topbar {
      padding: 22px 28px;
      border-bottom: 1px solid #1e293b;
      background: #0b1625;
    }

    .brand {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: 1px;
    }

    .subtitle {
      color: #94a3b8;
      font-size: 14px;
      margin-top: 5px;
    }

    .container {
      max-width: 1100px;
      margin: auto;
      padding: 28px;
    }

    .status-banner {
      padding: 20px;
      border-radius: 16px;
      margin-bottom: 24px;
      font-size: 24px;
      font-weight: 700;
      text-align: center;
      transition: 0.3s ease;
    }

    .safe-banner {
      background: #0f3d2e;
      border: 1px solid #34d399;
      color: #6ee7b7;
    }

    .danger-banner {
      background: #43171b;
      border: 1px solid #fb7185;
      color: #fda4af;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px;
    }

    .card {
      background: #0f1c2e;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 22px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    }

    .card-label {
      color: #94a3b8;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }

    .card-value {
      margin-top: 10px;
      font-size: 34px;
      font-weight: 700;
    }

    .small-value {
      font-size: 22px;
    }

    .green {
      color: #4ade80;
    }

    .red {
      color: #fb7185;
    }

    .yellow {
      color: #facc15;
    }

    .button-area {
      margin-top: 24px;
      background: #0f1c2e;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 22px;
    }

    button {
      border: none;
      padding: 14px 20px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      transition: 0.2s;
    }

    .ack-btn {
      background: #38bdf8;
      color: #06121e;
    }

    .ack-btn:hover {
      opacity: 0.85;
    }

    .ack-btn:disabled {
      background: #334155;
      color: #94a3b8;
      cursor: not-allowed;
    }

    .ack-state {
      margin-top: 12px;
      color: #94a3b8;
      font-size: 14px;
    }

    .footer {
      margin-top: 30px;
      color: #64748b;
      font-size: 12px;
      text-align: center;
    }

    .dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
    }

    .dot-green {
      background: #22c55e;
    }

    .dot-red {
      background: #ef4444;
    }
  </style>
</head>

<body>

  <div class="topbar">
    <div class="brand">VAULT</div>
    <div class="subtitle">
      Vaccine Cold-Chain Monitoring Prototype
    </div>
  </div>

  <div class="container">

    <div id="statusBanner" class="status-banner">
      Loading...
    </div>

    <div class="grid">

      <div class="card">
        <div class="card-label">Temperature</div>
        <div id="temperature" class="card-value">-- °C</div>
      </div>

      <div class="card">
        <div class="card-label">Humidity</div>
        <div id="humidity" class="card-value">-- %</div>
      </div>

      <div class="card">
        <div class="card-label">RTC Time</div>
        <div id="time" class="card-value small-value">--:--:--</div>
      </div>

      <div class="card">
        <div class="card-label">Date</div>
        <div id="date" class="card-value small-value">--/--/----</div>
      </div>

    </div>

    <div class="button-area">

      <div class="card-label">Alarm Control</div>

      <br>

      <button id="ackButton"
              class="ack-btn"
              onclick="ackAlarm()">
        Acknowledge Alarm
      </button>

      <div id="ackState" class="ack-state">
        Alarm acknowledgement status: --
      </div>

    </div>

    <div class="footer">
      Prototype only — not a medically validated monitoring device.
    </div>

  </div>

<script>

async function updateDashboard() {

  try {

    const response = await fetch('/data');
    const data = await response.json();

    document.getElementById('temperature').innerText =
      data.temperature.toFixed(1) + ' °C';

    document.getElementById('humidity').innerText =
      data.humidity.toFixed(1) + ' %';

    document.getElementById('time').innerText =
      data.time;

    document.getElementById('date').innerText =
      data.date;

    const banner =
      document.getElementById('statusBanner');

    const ackButton =
      document.getElementById('ackButton');

    const ackState =
      document.getElementById('ackState');

    if (data.status === 'SAFE') {

      banner.innerHTML =
        '<span class="dot dot-green"></span>SAFE — Temperature within 2–8°C';

      banner.className =
        'status-banner safe-banner';

      ackButton.disabled = true;

    } else {

      banner.innerHTML =
        '<span class="dot dot-red"></span>' +
        data.status +
        ' — Temperature breach detected';

      banner.className =
        'status-banner danger-banner';

      ackButton.disabled = false;
    }

    if (data.acknowledged) {

      ackState.innerText =
        'Alarm acknowledgement status: ACKNOWLEDGED';

      ackState.className =
        'ack-state green';

    } else {

      ackState.innerText =
        'Alarm acknowledgement status: ACTIVE / NOT ACKNOWLEDGED';

      ackState.className =
        'ack-state red';
    }

  } catch (error) {

    console.log(error);

    const banner =
      document.getElementById('statusBanner');

    banner.innerText =
      'Connection lost';

    banner.className =
      'status-banner danger-banner';
  }
}

async function ackAlarm() {

  try {

    await fetch('/ack', {
      method: 'POST'
    });

    updateDashboard();

  } catch (error) {
    console.log(error);
  }
}

setInterval(updateDashboard, 1000);

updateDashboard();

</script>

</body>
</html>
)rawliteral";

  server.send(200, "text/html", html);
}

// =====================================================
// JSON DATA API
// =====================================================
void handleData() {

  String json = "{";

  json += "\"temperature\":";
  json += String(temperature, 1);

  json += ",";

  json += "\"humidity\":";
  json += String(humidity, 1);

  json += ",";

  json += "\"status\":\"";
  json += getStatus();
  json += "\"";

  json += ",";

  json += "\"time\":\"";
  json += getTimeString();
  json += "\"";

  json += ",";

  json += "\"date\":\"";
  json += getDateString();
  json += "\"";

  json += ",";

  json += "\"acknowledged\":";
  json += alarmAcknowledged ? "true" : "false";

  json += "}";

  server.send(200, "application/json", json);
}

// =====================================================
// WEB ACKNOWLEDGEMENT
// =====================================================
void handleAck() {

  String status = getStatus();

  if (status != "SAFE") {

    alarmAcknowledged = true;

    digitalWrite(BUZZER_PIN, LOW);

    Serial.println("ALARM ACKNOWLEDGED FROM WEB");

    server.send(
      200,
      "application/json",
      "{\"success\":true,\"message\":\"Alarm acknowledged\"}"
    );

  } else {

    server.send(
      200,
      "application/json",
      "{\"success\":false,\"message\":\"No active breach\"}"
    );
  }
}

void sendReadingToVault(float temp, float hum) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Vault upload skipped: WiFi disconnected");
    return;
  }

  HTTPClient http;
  WiFiClient client;
  Serial.print("Vault API: ");
  Serial.println(vaultApiUrl);
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.begin(client, vaultApiUrl);
  http.addHeader("Content-Type", "application/json");

  String json = "{";
  json += "\"shipmentId\":\"" + String(vaultShipmentId) + "\",";
  json += "\"deviceId\":\"" + String(vaultDeviceId) + "\",";
  json += "\"temperature\":" + String(temp, 1) + ",";
  json += "\"humidity\":" + String(hum, 1);

  if (rtcWorking) {
    DateTime now = rtc.now();
    char timestamp[25];
    sprintf(timestamp, "%04d-%02d-%02dT%02d:%02d:%02dZ", now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());
    json += ",\"timestamp\":\"";
    json += timestamp;
    json += "\"";
  }

  json += "}";
  int responseCode = http.POST(json);
  Serial.print("Vault upload response: ");
  Serial.println(responseCode);
  if (responseCode < 0) {
    Serial.print("Vault upload error: ");
    Serial.println(http.errorToString(responseCode).c_str());
  } else {
    Serial.println(http.getString());
  }
  http.end();
}

String vaultAlarmUrl() {
  String url = String(vaultApiUrl);
  url.replace("/api/readings", "/api/devices/" + String(vaultDeviceId) + "/alarm?shipmentId=" + String(vaultShipmentId));
  return url;
}

void confirmVaultAlarmAcknowledgement() {
  HTTPClient http;
  WiFiClient client;
  String url = vaultAlarmUrl();
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  String body = "{\"shipmentId\":\"" + String(vaultShipmentId) + "\"}";
  int responseCode = http.POST(body);
  Serial.print("Vault alarm acknowledgement response: ");
  Serial.println(responseCode);
  http.end();
}

void checkVaultAlarmAcknowledgement() {
  if (WiFi.status() != WL_CONNECTED || millis() - lastVaultAlarmCheck < VAULT_ALARM_CHECK_INTERVAL) return;
  lastVaultAlarmCheck = millis();

  HTTPClient http;
  WiFiClient client;
  String url = vaultAlarmUrl();
  http.setConnectTimeout(5000);
  http.setTimeout(5000);
  http.begin(client, url);
  int responseCode = http.GET();
  String response = responseCode == 200 ? http.getString() : "";
  http.end();

  if (responseCode == 200 && response.indexOf("\"acknowledge\":true") >= 0 && getStatus() != "SAFE") {
    alarmAcknowledged = true;
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println("ALARM ACKNOWLEDGED FROM VAULT WEBSITE");
    confirmVaultAlarmAcknowledgement();
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("============================");
  Serial.println(" VAULT STARTUP");
  Serial.println("============================");

  // --------------------------
  // I2C
  // --------------------------
  Wire.begin(21, 22);

  // --------------------------
  // LCD
  // --------------------------
  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("VAULT");

  lcd.setCursor(0, 1);
  lcd.print("Starting...");

  // --------------------------
  // DHT
  // --------------------------
  dht.begin();

  // --------------------------
  // GPIO
  // --------------------------
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);

  // --------------------------
  // RTC
  // --------------------------
  if (rtc.begin()) {

    rtcWorking = true;
    Serial.println("RTC detected");

  } else {

    rtcWorking = false;
    Serial.println("RTC NOT FOUND");
  }

  // --------------------------
  // WIFI
  // --------------------------
  Serial.print("Connecting to WiFi");

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi...");

  WiFi.begin(ssid, password);

  unsigned long startAttempt = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startAttempt < 20000
  ) {

    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println("WiFi connected!");

    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi OK");

    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());

  } else {

    Serial.println("WiFi connection FAILED");

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi FAILED");
  }

  // --------------------------
  // SERVER ROUTES
  // --------------------------
  server.on("/", handleRoot);

  server.on("/data", HTTP_GET, handleData);

  server.on("/ack", HTTP_POST, handleAck);

  server.begin();

  Serial.println("Web server started");

  if (WiFi.status() == WL_CONNECTED) {

    Serial.print("Open: http://");
    Serial.println(WiFi.localIP());
  }

  delay(2000);

  lcd.clear();
}

// =====================================================
// LOOP
// =====================================================
void loop() {

  server.handleClient();

  // ===================================================
  // SERIAL ACK
  // ===================================================
  if (Serial.available()) {

    String command = Serial.readStringUntil('\n');

    command.trim();
    command.toLowerCase();

    if (command == "ack") {

      alarmAcknowledged = true;

      digitalWrite(BUZZER_PIN, LOW);

      Serial.println("ALARM ACKNOWLEDGED FROM SERIAL");
    }
  }

  // ===================================================
  // SENSOR UPDATE
  // ===================================================
  if (millis() - lastDHTRead >= DHT_INTERVAL) {

    lastDHTRead = millis();

    float newTemp = dht.readTemperature();
    float newHumidity = dht.readHumidity();

    if (isnan(newTemp) || isnan(newHumidity)) {

      Serial.println("DHT22 READ ERROR");

      lcd.setCursor(0, 0);
      lcd.print("DHT ERROR   ");

      return;
    }

    temperature = newTemp;
    humidity = newHumidity;

    bool breach =
      temperature < MIN_SAFE_TEMP ||
      temperature > MAX_SAFE_TEMP;

    // --------------------------
    // NEW BREACH
    // --------------------------
    if (breach && !previousBreach) {

      alarmAcknowledged = false;

      Serial.println();
      Serial.println("!!! NEW TEMPERATURE BREACH !!!");
    }

    // --------------------------
    // BACK TO SAFE
    // --------------------------
    if (!breach) {

      alarmAcknowledged = false;
    }

    // --------------------------
    // OUTPUTS
    // --------------------------
    if (breach) {

      digitalWrite(GREEN_LED, LOW);
      digitalWrite(RED_LED, HIGH);

      if (!alarmAcknowledged) {

        digitalWrite(BUZZER_PIN, HIGH);

      } else {

        digitalWrite(BUZZER_PIN, LOW);
      }

    } else {

      digitalWrite(GREEN_LED, HIGH);
      digitalWrite(RED_LED, LOW);
      digitalWrite(BUZZER_PIN, LOW);
    }

    previousBreach = breach;

    // --------------------------
    // SERIAL DATA
    // --------------------------
    Serial.print("[");

    if (rtcWorking) {

      DateTime now = rtc.now();

      if (now.hour() < 10) Serial.print("0");
      Serial.print(now.hour());

      Serial.print(":");

      if (now.minute() < 10) Serial.print("0");
      Serial.print(now.minute());

      Serial.print(":");

      if (now.second() < 10) Serial.print("0");
      Serial.print(now.second());

    } else {

      Serial.print("NO RTC");
    }

    Serial.print("] ");

    Serial.print("Temp: ");
    Serial.print(temperature, 1);
    Serial.print(" C");

    Serial.print(" | Humidity: ");
    Serial.print(humidity, 1);
    Serial.print("%");

    Serial.print(" | Status: ");
    Serial.print(getStatus());

    Serial.print(" | Alarm: ");

    if (breach) {

      if (alarmAcknowledged) {
        Serial.print("ACKNOWLEDGED");
      } else {
        Serial.print("ACTIVE");
      }

    } else {

      Serial.print("NONE");
    }

    Serial.println();
  }

  // Keep network uploads independent from the 2-second DHT sampling cycle.
  // This produces a true 5-second cadence instead of 2, 4, 6-second drift.
  if (!isnan(temperature) && !isnan(humidity) &&
      millis() - lastVaultUpload >= VAULT_UPLOAD_INTERVAL) {
    lastVaultUpload = millis();
    sendReadingToVault(temperature, humidity);
  }

  checkVaultAlarmAcknowledgement();

  // ===================================================
  // LCD UPDATE
  // ===================================================
  if (millis() - lastLCDUpdate >= LCD_INTERVAL) {

    lastLCDUpdate = millis();

    // --------------------------
    // LINE 1
    // --------------------------
    lcd.setCursor(0, 0);

    lcd.print("T:");
    lcd.print(temperature, 1);
    lcd.print((char)223);
    lcd.print("C ");

    String status = getStatus();

    if (status == "SAFE") {

      lcd.print("SAFE");

    } else if (status == "TOO HOT") {

      lcd.print("HOT ");

    } else {

      lcd.print("COLD");
    }

    lcd.print("    ");

    // --------------------------
    // LINE 2
    // --------------------------
    lcd.setCursor(0, 1);

    if (rtcWorking) {

      DateTime now = rtc.now();

      if (now.hour() < 10) lcd.print("0");
      lcd.print(now.hour());

      lcd.print(":");

      if (now.minute() < 10) lcd.print("0");
      lcd.print(now.minute());

      lcd.print(":");

      if (now.second() < 10) lcd.print("0");
      lcd.print(now.second());

      lcd.print("    ");

    } else {

      lcd.print("RTC ERROR   ");
    }
  }
}
