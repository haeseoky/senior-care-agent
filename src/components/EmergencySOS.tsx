import { useState, useRef } from 'react';
import { ShieldAlert, PhoneCall, AlertTriangle, X } from 'lucide-react';

export default function EmergencySOS() {
  const [isHolding, setIsHolding] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [sosTriggered, setSosTriggered] = useState(false);
  const timerRef = useRef<any>(null);

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
    // 사이렌 및 비상 음성 안내
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = '긴급 상황입니다! 비상 사이렌을 발송하고 보호자와 119에 긴급 구조 신호를 전송합니다.';
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <>
      {/* 메인 SOS 대형 비상 카드의 버튼 */}
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'rgba(244, 63, 94, 0.15)', border: '2px solid #f43f5e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f43f5e' }}>
          <ShieldAlert size={36} />
          <h3 style={{ fontSize: '1.5rem', fontWeight: 900 }}>비상 SOS 긴급 구조</h3>
        </div>

        <p style={{ fontSize: '1rem', color: '#fecdd3', textAlign: 'center' }}>
          몸이 몹시 아프시거나 도움이 필요할 때<br/>
          <strong>3초간 길게 꾹 누르고 계세요!</strong>
        </p>

        {/* 3초 지속 터치 긴급 SOS 버튼 */}
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
          {/* 누르는 게이지 프로그레스 바 */}
          {isHolding && (
            <div 
              style={{ 
                position: 'absolute', 
                left: 0, 
                top: 0, 
                bottom: 0, 
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

      {/* SOS 발동 팝업 모달 */}
      {sosTriggered && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="glass-card" style={{ maxWidth: '640px', width: '100%', padding: '40px', background: 'rgba(153, 27, 27, 0.9)', border: '4px solid #ef4444', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ fontSize: '80px', animation: 'voiceWave 1s infinite' }}>🚨</div>
            
            <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff' }}>비상 긴급 알림 발송됨!</h2>
            <p style={{ fontSize: '1.3rem', color: '#fecdd3' }}>
              등록된 보호자(아들/딸) 및 119로 위치와 함께 비상 구조 신호를 전달 중입니다.
            </p>

            {/* 비상 연락망 연결 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <button style={{ background: '#ffffff', color: '#991b1b', fontSize: '1.4rem', fontWeight: 900, height: '70px', borderRadius: '35px' }}>
                <PhoneCall size={32} /> 119 구급대 바로 전화걸기
              </button>
              <button style={{ background: 'rgba(255,255,255,0.2)', color: '#ffffff', fontSize: '1.3rem', height: '64px', borderRadius: '32px' }}>
                <PhoneCall size={28} /> 보호자 (아들) 바로 전화걸기
              </button>
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
    </>
  );
}
