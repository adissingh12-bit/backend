const mqtt = require("mqtt");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const cors = require("cors");

// ===== EXPRESS SETUP =====
const app = express();
app.use(cors());

// ===== MQTT CONFIG (UPDATED) =====
const MQTT_BROKER = "wss://broker.hivemq.com:8884/mqtt";
const TOPIC = "base/#";

// ===== DATABASE =====
const db = new sqlite3.Database("./telemetry.db");

console.log("Database connected");

// ===== TABLE 1: Environmental Sensors =====
db.run(`
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
`);

// ===== TABLE 2: Human Presence / Vitals =====
db.run(`
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
`);

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

// ===== MQTT ERROR HANDLING (NEW) =====
client.on("error", (err) => {
    console.log("MQTT Error:", err);
});

client.on("offline", () => {
    console.log("MQTT Offline");
});

// ===== MQTT MESSAGE HANDLER =====
client.on("message", (topic, message) => {
    try {
        const data = JSON.parse(message.toString());
        console.log("Received:", data);

        // ===== ENVIRONMENT DATA =====
        if (data.temperature !== undefined) {
            db.run(
                `INSERT INTO environmental_data
                (node_id, room, temperature, humidity, mq135_raw, mq135_ppm, mq135_do)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.node_id,
                    data.room,
                    data.temperature,
                    data.humidity,
                    data.mq135_raw,
                    data.mq135_ppm,
                    data.mq135_do
                ]
            );
            console.log("Environmental data stored");
        }

        // ===== VITALS DATA =====
        else if (data.heart_rate !== undefined) {
            db.run(
                `INSERT INTO vitals_data
                (node_id, room, human_detected, heart_rate, breath_rate, distance_m, move_speed_cm)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.node_id,
                    data.room,
                    data.human_detected,
                    data.heart_rate,
                    data.breath_rate,
                    data.distance_m,
                    data.move_speed_cm
                ]
            );
            console.log("Vitals data stored");
        }

    } catch (err) {
        console.log("Invalid JSON ignored");
    }
});

// ===== API ROUTES (NEW) =====

// Environmental data API
app.get("/api/environment", (req, res) => {
    db.all(
        "SELECT * FROM environmental_data ORDER BY timestamp DESC LIMIT 20",
        [],
        (err, rows) => {
            if (err) return res.status(500).json(err);
            res.json(rows);
        }
    );
});

// Vitals data API
app.get("/api/vitals", (req, res) => {
    db.all(
        "SELECT * FROM vitals_data ORDER BY timestamp DESC LIMIT 20",
        [],
        (err, rows) => {
            if (err) return res.status(500).json(err);
            res.json(rows);
        }
    );
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});