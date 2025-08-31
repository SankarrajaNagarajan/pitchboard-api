import "dotenv/config";
import { Pool } from "pg";
import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { pub, sub } from "./redis";

export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT),
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket: any) => {
  console.log("Client connected");

  socket.on("audio-chunk", async (chunk: Buffer) => {
    console.log("🎤 Received audio chunk", chunk.length);

    const transcript = { text: " [dummy transcript- audio ]", trainee: socket.id };

    await pub.publish("transcripts", JSON.stringify(transcript));
  });

  socket.on("end-audio", async () => {
    console.log("Session ended");

    const feedback = {
      fluency: Math.floor(Math.random() * 21) + 70,
      clarity: Math.floor(Math.random() * 21) + 70,
      grammar: Math.floor(Math.random() * 21) + 70,
    };

    try {
      await pool.query(
        "INSERT INTO sessions (trainee, fluency, clarity, grammar) VALUES ($1, $2, $3, $4)",
        [socket.id, feedback.fluency, feedback.clarity, feedback.grammar]
      );
      console.log("Session saved ✅");
    } catch (err) {
      console.error("DB insert error:", err);
    }

    socket.emit("feedback", feedback);
  });

  socket.on("disconnect", () => console.log("Client disconnected"));
});

sub.subscribe("transcripts", (err, count) => {
  if (err) {
    console.error(" Redis subscribe error:", err);
  } else {
    console.log(` Subscribed to transcripts channel (${count})`);
  }
});

sub.on("message", (channel, message) => {
  if (channel === "transcripts") {
    const data = JSON.parse(message);
    console.log(" Received transcript via Redis:", data);
    io.emit("transcript", data);
  }
});
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

