import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "secret123";

// ✅ Register
router.post("/register", async (req: Request, res: Response) => {
  console.log("📥 Register API hit");
  console.log("Payload received:", req.body);

  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      console.log("❌ Missing fields");
      return res.status(400).json({ error: "Missing fields" });
    }

    const hashed = await bcrypt.hash(password, 10);
    console.log("✅ Password hashed");

    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role",
      [name, email, hashed, role || "trainee"]
    );

    console.log("✅ User inserted:", result.rows[0]);
    return res.json(result.rows[0]);
  } catch (err: any) {
    console.error("❌ Register error:", err.message);

    // Duplicate email special case
    if (err.code === "23505") {
      return res.status(400).json({ error: "Email already exists" });
    }

    return res.status(500).json({ error: "Registration failed", details: err.message });
  }
});

// ✅ Login
router.post("/login", async (req: Request, res: Response) => {
  console.log("📥 Login API hit");
  console.log("Payload:", req.body);

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0) {
      console.log("❌ User not found");
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      console.log("❌ Wrong password");
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "1h" });

    console.log("✅ Login success for:", user.email);
    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err: any) {
    console.error("❌ Login error:", err.message);
    return res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// ✅ Middleware to protect routes
export function authMiddleware(req: any, res: any, next: any) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ error: "No token" });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ Token verification failed");
    res.status(403).json({ error: "Invalid token" });
  }
}

export default router;
