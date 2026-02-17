import express from "express";
import bcrypt from "bcryptjs";
import { query } from "../db/postgres.js";
import { signToken } from "../utils/jwt.js";
import { validate, schemas } from "../middleware/validate.js";

export const authRouter = express.Router();

authRouter.post("/register", validate(schemas.register), async (req, res, next) => {
  try {
    const email = req.body.email.toLowerCase();
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "User already exists" });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const inserted = await query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'student') RETURNING id, role",
      [email, passwordHash]
    );

    const token = signToken({ userId: inserted.rows[0].id, role: inserted.rows[0].role, email });
    return res.status(201).json({ token });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/login", validate(schemas.login), async (req, res, next) => {
  try {
    const email = req.body.email.toLowerCase();
    const result = await query("SELECT id, email, role, password_hash FROM users WHERE email = $1", [email]);

    if (!result.rowCount) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(req.body.password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    return res.json({ token });
  } catch (error) {
    return next(error);
  }
});