-- ============================================================
-- Pan Pan Bake POS — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- Sales / Orders table
CREATE TABLE IF NOT EXISTS sales (
  id           TEXT PRIMARY KEY,
  date         TIMESTAMPTZ NOT NULL,
  items        JSONB       NOT NULL,
  total        BIGINT      NOT NULL,
  discount     BIGINT      DEFAULT 0,
  payment      TEXT        NOT NULL,
  received     BIGINT,
  note         TEXT,
  cashier      TEXT,
  shift_id     TEXT,
  voided       BOOLEAN     DEFAULT false,
  void_reason  TEXT,
  parked_name  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id             TEXT PRIMARY KEY,
  opened_at      TIMESTAMPTZ NOT NULL,
  closed_at      TIMESTAMPTZ,
  cashier        TEXT,
  opening_cash   BIGINT      DEFAULT 0,
  closing_cash   BIGINT,
  expected_cash  BIGINT,
  variance       BIGINT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast dashboard queries
CREATE INDEX IF NOT EXISTS idx_sales_date    ON sales(date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_shift   ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment ON sales(payment);
CREATE INDEX IF NOT EXISTS idx_shifts_date   ON shifts(opened_at DESC);

-- Row Level Security (keeps data private)
ALTER TABLE sales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Allow full access via anon key (safe for a private POS with PIN auth)
CREATE POLICY "sales_open"  ON sales  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "shifts_open" ON shifts FOR ALL USING (true) WITH CHECK (true);
