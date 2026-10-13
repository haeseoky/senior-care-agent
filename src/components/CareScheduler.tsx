import { useState, useEffect } from 'react';
import { Pill, CheckCircle2, Clock, Plus, Trash2, X } from 'lucide-react';
import { medsStore, type MedicationItem } from '../lib/medsStore';

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function CareScheduler() {
  const [meds, setMeds] = useState<MedicationItem[]>(() => medsStore.get());

  useEffect(() => medsStore.subscribe(setMeds), []);

  const [newMedName, setNewMedName] = useState('');
  const [newMedTime, setNewMedTime] = useState('08:00');
  const [showAddModal, setShowAddModal] = useState(false);

  const toggleMedTaken = (id: string) => {
    const med = meds.find(m => m.id === id);
    medsStore.toggleTaken(id);
    if (med && !med.taken) {
      speakPraise(med.name);
    }
  };

  const speakPraise = (medName: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`참 잘하셨습니다! ${medName} 복약을 완료하셨습니다.`);
      utterance.lang = 'ko-KR';
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAddMed = () => {
    if (!newMedName.trim()) return;
    medsStore.addMed(newMedName.trim(), newMedTime);
    setNewMedName('');
    setShowAddModal(false);
  };

  const handleRemoveMed = (id: string, name: string) => {
    if (window.confirm(`[${name}] 복약 일정을 삭제하시겠습니까?`)) {
      medsStore.removeMed(id);
    }
  };

  const completedCount = meds.filter(m => m.taken).length;
  const progressPercent = meds.length > 0 ? Math.round((completedCount / meds.length) * 100) : 0;

  return (
    <div className="glass-card" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
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

      <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px 20px', borderRadius: '20px', border: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '1.1rem', fontWeight: 700 }}>
          <span>오늘의 복약 달성률</span>
          <span style={{ color: '#f59e0b' }}>{completedCount} / {meds.length}개 완료 ({progressPercent}%)</span>
        </div>
        <div style={{ width: '100%', height: '14px', background: 'rgba(255,255,255,0.1)', borderRadius: '7px', overflow: 'hidden' }}>
          <div style={{ width: `${progressPercent}%`, height: '100%', background: 'linear-gradient(90deg, #f59e0b, #10b981)', transition: 'width 0.5s ease' }}></div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }}>
        {meds.map((med) => (
          <div
            key={med.id}
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
                  <Clock size={18} /> {fmtTime(med.time)} • {med.dosage}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveMed(med.id, med.name); }}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)', color: '#f87171',
                  width: '56px', height: '60px', borderRadius: '30px', padding: 0
                }}
                title="복약 일정 삭제"
              >
                <Trash2 size={24} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleMedTaken(med.id); }}
                style={{
                  background: med.taken ? '#10b981' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#ffffff', fontSize: '1.2rem', fontWeight: 800,
                  padding: '0 28px', height: '60px', borderRadius: '30px'
                }}
              >
                {med.taken ? '복약 완료됨' : '복약하기 (터치)'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.9)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: '#0f172a', padding: '24px', borderRadius: '24px', border: '2px solid #f59e0b', display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '460px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '1.3rem', color: '#f59e0b' }}>신규 복약 일정 추가</h4>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', color: '#cbd5e1', padding: 0, minHeight: 'auto' }}><X size={24} /></button>
            </div>
            <input
              type="text"
              placeholder="약 이름 (예: 저녁 당뇨약)"
              value={newMedName}
              onChange={e => setNewMedName(e.target.value)}
              style={{ padding: '16px', borderRadius: '14px', fontSize: '1.1rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
            />
            <label style={{ fontSize: '0.95rem', color: 'var(--text-sub)' }}>복약 시간</label>
            <input
              type="time"
              value={newMedTime}
              onChange={e => setNewMedTime(e.target.value)}
              style={{ padding: '16px', borderRadius: '14px', fontSize: '1.1rem', background: '#1e293b', border: '1px solid #475569', color: '#fff' }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddModal(false)} style={{ background: '#475569', color: '#fff', height: '50px' }}>취소</button>
              <button onClick={handleAddMed} style={{ background: '#f59e0b', color: '#fff', height: '50px' }}>등록하기</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
