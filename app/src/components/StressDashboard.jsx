import { useState, useEffect, useRef } from 'react';
import {
  Zap, Settings, Terminal, Play, Save, RefreshCw,
  ShieldAlert, Activity, LogOut, CheckCircle, Building2,
  Square, Info, AlertTriangle, Sun, Moon
} from 'lucide-react';
import { useTheme } from '../ThemeContext';

const API = (url, method = 'GET', body = null) =>
  fetch(url, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || 'Error')));

const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</label>
      {hint && <span className="text-[8px] text-slate-400 dark:text-slate-600 italic max-w-[120px] text-right leading-tight">{hint}</span>}
    </div>
    {children}
  </div>
);

const Inp = ({ ...props }) => (
  <input
    {...props}
    className="w-full bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white disabled:opacity-20 disabled:cursor-not-allowed"
  />
);

const Sel = ({ value, onChange, children, ...props }) => (
  <select
    value={value}
    onChange={onChange}
    {...props}
    className="w-full bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[11px] font-bold outline-none focus:border-blue-500 text-slate-900 dark:text-white"
  >
    {children}
  </select>
);

const TEST_META = {
  'race-test.cjs': {
    label: 'Race Integrity',
    color: 'blue',
    icon: Zap,
    subtitle: 'Atomic Transaction Test',
    badge: 'ACID Safe',
    description: 'Fires N concurrent room allocation requests simultaneously. The system must allow exactly MaxCapacity winners and reject all others using SQLite BEGIN IMMEDIATE transactions — proving zero over-allocation under race conditions.',
    risk: 'medium',
  },
  'stress-test.cjs': {
    label: 'Gate Rush',
    color: 'blue',
    icon: Zap,
    subtitle: 'High-Volume Scan Stress',
    badge: 'Load Test',
    description: 'Simulates a surge of students scanning into the gate simultaneously. Fires TOTAL_REQUESTS QR scan events in batches of CONCURRENCY, measuring throughput (req/s), avg latency, and error rate under sustained load.',
    risk: 'high',
  },
  'failure-simulation.cjs': {
    label: 'Failure Sim',
    color: 'blue',
    icon: ShieldAlert,
    subtitle: 'ACID Rollback Check',
    badge: 'Stability',
    description: 'Starts an open transaction, inserts a record, then intentionally crashes before committing. Verifies that SQLite ROLLBACK leaves the database in a perfectly clean state — no partial or ghost records.',
    risk: 'low',
  },
  'unified-stress-test.cjs': {
    label: 'Unified Suite',
    color: 'blue',
    icon: Activity,
    subtitle: 'Parallel Global Load',
    badge: 'Full Suite',
    description: 'Runs all stress scenarios in parallel across 4 independent channels: Member dashboard polling, Gate scan stream, Bcrypt auth hashing, and Maintenance write operations. Tests the full system concurrently.',
    risk: 'high',
  },
};

