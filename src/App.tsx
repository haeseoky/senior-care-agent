import { useState, useEffect } from 'react';
import { Heart, Wifi, Sun, Cloud, CloudRain, Maximize, MessageSquare, Pill, Activity } from 'lucide-react';
import InteractiveAvatar from './components/InteractiveAvatar';
import CareScheduler from './components/CareScheduler';
import HealthCheck from './components/HealthCheck';
import EmergencySOS from './components/EmergencySOS';
import AlarmNotifier from './components/AlarmNotifier';

/** 초 단위 시계 - App 전체 재렌더 방지를 위해 격리 */
function Clock() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDate(now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f59e0b', letterSpacing: '0.5px', lineHeight: 1 }}>{time}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>{date}</div>
    </div>
  );
}

/** 실제 날씨 (Open-Meteo 무료 API, 키 불필요 - 기기 위치 기반) */
function WeatherBadge() {
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const pos: GeolocationPosition = await new Promise((res, rej) => {
          if (!navigator.geolocation) return rej(new Error('no-geo'));
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 });
        });
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,weather_code`
        );
        const data = await res.json();
        if (!cancelled && data?.current) {
          setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code });
        }
      } catch {
        // 위치/네트워크 실패 시 날씨 표시 생략 (가짜 데이터 표시 금지)
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (!weather) return null;
  const rain = weather.code >= 51;
  return (
    <div className="mobile-hide" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(245, 158, 11, 0.15)', padding: '6px 14px', borderRadius: '18px', color: '#f59e0b', fontSize: '0.95rem', fontWeight: 700 }}>
      {rain ? <CloudRain size={20} /> : weather.code === 0 ? <Sun size={20} /> : <Cloud size={20} />}
      {weather.temp}°C
    </div>
  );
}

export default function App() {
  const [mobileTab, setMobileTab] = useState<'all' | 'chat' | 'meds' | 'health'>('all');

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => console.log(e));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const tabs: { key: typeof mobileTab; icon: React.ReactNode; label: string }[] = [
    { key: 'all', icon: null, label: '전체보기' },
    { key: 'chat', icon: <MessageSquare size={18} />, label: '말벗' },
    { key: 'meds', icon: <Pill size={18} />, label: '복약' },
    { key: 'health', icon: <Activity size={18} />, label: '건강' },
  ];

  return (
    <div className="app-container" style={{ padding: '16px', height: '100vh', display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* 정시 복약 자동 알림 & WakeLock */}
      <AlarmNotifier />

      {/* 헤더 */}
      <header className="glass-card header-card" style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', padding: '10px', borderRadius: '16px', display: 'flex' }}>
            <Heart size={28} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)', lineHeight: 1.1 }}>효돌이 AI</h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>어르신 스마트 돌봄 에이전트</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <WeatherBadge />
          <Clock />
        </div>

        <div className="mobile-hide" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '6px 14px', borderRadius: '18px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Wifi size={16} /> 24H 상시 대기중
          </div>
          <button onClick={toggleFullScreen} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', padding: '0 12px', height: '40px', borderRadius: '20px', fontSize: '0.85rem' }}>
            <Maximize size={18} />
          </button>
        </div>
      </header>

      {/* 모바일 탭 */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setMobileTab(t.key)}
            style={{
              flex: 1, minHeight: '46px', borderRadius: '16px', fontSize: '0.95rem',
              background: mobileTab === t.key ? 'var(--primary)' : 'rgba(30, 41, 59, 0.7)',
              color: '#fff'
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* 메인 */}
      <main className="main-grid" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '14px', height: 'calc(100% - 130px)', overflow: 'hidden' }}>

        {(mobileTab === 'all' || mobileTab === 'chat') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
            <div style={{ flex: 1 }}>
              <InteractiveAvatar />
            </div>
            <EmergencySOS />
          </div>
        )}

        {mobileTab === 'all' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: 1.2, overflow: 'hidden' }}>
              <CareScheduler />
            </div>
            <div style={{ flex: 0.9, overflow: 'hidden' }}>
              <HealthCheck />
            </div>
          </div>
        )}

        {mobileTab === 'meds' && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <CareScheduler />
          </div>
        )}

        {mobileTab === 'health' && (
          <div style={{ height: '100%', overflow: 'auto' }}>
            <HealthCheck />
          </div>
        )}

      </main>

    </div>
  );
}
