import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "127.0.0.1",
  database: process.env.DB_NAME || "voiceapp",
  password: process.env.DB_PASS || "test@123",
  port: Number(process.env.DB_PORT) || 5432,
});

(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log(" DB connected! Current time:", res.rows[0]);
  } catch (err) {
    console.error(" DB connection failed:", err);
  } finally {
    await pool.end();
  }
})();
