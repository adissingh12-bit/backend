const mqtt = require("mqtt");
const Database = require("better-sqlite3");
const express = require("express");
const cors = require("cors");

// ===== EXPRESS SETUP =====
const app = express();
app.use(cors());

// ===== MQTT CONFIG =====
const MQTT_BROKER = "mqtt://broker.hivemq.com:1883";
const TOPIC = "base/#";

// ===== DATABASE =====
const db = new Database("telemetry.db");

console.log("Database connected");

// ===== CREATE TABLES =====
db.prepare(`
CREATE TABLE IF NOT EXISTS environmental_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT,
    room TEXT,
    temperature REAL,
    humidity REAL,
    mq135_raw INTEGER,
    mq135_ppm REAL,
    mq135_do INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS vitals_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT,
    room TEXT,
    human_detected INTEGER,
    heart_rate REAL,
    breath_rate REAL,
    distance_m REAL,
    move_speed_cm REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS rfid_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT,
    room TEXT,
    uid TEXT,
    access TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

console.log("Tables ready");

// ===== MQTT CONNECT =====
const client = mqtt.connect(MQTT_BROKER, {
    reconnectPeriod: 1000
});

client.on("connect", () => {
    console.log("MQTT connected");
    client.subscribe(TOPIC);
    console.log("Subscribed to:", TOPIC);
});

client.on("error", (err) => console.log("MQTT Error:", err));
client.on("offline", () => console.log("MQTT Offline"));

// ===== PREPARED STATEMENTS =====
const stmtEnv = db.prepare(`
INSERT INTO environmental_data
(node_id, room, temperature, humidity, mq135_raw, mq135_ppm, mq135_do)
VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const stmtVitals = db.prepare(`
INSERT INTO vitals_data
(node_id, room, human_detected, heart_rate, breath_rate, distance_m, move_speed_cm)
VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const stmtRFID = db.prepare(`
INSERT INTO rfid_data (node_id, room, uid, access)
VALUES (?, ?, ?, ?)
`);

// ===== MQTT MESSAGE HANDLER =====
client.on("message", (topic, message) => {

    // 🔥 PRINT RAW MESSAGE FIRST
    const raw = message.toString();
    console.log("RAW MQTT:", raw);

    let data;

    try {
        data = JSON.parse(raw);
    } catch (err) {
        console.log("❌ JSON PARSE FAILED:", err.message);
        return; // skip bad payload
    }

    console.log("✅ Parsed Data:", data);

    // ===== ENV NODE =====
    if (data.temperature !== undefined) {
        stmtEnv.run(
            data.node_id || "UNKNOWN",
            data.room || "UNKNOWN",
            Number(data.temperature) || 0,
            Number(data.humidity) || 0,
            Number(data.mq135_raw) || 0,
            Number(data.mq135_ppm) || 0,
            Number(data.mq135_do) || 0
        );
        console.log("🌿 Environmental data stored");
    }

    // ===== VITALS NODE (🔥 FIXED CONDITION) =====
    else if (data.heart_rate !== undefined || data.breath_rate !== undefined) {
        stmtVitals.run(
            data.node_id || "UNKNOWN",
            data.room || "UNKNOWN",
            data.human_detected || 0,
            Number(data.heart_rate) ?? -1,
            Number(data.breath_rate) ?? -1,
            Number(data.distance_m) ?? 0,
            Number(data.move_speed_cm) ?? 0
        );
        console.log("❤️ Vitals data stored");
    }

    // ===== RFID NODE =====
    else if (data.uid !== undefined) {
        stmtRFID.run(
            data.node_id || "NODE-03",
            data.room || "RFID",
            data.uid,
            data.access || "UNKNOWN"
        );
        console.log("🔐 RFID data stored");
    }

    else {
        console.log("⚠ Unknown data format:", data);
    }
});

// ===== API ROUTES =====
app.get("/", (req, res) => {
    res.send("Backend is running 🚀");
});

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

app.get("/api/environment", (req, res) => {
    const rows = db.prepare(
        "SELECT * FROM environmental_data ORDER BY timestamp DESC LIMIT 20"
    ).all();
    res.json(rows);
});

app.get("/api/vitals", (req, res) => {
    const rows = db.prepare(
        "SELECT * FROM vitals_data ORDER BY timestamp DESC LIMIT 20"
    ).all();
    res.json(rows);
});

app.get("/api/rfid", (req, res) => {
    const rows = db.prepare(
        "SELECT * FROM rfid_data ORDER BY timestamp DESC LIMIT 20"
    ).all();
    res.json(rows);
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port", PORT);
});