const RISK_COLORS = {
  low: { card: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400', pill: 'bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  medium: { card: 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400', pill: 'bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-600 dark:text-amber-400' },
  high: { card: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-400', pill: 'bg-rose-100 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400' },
};

export default function StressDashboard({ onLogout }) {
  const { dark, toggle: toggleTheme } = useTheme();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selectedTest, setSelectedTest] = useState('race-test.cjs');
  const [logs, setLogs] = useState([]);
  const [runId, setRunId] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const readerRef = useRef(null);
  const logEndRef = useRef(null);

  useEffect(() => { fetchConfig(); }, []);
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const fetchConfig = async () => {
    try {
      const data = await API('/api/tests/config');
      setConfig(data);
    } catch (e) {
      addLog(`[ERROR] Failed to fetch config: ${e}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    try {
      await API('/api/tests/config', 'POST', config);
      addLog('[SYSTEM] Configuration saved to constants.cjs successfully.', 'success');
    } catch (e) {
      addLog(`[ERROR] Failed to save config: ${e}`, 'error');
    }
  };

  const addLog = (msg, type = 'info') =>
    setLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }]);

  const killTest = async () => {
    if (!runId) return;
    try {
      readerRef.current?.cancel();
      await fetch('/api/tests/kill', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      addLog(`[TERMINATED] Process ${runId} killed by user.`, 'error');
    } catch (e) {
      addLog(`[WARN] Kill signal sent but response error: ${e}`, 'warn');
    } finally {
      setRunning(false);
      setRunId(null);
    }
  };

  const runTest = async () => {
    if (running || !selectedTest) return;
    const id = `run_${Date.now()}`;
    setRunId(id);
    setRunning(true);
    addLog(`[LAUNCH] Initializing ${selectedTest} (PID: ${id})...`, 'warn');
    try {
      const response = await fetch('/api/tests/run', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: selectedTest, runId: id }),
      });
      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        decoder.decode(value).split('\n').filter(l => l.trim()).forEach(line => {
          let type = 'info';
          if (line.includes('[PASS]') || line.includes('SUCCESS') || line.includes('VERIFICATION: SUCCESS')) type = 'success';
          if (line.includes('[BLOCK]') || line.includes('[ERROR]') || line.includes('FAILURE') || line.includes('TERMINATED')) type = 'error';
          if (line.includes('[LAUNCH]') || line.includes('[PARAM]') || line.includes('[AUTO') || line.includes('[RESET]') || line.includes('---')) type = 'warn';
          addLog(line, type);
        });
      }
    } catch (e) {
      if (e?.name !== 'AbortError') addLog(`[FATAL] Script execution failed: ${e}`, 'error');
    } finally {
      setRunning(false);
      setRunId(null);
      readerRef.current = null;
    }
  };

  const meta = TEST_META[selectedTest];
  const risk = RISK_COLORS[meta.risk];

  if (loading) return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
      <RefreshCw className="text-blue-500 animate-spin" size={48} />
    </div>
  );

  return (
    <div className="h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 font-sans flex flex-col overflow-hidden">

      {/* Header */}
      <header className="h-18 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-8 flex items-center justify-between z-50 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-2.5 shadow-lg shadow-blue-500/30">
            <Building2 size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-gray-900 dark:text-white font-black text-xl tracking-tight">HostelMS</h1>
            <p className="text-indigo-600 text-xs font-bold tracking-widest uppercase">ACID Testing Lab</p>
          </div>
        </div>


        <div className="flex items-center gap-4">
          <div className="hidden lg:block text-right">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 leading-none px-1">Logged in as:</p>
            <p className="text-sm font-black text-gray-900 dark:text-white uppercase italic leading-none px-1">System Tester</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all"
          >
            {dark ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all"
            title="Exit Testing Layer"
          >
            <LogOut size={20} />
          </button>
          {/* <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-xs shadow-md uppercase">TST</div> */}
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-white font-bold shadow-lg border-2 border-white ring-2 ring-slate-100 uppercase">TST</div>

        </div>
      </header>

      <main className="flex-1 max-w-[1700px] mx-auto w-full px-6 py-4 flex flex-col gap-4 overflow-hidden">

        {/* Execution Switcher */}
        <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 shrink-0 shadow-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {Object.entries(TEST_META).map(([id, t]) => (
              <button
                type="button"
                key={id}
                onClick={() => setSelectedTest(id)}
                className={`flex-1 min-w-[175px] flex items-center gap-2.5 p-2.5 rounded-xl transition-all border ${selectedTest === id
                  ? `bg-${t.color}-50 dark:bg-${t.color}-500/10 border-${t.color}-200 dark:border-${t.color}-500/40`
                  : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
              >
                <div className={`p-1.5 rounded-lg ${selectedTest === id ? `bg-${t.color}-500 text-white` : `bg-${t.color}-100 dark:bg-${t.color}-500/10 text-${t.color}-600 dark:text-${t.color}-400`}`}>
                  <t.icon size={14} />
                </div>
                <div className="text-left min-w-0">
                  <p className={`text-[11px] font-black uppercase tracking-tight truncate ${selectedTest === id ? `text-${t.color}-700 dark:text-${t.color}-300` : 'text-slate-600 dark:text-slate-400'}`}>{t.label}</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5 truncate">{t.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex gap-5 min-h-0 overflow-hidden">

          {/* Left: Config Panel */}
          <div className="w-[360px] shrink-0 flex flex-col bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">

            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-[11px] font-black text-slate-700 dark:text-white uppercase tracking-widest flex items-center gap-2">
                <Settings className="text-blue-500" size={14} /> Configuration
              </h2>
              <button type="button" onClick={saveConfig} className="text-[9px] font-black text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors uppercase tracking-widest flex items-center gap-1 p-1">
                <Save size={10} /> Save Defaults
              </button>
            </div>

            {/* Collapsible Description */}
            <div className={`mx-4 mt-3 rounded-xl border shrink-0 overflow-hidden ${risk.card}`}>
              <button
                type="button"
                onClick={() => setShowInfo(v => !v)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Info size={11} className="shrink-0" />
                  <span className="text-[9px] font-black uppercase tracking-widest">{meta.badge}</span>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${risk.pill}`}>
                    {meta.risk} risk
                  </span>
                </div>
                <span className="text-[9px] font-black opacity-40">{showInfo ? '▲' : '▼'}</span>
              </button>
              {showInfo && (
                <p className="text-[10px] font-medium leading-relaxed opacity-80 px-3 pb-3">{meta.description}</p>
              )}
            </div>

            {/* Scrollable Params */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">

              {selectedTest === 'race-test.cjs' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">Race Condition Parameters</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Auto Mode" hint="Discover room & users automatically">
                      <Sel value={config?.RACE_TEST?.AUTO_MODE} onChange={e => setConfig(p => ({ ...p, RACE_TEST: { ...p.RACE_TEST, AUTO_MODE: e.target.value === 'true' } }))}>
                        <option value="true">ENABLED</option>
                        <option value="false">DISABLED</option>
                      </Sel>
                    </Field>
                    <Field label="Auto Vacate" hint="Clear room before test">
                      <Sel value={config?.RACE_TEST?.AUTO_VACATE} onChange={e => setConfig(p => ({ ...p, RACE_TEST: { ...p.RACE_TEST, AUTO_VACATE: e.target.value === 'true' } }))}>
                        <option value="true">YES</option>
                        <option value="false">NO</option>
                      </Sel>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Target Capacity" hint="Max occupancy to find">
                      <Inp type="number" value={config?.RACE_TEST?.AUTO_CONFIG?.TARGET_CAPACITY} onChange={e => setConfig(p => ({ ...p, RACE_TEST: { ...p.RACE_TEST, AUTO_CONFIG: { ...p.RACE_TEST.AUTO_CONFIG, TARGET_CAPACITY: parseInt(e.target.value) } } }))} />
                    </Field>
                    <Field label="Concurrent Users" hint="Simultaneous requests">
                      <Inp type="number" value={config?.RACE_TEST?.AUTO_CONFIG?.NUM_STUDENTS} onChange={e => setConfig(p => ({ ...p, RACE_TEST: { ...p.RACE_TEST, AUTO_CONFIG: { ...p.RACE_TEST.AUTO_CONFIG, NUM_STUDENTS: parseInt(e.target.value) } } }))} />
                    </Field>
                  </div>
                  <Field label="Manual Room (if Auto OFF)" hint="Exact room to target">
                    <Inp type="text" disabled={config?.RACE_TEST?.AUTO_MODE} value={config?.RACE_TEST?.ROOM_NUMBER} onChange={e => setConfig(p => ({ ...p, RACE_TEST: { ...p.RACE_TEST, ROOM_NUMBER: e.target.value } }))} placeholder="e.g. A201" />
                  </Field>
                  <div className="p-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/10 rounded-xl">
                    <p className="text-[9px] font-bold text-amber-700 dark:text-amber-500/70 leading-relaxed">Expected: Exactly TARGET_CAPACITY requests succeed. All others blocked by atomic lock.</p>
                  </div>
                </div>
              )}

              {selectedTest === 'stress-test.cjs' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">Gate Rush Parameters</p>
                  <Field label="Total Requests" hint="Total QR scans to fire">
                    <Inp type="number" value={config?.STRESS_TEST?.TOTAL_REQUESTS} onChange={e => setConfig(p => ({ ...p, STRESS_TEST: { ...p.STRESS_TEST, TOTAL_REQUESTS: parseInt(e.target.value) } }))} />
                  </Field>
                  <Field label="Concurrency (Batch Size)" hint="Parallel requests per wave">
                    <Inp type="number" value={config?.STRESS_TEST?.CONCURRENCY} onChange={e => setConfig(p => ({ ...p, STRESS_TEST: { ...p.STRESS_TEST, CONCURRENCY: parseInt(e.target.value) } }))} />
                  </Field>
                  <Field label="Target QR Code" hint="QR payload to scan">
                    <Inp type="text" value={config?.STRESS_TEST?.QR_CODE} onChange={e => setConfig(p => ({ ...p, STRESS_TEST: { ...p.STRESS_TEST, QR_CODE: e.target.value } }))} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                      <p className="text-[8px] text-slate-400 uppercase tracking-widest mb-1">Projected</p>
                      <p className="text-sm font-black text-slate-800 dark:text-white">{config?.STRESS_TEST?.TOTAL_REQUESTS || 0}</p>
                      <p className="text-[8px] text-slate-400 uppercase">total req</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                      <p className="text-[8px] text-slate-400 uppercase tracking-widest mb-1">Waves</p>
                      <p className="text-sm font-black text-slate-800 dark:text-white">{Math.ceil((config?.STRESS_TEST?.TOTAL_REQUESTS || 0) / (config?.STRESS_TEST?.CONCURRENCY || 1))}</p>
                      <p className="text-[8px] text-slate-400 uppercase">batches</p>
                    </div>
                  </div>
                  <div className="p-3 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/10 rounded-xl">
                    <p className="text-[9px] font-bold text-rose-700 dark:text-rose-400/70 leading-relaxed flex items-start gap-1.5">
                      <AlertTriangle size={10} className="mt-0.5 shrink-0" /> High concurrency can saturate the local server. Start low (50 req / 10 concurrency) and scale up.
                    </p>
                  </div>
                </div>
              )}

              {selectedTest === 'failure-simulation.cjs' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 text-center py-4">
                  <ShieldAlert className="text-rose-500 mx-auto" size={40} />
                  <div>
                    <h3 className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-widest mb-2">No Parameters Required</h3>
                    <p className="text-[10px] font-medium text-slate-500 leading-relaxed px-2">
                      Self-contained test using seeded data to guarantee reproducible rollback verification.
                    </p>
                  </div>
                  <div className="text-left space-y-2 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Execution Steps</p>
                    {['BEGIN TRANSACTION', 'INSERT allocation record', 'THROW crash simulation', 'ROLLBACK triggered', 'VERIFY: no ghost data'].map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[8px] font-black text-slate-400 w-4">{i + 1}.</span>
                        <span className="text-[9px] font-bold text-slate-600 dark:text-slate-400">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedTest === 'unified-stress-test.cjs' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">Parallel Channel Config</p>
                  <Field label="Global Concurrency" hint="Applied to all 4 channels">
                    <Inp
                      type="number"
                      value={config?.UNIFIED_TEST?.S1_MEMBER_POLLING?.CONCURRENCY}
                      onChange={e => setConfig(prev => {
                        const next = { ...prev, UNIFIED_TEST: { ...prev.UNIFIED_TEST } };
                        Object.keys(next.UNIFIED_TEST).forEach(k => {
                          if (next.UNIFIED_TEST[k]?.CONCURRENCY !== undefined)
                            next.UNIFIED_TEST[k] = { ...next.UNIFIED_TEST[k], CONCURRENCY: parseInt(e.target.value) };
                        });
                        return next;
                      })}
                    />
                  </Field>
                  <Field label="S1: Member Polling — Total"><Inp type="number" value={config?.UNIFIED_TEST?.S1_MEMBER_POLLING?.TOTAL_REQUESTS} onChange={e => setConfig(p => ({ ...p, UNIFIED_TEST: { ...p.UNIFIED_TEST, S1_MEMBER_POLLING: { ...p.UNIFIED_TEST.S1_MEMBER_POLLING, TOTAL_REQUESTS: parseInt(e.target.value) } } }))} /></Field>
                  <Field label="S2: Gate Scan — Total"><Inp type="number" value={config?.UNIFIED_TEST?.S2_GATE_SCAN?.TOTAL_REQUESTS} onChange={e => setConfig(p => ({ ...p, UNIFIED_TEST: { ...p.UNIFIED_TEST, S2_GATE_SCAN: { ...p.UNIFIED_TEST.S2_GATE_SCAN, TOTAL_REQUESTS: parseInt(e.target.value) } } }))} /></Field>
                  <Field label="S3: Auth Bcrypt — Total"><Inp type="number" value={config?.UNIFIED_TEST?.S3_AUTH_STRESS?.TOTAL_REQUESTS} onChange={e => setConfig(p => ({ ...p, UNIFIED_TEST: { ...p.UNIFIED_TEST, S3_AUTH_STRESS: { ...p.UNIFIED_TEST.S3_AUTH_STRESS, TOTAL_REQUESTS: parseInt(e.target.value) } } }))} /></Field>
                  <Field label="S4: Maintenance Ops — Total"><Inp type="number" value={config?.UNIFIED_TEST?.S4_MAINTENANCE?.TOTAL_REQUESTS} onChange={e => setConfig(p => ({ ...p, UNIFIED_TEST: { ...p.UNIFIED_TEST, S4_MAINTENANCE: { ...p.UNIFIED_TEST.S4_MAINTENANCE, TOTAL_REQUESTS: parseInt(e.target.value) } } }))} /></Field>
                  <div className="p-3 bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/10 rounded-xl space-y-1">
                    <p className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2">Active Channels</p>
                    {[['S1', 'Member Dashboard Polling', config?.UNIFIED_TEST?.S1_MEMBER_POLLING?.TOTAL_REQUESTS],
                    ['S2', 'Gate QR Scan Stream', config?.UNIFIED_TEST?.S2_GATE_SCAN?.TOTAL_REQUESTS],
                    ['S3', 'Auth Bcrypt Hash', config?.UNIFIED_TEST?.S3_AUTH_STRESS?.TOTAL_REQUESTS],
                    ['S4', 'Maintenance Write Ops', config?.UNIFIED_TEST?.S4_MAINTENANCE?.TOTAL_REQUESTS],
                    ].map(([ch, name, val]) => (
                      <div key={ch} className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-500 dark:text-slate-500">{name}</span>
                        <span className="text-[9px] font-black text-blue-600 dark:text-blue-400">{val || '?'} req</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-rose-50 dark:bg-rose-500/5 border border-rose-200 dark:border-rose-500/10 rounded-xl">
                    <p className="text-[9px] font-bold text-rose-700 dark:text-rose-400/70 leading-relaxed flex items-start gap-1.5">
                      <AlertTriangle size={10} className="mt-0.5 shrink-0" /> Fires all 4 channels simultaneously. Keep totals under 100 per channel for first runs.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="p-4 shrink-0 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <button
                type="button"
                onClick={runTest}
                disabled={running}
                className={`w-full py-3.5 rounded-2xl flex items-center justify-center gap-2.5 transition-all font-black uppercase text-xs tracking-[0.3em] italic shadow-sm ${running
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20 border border-blue-400/30'
                  }`}
              >
                {running ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                {running ? 'Execution in progress...' : `Run ${selectedTest.split('.')[0].replace(/-/g, ' ').toUpperCase()}`}
              </button>

              <button
                type="button"
                onClick={killTest}
                disabled={!running}
                className={`w-full py-2.5 rounded-2xl flex items-center justify-center gap-2 transition-all font-black uppercase text-xs tracking-widest border ${running
                  ? 'bg-rose-50 dark:bg-rose-500/15 hover:bg-rose-100 dark:hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 cursor-pointer'
                  : 'bg-slate-50 dark:bg-slate-800/20 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-700/20 cursor-not-allowed opacity-50'
                  }`}
              >
                <Square size={13} className={running ? 'fill-rose-500 dark:fill-rose-400' : ''} />
                {running ? 'Terminate Process' : 'No Process Running'}
              </button>
            </div>
          </div>

          {/* Right: Console */}
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">

            {/* Terminal Header */}
            <div className="bg-slate-50 dark:bg-slate-900/80 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <p className="text-[10px] font-black tracking-[0.3em] text-slate-400 uppercase flex items-center gap-1.5">
                  <Terminal size={12} className="text-blue-500" /> Output Console
                </p>
                <button
                  type="button"
                  onClick={() => setLogs([])}
                  className="ml-2 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-[8px] font-black text-slate-400 hover:text-slate-700 dark:hover:text-white uppercase tracking-widest"
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">DB Mode</span>
                  <span className="text-[10px] font-black text-blue-500 italic uppercase">WAL</span>
                </div>
                {running && (
                  <div className="flex items-center gap-1.5 p-1 px-2.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-full">
                    <Activity size={8} className="text-blue-500 dark:text-blue-400 animate-pulse" />
                    <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Live</span>
                  </div>
                )}
                <div className="text-right">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Log Entries</span>
                  <span className="text-[10px] font-black text-slate-700 dark:text-white">{logs.length}</span>
                </div>
              </div>
            </div>

            {/* Log Area */}
            <div className="flex-1 p-6 overflow-y-auto font-mono text-[12px] leading-relaxed space-y-1.5 custom-scrollbar bg-slate-50/50 dark:bg-slate-950/30">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 space-y-4">
                  <Terminal size={56} className="opacity-10" />
                  <div className="text-center">
                    <p className="font-black uppercase tracking-[0.4em] text-[9px] opacity-40">Reliability Interface Standby</p>
                    <p className="text-[16px] font-black uppercase tracking-[0.2em] italic text-slate-300 dark:text-slate-800 mt-2">Ready for deployment</p>
                    <p className="text-[9px] font-medium text-slate-400 dark:text-slate-700 mt-3 max-w-xs leading-relaxed">Select a test engine above, configure parameters on the left, then click Run.</p>
                  </div>
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="flex gap-3 fade-in animate-in slide-in-from-left-1 duration-200 border-l-2 border-slate-100 dark:border-slate-800/50 pl-2">
                    <span className="text-slate-400 shrink-0 select-none font-bold text-[8px] mt-0.5 tabular-nums uppercase">{log.time}</span>
                    <p className={`text-[11px] leading-snug ${log.type === 'error' ? 'text-rose-600 dark:text-rose-400 font-bold' :
                      log.type === 'success' ? 'text-emerald-600 dark:text-emerald-400 font-medium' :
                        log.type === 'warn' ? 'text-amber-600 dark:text-amber-400 font-black' :
                          'text-slate-600 dark:text-slate-400'
                      }`}>
                      {log.msg}
                    </p>
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>

            {/* Status Bar */}
            <div className="bg-slate-50 dark:bg-slate-900/60 px-6 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-8">
                <div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] block mb-0.5">Engine Status</span>
                  <span className={`text-[10px] font-black uppercase flex items-center gap-1.5 italic ${running ? 'text-blue-600 dark:text-blue-500' : 'text-emerald-600 dark:text-emerald-500'}`}>
                    {running ? <Activity size={12} className="animate-pulse" /> : <CheckCircle size={12} />}
                    {running ? 'Processing' : 'Idle'}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] block mb-0.5">Active Test</span>
                  <span className="text-[10px] font-black text-slate-700 dark:text-white italic uppercase">{selectedTest.split('.')[0]}</span>
                </div>
                {running && runId && (
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] block mb-0.5">Process ID</span>
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 font-mono">{runId.split('_')[1]}</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.25em] block mb-0.5">Transactions</span>
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 italic uppercase">BEGIN IMMEDIATE</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
      `}</style>
    </div>
  );
}
