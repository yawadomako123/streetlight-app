import { useState, useEffect } from 'react';
import { Activity, LayoutDashboard, Sliders, LogOut, Power, Sun, Zap, Eye, Clock, Radio, ChevronDown, ChevronUp, Save, RotateCcw } from 'lucide-react';

interface DashboardProps {
  onLogout: () => void;
}

// Default per-device config state
const defaultConfig = () => ({
  // Brightness override
  manual_override: false,
  target_brightness: 100, // percent 0-100

  // Schedule
  schedule_start: '',
  schedule_end: '',

  // Per-device LDR threshold ('' = use global)
  ldr_threshold: '',

  // Auto-dim delay: minutes (0 = off)
  auto_dim_delay: 0,
});

export default function Dashboard({ onLogout }: DashboardProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'devices' | 'settings'>('overview');
  const [stats, setStats] = useState<any>(null);
  const [userRole, setUserRole] = useState<'viewer' | 'admin'>('viewer');
  const [userData, setUserData] = useState<any>(null);

  const [devices, setDevices] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    ldrThreshold: 150,
    pirTimeout: 30,
    globalOverride: false,
  });

  // Which device card has its config panel expanded
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);

  // Pending config edits keyed by device id
  const [deviceConfigs, setDeviceConfigs] = useState<Record<string, ReturnType<typeof defaultConfig>>>({});

  // Save status per device
  const [saveStatus, setSaveStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  const fetchDevicesOnly = () => {
    // Fetch only devices (telemetry)
    fetch(`${apiUrl}/api/devices`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDevices(data);
          setDeviceConfigs(prev => {
            const next = { ...prev };
            data.forEach((d: any) => {
              if (!next[d.id]) {
                next[d.id] = {
                  manual_override: d.manual_override || false,
                  target_brightness: d.target_brightness != null
                    ? Math.round((d.target_brightness / 255) * 100)
                    : 100,
                  schedule_start: d.schedule_start ? d.schedule_start.slice(0, 5) : '',
                  schedule_end:   d.schedule_end   ? d.schedule_end.slice(0, 5)   : '',
                  ldr_threshold:  d.ldr_threshold != null ? String(d.ldr_threshold) : '',
                  auto_dim_delay: d.auto_dim_delay ?? 0,
                };
              }
            });
            return next;
          });
        }
      })
      .catch(err => console.error('Failed to fetch devices:', err));
  };

  const fetchDashboardData = () => {
    // Fetch stats
    fetch(`${apiUrl}/api/stats`)
      .then(res => res.json())
      .then(data => { if (data?.stats) setStats(data); })
      .catch(err => console.error('Failed to fetch stats:', err));

    // Fetch settings
    fetch(`${apiUrl}/api/settings`)
      .then(res => res.json())
      .then(data => {
        if (data?.ldr_threshold) {
          setSettings({
            ldrThreshold:  data.ldr_threshold,
            pirTimeout:    data.pir_timeout,
            globalOverride: data.global_override,
          });
        }
      })
      .catch(err => console.error('Failed to fetch settings:', err));
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { onLogout(); return; }

    fetch(`${apiUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => { if (!res.ok) throw new Error('Unauthorized'); return res.json(); })
      .then(data => {
        if (data.user) {
          setUserData(data.user);
          if (data.user.role) setUserRole(data.user.role);
        }
      })
      .catch(() => onLogout());

    fetchDashboardData();
    fetchDevicesOnly();

    // Poll devices (telemetry) very fast (every 250ms)
    const deviceInterval = setInterval(fetchDevicesOnly, 250);
    // Poll stats/settings slower (every 3000ms) to avoid overloading the backend
    const dashboardInterval = setInterval(fetchDashboardData, 3000);

    return () => {
      clearInterval(deviceInterval);
      clearInterval(dashboardInterval);
    };
  }, []);

  // ── Brightness override ──────────────────────────────────────────────────
  const applyBrightnessOverride = async (deviceId: string, enable: boolean, pct: number) => {
    const token = localStorage.getItem('token');
    const targetPwm = Math.round((pct / 100) * 255);
    await fetch(`${apiUrl}/api/devices/${deviceId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ manual_override: enable, target_brightness: enable ? targetPwm : null }),
    });
    fetchDashboardData();
  };

  // ── Save automation config ───────────────────────────────────────────────
  const saveDeviceConfig = async (deviceId: string) => {
    const cfg = deviceConfigs[deviceId];
    if (!cfg) return;
    const token = localStorage.getItem('token');

    setSaveStatus(s => ({ ...s, [deviceId]: 'saving' }));
    try {
      await fetch(`${apiUrl}/api/devices/${deviceId}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          schedule_start: cfg.schedule_start || null,
          schedule_end:   cfg.schedule_end   || null,
          ldr_threshold:  cfg.ldr_threshold !== '' ? Number(cfg.ldr_threshold) : null,
          auto_dim_delay: cfg.auto_dim_delay > 0 ? cfg.auto_dim_delay : null,
        }),
      });
      setSaveStatus(s => ({ ...s, [deviceId]: 'saved' }));
      setTimeout(() => setSaveStatus(s => ({ ...s, [deviceId]: 'idle' })), 2000);
      fetchDashboardData();
    } catch {
      setSaveStatus(s => ({ ...s, [deviceId]: 'error' }));
    }
  };

  const patchConfig = (deviceId: string, patch: Partial<ReturnType<typeof defaultConfig>>) => {
    setDeviceConfigs(prev => ({
      ...prev,
      [deviceId]: { ...(prev[deviceId] || defaultConfig()), ...patch }
    }));
  };

  // ── Global settings save ─────────────────────────────────────────────────
  const saveSettings = async () => {
    const token = localStorage.getItem('token');
    try {
      await fetch(`${apiUrl}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          ldr_threshold:  settings.ldrThreshold,
          pir_timeout:    settings.pirTimeout,
          global_override: settings.globalOverride,
        }),
      });
      alert('Settings saved successfully!');
    } catch {
      alert('Error saving settings.');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-night-end relative z-10 overflow-hidden">

      {/* ── Sidebar ── */}
      <div className="w-full md:w-64 bg-night-start/80 border-b md:border-b-0 md:border-r border-white/5 flex flex-col md:p-6 p-4">
        <div className="flex items-center justify-between md:justify-start gap-3 md:mb-10 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-glow/20 flex items-center justify-center border border-amber-glow/30">
              <Activity className="w-5 h-5 text-amber-glow" />
            </div>
            <div>
              <h3 className="font-space font-bold text-white tracking-wide">ISLC</h3>
              <p className="text-xs text-amber-glow font-inter hidden md:block">Control Panel</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="md:hidden flex items-center justify-center p-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 scrollbar-hide flex-1">
          {(['overview', 'devices', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 md:w-full flex items-center gap-2 md:gap-3 px-4 py-2.5 md:py-3 rounded-xl transition-all duration-300 font-inter text-sm font-medium capitalize ${
                activeTab === tab
                  ? 'bg-amber-glow/10 text-amber-glow border border-amber-glow/30'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {tab === 'overview' && <LayoutDashboard className="w-4 h-4" />}
              {tab === 'devices'  && <Power className="w-4 h-4" />}
              {tab === 'settings' && <Sliders className="w-4 h-4" />}
              {tab}
            </button>
          ))}
        </nav>

        <div className="hidden md:block mt-auto pt-6 border-t border-white/5">
          {userData && (
            <div className="mb-4 px-2">
              <div className="text-sm font-space font-bold text-white truncate">{userData.username}</div>
              <div className="text-xs font-inter text-gray-500 truncate">{userData.email}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest mt-1 text-amber-glow">
                Role: {userData.role}
              </div>
            </div>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all duration-300 font-inter text-sm font-bold uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 p-6 sm:p-10 overflow-y-auto">

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="font-space text-3xl font-bold text-white mb-2">Live Overview</h2>
            <p className="text-gray-400 font-inter mb-8">Real-time system telemetry and statistics.</p>

            {stats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                <div className="bg-night-start/40 border border-white/5 rounded-2xl p-6">
                  <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Energy Saved</div>
                  <div className="text-4xl font-space font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-glow to-amber-200">
                    {stats.details?.energySavedPercent || 0}%
                  </div>
                </div>
                <div className="bg-night-start/40 border border-white/5 rounded-2xl p-6">
                  <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">System Uptime</div>
                  <div className="text-4xl font-space font-bold text-green-400">
                    {stats.details?.uptimePercent || 0}%
                  </div>
                </div>
                <div className="bg-night-start/40 border border-white/5 rounded-2xl p-6">
                  <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Total Motion Events</div>
                  <div className="text-4xl font-space font-bold text-white">
                    {stats.details?.motionEvents?.toLocaleString() || 0}
                  </div>
                </div>
                <div className="bg-night-start/40 border border-white/5 rounded-2xl p-6">
                  <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Total Sensor Readings</div>
                  <div className="text-4xl font-space font-bold text-white">
                    {stats.details?.totalReadings?.toLocaleString() || 0}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-amber-glow animate-pulse">Loading telemetry...</div>
            )}

            <div className="bg-night-start/40 border border-white/5 rounded-2xl p-6">
              <h3 className="font-space font-bold text-white mb-4">Activity Feed</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm font-inter text-gray-300">
                  <div className="w-2 h-2 rounded-full bg-amber-glow"></div>
                  <span className="text-gray-500 w-24">Just now</span>
                  <span>Motion detected in <strong className="text-white">Zone B</strong>. Brightness increased to 100%.</span>
                </div>
                <div className="flex items-center gap-4 text-sm font-inter text-gray-300">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  <span className="text-gray-500 w-24">12 mins ago</span>
                  <span>Ambient light level dropped below threshold. System active.</span>
                </div>
                <div className="flex items-center gap-4 text-sm font-inter text-gray-300">
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <span className="text-gray-500 w-24">1 hour ago</span>
                  <span>System routine diagnostic completed successfully.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── DEVICES TAB ── */}
        {activeTab === 'devices' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="font-space text-3xl font-bold text-white mb-2">Device Management</h2>
            <p className="text-gray-400 font-inter mb-8">Live sensor telemetry and automation control for each street light node.</p>

            <div className="grid grid-cols-1 gap-6">
              {devices.length === 0 && (
                <div className="text-center py-16 text-gray-500 font-inter">
                  <Radio className="w-10 h-10 mx-auto mb-3 opacity-30 animate-pulse" />
                  <p>No devices found. Connect a hardware node via USB to get started.</p>
                </div>
              )}

              {devices.map(device => {
                const cfg = deviceConfigs[device.id] || defaultConfig();
                const brightnessPercent = Math.round((device.current_brightness / 255) * 100);
                const ldrPercent = Math.round(((device.light_level || 0) / 1023) * 100);
                const isDay = (device.light_level || 0) > (device.ldr_threshold ?? settings.ldrThreshold);
                const isOnline = device.status === 'online';
                const hasMotion = device.motion_detected;
                const isExpanded = expandedDevice === device.id;

                const lastSeen = device.last_seen ? new Date(device.last_seen) : null;
                const secondsAgo = lastSeen ? Math.floor((Date.now() - lastSeen.getTime()) / 1000) : null;
                const lastSeenLabel = secondsAgo === null ? '—'
                  : secondsAgo < 10 ? 'Just now'
                  : secondsAgo < 60 ? `${secondsAgo}s ago`
                  : secondsAgo < 3600 ? `${Math.floor(secondsAgo / 60)}m ago`
                  : `${Math.floor(secondsAgo / 3600)}h ago`;

                const status = saveStatus[device.id] || 'idle';

                return (
                  <div
                    key={device.id}
                    className={`relative rounded-2xl border transition-all duration-500 overflow-hidden ${
                      isOnline
                        ? hasMotion
                          ? 'border-amber-glow/40 bg-amber-glow/5'
                          : 'border-white/10 bg-night-start/40'
                        : 'border-red-500/20 bg-night-start/40 opacity-70'
                    }`}
                  >
                    {/* Ambient glow when LED is on */}
                    {brightnessPercent > 0 && (
                      <div
                        className="absolute inset-0 pointer-events-none rounded-2xl"
                        style={{
                          boxShadow: `inset 0 0 60px rgba(255,179,71,${brightnessPercent / 400})`,
                          transition: 'box-shadow 1s ease',
                        }}
                      />
                    )}

                    <div className="p-6">
                      {/* ── Header ── */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4">
                          {/* Glowing LED icon */}
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center border flex-shrink-0 transition-all duration-700"
                            style={{
                              background: brightnessPercent > 0 ? `rgba(255,179,71,${brightnessPercent / 350})` : 'rgba(255,255,255,0.04)',
                              borderColor: brightnessPercent > 0 ? `rgba(255,179,71,${0.3 + brightnessPercent / 400})` : 'rgba(255,255,255,0.1)',
                              boxShadow: brightnessPercent > 0 ? `0 0 ${brightnessPercent / 3}px rgba(255,179,71,0.5)` : 'none',
                            }}
                          >
                            <Sun
                              className="w-7 h-7 transition-colors duration-700"
                              style={{ color: brightnessPercent > 0 ? '#ffb347' : '#4b5563' }}
                            />
                          </div>

                          <div>
                            <h3 className="font-space font-bold text-white text-lg leading-tight">{device.name}</h3>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                                {isOnline ? 'Online' : 'Offline'}
                              </span>
                              {device.manual_override && (
                                <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-glow bg-amber-glow/10 border border-amber-glow/30 px-2 py-0.5 rounded-full">
                                  <Zap className="w-3 h-3" /> Override
                                </span>
                              )}
                              {(device.schedule_start && device.schedule_end) && (
                                <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-400/10 border border-blue-400/30 px-2 py-0.5 rounded-full">
                                  <Clock className="w-3 h-3" /> Scheduled
                                </span>
                              )}
                              <span className="text-xs text-gray-500 font-inter">{isDay ? '☀️ Day' : '🌙 Night'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-inter text-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{lastSeenLabel}</span>
                        </div>
                      </div>

                      {/* ── Live metrics ── */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">

                        {/* Brightness */}
                        <div className="bg-night-end/60 rounded-xl p-4 border border-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">LED Brightness</span>
                            <span className="font-space font-bold text-white text-sm">{brightnessPercent}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${brightnessPercent}%`,
                                background: brightnessPercent > 80
                                  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                                  : brightnessPercent > 20
                                  ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                                  : 'linear-gradient(90deg,#374151,#4b5563)',
                              }}
                            />
                          </div>
                        </div>

                        {/* Ambient light */}
                        <div className="bg-night-end/60 rounded-xl p-4 border border-white/5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Ambient Light</span>
                            <span className="font-space font-bold text-white text-sm">{device.light_level ?? '—'}</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${ldrPercent}%`,
                                background: ldrPercent > 50 ? 'linear-gradient(90deg,#60a5fa,#93c5fd)' : 'linear-gradient(90deg,#1e3a5f,#2563eb)',
                              }}
                            />
                          </div>
                          <div className="text-[10px] text-gray-600 font-inter mt-1.5">
                            {isDay ? 'Above threshold — lights off' : 'Below threshold — lights armed'}
                          </div>
                        </div>

                        {/* Motion */}
                        <div className={`rounded-xl p-4 border transition-all duration-500 ${hasMotion ? 'bg-amber-glow/10 border-amber-glow/30' : 'bg-night-end/60 border-white/5'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Motion</span>
                            <Eye className={`w-4 h-4 ${hasMotion ? 'text-amber-glow' : 'text-gray-600'}`} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${hasMotion ? 'bg-amber-glow animate-ping' : 'bg-gray-600'}`} />
                            <span className={`font-space font-bold text-lg ${hasMotion ? 'text-amber-glow' : 'text-gray-500'}`}>
                              {hasMotion ? 'DETECTED' : 'CLEAR'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* ── Configure toggle ── */}
                      {userRole === 'admin' && (
                        <button
                          onClick={() => setExpandedDevice(isExpanded ? null : device.id)}
                          className="w-full flex items-center justify-between px-5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-inter text-sm font-medium transition-all duration-200"
                        >
                          <span className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-amber-glow" />
                            Automation & Control
                          </span>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>
                      )}

                      {/* ── Control panel (expanded) ── */}
                      {isExpanded && userRole === 'admin' && (
                        <div className="mt-4 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">

                          {/* 1 ── Brightness override */}
                          <div className="bg-night-end/70 rounded-xl p-5 border border-white/5">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <h4 className="font-space font-bold text-white text-sm">Brightness Override</h4>
                                <p className="text-xs text-gray-500 font-inter mt-0.5">Force the LED to a specific level, ignoring sensors.</p>
                              </div>
                              {/* Toggle */}
                              <button
                                onClick={() => {
                                  const next = !cfg.manual_override;
                                  patchConfig(device.id, { manual_override: next });
                                  applyBrightnessOverride(device.id, next, cfg.target_brightness);
                                }}
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${cfg.manual_override ? 'bg-amber-glow' : 'bg-gray-600'}`}
                              >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${cfg.manual_override ? 'translate-x-6' : 'translate-x-1'}`} />
                              </button>
                            </div>

                            {cfg.manual_override && (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs text-gray-400 font-inter">Target Brightness</span>
                                  <span className="font-space font-bold text-amber-glow">{cfg.target_brightness}%</span>
                                </div>
                                <input
                                  type="range" min="0" max="100" value={cfg.target_brightness}
                                  onChange={e => {
                                    const v = Number(e.target.value);
                                    patchConfig(device.id, { target_brightness: v });
                                    applyBrightnessOverride(device.id, true, v);
                                  }}
                                  className="w-full accent-amber-glow"
                                />
                                <div className="flex justify-between text-[10px] text-gray-600 font-inter mt-1">
                                  <span>Off (0%)</span>
                                  <span>Dim (20%)</span>
                                  <span>Full (100%)</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 2 ── Schedule */}
                          <div className="bg-night-end/70 rounded-xl p-5 border border-white/5">
                            <h4 className="font-space font-bold text-white text-sm mb-1">Active Schedule</h4>
                            <p className="text-xs text-gray-500 font-inter mb-4">
                              Define when this node is allowed to be active. Leave blank to run 24/7.
                              Supports overnight ranges (e.g. 18:00 – 06:00).
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs text-gray-400 font-inter mb-1 block">Lights ON from</label>
                                <input
                                  type="time"
                                  value={cfg.schedule_start}
                                  onChange={e => patchConfig(device.id, { schedule_start: e.target.value })}
                                  className="w-full bg-night-start/60 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-inter focus:outline-none focus:border-amber-glow/50"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-gray-400 font-inter mb-1 block">Lights OFF at</label>
                                <input
                                  type="time"
                                  value={cfg.schedule_end}
                                  onChange={e => patchConfig(device.id, { schedule_end: e.target.value })}
                                  className="w-full bg-night-start/60 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-inter focus:outline-none focus:border-amber-glow/50"
                                />
                              </div>
                            </div>
                            {cfg.schedule_start && cfg.schedule_end && (
                              <div className="mt-3 flex items-center gap-2 text-xs text-blue-300 font-inter">
                                <Clock className="w-3 h-3" />
                                Active {cfg.schedule_start} → {cfg.schedule_end}
                                {cfg.schedule_start > cfg.schedule_end ? ' (overnight)' : ''}
                              </div>
                            )}
                            {(cfg.schedule_start || cfg.schedule_end) && (
                              <button
                                onClick={() => patchConfig(device.id, { schedule_start: '', schedule_end: '' })}
                                className="mt-2 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 font-inter transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" /> Clear schedule
                              </button>
                            )}
                          </div>

                          {/* 3 ── Per-device LDR threshold */}
                          <div className="bg-night-end/70 rounded-xl p-5 border border-white/5">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-space font-bold text-white text-sm">LDR Sensitivity</h4>
                              <span className="text-xs text-gray-500 font-inter">
                                Global: {settings.ldrThreshold}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 font-inter mb-4">
                              Override the day/night threshold for this node only. Leave blank to use the global value.
                            </p>
                            <div className="flex items-center gap-3">
                              <input
                                type="number"
                                min="0" max="1023"
                                placeholder={`Global (${settings.ldrThreshold})`}
                                value={cfg.ldr_threshold}
                                onChange={e => patchConfig(device.id, { ldr_threshold: e.target.value })}
                                className="flex-1 bg-night-start/60 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-inter focus:outline-none focus:border-amber-glow/50 placeholder-gray-600"
                              />
                              {cfg.ldr_threshold !== '' && (
                                <button
                                  onClick={() => patchConfig(device.id, { ldr_threshold: '' })}
                                  className="text-xs text-gray-500 hover:text-gray-300 font-inter transition-colors flex items-center gap-1"
                                >
                                  <RotateCcw className="w-3 h-3" /> Use global
                                </button>
                              )}
                            </div>
                            {cfg.ldr_threshold !== '' && (
                              <div className="mt-2 text-[10px] text-gray-600 font-inter">
                                LDR &gt; {cfg.ldr_threshold} = Day (off) · LDR ≤ {cfg.ldr_threshold} = Night (armed)
                              </div>
                            )}
                          </div>

                          {/* 4 ── Auto-dim delay */}
                          <div className="bg-night-end/70 rounded-xl p-5 border border-white/5">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="font-space font-bold text-white text-sm">Auto-Dim Timer</h4>
                              <span className="font-space font-bold text-amber-glow text-sm">
                                {cfg.auto_dim_delay === 0 ? 'Off' : `${cfg.auto_dim_delay} min`}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 font-inter mb-4">
                              Fade to baseline brightness after this many minutes of no motion, instead of cutting off instantly.
                            </p>
                            <input
                              type="range" min="0" max="30" step="1"
                              value={cfg.auto_dim_delay}
                              onChange={e => patchConfig(device.id, { auto_dim_delay: Number(e.target.value) })}
                              className="w-full accent-amber-glow"
                            />
                            <div className="flex justify-between text-[10px] text-gray-600 font-inter mt-1">
                              <span>Off</span>
                              <span>1 min</span>
                              <span>5 min</span>
                              <span>15 min</span>
                              <span>30 min</span>
                            </div>
                          </div>

                          {/* Save button */}
                          <button
                            onClick={() => saveDeviceConfig(device.id)}
                            disabled={status === 'saving'}
                            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold font-space text-sm transition-all duration-300 ${
                              status === 'saved'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : status === 'error'
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : 'bg-amber-glow text-night-start hover:bg-amber-400 shadow-[0_0_20px_rgba(255,179,71,0.3)]'
                            }`}
                          >
                            <Save className="w-4 h-4" />
                            {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved ✓' : status === 'error' ? 'Error — Try again' : 'Save Configuration'}
                          </button>
                        </div>
                      )}

                      {/* Viewer hint */}
                      {userRole !== 'admin' && (
                        <div className="mt-4 text-center text-xs text-gray-600 font-inter">
                          Admin role required to configure devices.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {activeTab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="font-space text-3xl font-bold text-white mb-2">System Settings</h2>
            <p className="text-gray-400 font-inter mb-8">Configure global hardware thresholds and automation rules.</p>

            <div className="space-y-6 max-w-2xl">
              <div className="bg-night-start/40 border border-white/5 rounded-2xl p-6">
                <label className="flex items-center justify-between mb-4">
                  <span className="font-space font-bold text-white">LDR Sensitivity Threshold</span>
                  <span className="text-amber-glow font-bold">{settings.ldrThreshold}</span>
                </label>
                <input
                  type="range" min="0" max="1023"
                  value={settings.ldrThreshold}
                  onChange={e => setSettings({ ...settings, ldrThreshold: parseInt(e.target.value) })}
                  className="w-full accent-amber-glow"
                />
                <p className="text-xs text-gray-500 font-inter mt-3">Values below this threshold will be considered "Night" and activate the lighting system. Individual devices can override this.</p>
              </div>

              <div className="bg-night-start/40 border border-white/5 rounded-2xl p-6">
                <label className="flex items-center justify-between mb-4">
                  <span className="font-space font-bold text-white">PIR Motion Timeout (Seconds)</span>
                  <span className="text-amber-glow font-bold">{settings.pirTimeout}s</span>
                </label>
                <input
                  type="range" min="5" max="300"
                  value={settings.pirTimeout}
                  onChange={e => setSettings({ ...settings, pirTimeout: parseInt(e.target.value) })}
                  className="w-full accent-amber-glow"
                />
                <p className="text-xs text-gray-500 font-inter mt-3">Duration the lights stay at 100% brightness after detecting motion.</p>
              </div>

              <div className="bg-night-start/40 border border-amber-glow/20 rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <h3 className="font-space font-bold text-white mb-1">Global Manual Override</h3>
                  <p className="text-xs text-gray-400 font-inter max-w-sm">When enabled, the system will ignore all sensor inputs and keep lights ON indefinitely.</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, globalOverride: !settings.globalOverride })}
                  disabled={userRole !== 'admin'}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${settings.globalOverride ? 'bg-amber-glow' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${settings.globalOverride ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="pt-6">
                <button
                  onClick={saveSettings}
                  disabled={userRole !== 'admin'}
                  title={userRole !== 'admin' ? 'Only Admins can save settings' : ''}
                  className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all duration-300 border border-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
