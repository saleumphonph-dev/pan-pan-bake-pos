import { useState, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// SUPABASE DATABASE SETUP (FREE - 500MB)
// ============================================================

/*
SETUP INSTRUCTIONS:

1. Go to https://supabase.com
2. Sign up with Google/GitHub (FREE forever)
3. Create new project
4. Copy these from Project Settings:
   - Project URL: https://xxxxx.supabase.co
   - Anon Key: eyxxx...
5. Create .env.local in your project:
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_KEY=eyxxx...

6. Run in Supabase SQL Editor:
   - Copy all SQL from below
   - Paste in SQL Editor
   - Click "Run"
*/

const SUPABASE_SQL = `
-- Create sales table
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  date TIMESTAMP,
  items JSONB,
  total BIGINT,
  discount BIGINT,
  payment TEXT,
  received BIGINT,
  note TEXT,
  cashier TEXT,
  shift_id TEXT,
  voided BOOLEAN DEFAULT false,
  void_reason TEXT,
  void_date TIMESTAMP,
  parked_name TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create shifts table
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  opened_at TIMESTAMP,
  closed_at TIMESTAMP,
  opening_cash BIGINT,
  closing_cash BIGINT,
  expected_cash BIGINT,
  variance BIGINT,
  cashier TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  name TEXT,
  name_lao TEXT,
  type TEXT,
  category TEXT,
  amount BIGINT,
  month TEXT,
  cashier TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create parked_orders table
CREATE TABLE IF NOT EXISTS parked_orders (
  id TEXT PRIMARY KEY,
  name TEXT,
  items JSONB,
  discount BIGINT,
  note TEXT,
  parked_at TIMESTAMP,
  cashier TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_sales_date ON sales(date DESC);
CREATE INDEX idx_sales_shift ON sales(shift_id);
CREATE INDEX idx_shifts_date ON shifts(opened_at DESC);
CREATE INDEX idx_expenses_month ON expenses(month DESC);

-- Enable Row Level Security
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE parked_orders ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all for public use - modify for production!)
CREATE POLICY "sales_all" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "shifts_all" ON shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "expenses_all" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "parked_all" ON parked_orders FOR ALL USING (true) WITH CHECK (true);
`;

// ============================================================
// DATABASE HELPER FUNCTIONS
// ============================================================

const createSupabaseClient = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_KEY;

  if (!url || !key) {
    console.warn("⚠️ Supabase credentials not found. Using localStorage only.");
    return null;
  }

  return createClient(url, key);
};

const supabase = createSupabaseClient();

// Hybrid storage: localStorage + Supabase
const hybridStorage = {
  // Get from local first, then sync with cloud
  async get(table, id = null) {
    const local = localStorage.getItem(`ppb_${table}`);
    if (!supabase) return local ? JSON.parse(local) : null;

    try {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;

      if (data) {
        localStorage.setItem(`ppb_${table}`, JSON.stringify(data));
        return data;
      }
    } catch (err) {
      console.error(`Error fetching ${table}:`, err);
      return local ? JSON.parse(local) : null;
    }
  },

  // Save to both local and cloud
  async set(table, data) {
    // Save locally first
    localStorage.setItem(`ppb_${table}`, JSON.stringify(data));

    // Then sync to cloud
    if (!supabase) return;

    try {
      // Clear existing and insert new
      await supabase.from(table).delete().neq("id", "null");

      if (Array.isArray(data) && data.length > 0) {
        const { error } = await supabase.from(table).insert(data);
        if (error) throw error;
      }

      console.log(`✅ Synced ${table} to cloud`);
    } catch (err) {
      console.error(`❌ Error syncing ${table}:`, err);
    }
  },

  // Add single record
  async add(table, record) {
    // Add to local
    const local = localStorage.getItem(`ppb_${table}`);
    const arr = local ? JSON.parse(local) : [];
    arr.push(record);
    localStorage.setItem(`ppb_${table}`, JSON.stringify(arr));

    // Add to cloud
    if (!supabase) return;

    try {
      const { error } = await supabase.from(table).insert([record]);
      if (error) throw error;
      console.log(`✅ Added to ${table}`);
    } catch (err) {
      console.error(`❌ Error adding to ${table}:`, err);
    }
  },

  // Delete record
  async delete(table, id) {
    // Delete from local
    const local = localStorage.getItem(`ppb_${table}`);
    if (local) {
      const arr = JSON.parse(local).filter((item) => item.id !== id);
      localStorage.setItem(`ppb_${table}`, JSON.stringify(arr));
    }

    // Delete from cloud
    if (!supabase) return;

    try {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
      console.log(`✅ Deleted from ${table}`);
    } catch (err) {
      console.error(`❌ Error deleting from ${table}:`, err);
    }
  },
};

