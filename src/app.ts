import express = require("express");
import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import { Parser } from "json2csv";
import { pool } from "./server";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { connectMongo } from "./mongo";

const swaggerDocument = YAML.load("./src/swagger.yaml");

const app = express();

app.use(cors({ origin: "http://localhost:4200" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

app.use("/api/auth", authRoutes);

app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Backend is running 🚀" });
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

/**
 * GET /api/sessions
 * Aggregates transcripts in Mongo grouped by userId,
 * then joins with Postgres users.
 */
app.get("/api/sessions", async (req: Request, res: Response) => {
  try {
    const db = await connectMongo();
    const transcriptsCol = db.collection("transcripts");

    // Group by userId in Mongo
    const pipeline = [
      { $match: { userId: { $exists: true } } },
      {
        $group: {
          _id: "$userId",
          firstAt: { $min: "$createdAt" },
          lastAt: { $max: "$createdAt" },
          transcriptCount: { $sum: 1 },
          firstSnippet: { $first: "$text" },
          lastSnippet: { $last: "$text" },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: 50 },
    ];

    const agg = await transcriptsCol.aggregate(pipeline).toArray();
    const userIds = agg.map((s) => s._id).filter(Boolean);

    // Fetch user details from Postgres
    let usersMap: Record<number, any> = {};
    if (userIds.length > 0) {
      const placeholders = userIds.map((_, i) => `$${i + 1}`).join(", ");
      const { rows } = await pool.query(
        `SELECT id, name, email, role FROM users WHERE id IN (${placeholders})`,
        userIds
      );
      usersMap = rows.reduce((acc: any, u: any) => {
        acc[u.id] = u;
        return acc;
      }, {});
    }

    // Combine results
    const sessions = agg.map((s: any) => {
      const uid = s._id;
      return {
        userId: uid,
        trainee: usersMap[uid]?.name ?? null,
        email: usersMap[uid]?.email ?? null,
        role: usersMap[uid]?.role ?? null,
        startedAt: s.firstAt,
        endedAt: s.lastAt,
        transcriptCount: s.transcriptCount,
        snippet: { first: s.firstSnippet, last: s.lastSnippet },
      };
    });

    return res.json(sessions);
  } catch (err: any) {
    console.error("❌ /api/sessions error:", err.message);
    return res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

/**
 * GET /api/sessions/:userId/transcripts
 * Fetch full transcripts for one user from Mongo
 */
app.get("/api/sessions/:userId/transcripts", async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  try {
    const db = await connectMongo();
    const transcripts = await db
      .collection("transcripts")
      .find({ userId })
      .sort({ createdAt: 1 })
      .toArray();

    res.json(transcripts);
  } catch (err: any) {
    console.error("❌ transcripts fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch transcripts" });
  }
});

/**
 * GET /api/sessions/export
 * Export Postgres sessions summary as CSV
 */
app.get("/api/sessions/export", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT trainee, fluency, clarity, grammar, created_at FROM sessions ORDER BY created_at DESC"
    );

    const fields = ["trainee", "fluency", "clarity", "grammar", "created_at"];
    const parser = new Parser({ fields });
    const csv = parser.parse(result.rows);

    res.header("Content-Type", "text/csv");
    res.attachment("sessions.csv");
    return res.send(csv);
  } catch (err: any) {
    console.error("❌ CSV export error:", err.message);
    return res.status(500).json({ error: "Failed to export CSV" });
  }
});

export default app;
