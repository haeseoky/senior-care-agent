// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { safeGet, safeSet } from '../src/lib/storage';

describe('storage (safeGet / safeSet)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('정상 케이스: 객체, 배열, 원시값을 저장하고 그대로 복원한다', () => {
    const obj = { name: '홍길동', age: 78, active: true };
    safeSet('test_obj', obj);
    expect(safeGet('test_obj', { name: '', age: 0, active: false })).toEqual(obj);

    const arr = [1, 2, 3];
    safeSet('test_arr', arr);
    expect(safeGet<number[]>('test_arr', [])).toEqual(arr);

    safeSet('test_str', '안녕하세요');
    expect(safeGet('test_str', '기본값')).toBe('안녕하세요');
  });

  it('빈 값 케이스: 키가 없거나 빈 문자열일 때 fallback을 반환한다', () => {
    expect(safeGet('non_existent_key', 'default_val')).toBe('default_val');

    localStorage.setItem('empty_key', '');
    expect(safeGet('empty_key', { ok: false })).toEqual({ ok: false });
  });

  it('손상된 JSON 케이스: 파싱 실패 시 fallback을 반환하고 손상된 키를 삭제한다', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('corrupted_key', '{broken_json: true');

    const result = safeGet('corrupted_key', ['fallback']);
    expect(result).toEqual(['fallback']);
    expect(localStorage.getItem('corrupted_key')).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('safeSet 예외 처리: localStorage.setItem 에러 발생 시 앱이 크래시하지 않는다', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => safeSet('quota_key', { data: 'test' })).not.toThrow();
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});
