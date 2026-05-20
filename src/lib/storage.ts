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
    } catch {}
  },
  remove: (key: string): void => {
    localStorage.removeItem(key);
  },
};
