export const storage = {
  get: <T>(key: string): T | null => {
    try {
      const local = localStorage.getItem(key);
      return local ? JSON.parse(local) as T : null;
    } catch {
      return null;
    }
  },
  set: (key: string, value: unknown): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 저장공간 초과·프라이빗 브라우징 등 — 로컬 캐시 실패는 무시(치명적이지 않음)
    }
  },
  remove: (key: string): void => {
    localStorage.removeItem(key);
  },
};
