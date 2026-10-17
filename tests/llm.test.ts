// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { localFallback } from '../src/lib/llm';

describe('llm - localFallback 순수함수 분기 테스트', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('add_med 분기', () => {
    it('아침/점심/저녁 및 약 종류 키워드를 추출하여 add_med 의도를 반환한다', () => {
      const morningBp = localFallback('아침 혈압약 등록해줘', '김철수');
      expect(morningBp.intent).toEqual({
        action: 'add_med',
        speaker: 'senior',
        medication: { name: '혈압약', time: '08:00' },
      });

      const lunchDiabetes = localFallback('점심 당뇨약 추가해줘', '김철수');
      expect(lunchDiabetes.intent).toEqual({
        action: 'add_med',
        speaker: 'senior',
        medication: { name: '당뇨약', time: '12:30' },
      });

      const eveningJoint = localFallback('오후 8시 관절약 챙겨줘', '김철수');
      expect(eveningJoint.intent).toEqual({
        action: 'add_med',
        speaker: 'senior',
        medication: { name: '관절약', time: '20:00' },
      });

      const supplement = localFallback('영양제 약 설정해줘', '김철수');
      expect(supplement.intent).toEqual({
        action: 'add_med',
        speaker: 'senior',
        medication: { name: '영양제', time: '19:00' },
      });
    });
  });

  describe('sos_check 분기', () => {
    it('통증/어지러움/비상 키워드 감지 시 sos_check 의도를 반환한다', () => {
      expect(localFallback('머리가 너무 어지러워', '김철수').intent).toEqual({
        action: 'sos_check',
        speaker: 'senior',
      });
      expect(localFallback('가슴이 아파요', '김철수').intent).toEqual({
        action: 'sos_check',
        speaker: 'senior',
      });
      expect(localFallback('비상 구급 상황이야', '김철수').intent).toEqual({
        action: 'sos_check',
        speaker: 'senior',
      });
    });
  });

  describe('confirm_med 분기', () => {
    it('복약 완료 표현 감지 시 confirm_med 의도를 반환한다', () => {
      expect(localFallback('아침 약 먹었어', '김철수').intent).toEqual({
        action: 'confirm_med',
        speaker: 'senior',
      });
      expect(localFallback('방금 복약 했어요', '김철수').intent).toEqual({
        action: 'confirm_med',
        speaker: 'senior',
      });
      expect(localFallback('약 다 먹었어', '김철수').intent).toEqual({
        action: 'confirm_med',
        speaker: 'senior',
      });
    });
  });

  describe('chat 분기', () => {
    it('인사, 시각 질문, 일반 발화에 대해 chat 의도와 적절한 존댓말 응답을 반환한다', () => {
      const greet = localFallback('효돌아 안녕!', '김철수');
      expect(greet.intent).toEqual({ action: 'chat', speaker: 'senior' });
      expect(greet.reply).toContain('김철수 어르신');
      expect(greet.reply).toContain('안녕하십니까');

      const timeAsk = localFallback('지금 몇 시야?', '김철수');
      expect(timeAsk.intent).toEqual({ action: 'chat', speaker: 'senior' });
      expect(timeAsk.reply).toMatch(/현재 시각은 \d{1,2}시 \d{1,2}분입니다\./);

      const general = localFallback('오늘 날씨가 참 좋구나', '김철수');
      expect(general.intent).toEqual({ action: 'chat', speaker: 'senior' });
      expect(general.reply).toContain('김철수 어르신');
      expect(general.reply).toContain('늘 곁에서 들어드리겠습니다');
    });
  });
});
