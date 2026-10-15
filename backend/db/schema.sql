-- Village Bank (VSLA) — PostgreSQL schema for Neon
-- Converted from the original MySQL schema, plus tables for SMS reset,
-- login lockout, group voting on join requests, and per-member share-out lines.

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  username          VARCHAR(50) UNIQUE NOT NULL,
  password          VARCHAR(255) NOT NULL,
  role              VARCHAR(20) NOT NULL CHECK (role IN ('admin','treasurer','secretary','member')),
  full_name         VARCHAR(120) NOT NULL,
  phone             VARCHAR(20),
  language          VARCHAR(5) NOT NULL DEFAULT 'ny' CHECK (language IN ('en','ny')),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  failed_attempts   INT NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  last_login        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS members (
  id                 SERIAL PRIMARY KEY,
  user_id            INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  membership_number  VARCHAR(20) UNIQUE NOT NULL,
  date_joined        DATE NOT NULL DEFAULT CURRENT_DATE,
  status             VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  village            VARCHAR(120),
  address            TEXT,
  next_of_kin        VARCHAR(120),
  next_of_kin_phone  VARCHAR(20)
);

-- A cycle is one saving period. The group runs a one-year cycle by default.
CREATE TABLE IF NOT EXISTS cycles (
  id             SERIAL PRIMARY KEY,
  cycle_name     VARCHAR(100) NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  share_value    NUMERIC(12,2) NOT NULL DEFAULT 1000,
  status         VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS savings (
  id           SERIAL PRIMARY KEY,
  member_id    INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cycle_id     INT REFERENCES cycles(id) ON DELETE SET NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  shares       INT NOT NULL DEFAULT 1,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  recorded_by  INT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
  id             SERIAL PRIMARY KEY,
  member_id      INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cycle_id       INT REFERENCES cycles(id) ON DELETE SET NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  -- The borrower chooses at application time whether to carry interest.
  with_interest  BOOLEAN NOT NULL DEFAULT TRUE,
  interest_rate  NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  purpose        TEXT,
  status         VARCHAR(12) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','repaid','defaulted')),
  due_date       DATE,
  decision_note  TEXT,
  applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at     TIMESTAMPTZ,
  approved_by    INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS loan_repayments (
  id            SERIAL PRIMARY KEY,
  loan_id       INT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  -- How this payment was split. Interest is banked separately from savings.
  principal_part NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest_part  NUMERIC(12,2) NOT NULL DEFAULT 0,
  date          DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by   INT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fines (
  id           SERIAL PRIMARY KEY,
  member_id    INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cycle_id     INT REFERENCES cycles(id) ON DELETE SET NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason       TEXT,
  paid         BOOLEAN NOT NULL DEFAULT FALSE,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by  INT NOT NULL REFERENCES users(id)
);

-- Social fund: sickness, funerals, emergencies.
CREATE TABLE IF NOT EXISTS welfare_fund (
  id           SERIAL PRIMARY KEY,
  member_id    INT REFERENCES members(id) ON DELETE SET NULL,
  cycle_id     INT REFERENCES cycles(id) ON DELETE SET NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type         VARCHAR(12) NOT NULL CHECK (type IN ('contribution','payout')),
  category     VARCHAR(20) CHECK (category IN ('sickness','funeral','emergency','other')),
  notes        TEXT,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by  INT NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS meetings (
  id            SERIAL PRIMARY KEY,
  cycle_id      INT REFERENCES cycles(id) ON DELETE SET NULL,
  meeting_date  DATE NOT NULL,
  meeting_time  VARCHAR(10),
  location      VARCHAR(160),
  agenda        TEXT,
  notes         TEXT,
  recorded_by   INT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance (
  id          SERIAL PRIMARY KEY,
  meeting_id  INT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id   INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status      VARCHAR(10) NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','excused')),
  UNIQUE (meeting_id, member_id)
);

CREATE TABLE IF NOT EXISTS share_out (
  id                SERIAL PRIMARY KEY,
  cycle_id          INT REFERENCES cycles(id) ON DELETE SET NULL,
  total_savings     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_interest    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_fines       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_welfare     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_fund        NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_members     INT NOT NULL DEFAULT 0,
  status            VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','distributed')),
  date_distributed  DATE,
  distributed_by    INT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One line per member per share-out, so we can show and text each person their own figure.
CREATE TABLE IF NOT EXISTS share_out_details (
  id              SERIAL PRIMARY KEY,
  share_out_id    INT NOT NULL REFERENCES share_out(id) ON DELETE CASCADE,
  member_id       INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member_savings  NUMERIC(12,2) NOT NULL DEFAULT 0,
  profit_share    NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  share_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  notified        BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (share_out_id, member_id)
);

-- people apply to join; the group votes; a committee member finalises.
CREATE TABLE IF NOT EXISTS join_requests (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  phone         VARCHAR(20) NOT NULL,
  village       VARCHAR(120),
  reason        TEXT,
  screening     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status        VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by    INT REFERENCES users(id),
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS join_request_votes (
  id          SERIAL PRIMARY KEY,
  request_id  INT NOT NULL REFERENCES join_requests(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote        VARCHAR(7) NOT NULL CHECK (vote IN ('yes','no')),
  screening   JSONB NOT NULL DEFAULT '{}'::jsonb,
  comment     TEXT,
  voted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, user_id)
);

CREATE TABLE IF NOT EXISTS sms_notifications (
  id               SERIAL PRIMARY KEY,
  recipient_phone  VARCHAR(20) NOT NULL,
  recipient_name   VARCHAR(120),
  message          TEXT NOT NULL,
  category         VARCHAR(30) NOT NULL DEFAULT 'general',
  is_broadcast     BOOLEAN NOT NULL DEFAULT FALSE,
  status           VARCHAR(10) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
  error            TEXT,
  sent_by          INT REFERENCES users(id),
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One-time codes for the SMS password reset.
CREATE TABLE IF NOT EXISTS password_resets (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  attempts    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           SERIAL PRIMARY KEY,
  user_id      INT REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(60) NOT NULL,
  entity_type  VARCHAR(40),
  entity_id    INT,
  details      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key    VARCHAR(60) PRIMARY KEY,
  setting_value  TEXT NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_savings_member ON savings(member_id);
CREATE INDEX IF NOT EXISTS idx_savings_cycle  ON savings(cycle_id);
CREATE INDEX IF NOT EXISTS idx_loans_member   ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status   ON loans(status);
CREATE INDEX IF NOT EXISTS idx_repay_loan     ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS idx_sms_sent_at    ON sms_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at DESC);


-- =====================================================================
--  UPGRADE SECTION
--  Everything below is safe to run again and again. It upgrades an
--  existing database without deleting any data.
-- =====================================================================

-- Personal details kept for every member.
ALTER TABLE members ADD COLUMN IF NOT EXISTS gender         VARCHAR(10);
ALTER TABLE members ADD COLUMN IF NOT EXISTS marital_status VARCHAR(15);
ALTER TABLE members ADD COLUMN IF NOT EXISTS date_of_birth  DATE;
ALTER TABLE members ADD COLUMN IF NOT EXISTS occupation     VARCHAR(80);

-- The member's own picture, shown next to her name everywhere.
ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar        BYTEA;
ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_mime   VARCHAR(12);

-- Money that could not be taken from a member's payout at share-out
-- (she owed more than her savings and returned interest together).
ALTER TABLE share_out_details ADD COLUMN IF NOT EXISTS unrecovered NUMERIC(12,2) NOT NULL DEFAULT 0;

-- A fine can now point at the meeting it came from (the automatic absence fine),
-- so the records can show which meeting and cycle a member has to pay for.
ALTER TABLE fines ADD COLUMN IF NOT EXISTS meeting_id INT REFERENCES meetings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fines_member ON fines(member_id);

-- The fixed monthly contribution every member pays for the group's wrappers.
-- Not savings, not shared out: it is spent on the group's own needs.
-- One row per payment; a month is "paid" when the payments add up to the monthly amount.
CREATE TABLE IF NOT EXISTS monthly_contributions (
  id           SERIAL PRIMARY KEY,
  member_id    INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  cycle_id     INT REFERENCES cycles(id) ON DELETE SET NULL,
  period       DATE NOT NULL,                 -- first day of the month this payment covers
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  recorded_by  INT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_monthly_member ON monthly_contributions(member_id, period);

-- The one-off fee a new member pays on joining. Recorded by the treasurer or
-- the secretary; not savings and never shared out. One row per member, so the
-- UNIQUE keeps a member from being recorded twice.
CREATE TABLE IF NOT EXISTS registration_fees (
  id           SERIAL PRIMARY KEY,
  member_id    INT NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  cycle_id     INT REFERENCES cycles(id) ON DELETE SET NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  note         TEXT,
  recorded_by  INT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scanned IDs, membership forms and similar papers, kept inside the database
-- so they are never exposed by a public web address.
CREATE TABLE IF NOT EXISTS member_documents (
  id             SERIAL PRIMARY KEY,
  member_id      INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  document_type  VARCHAR(30) NOT NULL,
  original_name  VARCHAR(200) NOT NULL,
  mime_type      VARCHAR(80) NOT NULL,
  size_bytes     INT NOT NULL,
  data           BYTEA NOT NULL,
  uploaded_by    INT REFERENCES users(id),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_member ON member_documents(member_id);

-- Group rules (can be changed on the Settings page).
INSERT INTO settings (setting_key, setting_value) VALUES
  ('loan_multiplier', '2'),
  ('default_interest_rate', '10'),
  ('weekly_share_value', '1000'),
  ('welfare_contribution', '200'),
  ('registration_fee', '1000'),
  ('monthly_levy', '3000'),
  ('absence_fine', '0')
ON CONFLICT (setting_key) DO NOTHING;

-- The group agreed: a member may borrow 2 times her savings (it used to be 3).
UPDATE settings SET setting_value = '2' WHERE setting_key = 'loan_multiplier' AND setting_value = '3';

-- Share-out rules are now fixed by the group's decision, so these switches are gone.
DELETE FROM settings WHERE setting_key IN
  ('include_interest_in_shareout', 'include_fines_in_shareout', 'include_welfare_in_shareout');

-- A member can only have one open (pending or approved) loan at a time.
-- Guarded so an old database that already breaks this rule still upgrades.
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS one_open_loan_per_member
    ON loans (member_id) WHERE status IN ('pending','approved');
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Skipped one_open_loan_per_member: some members already have two open loans.';
END $$;
-- =====================================================================
--  MEMBER CASES
--  Suspending, dismissing or bringing back a member is decided by a vote of
--  the members. The chairperson opens the case and carries out the result.
-- =====================================================================

-- A member can now also be suspended or dismissed. ('inactive' stays valid for old records.)
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_status_check;
ALTER TABLE members ADD CONSTRAINT members_status_check
  CHECK (status IN ('active','inactive','suspended','dismissed'));

CREATE TABLE IF NOT EXISTS member_cases (
  id                     SERIAL PRIMARY KEY,
  member_id              INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  action                 VARCHAR(10) NOT NULL CHECK (action IN ('suspend','dismiss','reinstate')),
  reason                 TEXT NOT NULL,
  member_response        TEXT,                      -- the member's own side of the story
  status                 VARCHAR(10) NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','passed','rejected','lapsed','withdrawn')),
  opened_by              INT NOT NULL REFERENCES users(id),
  opened_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closes_at              TIMESTAMPTZ NOT NULL,
  decided_at             TIMESTAMPTZ,
  eligible_voters        INT NOT NULL DEFAULT 0,    -- how many members could vote when it opened
  yes_votes              INT NOT NULL DEFAULT 0,    -- filled in when voting closes
  no_votes               INT NOT NULL DEFAULT 0,
  executed_by            INT REFERENCES users(id),
  executed_at            TIMESTAMPTZ,
  settlement_amount      NUMERIC(12,2),             -- what a dismissed member is owed back
  settlement_unrecovered NUMERIC(12,2),             -- what they still owe beyond that
  settlement_paid_on     DATE,
  settlement_paid_by     INT REFERENCES users(id)
);

-- One vote per member per case. Only the totals are ever shown, never who voted how.
CREATE TABLE IF NOT EXISTS member_case_votes (
  id        SERIAL PRIMARY KEY,
  case_id   INT NOT NULL REFERENCES member_cases(id) ON DELETE CASCADE,
  member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  vote      VARCHAR(3) NOT NULL CHECK (vote IN ('yes','no')),
  voted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_case_votes_case ON member_case_votes(case_id);
CREATE INDEX IF NOT EXISTS idx_member_cases_status ON member_cases(status, closes_at);
-- Only one open case about the same member at a time.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_case_per_member ON member_cases (member_id) WHERE status = 'open';

-- Voting rules (change them on the Settings page).
INSERT INTO settings (setting_key, setting_value) VALUES
  ('case_voting_days', '1'),        -- how long a vote stays open
  ('case_quorum_percent', '50'),    -- at least this % of members must vote
  ('case_dismiss_percent', '67')    -- a dismissal needs at least this % of "yes" among the votes
ON CONFLICT (setting_key) DO NOTHING;

-- =====================================================================
--  SHARE-OUT REVIEW
--  Before any money is handed out, a committee member reviews the
--  calculated figures and confirms them. Nothing is paid until then.
-- =====================================================================

-- A share-out now has a step between 'draft' and 'distributed'.
ALTER TABLE share_out DROP CONSTRAINT IF EXISTS share_out_status_check;
ALTER TABLE share_out ADD CONSTRAINT share_out_status_check
  CHECK (status IN ('draft','confirmed','distributed'));

-- Who confirmed the figures, and when.
ALTER TABLE share_out ADD COLUMN IF NOT EXISTS confirmed_by INT REFERENCES users(id);
ALTER TABLE share_out ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- =====================================================================
--  DELEGATION OF OFFICE
--  When an official (secretary, treasurer or chairperson) is suspended
--  or dismissed, the office is filled by a vote of all the members. The
--  chairperson opens the election and carries out the result.
-- =====================================================================

CREATE TABLE IF NOT EXISTS office_votes (
  id                SERIAL PRIMARY KEY,
  office            VARCHAR(12) NOT NULL CHECK (office IN ('admin','treasurer','secretary')),
  reason            TEXT NOT NULL,
  status            VARCHAR(10) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','passed','lapsed','tie','withdrawn')),
  opened_by         INT NOT NULL REFERENCES users(id),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closes_at         TIMESTAMPTZ NOT NULL,
  decided_at        TIMESTAMPTZ,
  eligible_voters   INT NOT NULL DEFAULT 0,      -- how many members could vote when it opened
  winner_user_id    INT REFERENCES users(id),
  winner_ballots    INT NOT NULL DEFAULT 0,
  round             SMALLINT NOT NULL DEFAULT 1, -- 1 = first ballot, 2 = run-off among ties
  run_off_from      INT REFERENCES office_votes(id), -- the tied round this run-off came from
  executed_by       INT REFERENCES users(id),
  executed_at       TIMESTAMPTZ
);

-- The people standing for the office.
CREATE TABLE IF NOT EXISTS office_vote_candidates (
  id                SERIAL PRIMARY KEY,
  vote_id           INT NOT NULL REFERENCES office_votes(id) ON DELETE CASCADE,
  candidate_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nominated_by      INT REFERENCES users(id),
  nominated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vote_id, candidate_user_id)
);

-- One secret ballot per member per election. Only totals are ever shown.
CREATE TABLE IF NOT EXISTS office_vote_ballots (
  id                SERIAL PRIMARY KEY,
  vote_id           INT NOT NULL REFERENCES office_votes(id) ON DELETE CASCADE,
  voter_member_id   INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  candidate_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  voted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vote_id, voter_member_id)
);

CREATE INDEX IF NOT EXISTS idx_office_vote_candidates ON office_vote_candidates(vote_id);
CREATE INDEX IF NOT EXISTS idx_office_vote_ballots ON office_vote_ballots(vote_id);
CREATE INDEX IF NOT EXISTS idx_office_votes_status ON office_votes(status, closes_at);
-- Only one open election for the same office at a time.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_office_vote ON office_votes (office) WHERE status = 'open';

-- Voting rules for office elections (change them on the Settings page).
INSERT INTO settings (setting_key, setting_value) VALUES
  ('office_voting_days', '2'),      -- how long an election stays open
  ('office_quorum_percent', '50')   -- at least this % of members must vote for it to count
ON CONFLICT (setting_key) DO NOTHING;

-- The applicant answers the background questions in the join form and the
-- answers are kept on the request. Added after the first release, so bring
-- older databases up to date too.
ALTER TABLE join_requests ADD COLUMN IF NOT EXISTS screening JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Older databases collected the background per member vote; that column is no
-- longer written, but it is left in place so nothing is lost.
ALTER TABLE join_request_votes ADD COLUMN IF NOT EXISTS screening JSONB NOT NULL DEFAULT '{}'::jsonb;