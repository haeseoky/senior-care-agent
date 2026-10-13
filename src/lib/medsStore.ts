// 복약 데이터 단일 스토어 - 모든 컴포넌트가 이 스토어만 바라봄
// localStorage는 영속화 계층으로만 사용 (직접 접근 금지)
import { safeGet, safeSet } from './storage';

export interface MedicationItem {
  id: string;
  name: string;
  /** 24시간제 HH:mm (예: "08:30") */
  time: string;
  taken: boolean;
  dosage: string;
}

const KEY = 'senior_care_meds_v2';
const DATE_KEY = 'senior_care_med_date';

const DEFAULT_MEDS: MedicationItem[] = [
  { id: '1', name: '아침 약 (혈압약 & 식후약)', time: '08:30', taken: false, dosage: '1포 (식후 30분)' },
  { id: '2', name: '점심 약 (당뇨약 & 관절약)', time: '13:00', taken: false, dosage: '1알 (식후 30분)' },
  { id: '3', name: '저녁 약 (식후 종합약)', time: '19:00', taken: false, dosage: '1포 (식후 30분)' },
];

type Listener = (meds: MedicationItem[]) => void;
const listeners = new Set<Listener>();

function normalizeTime(t: string): string {
  // "오전 08:30", "오후 7시 30분" 등 → "HH:mm" 24시간제
  const m = t.match(/(\d{1,2})\s*[:시]?\s*(\d{1,2})?\s*분?/);
  if (!m) return t.replace(/[^0-9:]/g, '');
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (/오후|저녁|밤/.test(t) && h < 12) h += 12;
  if (/오전|아침/.test(t) && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function migrate(raw: unknown): MedicationItem[] {
  // 구버전("오전 08:30") → 신버전("08:30") 마이그레이션
  if (!Array.isArray(raw)) return DEFAULT_MEDS;
  return raw.map((m: any) => ({
    id: String(m.id ?? Date.now() + Math.random()),
    name: String(m.name ?? '이름 없는 약'),
    time: normalizeTime(String(m.time ?? '')),
    taken: Boolean(m.taken ?? false),
    dosage: String(m.dosage ?? '1회 분량'),
  }));
}

let state: MedicationItem[] = migrate(safeGet<unknown>(KEY, DEFAULT_MEDS));

// 하루가 지나면 복약 완료 플래그 초기화 (매일 알림 보장)
function checkDailyReset() {
  const today = new Date().toDateString();
  const saved = safeGet<string>(DATE_KEY, '');
  if (saved !== today) {
    state = state.map(m => ({ ...m, taken: false }));
    safeSet(DATE_KEY, today);
    safeSet(KEY, state);
  }
}
checkDailyReset();

function commit(next: MedicationItem[]) {
  state = next;
  safeSet(KEY, state);
  listeners.forEach(l => l(state));
}

export const medsStore = {
  get(): MedicationItem[] {
    return state;
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  },
  addMed(name: string, time: string, dosage = '1회 분량'): MedicationItem {
    const item: MedicationItem = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      name, time: normalizeTime(time), taken: false, dosage,
    };
    commit([...state, item]);
    return item;
  },
  removeMed(id: string) {
    commit(state.filter(m => m.id !== id));
  },
  toggleTaken(id: string) {
    commit(state.map(m => m.id === id ? { ...m, taken: !m.taken } : m));
  },
  setTaken(id: string, taken: boolean) {
    commit(state.map(m => m.id === id ? { ...m, taken } : m));
  },
};

export { normalizeTime };
