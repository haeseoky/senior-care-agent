import { useState, useRef, useEffect } from 'react';
import { ShieldAlert, PhoneCall, AlertTriangle, X, Settings } from 'lucide-react';
import { safeGet, safeSet } from '../lib/storage';

const CONTACT_KEY = 'senior_care_emergency_contact';

/** 비상 SOS - 실제 전화 연결(tel:) + 보호자 연락처 설정 */
export default function EmergencySOS({ onTriggerSOS }: { onTriggerSOS?: () => void }) {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [sosTriggered, setSosTriggered] = useState(false);
  const [showContactSetting, setShowContactSetting] = useState(false);
  const [guardianPhone, setGuardianPhone] = useState<string>(() => safeGet<string>(CONTACT_KEY, ''));
  const timerRef = useRef<any>(null);

  useEffect(() => {
    safeSet(CONTACT_KEY, guardianPhone);
  }, [guardianPhone]);

  const startHold = () => {
    setIsHolding(true);
    let progress = 0;
    timerRef.current = setInterval(() => {
      progress += 10;
      setHoldProgress(progress);
      if (progress >= 100) {
        clearInterval(timerRef.current);
        triggerSOS();
      }
    }, 150);
  };

  const endHold = () => {
    setIsHolding(false);
    setHoldProgress(0);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const triggerSOS = () => {
    setSosTriggered(true);
    if (onTriggerSOS) onTriggerSOS();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('긴급 상황입니다! 화면의 버튼을 눌러 119 또는 보호자에게 바로 연락하십시오.');
      utterance.lang = 'ko-KR';
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <>
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'rgba(244, 63, 94, 0.15)', border: '2px solid #f43f5e', position: 'relative' }}>
        <button
          onClick={() => setShowContactSetting(true)}
          style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', padding: 0, width: '44px', height: '44px', borderRadius: '22px', minHeight: 'auto' }}
          title="보호자 연락처 설정"
        >
          <Settings size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f43f5e' }}>
          <ShieldAlert size={36} />
          <h3 style={{ fontSize: '1.5rem', fontWeight: 900 }}>비상 SOS 긴급 구조</h3>
        </div>

        <p style={{ fontSize: '1rem', color: '#fecdd3', textAlign: 'center' }}>
          몸이 몹시 아프시거나 도움이 필요할 때<br/>
          <strong>3초간 길게 꾹 누르고 계세요!</strong>
        </p>

        <button
          onMouseDown={startHold}
          onMouseUp={endHold}
          onMouseLeave={endHold}
          onTouchStart={startHold}
          onTouchEnd={endHold}
          style={{
            width: '100%',
            height: '76px',
            borderRadius: '38px',
            background: isHolding ? 'linear-gradient(135deg, #b91c1c, #7f1d1d)' : 'linear-gradient(135deg, #f43f5e, #e11d48)',
            color: '#ffffff',
            fontSize: '1.4rem',
            fontWeight: 900,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 10px 30px rgba(244, 63, 94, 0.5)'
          }}
        >
          {isHolding && (
            <div
              style={{
                position: 'absolute',
                left: 0, top: 0, bottom: 0,
                width: `${holdProgress}%`,
                background: 'rgba(255, 255, 255, 0.35)',
                transition: 'width 0.15s linear'
              }}
            />
          )}
          <span style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={32} />
            {isHolding ? `누르고 계세요... (${Math.round((100 - holdProgress) / 33)}초)` : '🚨 긴급 SOS 발송하기 (3초 터치)'}
          </span>
        </button>
      </div>

      {/* SOS 발동 팝업 모달 - 실제 전화 연결 */}
      {sosTriggered && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="glass-card" style={{ maxWidth: '640px', width: '100%', padding: '40px', background: 'rgba(153, 27, 27, 0.9)', border: '4px solid #ef4444', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ fontSize: '80px', animation: 'voiceWave 1s infinite' }}>🚨</div>

            <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff' }}>비상 긴급 알림!</h2>
            <p style={{ fontSize: '1.3rem', color: '#fecdd3' }}>
              아래 버튼을 눌러 바로 전화를 거세요.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <a
                href="tel:119"
                style={{ background: '#ffffff', color: '#991b1b', fontSize: '1.4rem', fontWeight: 900, height: '70px', borderRadius: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', textDecoration: 'none' }}
              >
                <PhoneCall size={32} /> 119 구급대 바로 전화걸기
              </a>
              {guardianPhone ? (
                <a
                  href={`tel:${guardianPhone}`}
                  style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff', fontSize: '1.3rem', height: '64px', borderRadius: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', textDecoration: 'none' }}
                >
                  <PhoneCall size={28} /> 보호자 ({guardianPhone}) 전화걸기
                </a>
              ) : (
                <button onClick={() => { setSosTriggered(false); setShowContactSetting(true); }} style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff', fontSize: '1.3rem', height: '64px', borderRadius: '32px' }}>
                  <Settings size={24} /> 보호자 연락처 먼저 설정하기
                </button>
              )}
            </div>

            <button
              onClick={() => setSosTriggered(false)}
              style={{ background: 'transparent', border: '2px solid rgba(255,255,255,0.4)', color: '#fff', fontSize: '1.1rem', height: '54px', borderRadius: '27px', marginTop: '10px' }}
            >
              <X size={24} /> 잘못 눌렀습니다 (상황 해제)
            </button>
          </div>
        </div>
      )}

      {/* 보호자 연락처 설정 모달 */}
      {showContactSetting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.9)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="glass-card" style={{ maxWidth: '460px', width: '100%', padding: '28px', background: '#0f172a', border: '2px solid #f43f5e', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>보호자 연락처 설정</h3>
              <button onClick={() => setShowContactSetting(false)} style={{ background: 'transparent', color: '#cbd5e1', padding: 0, minHeight: 'auto' }}><X size={24} /></button>
            </div>
            <input
              type="tel"
              inputMode="tel"
              placeholder="보호자 전화번호 (예: 010-1234-5678)"
              value={guardianPhone}
              onChange={e => setGuardianPhone(e.target.value)}
              style={{ padding: '16px', borderRadius: '14px', fontSize: '1.1rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>이 번호는 이 기기에만 저장됩니다. SOS 시 전화 버튼이 활성화됩니다.</p>
            <button onClick={() => setShowContactSetting(false)} style={{ background: '#f43f5e', color: '#fff', height: '54px' }}>저장</button>
          </div>
        </div>
      )}
    </>
  );
}
