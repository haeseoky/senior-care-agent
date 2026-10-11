import { useState, useEffect } from 'react';
import { Volume2, CheckCircle } from 'lucide-react';
import type { MedicationItem } from './CareScheduler';

export default function AlarmNotifier() {
  const [activeAlarm, setActiveAlarm] = useState<MedicationItem | null>(null);

  // 1. Web Screen Wake Lock (24시간 화면 상시 켜짐 대기 방지 보장)
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.log('Wake Lock Request Error:', err);
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) wakeLock.release();
    };
  }, []);

  // 2. 1초 간격 정시 복약 감지 타이머
  useEffect(() => {
    const checkAlarm = () => {
      const now = new Date();
      const currentHours = now.getHours().toString().padStart(2, '0');
      const currentMinutes = now.getMinutes().toString().padStart(2, '0');
      const timeString = `${currentHours}:${currentMinutes}`;

      const savedMedsStr = localStorage.getItem('senior_care_meds');
      if (!savedMedsStr) return;

      const meds: MedicationItem[] = JSON.parse(savedMedsStr);
      // 아직 복약하지 않은 약 중 시/분이 일치하는 항목 검색
      const targetMed = meds.find(m => !m.taken && m.time.includes(timeString));

      if (targetMed && (!activeAlarm || activeAlarm.id !== targetMed.id)) {
        setActiveAlarm(targetMed);
        triggerVoiceAlarm(targetMed.name);
      }
    };

    const interval = setInterval(checkAlarm, 5000);
    return () => clearInterval(interval);
  }, [activeAlarm]);

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
    
    // 복약 상태 완료로 업데이트
    const savedMedsStr = localStorage.getItem('senior_care_meds');
    if (savedMedsStr) {
      const meds: MedicationItem[] = JSON.parse(savedMedsStr);
      const updated = meds.map(m => m.id === activeAlarm.id ? { ...m, taken: true } : m);
      localStorage.setItem('senior_care_meds', JSON.stringify(updated));
    }

    setActiveAlarm(null);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('훌륭하십니다! 복약을 잊지 않고 완료하셨습니다.');
      utterance.lang = 'ko-KR';
      window.speechSynthesis.speak(utterance);
    }
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
      </div>
    </div>
  );
}
