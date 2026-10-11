import { useState, useEffect } from 'react';
import { Pill, CheckCircle2, Clock, Plus } from 'lucide-react';

export interface MedicationItem {
  id: string;
  name: string;
  time: string;
  taken: boolean;
  dosage: string;
}

const DEFAULT_MEDS: MedicationItem[] = [
  { id: '1', name: '아침 약 (혈압약 & 식후약)', time: '오전 08:30', taken: false, dosage: '1포 (식후 30분)' },
  { id: '2', name: '점심 약 (당뇨약 & 관절약)', time: '오후 13:00', taken: false, dosage: '1알 (식후 30분)' },
  { id: '3', name: '저녁 약 (식후 종합약)', time: '오후 19:00', taken: false, dosage: '1포 (식후 30분)' },
];

export default function CareScheduler() {
  const [meds, setMeds] = useState<MedicationItem[]>(() => {
    const saved = localStorage.getItem('senior_care_meds');
    return saved ? JSON.parse(saved) : DEFAULT_MEDS;
  });

  const [newMedName, setNewMedName] = useState('');
  const [newMedTime, setNewMedTime] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('senior_care_meds', JSON.stringify(meds));
  }, [meds]);

  const toggleMedTaken = (id: string) => {
    setMeds(prev => prev.map(m => {
      if (m.id === id) {
        const nextState = !m.taken;
        // 복약 처리 시 음성 칭찬 안내
        if (nextState) {
          speakPraise(m.name);
        }
        return { ...m, taken: nextState };
      }
      return m;
    }));
  };

  const speakPraise = (medName: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text = `참 잘하셨습니다! ${medName} 복약을 완료하셨습니다.`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAddMed = () => {
    if (!newMedName) return;
    const item: MedicationItem = {
      id: Date.now().toString(),
      name: newMedName,
      time: newMedTime || '시간 미지정',
      taken: false,
      dosage: '1회 분량'
    };
    setMeds([...meds, item]);
    setNewMedName('');
    setNewMedTime('');
    setShowAddModal(false);
  };

  const completedCount = meds.filter(m => m.taken).length;
  const progressPercent = meds.length > 0 ? Math.round((completedCount / meds.length) * 100) : 0;

  return (
    <div className="glass-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      {/* 헤더 및 진행률 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '16px', color: '#f59e0b' }}>
            <Pill size={32} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff' }}>복약 및 건강 일정</h2>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-sub)' }}>오늘 챙겨드셔야 할 약입니다.</p>
          </div>
        </div>

        <button 
          onClick={() => setShowAddModal(!showAddModal)}
          style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', padding: '0 20px', height: '52px', borderRadius: '26px', fontSize: '1rem' }}
        >
          <Plus size={24} /> 약 추가하기
        </button>
      </div>

      {/* 달성률 바 */}
      <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px 20px', borderRadius: '20px', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 700 }}>
          <span>오늘의 복약 달성률</span>
          <span style={{ color: '#f59e0b' }}>{completedCount} / {meds.length}개 완료 ({progressPercent}%)</span>
        </div>
        <div style={{ width: '100%', height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '7px', overflow: 'hidden' }}>
          <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #10b981)', transition: 'width 0.5s ease' }}></div>
        </div>
      </div>

      {/* 복약 목록 */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}>
        {meds.map((med) => (
          <div 
            key={med.id}
            onClick={() => toggleMedTaken(med.id)}
            style={{
              padding: '20px 24px',
              borderRadius: '24px',
              background: med.taken ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 41, 59, 0.9)',
              border: med.taken ? '2px solid #10b981' : '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.25s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div style={{ color: med.taken ? '#10b981' : 'var(--text-muted)' }}>
                <CheckCircle2 size={38} />
              </div>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: med.taken ? '#9ae6b4' : '#ffffff', textDecoration: med.taken ? 'line-through' : 'none' }}>
                  {med.name}
                </div>
                <div style={{ fontSize: '1rem', color: 'var(--text-sub)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <Clock size={18} /> {med.time} • {med.dosage}
                </div>
              </div>
            </div>

            <button 
              style={{
                background: med.taken ? '#10b981' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#ffffff',
                fontSize: '1.2rem',
                fontWeight: 800,
                padding: '0 28px',
                height: '60px',
                borderRadius: '30px'
              }}
            >
              {med.taken ? '복약 완료됨' : '복약하기 (터치)'}
            </button>
          </div>
        ))}
      </div>

      {/* 약 추가 모달 */}
      {showAddModal && (
        <div style={{ background: 'rgba(15, 23, 42, 0.95)', padding: '24px', borderRadius: '24px', border: '2px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <h4 style={{ fontSize: '1.3rem', color: '#f59e0b' }}>신규 복약 일정 추가</h4>
          <input 
            type="text"
            placeholder="약 이름 (예: 저녁 당뇨약)"
            value={newMedName}
            onChange={e => setNewMedName(e.target.value)}
            style={{ padding: '16px', borderRadius: '14px', fontSize: '1.1rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
          />
          <input 
            type="text"
            placeholder="복약 시간 (예: 오후 07:00)"
            value={newMedTime}
            onChange={e => setNewMedTime(e.target.value)}
            style={{ padding: '16px', borderRadius: '14px', fontSize: '1.1rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
          />
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowAddModal(false)} style={{ background: '#475569', color: '#fff', height: '50px' }}>취소</button>
            <button onClick={handleAddMed} style={{ background: '#f59e0b', color: '#fff', height: '50px' }}>등록하기</button>
          </div>
        </div>
      )}

    </div>
  );
}
