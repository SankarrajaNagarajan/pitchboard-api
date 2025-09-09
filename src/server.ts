// backend/src/server.ts
import "dotenv/config";
import http from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import app from "./app";
import { pool } from "./db";
import { pub, sub } from "./redis";
import { connectMongo } from "./mongo";

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// socket auth (same as you had)
io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || "").split(" ")[1];
    if (!token) return next(new Error("Auth error"));
    const decoded: any = jwt.verify(token, JWT_SECRET);
    socket.data.user = { id: decoded.id, role: decoded.role, email: decoded.email };
    return next();
  } catch (err) {
    return next(new Error("Auth error"));
  }
});

io.on("connection", (socket: any) => {
  console.log("Client connected", socket.id, "user:", socket.data.user);

  socket.on("start-session", async () => {
    // create Postgres session and attach sessionId
    const userId = socket.data.user?.id || null;
    try {
      const r = await pool.query(
        `INSERT INTO sessions (user_id, started_at) VALUES ($1, now()) RETURNING id, started_at`,
        [userId]
      );
      socket.data.sessionId = r.rows[0].id;
      socket.emit("session-started", { sessionId: socket.data.sessionId });
    } catch (err) {
      console.error("Failed to create session", err);
      socket.emit("error", { message: "Failed to create session" });
    }
  });

  

  socket.on("audio-chunk", async (chunk: Buffer) => {
    // process STT -> text (dummy here)
    const text = "dummy transcript from audio chunk";
    const sessionId = socket.data.sessionId || null;
    const userId = socket.data.user?.id || null;
    const seq = (socket.data.seq = (socket.data.seq || 0) + 1);
    const doc = {
      sessionId,
      userId,
      text,
      seq,
      createdAt: new Date()
    };

    // save to Mongo
    try {
      const db = await connectMongo();
      await db.collection("transcripts").insertOne(doc);
      // optional: set TTL later if desired
    } catch (err) {
      console.error("Mongo insert transcript failed", err);
    }

    // publish to Redis channel so other servers can broadcast
    try {
      await pub.publish("transcripts", JSON.stringify(doc));
    } catch (err) {
      console.error("Redis publish error", err);
    }

    // emit ack or transcript back to client
    socket.emit("transcript", doc);
  });

  socket.on("end-audio", async () => {
    const sessionId = socket.data.sessionId || null;
    const userId = socket.data.user?.id || null;
    const feedback = {
      fluency: Math.floor(Math.random() * 21) + 70,
      clarity: Math.floor(Math.random() * 21) + 70,
      grammar: Math.floor(Math.random() * 21) + 70
    };

    // update Postgres session
    try {
      await pool.query(
        `UPDATE sessions SET ended_at=now(), fluency=$1, clarity=$2, grammar=$3 WHERE id=$4`,
        [feedback.fluency, feedback.clarity, feedback.grammar, sessionId]
      );
    } catch (err) {
      console.error("Postgres update session failed", err);
    }

    // save feedback log to Mongo
    try {
      const db = await connectMongo();
      await db.collection("logs").insertOne({
        sessionId,
        userId,
        event: "feedback",
        feedback,
        createdAt: new Date()
      });
    } catch (err) {
      console.error("Mongo insert log failed", err);
    }

    // publish feedback
    try {
      await pub.publish("feedback", JSON.stringify({ sessionId, userId, feedback }));
    } catch (err) {
      console.error("Redis publish feedback error", err);
    }

    socket.emit("feedback", feedback);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
  });
});

// Redis subscriber to broadcast incoming messages
sub.subscribe("transcripts", "feedback");
sub.on("message", (channel, message) => {
  try {
    const data = JSON.parse(message);
    if (channel === "transcripts") io.emit("transcript", data);
    if (channel === "feedback") io.emit("feedback", data);
  } catch (err) {
    console.error("Error parsing redis message", err);
  }
});

server.listen(PORT, () => console.log(`Listening ${PORT}`));
export { pool };

