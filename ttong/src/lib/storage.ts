/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Simple wrapper for window.storage API as requested
export const storage = {
  get: <T>(key: string): T | null => {
    try {
      const val = (window as unknown as { storage: { get: (k: string) => string } }).storage?.get?.(key);
      if (val) return JSON.parse(val) as T;
      
      const local = localStorage.getItem(key);
      return local ? JSON.parse(local) as T : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },
  set: (key: string, value: unknown): void => {
    const stringified = JSON.stringify(value);
    try {
      (window as unknown as { storage: { set: (k: string, v: string) => void } }).storage?.set?.(key, stringified);
    } catch (e) {
      console.warn('Window storage set error:', e);
    }
    localStorage.setItem(key, stringified);
  },
  remove: (key: string): void => {
    try {
      (window as unknown as { storage: { remove: (k: string) => void } }).storage?.remove?.(key);
    } catch (e) {
      console.warn('Window storage remove error:', e);
    }
    localStorage.removeItem(key);
  },
  clear: (): void => {
    try {
      localStorage.clear();
    } catch (e) {
      console.error('Storage clear error:', e);
    }
  }
};
