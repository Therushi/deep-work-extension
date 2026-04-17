// src/shared/constants.ts
import type { AppSettings, SessionState } from "./types.js";

export const DEFAULT_SETTINGS: AppSettings = {
  activeProfileId: "default",
  profiles: [
    {
      id: "default",
      name: "Work",
      sites: [
        "twitter.com",
        "x.com",
        "reddit.com",
        "instagram.com",
        "facebook.com",
        "youtube.com",
        "tiktok.com",
      ],
      whitelistMode: false,
    },
  ],
  pomodoro: {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
    autoStartNext: false,
  },
  notifications: true,
  emergencyUnlockPhrase: "I choose to break focus",
  schedule: null,
};

export const DEFAULT_SESSION_STATE: SessionState = {
  phase: "idle",
  cycleCount: 0,
  endTimestamp: 0,
  taskLabel: "",
  todayDate: "",
  completedToday: 0,
};

export const ALARM_PHASE_END = "phase-end";
export const ALARM_SCHEDULE_PREFIX = "schedule-";

export const STORAGE_KEYS = {
  SETTINGS: "settings",
  SESSION: "session",
  STATS: "stats",
} as const;
