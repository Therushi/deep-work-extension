// src/background/timer.ts
import type { Phase, SessionState, AppSettings } from "../shared/types.js";

export interface PhaseTransition {
  nextPhase: Phase;
  durationMinutes: number;
  nextCycleCount: number;
}

export function getNextPhase(
  currentPhase: Phase,
  cycleCount: number,
  config: AppSettings["pomodoro"],
): PhaseTransition {
  if (currentPhase === "work") {
    const completedCycles = cycleCount + 1;
    if (completedCycles % config.cyclesBeforeLongBreak === 0) {
      return {
        nextPhase: "longBreak",
        durationMinutes: config.longBreakMinutes,
        nextCycleCount: completedCycles,
      };
    }
    return {
      nextPhase: "shortBreak",
      durationMinutes: config.shortBreakMinutes,
      nextCycleCount: completedCycles,
    };
  }

  // shortBreak or longBreak → back to work
  return {
    nextPhase: "work",
    durationMinutes: config.workMinutes,
    nextCycleCount: cycleCount,
  };
}

export function getPhaseDuration(
  phase: Phase,
  config: AppSettings["pomodoro"],
): number {
  switch (phase) {
    case "work":
      return config.workMinutes;
    case "shortBreak":
      return config.shortBreakMinutes;
    case "longBreak":
      return config.longBreakMinutes;
    default:
      return 0;
  }
}

export function buildInitialWorkState(
  existing: SessionState,
  config: AppSettings["pomodoro"],
  taskLabel: string,
): SessionState {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const completedToday =
    existing.todayDate === today ? existing.completedToday : 0;

  return {
    phase: "work",
    cycleCount: 0,
    endTimestamp: now + config.workMinutes * 60 * 1000,
    taskLabel,
    todayDate: today,
    completedToday,
  };
}

export function getRemainingSeconds(endTimestamp: number): number {
  return Math.max(0, Math.ceil((endTimestamp - Date.now()) / 1000));
}
