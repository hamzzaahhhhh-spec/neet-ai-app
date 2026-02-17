import bcrypt from "bcryptjs";
import { query } from "../db/postgres.js";
import { env } from "../config/env.js";
import { PHYSICS_TOPICS, CHEMISTRY_TOPICS, BIOLOGY_TOPICS } from "../config/topics.js";

const defaultWeights = (topics) => topics.reduce((acc, topic) => ({ ...acc, [topic]: 1 }), {});

export const bootstrapSystemState = async () => {
  const settingsExists = await query("SELECT id FROM admin_settings LIMIT 1");
  if (!settingsExists.rowCount) {
    await query(
      `INSERT INTO admin_settings (exam_mode, negative_marking_enabled, exam_duration_minutes, prediction_mode_enabled, inactivity_limit_minutes)
       VALUES ($1, $2, $3, $4, $5)`,
      [true, true, env.examDurationMinutes, env.predictionModeEnabled, env.inactivityLimitMinutes]
    );
  }

  const topicRows = await query("SELECT subject FROM topic_weights");
  const existingSubjects = new Set(topicRows.rows.map((row) => row.subject));
  const subjects = [
    { subject: "Physics", topics: PHYSICS_TOPICS },
    { subject: "Chemistry", topics: CHEMISTRY_TOPICS },
    { subject: "Biology", topics: BIOLOGY_TOPICS }
  ];

  for (const entry of subjects) {
    if (!existingSubjects.has(entry.subject)) {
      await query("INSERT INTO topic_weights (subject, weights_json) VALUES ($1, $2)", [entry.subject, defaultWeights(entry.topics)]);
    }
  }

  if (env.adminBootstrapEmail && env.adminBootstrapPassword) {
    const existingAdmin = await query("SELECT id FROM users WHERE email = $1", [env.adminBootstrapEmail.toLowerCase()]);
    if (!existingAdmin.rowCount) {
      const passwordHash = await bcrypt.hash(env.adminBootstrapPassword, 12);
      await query("INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')", [
        env.adminBootstrapEmail.toLowerCase(),
        passwordHash
      ]);
      console.log("Bootstrap admin created");
    }
  }
};
