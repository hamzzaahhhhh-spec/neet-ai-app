CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGSERIAL PRIMARY KEY,
  subject TEXT NOT NULL CHECK (subject IN ('Physics', 'Chemistry', 'Biology')),
  topic TEXT NOT NULL,
  syllabus_unit TEXT NOT NULL DEFAULT 'Physics and Measurement',
  concept_tag TEXT NOT NULL DEFAULT 'Core Concept',
  question_format TEXT NOT NULL DEFAULT 'Single Correct' CHECK (question_format IN ('Single Correct', 'Assertion-Reason', 'Statement I-II', 'Multi-Statement', 'Case-Based')),
  source_type TEXT NOT NULL DEFAULT 'Conceptual' CHECK (source_type IN ('Conceptual', 'Numerical', 'Application')),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  explanation TEXT NOT NULL,
  probability_score NUMERIC(4,3) NOT NULL CHECK (probability_score >= 0 AND probability_score <= 1),
  confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  verification_flag TEXT NOT NULL DEFAULT 'Estimated' CHECK (verification_flag IN ('Verified', 'Estimated', 'Regenerated')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'moderate', 'hard')),
  hash_signature TEXT NOT NULL,
  date_generated DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hash_signature)
);

CREATE INDEX IF NOT EXISTS idx_questions_date_generated ON questions(date_generated);
CREATE INDEX IF NOT EXISTS idx_questions_subject_topic ON questions(subject, topic);
CREATE INDEX IF NOT EXISTS idx_questions_topic_recent ON questions(topic, date_generated DESC);
CREATE INDEX IF NOT EXISTS idx_questions_confidence ON questions(confidence_score DESC);

CREATE TABLE IF NOT EXISTS daily_papers (
  id BIGSERIAL PRIMARY KEY,
  paper_date DATE NOT NULL UNIQUE,
  physics_count INT NOT NULL,
  chemistry_count INT NOT NULL,
  biology_count INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_paper_questions (
  id BIGSERIAL PRIMARY KEY,
  paper_id BIGINT NOT NULL REFERENCES daily_papers(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  question_order INT NOT NULL,
  UNIQUE (paper_id, question_id),
  UNIQUE (paper_id, question_order)
);

CREATE TABLE IF NOT EXISTS attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id BIGINT NOT NULL REFERENCES daily_papers(id) ON DELETE CASCADE,
  score INT NOT NULL,
  accuracy NUMERIC(5,2) NOT NULL,
  time_taken_seconds INT NOT NULL,
  topic_stats_json JSONB NOT NULL,
  subject_stats_json JSONB NOT NULL,
  time_by_subject_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_created_at ON attempts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id BIGSERIAL PRIMARY KEY,
  attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option CHAR(1) NULL CHECK (selected_option IN ('A', 'B', 'C', 'D')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_settings (
  id BIGSERIAL PRIMARY KEY,
  exam_mode BOOLEAN NOT NULL DEFAULT TRUE,
  negative_marking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  exam_duration_minutes INT NOT NULL DEFAULT 180,
  prediction_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  inactivity_limit_minutes INT NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topic_weights (
  id BIGSERIAL PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE CHECK (subject IN ('Physics', 'Chemistry', 'Biology')),
  weights_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generation_logs (
  id BIGSERIAL PRIMARY KEY,
  run_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  message TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revision_queue (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  attempt_id BIGINT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  next_review_date DATE NOT NULL,
  interval_days INT NOT NULL CHECK (interval_days IN (1, 3, 7, 14)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_revision_queue_user_date ON revision_queue(user_id, next_review_date);
CREATE INDEX IF NOT EXISTS idx_revision_queue_status ON revision_queue(status);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS concept_tag TEXT NOT NULL DEFAULT 'Core Concept';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS syllabus_unit TEXT NOT NULL DEFAULT 'Physics and Measurement';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_format TEXT NOT NULL DEFAULT 'Single Correct';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'Conceptual';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS verification_flag TEXT NOT NULL DEFAULT 'Estimated';
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_difficulty_check;
ALTER TABLE questions ADD CONSTRAINT questions_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'moderate', 'hard'));
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS prediction_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS inactivity_limit_minutes INT NOT NULL DEFAULT 15;
ALTER TABLE generation_logs ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
