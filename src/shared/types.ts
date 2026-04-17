// src/shared/types.ts

export type Phase = "idle" | "work" | "shortBreak" | "longBreak";

export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface BlockProfile {
  id: string;
  name: string;
  sites: string[];
  whitelistMode: boolean; // false = block listed; true = block everything except listed
}

export interface PomodoroConfig {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartNext: boolean;
}

export interface ScheduleConfig {
  days: Day[];
  startTime: string; // 'HH:MM' 24h
}

export interface AppSettings {
  activeProfileId: string;
  profiles: BlockProfile[];
  pomodoro: PomodoroConfig;
  notifications: boolean;
  emergencyUnlockPhrase: string;
  schedule: ScheduleConfig | null;
}

export interface SessionState {
  phase: Phase;
  cycleCount: number;
  endTimestamp: number; // epoch ms
  taskLabel: string;
  todayDate: string; // 'YYYY-MM-DD'
  completedToday: number;
}

export interface DailyStats {
  date: string;
  completedPomodoros: number;
  totalFocusMinutes: number;
}

// Messages between popup/blocked page and service worker
export type MessageType =
  | "START"
  | "STOP"
  | "SKIP"
  | "EMERGENCY_UNLOCK"
  | "GET_STATE"
  | "STATE_UPDATE";

export interface ExtMessage {
  type: MessageType;
  payload?: unknown;
}

export interface StateUpdatePayload {
  state: SessionState;
  settings: AppSettings;
}
