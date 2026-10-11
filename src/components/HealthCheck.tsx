import { useState } from 'react';
import { HeartPulse, Activity } from 'lucide-react';

export interface HealthLog {
  date: string;
  mood: string;
  label: string;
}

export default function HealthCheck() {
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [history, setHistory] = useState<HealthLog[]>(() => {
    const saved = localStorage.getItem('senior_care_health');
    return saved ? JSON.parse(saved) : [
      { date: '어제', mood: '😀', label: '최고예요' },
      { date: '그저께', mood: '🙂', label: '보통이에요' }
    ];
  });

  const moods = [
    { emoji: '😀', label: '최고예요', msg: '어르신, 오늘도 활기차고 좋은 날이 될 것입니다!', color: '#10b981' },
    { emoji: '🙂', label: '보통이에요', msg: '평온한 하루입니다. 가벼운 스트레칭을 추천해 드립니다.', color: '#3b82f6' },
    { emoji: '🤒', label: '몸이 아파요', msg: '어르신, 어디가 아프신가요? 무리하지 마시고 편히 쉬십시오.', color: '#f59e0b' },
    { emoji: '😢', label: '외로워요', msg: '어르신, 언제든 저 효돌이가 함께 이야기해 드리겠습니다!', color: '#8b5cf6' }
  ];

  const handleSelectMood = (moodObj: typeof moods[0]) => {
    setSelectedMood(moodObj.label);
    const newEntry: HealthLog = {
      date: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      mood: moodObj.emoji,
      label: moodObj.label
    };
    const updated = [newEntry, ...history.slice(0, 4)];
    setHistory(updated);
    localStorage.setItem('senior_care_health', JSON.stringify(updated));

    // 음성 안내 발화
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(moodObj.msg);
      utterance.lang = 'ko-KR';
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '16px', color: '#10b981' }}>
          <Activity size={32} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff' }}>일일 건강 & 기분 케어</h2>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-sub)' }}>오늘 어르신의 컨디션은 어떠신가요?</p>
        </div>
      </div>

      {/* 4대 큼직한 기분 카드 선택버튼 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        {moods.map((m) => (
          <button
            key={m.label}
            onClick={() => handleSelectMood(m)}
            style={{
              height: '110px',
              borderRadius: '24px',
              background: selectedMood === m.label ? `${m.color}33` : 'rgba(30, 41, 59, 0.8)',
              border: selectedMood === m.label ? `3px solid ${m.color}` : '1px solid var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '12px'
            }}
          >
            <span style={{ fontSize: '42px' }}>{m.emoji}</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>{m.label}</span>
          </button>
        ))}
      </div>

      {/* 기록 히스토리 */}
      <div style={{ flex: 1, background: 'rgba(15, 23, 42, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <HeartPulse size={20} color="#10b981" /> 최근 상태 기록
        </div>
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
          {history.map((item, idx) => (
            <div key={idx} style={{ background: 'rgba(255,255,255,0.06)', padding: '12px 18px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '10px', minWidth: '140px' }}>
              <span style={{ fontSize: '28px' }}>{item.mood}</span>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>{item.label}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
