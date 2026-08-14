import { useState, useEffect, useRef } from 'react';
import {
  LayoutGrid, Lightbulb, SlidersHorizontal, Power, Clock,
  Radio, BarChart3, Zap, Check, Sun, Eye,
} from 'lucide-react';
import { pushSupported, isPushEnabled, enablePush, disablePush } from '../push';

interface DashboardProps {
  onLogout: () => void;
}

// Friendly name for the ESP32 node (the raw id stays "arduino-uno" in the DB).
const displayName = (d: any) =>
  /arduino-uno/i.test(d?.name || d?.id || '') ? 'ESP32 Street Light' : d?.name;

export default function Dashboard({ onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'settings'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [userRole, setUserRole] = useState<'viewer' | 'admin'>('viewer');
  const [userData, setUserData] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [settings, setSettings] = useState({ ldrThreshold: 150, pirTimeout: 30, globalOverride: false });
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const canPush = pushSupported();
  const [dimPct, setDimPct] = useState<Record<string, number>>({});
  const [listening, setListening] = useState(false);
  const dimTimers = useRef<Record<string, any>>({});

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const fetchDashboardData = () => {
    fetch(`${apiUrl}/api/stats`).then(r => r.json()).then(d => { if (d?.stats) setStats(d); }).catch(() => {});
    fetch(`${apiUrl}/api/devices`).then(r => r.json()).then(d => { if (Array.isArray(d)) setDevices(d); }).catch(() => {});
    fetch(`${apiUrl}/api/settings`).then(r => r.json()).then(d => {
      if (d?.ldr_threshold !== undefined) {
        setSettings({ ldrThreshold: d.ldr_threshold, pirTimeout: d.pir_timeout, globalOverride: d.global_override });
      }
    }).catch(() => {});
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { onLogout(); return; }

    fetch(`${apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error('unauth'); return r.json(); })
      .then(d => { if (d.user) { setUserData(d.user); if (d.user.role) setUserRole(d.user.role); } })
      .catch(() => onLogout());

    fetchDashboardData();
    const i = setInterval(fetchDashboardData, 1000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyOverride = async (deviceId: string, enable: boolean, pct = 100, silent = false) => {
    if (userRole !== 'admin') { showToast('Admin only'); return; }
    const token = localStorage.getItem('token');
    const pwm = Math.round((pct / 100) * 255);
    try {
      await fetch(`${apiUrl}/api/devices/${deviceId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ manual_override: enable, target_brightness: enable ? pwm : null }),
      });
      if (!silent) showToast(enable ? 'Manual override ON' : 'Back to auto');
      fetchDashboardData();
    } catch { showToast('Action failed'); }
  };

  const saveSettings = async () => {
    if (userRole !== 'admin') { showToast('Admin only'); return; }
    const token = localStorage.getItem('token');
    setSaving(true);
    try {
      await fetch(`${apiUrl}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ldr_threshold: settings.ldrThreshold,
          pir_timeout: settings.pirTimeout,
          global_override: settings.globalOverride,
        }),
      });
      // Push the LDR threshold to the device too, so the ESP32 picks it up on sync.
      const dev = devices[0];
      if (dev) {
        await fetch(`${apiUrl}/api/devices/${dev.id}/config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ldr_threshold: settings.ldrThreshold,
            auto_dim_delay: null,
            schedule_start: null,
            schedule_end: null,
          }),
        });
      }
      showToast('Settings saved');
    } catch { showToast('Save failed'); }
    finally { setSaving(false); }
  };

  // Security notifications (web push).
  useEffect(() => { isPushEnabled().then(setPushOn).catch(() => {}); }, []);

  const togglePush = async () => {
    const token = localStorage.getItem('token');
    if (!token) { showToast('Sign in first'); return; }
    setPushBusy(true);
    try {
      if (pushOn) { await disablePush(token); setPushOn(false); showToast('Notifications off'); }
      else { await enablePush(token); setPushOn(true); showToast('Notifications on'); }
    } catch (e: any) {
      showToast(e?.message || 'Could not enable notifications');
    } finally {
      setPushBusy(false);
    }
  };

  // ── Live dimmer helpers ───────────────────────────────────────────────────
  const setDim = (id: string, pct: number) => setDimPct((p) => ({ ...p, [id]: pct }));
  const clearDim = (id: string) => setDimPct((p) => { const n = { ...p }; delete n[id]; return n; });
  const dimValFor = (d: any) => dimPct[d.id] ?? Math.round(((d.current_brightness || 0) / 255) * 100);

  // Update the slider instantly; debounce the network call so we don't spam it.
  const onDimChange = (id: string, pct: number) => {
    setDim(id, pct);
    clearTimeout(dimTimers.current[id]);
    dimTimers.current[id] = setTimeout(() => applyOverride(id, true, pct, true), 350);
  };

  const modeBtn = (active: boolean) =>
    `py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-amber-glow text-night-start' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'}`;

  // ── Voice control (Web Speech API) ────────────────────────────────────────
  const applyVoiceCommand = (transcript: string) => {
    const t = transcript.toLowerCase();
    const id = devices[0]?.id || 'arduino-uno';
    const num = t.match(/(\d{1,3})/);
    if (/auto|automatic|sensor/.test(t)) { clearDim(id); applyOverride(id, false, 100, true); showToast(`🎙️ "${transcript}" → Auto`); return; }
    if (/off|dark/.test(t)) { setDim(id, 0); applyOverride(id, true, 0, true); showToast(`🎙️ "${transcript}" → Off`); return; }
    if (num && /(dim|bright|set|level|percent|%|to)/.test(t)) {
      const p = Math.max(0, Math.min(100, parseInt(num[1], 10)));
      setDim(id, p); applyOverride(id, true, p, true); showToast(`🎙️ "${transcript}" → ${p}%`); return;
    }
    if (/full|max|hundred/.test(t)) { setDim(id, 100); applyOverride(id, true, 100, true); showToast(`🎙️ "${transcript}" → Full`); return; }
    if (/half/.test(t)) { setDim(id, 50); applyOverride(id, true, 50, true); showToast(`🎙️ "${transcript}" → 50%`); return; }
    if (/\bon\b|light/.test(t)) { setDim(id, 100); applyOverride(id, true, 100, true); showToast(`🎙️ "${transcript}" → On`); return; }
    showToast(`🎙️ Didn't catch: "${transcript}"`);
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { showToast('Voice needs Chrome or Edge'); return; }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setListening(true);
    rec.onresult = (e: any) => applyVoiceCommand(e.results[0][0].transcript);
    rec.onerror = () => { setListening(false); showToast('Didn’t hear anything'); };
    rec.onend = () => setListening(false);
    rec.start();
  };

  const sendTestPush = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${apiUrl}/api/push/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      showToast(res.ok ? 'Test alert sent 🔔' : 'Test failed');
    } catch {
      showToast('Test failed');
    }
  };

  const tabs = [
    { id: 'overview' as const, label: 'Overview', Icon: LayoutGrid },
    { id: 'devices' as const, label: 'Devices', Icon: Lightbulb },
    { id: 'settings' as const, label: 'Settings', Icon: SlidersHorizontal },
  ];

  const online = devices.filter(d => d.status === 'online').length;

  return (
    <div className="min-h-screen w-full bg-night-start flex justify-center relative">
      <div className="w-full max-w-md px-5 pb-28 pt-4 relative">

        {/* Toast */}
        {toast && (
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[min(92%,26rem)]">
            <div className="flex items-center gap-3 bg-night-start border border-green-400/40 rounded-xl px-4 py-3 shadow-xl">
              <span className="w-5 h-5 rounded-full bg-green-400/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-green-400" />
              </span>
              <span className="text-white text-sm font-semibold font-inter">{toast}</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-white text-2xl font-space font-extrabold">Dashboard</h1>
            <p className="text-gray-400 text-xs font-inter mt-0.5">
              {online > 0 ? `${online} node${online > 1 ? 's' : ''} online` : 'No nodes online'}
            </p>
          </div>
          <button
            onClick={onLogout}
            title={userData ? `${userData.username} — sign out` : 'Sign out'}
            className="w-10 h-10 rounded-full border-2 border-amber-glow bg-amber-glow/10 flex items-center justify-center"
          >
            <span className="text-amber-glow text-sm font-bold">
              {userData ? userData.username.slice(0, 2).toUpperCase() : 'AD'}
            </span>
          </button>
        </div>

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div className="space-y-4 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { Icon: Power, value: `${stats?.details?.energySavedPercent ?? 0}%`, label: 'ENERGY SAVED' },
                { Icon: Clock, value: `${stats?.details?.uptimePercent ?? 0}%`, label: 'SYSTEM UPTIME' },
                { Icon: Radio, value: (stats?.details?.motionEvents ?? 0).toLocaleString(), label: 'MOTION EVENTS' },
                { Icon: BarChart3, value: (stats?.details?.totalReadings ?? 0).toLocaleString(), label: 'SENSOR READINGS' },
              ].map((s, i) => (
                <div key={i} className="bg-night-end border border-white/5 rounded-2xl p-4 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-amber-glow/10 flex items-center justify-center">
                    <s.Icon className="w-4 h-4 text-amber-glow" />
                  </div>
                  <div className="text-white text-xl font-space font-bold">{s.value}</div>
                  <div className="text-gray-500 text-[10px] font-bold tracking-wider">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Live nodes */}
            <div className="bg-night-end border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-white font-space font-semibold">Live nodes</h3>
                <span className="text-gray-500 text-xs">{online} of {devices.length || 0} online</span>
              </div>
              {devices.length === 0 && (
                <p className="text-gray-500 text-sm font-inter py-2">Waiting for the ESP32 to report in…</p>
              )}
              {devices.map(d => {
                const pct = Math.round(((d.current_brightness || 0) / 255) * 100);
                const isOnline = d.status === 'online';
                return (
                  <div key={d.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-gray-200 text-sm font-inter">{displayName(d)}</span>
                    </div>
                    {isOnline ? (
                      <div className="relative w-28 h-4 bg-white/5 rounded-full overflow-hidden flex items-center px-2">
                        <div className="absolute left-0 top-0 bottom-0 bg-amber-glow" style={{ width: `${pct}%` }} />
                        <span className="relative z-10 text-white text-[10px] font-bold ml-auto">{pct}%</span>
                      </div>
                    ) : (
                      <span className="text-gray-600 text-xs">Offline</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DEVICES ── */}
        {activeTab === 'devices' && (
          <div className="space-y-4 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {devices.length === 0 && (
              <div className="text-center py-16 text-gray-500 font-inter">
                <Radio className="w-9 h-9 mx-auto mb-3 opacity-30" />
                <p>No devices found. Power on the ESP32 and connect it to WiFi.</p>
              </div>
            )}
            {devices.map(d => {
              const pct = Math.round(((d.current_brightness || 0) / 255) * 100);
              const isOnline = d.status === 'online';
              const isDay = (d.light_level || 0) > (d.ldr_threshold ?? settings.ldrThreshold);
              return (
                <div
                  key={d.id}
                  className={`bg-night-end border rounded-2xl p-5 space-y-4 ${d.motion_detected ? 'border-amber-glow/40' : 'border-white/5'} ${isOnline ? '' : 'opacity-60'}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sun className="w-4 h-4" style={{ color: pct > 0 ? '#FFB347' : '#4b5563' }} />
                        <h3 className="text-white font-space font-semibold">{displayName(d)}</h3>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                        <span className="text-gray-400 text-xs font-inter">
                          {isOnline ? (d.motion_detected ? 'Online — motion now' : `Online — ${isDay ? 'day' : 'night'}, idle`) : 'Offline'}
                        </span>
                        {d.manual_override && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-glow bg-amber-glow/10 border border-amber-glow/30 px-2 py-0.5 rounded-full">
                            <Zap className="w-2.5 h-2.5" /> OVERRIDE
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-amber-glow text-lg font-space font-bold">{pct}%</span>
                  </div>

                  {/* Brightness track */}
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-glow transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>

                  {/* Ambient + motion mini row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-night-start/60 rounded-xl p-3">
                      <div className="text-gray-500 text-[10px] font-bold tracking-wider mb-1">AMBIENT</div>
                      <div className="text-white text-sm font-space font-bold">{d.light_level ?? '—'} <span className="text-gray-600 text-xs">/1023</span></div>
                    </div>
                    <div className="bg-night-start/60 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-500 text-[10px] font-bold tracking-wider">MOTION</span>
                        <Eye className={`w-3.5 h-3.5 ${d.motion_detected ? 'text-amber-glow' : 'text-gray-600'}`} />
                      </div>
                      <div className={`text-sm font-space font-bold ${d.motion_detected ? 'text-amber-glow' : 'text-gray-500'}`}>
                        {d.motion_detected ? 'DETECTED' : 'CLEAR'}
                      </div>
                    </div>
                  </div>

                  {/* Control panel (admin) — Auto / Off / On + live dimmer */}
                  {userRole === 'admin' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => { clearDim(d.id); applyOverride(d.id, false, 100, true); showToast('Auto mode'); }}
                          disabled={!isOnline}
                          className={`${modeBtn(!d.manual_override)} disabled:opacity-40`}
                        >Auto</button>
                        <button
                          onClick={() => { setDim(d.id, 0); applyOverride(d.id, true, 0, true); showToast('Lights off'); }}
                          disabled={!isOnline}
                          className={`${modeBtn(d.manual_override && (d.current_brightness || 0) === 0)} disabled:opacity-40`}
                        >Off</button>
                        <button
                          onClick={() => { setDim(d.id, 100); applyOverride(d.id, true, 100, true); showToast('Lights on'); }}
                          disabled={!isOnline}
                          className={`${modeBtn(d.manual_override && (d.current_brightness || 0) >= 250)} disabled:opacity-40`}
                        >On</button>
                      </div>

                      <div className="bg-night-start/50 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-400 text-xs font-inter">Dimmer</span>
                          <span className="text-amber-glow text-sm font-bold">{dimValFor(d)}%</span>
                        </div>
                        <input
                          type="range" min={0} max={100} value={dimValFor(d)}
                          onChange={(e) => onDimChange(d.id, parseInt(e.target.value))}
                          disabled={!isOnline}
                          className="w-full accent-amber-glow disabled:opacity-40"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-gray-600 font-inter">Admin role required to control</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab === 'settings' && (
          <div className="space-y-4 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Security notifications */}
            <div className="bg-night-end border border-amber-glow/20 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <h3 className="text-white font-space font-semibold mb-1">🔔 Security notifications</h3>
                  <p className="text-gray-400 text-xs font-inter">
                    {canPush
                      ? 'Get a push alert for motion and if the light goes offline — even when the app is closed.'
                      : 'Not supported here. On iPhone, install the app to your Home Screen first (Share → Add to Home Screen).'}
                  </p>
                </div>
                <button
                  onClick={togglePush}
                  disabled={!canPush || pushBusy}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${pushOn ? 'bg-amber-glow' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${pushOn ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
              {pushOn && (
                <button
                  onClick={sendTestPush}
                  className="mt-4 w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-inter hover:bg-white/10 transition-colors"
                >
                  Send test alert
                </button>
              )}
            </div>

            {/* LDR */}
            <div className="bg-night-end border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-space font-semibold">☀ LDR sensitivity</span>
                <span className="text-amber-glow font-bold">{settings.ldrThreshold}</span>
              </div>
              <input
                type="range" min={0} max={1023} value={settings.ldrThreshold}
                onChange={e => setSettings({ ...settings, ldrThreshold: parseInt(e.target.value) })}
                className="w-full accent-amber-glow"
              />
              <div className="flex justify-between text-[11px] text-gray-600 mt-1"><span>0</span><span>1023</span></div>
              <p className="text-gray-500 text-xs font-inter mt-2">
                Lights arm when the reading drops to/below this (lower = waits for darker).
              </p>
            </div>

            {/* PIR timeout */}
            <div className="bg-night-end border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white font-space font-semibold">📶 Motion timeout</span>
                <span className="text-amber-glow font-bold">{settings.pirTimeout}s</span>
              </div>
              <input
                type="range" min={5} max={300} value={settings.pirTimeout}
                onChange={e => setSettings({ ...settings, pirTimeout: parseInt(e.target.value) })}
                className="w-full accent-amber-glow"
              />
              <div className="flex justify-between text-[11px] text-gray-600 mt-1"><span>5s</span><span>300s</span></div>
              <p className="text-gray-500 text-xs font-inter mt-2">How long a lamp stays at full brightness after the last movement.</p>
            </div>

            {/* Global override */}
            <div className="bg-night-end border border-amber-glow/20 rounded-2xl p-5 flex items-center justify-between">
              <div className="pr-4">
                <h3 className="text-white font-space font-semibold mb-1">⚡ Global manual override</h3>
                <p className="text-gray-400 text-xs font-inter">Takes every node off sensor control until switched back.</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, globalOverride: !settings.globalOverride })}
                disabled={userRole !== 'admin'}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${settings.globalOverride ? 'bg-amber-glow' : 'bg-gray-600'}`}
              >
                <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.globalOverride ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>

            <button
              onClick={saveSettings}
              disabled={saving || userRole !== 'admin'}
              className="w-full py-4 rounded-xl bg-amber-glow text-night-start font-space font-bold shadow-[0_4px_20px_rgba(255,179,71,0.3)] disabled:opacity-50"
            >
              {saving ? 'Saving…' : '✓ Save configuration'}
            </button>
            {userRole !== 'admin' && (
              <p className="text-center text-xs text-gray-600 font-inter">Only admins can change settings.</p>
            )}
          </div>
        )}
      </div>

      {/* Voice control mic (admin) */}
      {userRole === 'admin' && (
        <button
          onClick={startVoice}
          title='Voice control — try "turn on", "dim to 30", "auto"'
          className={`fixed bottom-28 right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all ${listening ? 'bg-red-500 animate-pulse scale-110' : 'bg-amber-glow'}`}
        >
          <span className="text-xl">🎤</span>
        </button>
      )}

      {/* Floating pill tab bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(92%,26rem)]">
        <div className="flex items-center justify-between gap-2 bg-night-start/95 border border-white/10 rounded-full p-2 shadow-2xl backdrop-blur">
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex-1 h-12 rounded-full flex items-center justify-center gap-2 transition-all ${active ? 'bg-amber-glow flex-[1.3]' : ''}`}
              >
                <Icon className="w-4 h-4" style={{ color: active ? '#0B1530' : '#9CA3AF' }} />
                {active && <span className="text-night-start text-xs font-bold">{label}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