// ============================================================
// DATABASE SETUP WIZARD
// ============================================================
export function DatabaseSetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [credentials, setCredentials] = useState({ url: "", key: "" });
  const [connected, setConnected] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const testConnection = async () => {
    if (!credentials.url || !credentials.key) {
      setTestResult("❌ Please enter both URL and Key");
      return;
    }

    try {
      const testClient = createClient(credentials.url, credentials.key);
      const { data, error } = await testClient.from("sales").select("count", { count: "exact" }).limit(1);

      if (error) {
        setTestResult(`❌ Connection failed: ${error.message}`);
      } else {
        setTestResult("✅ Connected successfully!");
        setConnected(true);
      }
    } catch (err) {
      setTestResult(`❌ Error: ${err.message}`);
    }
  };

  const steps = [
    {
      title: "📋 Create Supabase Account",
      content: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <ol style={{ paddingLeft: 20, color: "#6b7280", lineHeight: 1.8 }}>
              <li>Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>https://supabase.com</a></li>
              <li>Click "Start your project"</li>
              <li>Sign up with GitHub or Google (FREE)</li>
              <li>Create organization (name: Pan Pan Bake)</li>
              <li>Create project (name: pos-database)</li>
              <li>Wait for project to initialize (2-3 min)</li>
              <li>Come back and click "Next" when ready</li>
            </ol>
          </div>
          <button
            onClick={() => setStep(1)}
            style={{
              padding: "12px 24px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✅ Account Created → Next
          </button>
        </div>
      ),
    },
    {
      title: "🔑 Get Credentials",
      content: (
        <div>
          <div style={{ background: "#f9f6f0", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 12 }}>
            <p style={{ margin: 0, color: "#6b7280" }}>
              📍 In Supabase Dashboard, click
              <strong> ⚙️ Project Settings → API</strong>
            </p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              Project URL (from API section):
            </div>
            <input
              type="text"
              value={credentials.url}
              onChange={(e) => setCredentials({ ...credentials, url: e.target.value })}
              placeholder="https://xxxxx.supabase.co"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              Anon/Public Key (from API section):
            </div>
            <input
              type="password"
              value={credentials.key}
              onChange={(e) => setCredentials({ ...credentials, key: e.target.value })}
              placeholder="eyJhbGc..."
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            onClick={testConnection}
            style={{
              padding: "10px 18px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            🧪 Test Connection
          </button>

          {testResult && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                background: testResult.includes("✅") ? "#dcfce7" : "#fee2e2",
                color: testResult.includes("✅") ? "#16a34a" : "#dc2626",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {testResult}
            </div>
          )}

          {connected && (
            <button
              onClick={() => setStep(2)}
              style={{
                marginTop: 12,
                padding: "10px 18px",
                background: "#16a34a",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ✅ Connected → Next
            </button>
          )}
        </div>
      ),
    },
    {
      title: "⚙️ Setup Database Tables",
      content: (
        <div>
          <div style={{ background: "#fff7ed", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 12, color: "#9a3412" }}>
            <strong>📋 Instructions:</strong>
            <ol style={{ paddingLeft: 20, marginTop: 8 }}>
              <li>In Supabase, go to <strong>SQL Editor</strong> (left sidebar)</li>
              <li>Click <strong>"New Query"</strong></li>
              <li>Copy-paste the SQL code below</li>
              <li>Click <strong>"Run"</strong></li>
              <li>Wait for "Success" message</li>
            </ol>
          </div>

          <div style={{ background: "#1a1a2e", color: "#f4d03f", padding: 12, borderRadius: 8, marginBottom: 16, fontFamily: "monospace", fontSize: 11, maxHeight: 200, overflowY: "auto" }}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{SUPABASE_SQL.substring(0, 500)}... (see full SQL above)</pre>
          </div>

          <button
            onClick={() => {
              navigator.clipboard.writeText(SUPABASE_SQL);
              alert("✅ SQL copied to clipboard!");
            }}
            style={{
              padding: "10px 18px",
              background: "#1a1a2e",
              color: "#f4d03f",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
              marginRight: 8,
            }}
          >
            📋 Copy SQL Code
          </button>

          <a
            href="https://supabase.com"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              padding: "10px 18px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            🚀 Open Supabase
          </a>

          <button
            onClick={() => setStep(3)}
            style={{
              marginTop: 12,
              padding: "10px 18px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ✅ Tables Created → Next
          </button>
        </div>
      ),
    },
    {
      title: "📁 Create .env.local File",
      content: (
        <div>
          <div style={{ background: "#f0fdf4", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 12, color: "#16a34a" }}>
            <strong>📍 In your project folder, create a file named:</strong>
            <code style={{ display: "block", marginTop: 6, background: "#fff", padding: 8, borderRadius: 4, fontSize: 11 }}>.env.local</code>
          </div>

          <div style={{ background: "#1a1a2e", color: "#f4d03f", padding: 12, borderRadius: 8, marginBottom: 16, fontFamily: "monospace", fontSize: 12 }}>
            <pre style={{ margin: 0 }}>
{`VITE_SUPABASE_URL=${credentials.url}
VITE_SUPABASE_KEY=${credentials.key}`}
            </pre>
          </div>

          <button
            onClick={() => {
              navigator.clipboard.writeText(`VITE_SUPABASE_URL=${credentials.url}\nVITE_SUPABASE_KEY=${credentials.key}`);
              alert("✅ Credentials copied!");
            }}
            style={{
              padding: "10px 18px",
              background: "#1a1a2e",
              color: "#f4d03f",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            📋 Copy to Clipboard
          </button>

          <button
            onClick={() => setStep(4)}
            style={{
              marginTop: 12,
              marginLeft: 8,
              padding: "10px 18px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ✅ Done → Finish
          </button>
        </div>
      ),
    },
    {
      title: "🎉 Setup Complete!",
      content: (
        <div>
          <div style={{ background: "#dcfce7", padding: 14, borderRadius: 10, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#16a34a" }}>Your database is ready!</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>All sales, shifts, and expenses will now sync to the cloud automatically.</div>
          </div>

          <div style={{ background: "#f9f6f0", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 12 }}>
            <strong style={{ color: "#1a1a2e" }}>✅ What now syncs:</strong>
            <ul style={{ paddingLeft: 20, color: "#6b7280", marginTop: 8 }}>
              <li>💰 All sales transactions</li>
              <li>🌗 Shift records</li>
              <li>📊 Expenses</li>
              <li>📋 Parked orders</li>
              <li>📱 Works offline - syncs when online!</li>
            </ul>
          </div>

          <button
            onClick={onComplete}
            style={{
              padding: "12px 24px",
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            ✅ Start Using POS
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20, fontFamily: "'Noto Sans Lao', sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #e5e7eb" }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
          {steps[step].title}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 20 }}>
          Step {step + 1} of {steps.length}
        </div>

        <div style={{ marginBottom: 20 }}>{steps[step].content}</div>

        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                padding: "10px 18px",
                background: "#f3f4f6",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              ← Back
            </button>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: "#6b7280", alignSelf: "center" }}>
            {step + 1} / {steps.length}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SYNC STATUS INDICATOR
// ============================================================
export function SyncStatus() {
  const [status, setStatus] = useState("offline");
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    const checkConnection = async () => {
      if (!supabase) {
        setStatus("no-db");
        return;
      }

      try {
        const { error } = await supabase.from("sales").select("count", { count: "exact" }).limit(1);
        setStatus(error ? "offline" : "online");
        if (!error) setLastSync(new Date());
      } catch {
        setStatus("offline");
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const statusConfig = {
    online: { color: "#16a34a", label: "🟢 Cloud Sync Active", bg: "#dcfce7" },
    offline: { color: "#ea580c", label: "🟡 Offline Mode (Local Only)", bg: "#fed7aa" },
    "no-db": { color: "#6b7280", label: "⚪ Database Not Configured", bg: "#f3f4f6" },
  };

  const config = statusConfig[status];

  return (
    <div style={{ padding: "8px 14px", background: config.bg, borderRadius: 8, fontSize: 11, fontWeight: 600, color: config.color }}>
      {config.label}
      {lastSync && <span style={{ marginLeft: 8, fontSize: 10, color: "#6b7280" }}>({lastSync.toLocaleTimeString()})</span>}
    </div>
  );
}

export { hybridStorage, supabase };
