// 안전한 localStorage 접근 - 손상된 JSON으로 앱 크래시 방지
export function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[storage] 손상된 데이터 감지: ${key} → 기본값 복원`);
    try { localStorage.removeItem(key); } catch {}
    return fallback;
  }
}

export function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[storage] 저장 실패: ${key}`, e);
  }
}
