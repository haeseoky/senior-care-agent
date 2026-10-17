import { useState, useEffect, useRef } from 'react';
import { Volume2, CheckCircle, Clock } from 'lucide-react';
import { medsStore, type MedicationItem } from '../lib/medsStore';

/** 정시 복약 알림 - 스토어 구독 + 미응답 시 5분 간격 재알림 (최대 3회) */
export default function AlarmNotifier() {
  const [activeAlarm, setActiveAlarm] = useState<MedicationItem | null>(null);
  const retryCountRef = useRef(0);

  // 1. Web Screen Wake Lock - 화면 꺼짐/탭 전환 후 자동 재획득
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && navigator.wakeLock && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.log('Wake Lock Request Error:', err);
      }
    };
    requestWakeLock();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLock) wakeLock.release();
    };
  }, []);

  // 2. 정시 복약 감지 (1분 간격 체크)
  useEffect(() => {
    const firedKey = (id: string) => `alarm_fired_${id}_${new Date().toDateString()}`;
    const fired = new Set<string>(
      Object.keys(localStorage).filter(k => k.startsWith('alarm_fired_'))
    );
    // 하루가 지난 fired 키 정리
    const today = new Date().toDateString();
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('alarm_fired_') && !k.endsWith(today)) localStorage.removeItem(k);
    });

    const checkAlarm = () => {
      if (activeAlarm) return; // 이미 알림 표시 중
      const now = new Date();
      const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const target = medsStore.get().find(m => !m.taken && m.time === timeString && !fired.has(firedKey(m.id)));
      if (target) {
        fired.add(firedKey(target.id));
        retryCountRef.current = 0;
        setActiveAlarm(target);
        triggerVoiceAlarm(target.name);
      }
    };

    const interval = setInterval(checkAlarm, 15000);
    checkAlarm();
    return () => clearInterval(interval);
  }, [activeAlarm]);

  // 3. 미응답 재알림 - 5분 후 TTS 재생 (최대 3회)
  useEffect(() => {
    if (!activeAlarm) return;
    const timer = setTimeout(() => {
      if (retryCountRef.current < 3) {
        retryCountRef.current += 1;
        triggerVoiceAlarm(activeAlarm.name);
      }
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [activeAlarm, retryCountRef.current]);

  const triggerVoiceAlarm = (medName: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = `어르신! ${medName} 드실 시간입니다. 잊지 마시고 약을 꼭 챙겨 드십시오!`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.volume = 1.0;
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleDismissAndConfirm = () => {
    if (!activeAlarm) return;
    medsStore.setTaken(activeAlarm.id, true);
    setActiveAlarm(null);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('훌륭하십니다! 복약을 잊지 않고 완료하셨습니다.');
      utterance.lang = 'ko-KR';
      window.speechSynthesis.speak(utterance);
    }
  };

  /** 나중에 드시겠습니다 - 완료 처리는 하지 않고 알림만 닫기 (재알림 유지) */
  const handleSnooze = () => {
    setActiveAlarm(null);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  if (!activeAlarm) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.92)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="glass-card" style={{ maxWidth: '580px', width: '100%', padding: '40px', background: 'rgba(245, 158, 11, 0.2)', border: '4px solid #f59e0b', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        <div style={{ fontSize: '76px', animation: 'voiceWave 1.2s infinite' }}>💊</div>

        <div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#ffffff' }}>정시 복약 알림 시간입니다!</h2>
          <p style={{ fontSize: '1.4rem', color: '#fef3c7', marginTop: '8px' }}>
            <strong>{activeAlarm.name}</strong> ({activeAlarm.dosage})
          </p>
        </div>

        <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '20px', borderRadius: '20px', fontSize: '1.2rem', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Volume2 size={28} /> "어르신, 약 드실 시간입니다!"
        </div>

        <button
          onClick={handleDismissAndConfirm}
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#ffffff', fontSize: '1.5rem', fontWeight: 900, height: '76px', borderRadius: '38px', boxShadow: '0 12px 30px rgba(16, 185, 129, 0.4)' }}
        >
          <CheckCircle size={36} /> 약 복용했습니다 (완료)
        </button>

        <button
          onClick={handleSnooze}
          style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '1.1rem', height: '58px', borderRadius: '29px' }}
        >
          <Clock size={24} /> 조금 뒤에 드실게요
        </button>
      </div>
    </div>
  );
}
