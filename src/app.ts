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
  res.json({ message: "Backend is running " });
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get("/api/sessions", (req: Request, res: Response) => {
  res.json([
    { trainee: "John", fluency: 75, clarity: 80, grammar: 90 },
    { trainee: "Mary", fluency: 85, clarity: 70, grammar: 88 },
    { trainee: "Alex", fluency: 65, clarity: 78, grammar: 82 },
  ]);
});

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
    console.error(" CSV export error:", err.message);
    return res.status(500).json({ error: "Failed to export CSV" });
  }
});

export default app;

