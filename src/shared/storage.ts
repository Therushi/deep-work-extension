// src/shared/storage.ts
import type { AppSettings, SessionState, DailyStats } from "./types.js";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SESSION_STATE,
  STORAGE_KEYS,
} from "./constants.js";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const storage = {
  async getSettings(): Promise<AppSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return result[STORAGE_KEYS.SETTINGS] ?? DEFAULT_SETTINGS;
  },

  async setSettings(settings: AppSettings): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  },

  async getSession(): Promise<SessionState> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION);
    return result[STORAGE_KEYS.SESSION] ?? DEFAULT_SESSION_STATE;
  },

  async setSession(session: SessionState): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: session });
  },

  async getStats(): Promise<DailyStats[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.STATS);
    return result[STORAGE_KEYS.STATS] ?? [];
  },

  async recordCompletedPomodoro(focusMinutes: number): Promise<void> {
    const today = todayKey();
    const stats = await storage.getStats();
    const idx = stats.findIndex((s) => s.date === today);

    if (idx >= 0) {
      stats[idx].completedPomodoros += 1;
      stats[idx].totalFocusMinutes += focusMinutes;
    } else {
      stats.push({
        date: today,
        completedPomodoros: 1,
        totalFocusMinutes: focusMinutes,
      });
    }

    // Keep only last 30 days
    const trimmed = stats.slice(-30);
    await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: trimmed });
  },

  async getTodayStats(): Promise<DailyStats> {
    const today = todayKey();
    const stats = await storage.getStats();
    return (
      stats.find((s) => s.date === today) ?? {
        date: today,
        completedPomodoros: 0,
        totalFocusMinutes: 0,
      }
    );
  },
};
