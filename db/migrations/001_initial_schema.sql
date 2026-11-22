-- Migration 001: Initial BAUST CSE Fest Judge Management Schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'JUDGE')),
  full_name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS judges (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  designation VARCHAR(255) NOT NULL,
  institution VARCHAR(255) NOT NULL,
  judge_type VARCHAR(20) NOT NULL CHECK (judge_type IN ('EXTERNAL', 'FACULTY')),
  expertise TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_judges_type_active ON judges(judge_type, is_active);

CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  required_primary_judges INTEGER NOT NULL CHECK (required_primary_judges >= 1),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'OPEN', 'ONGOING', 'COMPLETED', 'CANCELLED')),
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitions_status ON competitions(status);

CREATE TABLE IF NOT EXISTS competition_slots (
  id SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE RESTRICT,
  slot_label VARCHAR(150) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  venue VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
    CHECK (status IN ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_slot_valid_times CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_competition_slots_comp ON competition_slots(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_slots_window ON competition_slots(start_time, end_time);

CREATE TABLE IF NOT EXISTS judge_invitations (
  id SERIAL PRIMARY KEY,
  judge_id INTEGER NOT NULL UNIQUE REFERENCES judges(id) ON DELETE RESTRICT,
  sent_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_resent_date TIMESTAMPTZ,
  resend_count INTEGER NOT NULL DEFAULT 0 CHECK (resend_count >= 0),
  expiration_date TIMESTAMPTZ NOT NULL,
  response_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (response_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
  response_date TIMESTAMPTZ,
  response_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invitation_dates CHECK (expiration_date > sent_date)
);

CREATE INDEX IF NOT EXISTS idx_judge_invitations_status ON judge_invitations(response_status, expiration_date);

CREATE TABLE IF NOT EXISTS judge_availability (
  id SERIAL PRIMARY KEY,
  judge_id INTEGER NOT NULL REFERENCES judges(id) ON DELETE RESTRICT,
  slot_id INTEGER NOT NULL REFERENCES competition_slots(id) ON DELETE RESTRICT,
  availability_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (availability_status IN ('AVAILABLE', 'UNAVAILABLE', 'TENTATIVE')),
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_judge_slot_availability UNIQUE (judge_id, slot_id)
);

CREATE TABLE IF NOT EXISTS judge_assignments (
  id SERIAL PRIMARY KEY,
  judge_id INTEGER NOT NULL REFERENCES judges(id) ON DELETE RESTRICT,
  slot_id INTEGER NOT NULL REFERENCES competition_slots(id) ON DELETE RESTRICT,
  role VARCHAR(20) NOT NULL CHECK (role IN ('PRIMARY', 'BACKUP')),
  response_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (response_status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  assignment_status VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED'
    CHECK (assignment_status IN (
      'ASSIGNED',
      'CONFIRMED',
      'DECLINED',
      'WITHDRAWN',
      'REPLACED',
      'STANDBY',
      'ACTIVATED_BACKUP',
      'CANCELLED_SLOT',
      'CANCELLED_DEACTIVATED',
      'COMPLETED'
    )),
  replaces_assignment_id INTEGER REFERENCES judge_assignments(id) ON DELETE RESTRICT,
  assigned_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  response_note TEXT,
  status_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_no_self_replacement CHECK (replaces_assignment_id IS NULL OR replaces_assignment_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_judge_slot_assignment
  ON judge_assignments (judge_id, slot_id)
  WHERE assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP');

CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_replacement
  ON judge_assignments (replaces_assignment_id)
  WHERE replaces_assignment_id IS NOT NULL
    AND assignment_status IN ('ASSIGNED', 'CONFIRMED', 'ACTIVATED_BACKUP');

CREATE INDEX IF NOT EXISTS idx_judge_assignments_slot ON judge_assignments(slot_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_judge_assignments_judge ON judge_assignments(judge_id, assignment_status);

CREATE TABLE IF NOT EXISTS judge_attendance (
  id SERIAL PRIMARY KEY,
  assignment_id INTEGER NOT NULL UNIQUE REFERENCES judge_assignments(id) ON DELETE RESTRICT,
  attendance_status VARCHAR(20) NOT NULL
    CHECK (attendance_status IN ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')),
  marked_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role VARCHAR(20),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

CREATE OR REPLACE FUNCTION fn_validate_judge_assignment()
RETURNS TRIGGER AS $$
DECLARE
  v_judge_active BOOLEAN;
  v_judge_type VARCHAR(20);
  v_inv_status VARCHAR(20);
  v_slot_start TIMESTAMPTZ;
  v_slot_end TIMESTAMPTZ;
  v_slot_status VARCHAR(20);
  v_comp_status VARCHAR(20);
  v_conflict_count INTEGER;
BEGIN
  IF NEW.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP') THEN
    SELECT j.is_active, j.judge_type
      INTO v_judge_active, v_judge_type
      FROM judges j
     WHERE j.id = NEW.judge_id;

    IF NOT FOUND OR v_judge_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Cannot assign inactive or non-existent judge (id=%).', NEW.judge_id
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.role = 'BACKUP' AND v_judge_type <> 'FACULTY' THEN
      RAISE EXCEPTION 'Only FACULTY judges can be designated as BACKUP judges.'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT ji.response_status
      INTO v_inv_status
      FROM judge_invitations ji
     WHERE ji.judge_id = NEW.judge_id;

    IF NOT FOUND OR v_inv_status <> 'ACCEPTED' THEN
      RAISE EXCEPTION 'Judge (id=%) must have an ACCEPTED invitation before receiving assignments.', NEW.judge_id
        USING ERRCODE = 'P0003';
    END IF;

    SELECT cs.start_time, cs.end_time, cs.status, c.status
      INTO v_slot_start, v_slot_end, v_slot_status, v_comp_status
      FROM competition_slots cs
      JOIN competitions c ON c.id = cs.competition_id
     WHERE cs.id = NEW.slot_id;

    IF NOT FOUND OR v_slot_status = 'CANCELLED' OR v_comp_status = 'CANCELLED' THEN
      RAISE EXCEPTION 'Cannot assign judge to a cancelled or non-existent competition slot (slot_id=%).', NEW.slot_id
        USING ERRCODE = 'P0004';
    END IF;

    SELECT COUNT(*)
      INTO v_conflict_count
      FROM judge_assignments ja
      JOIN competition_slots cs ON cs.id = ja.slot_id
     WHERE ja.judge_id = NEW.judge_id
       AND ja.id <> COALESCE(NEW.id, -1)
       AND ja.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
       AND cs.status <> 'CANCELLED'
       AND cs.start_time < v_slot_end
       AND cs.end_time > v_slot_start;

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'Scheduling conflict: judge (id=%) already has an overlapping assignment.', NEW.judge_id
        USING ERRCODE = 'P0005';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_judge_assignment ON judge_assignments;
CREATE TRIGGER trg_validate_judge_assignment
  BEFORE INSERT OR UPDATE ON judge_assignments
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_judge_assignment();

CREATE OR REPLACE FUNCTION fn_validate_slot_reschedule()
RETURNS TRIGGER AS $$
DECLARE
  v_conflict_judge_id INTEGER;
BEGIN
  IF NEW.status <> 'CANCELLED' AND (NEW.start_time <> OLD.start_time OR NEW.end_time <> OLD.end_time) THEN
    SELECT ja1.judge_id
      INTO v_conflict_judge_id
      FROM judge_assignments ja1
      JOIN judge_assignments ja2 ON ja2.judge_id = ja1.judge_id AND ja2.id <> ja1.id
      JOIN competition_slots cs2 ON cs2.id = ja2.slot_id
     WHERE ja1.slot_id = NEW.id
       AND ja1.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
       AND ja2.assignment_status IN ('ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP')
       AND cs2.status <> 'CANCELLED'
       AND cs2.start_time < NEW.end_time
       AND cs2.end_time > NEW.start_time
     LIMIT 1;

    IF v_conflict_judge_id IS NOT NULL THEN
      RAISE EXCEPTION 'Slot reschedule creates an overlapping assignment for judge (id=%).', v_conflict_judge_id
        USING ERRCODE = 'P0006';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_slot_reschedule ON competition_slots;
CREATE TRIGGER trg_validate_slot_reschedule
  BEFORE UPDATE OF start_time, end_time, status ON competition_slots
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_slot_reschedule();
