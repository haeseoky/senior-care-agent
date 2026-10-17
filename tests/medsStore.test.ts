// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'senior_care_meds_v2';
const DATE_KEY = 'senior_care_med_date';

describe('medsStore & normalizeTime', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  describe('normalizeTime 시간 정규화', () => {
    it('다양한 한국어 시간 표현을 24시간제 HH:mm 형식으로 정규화한다', async () => {
      const { normalizeTime } = await import('../src/lib/medsStore');

      expect(normalizeTime('08:30')).toBe('08:30');
      expect(normalizeTime('8:5')).toBe('08:05');
      expect(normalizeTime('오전 08:30')).toBe('08:30');
      expect(normalizeTime('아침 8시 30분')).toBe('08:30');
      expect(normalizeTime('오전 12시')).toBe('00:00');
      expect(normalizeTime('오후 7시 30분')).toBe('19:30');
      expect(normalizeTime('저녁 7시')).toBe('19:00');
      expect(normalizeTime('밤 10시 15분')).toBe('22:15');
      expect(normalizeTime('오후 12시 30분')).toBe('12:30');
    });
  });

  describe('addMed / removeMed / toggleTaken', () => {
    it('기본 복약 목록으로 초기화되며 addMed로 새 약을 추가하고 정규화된 시간을 저장한다', async () => {
      const { medsStore } = await import('../src/lib/medsStore');

      const initial = medsStore.get();
      expect(initial).toHaveLength(3);

      const added = medsStore.addMed('혈압약', '오후 8시 30분', '1정');
      expect(added.name).toBe('혈압약');
      expect(added.time).toBe('20:30');
      expect(added.dosage).toBe('1정');
      expect(added.taken).toBe(false);

      const current = medsStore.get();
      expect(current).toHaveLength(4);
      expect(current[3]).toEqual(added);

      const persisted = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      expect(persisted).toHaveLength(4);
      expect(persisted[3].time).toBe('20:30');
    });

    it('removeMed로 특정 ID의 약을 스토어와 localStorage에서 삭제한다', async () => {
      const { medsStore } = await import('../src/lib/medsStore');

      const targetId = medsStore.get()[0].id;
      medsStore.removeMed(targetId);

      expect(medsStore.get().some(m => m.id === targetId)).toBe(false);
      expect(medsStore.get()).toHaveLength(2);

      const persisted = JSON.parse(localStorage.getItem(KEY) ?? '[]');
      expect(persisted).toHaveLength(2);
    });

    it('toggleTaken으로 복약 완료 상태를 토글하고 구독자에게 알린다', async () => {
      const { medsStore } = await import('../src/lib/medsStore');

      const listener = vi.fn();
      const unsubscribe = medsStore.subscribe(listener);
      expect(listener).toHaveBeenCalledTimes(1);

      const targetId = medsStore.get()[0].id;
      expect(medsStore.get()[0].taken).toBe(false);

      medsStore.toggleTaken(targetId);
      expect(medsStore.get()[0].taken).toBe(true);
      expect(listener).toHaveBeenCalledTimes(2);

      medsStore.toggleTaken(targetId);
      expect(medsStore.get()[0].taken).toBe(false);
      expect(listener).toHaveBeenCalledTimes(3);

      unsubscribe();
    });
  });

  describe('일일 taken 리셋 (checkDailyReset)', () => {
    it('저장된 날짜가 오늘과 다르면 모든 약의 taken 플래그를 false로 초기화한다', async () => {
      localStorage.setItem(
        KEY,
        JSON.stringify([
          { id: '1', name: '아침 약', time: '08:30', taken: true, dosage: '1포' },
          { id: '2', name: '저녁 약', time: '19:00', taken: true, dosage: '1포' },
        ]),
      );
      localStorage.setItem(DATE_KEY, JSON.stringify('Sun Jan 01 2023'));

      const { medsStore } = await import('../src/lib/medsStore');
      const meds = medsStore.get();

      expect(meds).toHaveLength(2);
      expect(meds.every(m => m.taken === false)).toBe(true);
      expect(JSON.parse(localStorage.getItem(DATE_KEY) ?? '""')).toBe(new Date().toDateString());
    });

    it('저장된 날짜가 오늘과 같으면 기존 taken=true 상태를 유지한다', async () => {
      const today = new Date().toDateString();
      localStorage.setItem(
        KEY,
        JSON.stringify([
          { id: '1', name: '아침 약', time: '08:30', taken: true, dosage: '1포' },
        ]),
      );
      localStorage.setItem(DATE_KEY, JSON.stringify(today));

      const { medsStore } = await import('../src/lib/medsStore');
      const meds = medsStore.get();

      expect(meds).toHaveLength(1);
      expect(meds[0].taken).toBe(true);
    });
  });
});
