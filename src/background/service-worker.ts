// src/background/service-worker.ts
import { storage } from "../shared/storage.js";
import {
  DEFAULT_SESSION_STATE,
  ALARM_PHASE_END,
  ALARM_SCHEDULE_PREFIX,
} from "../shared/constants.js";
import type { ExtMessage, SessionState } from "../shared/types.js";
import { getNextPhase, buildInitialWorkState } from "./timer.js";
import { applyRules, removeAll } from "./blocker.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function broadcastState(): Promise<void> {
  const [state, settings] = await Promise.all([
    storage.getSession(),
    storage.getSettings(),
  ]);
  chrome.runtime
    .sendMessage({ type: "STATE_UPDATE", payload: { state, settings } })
    .catch(() => {
      // Popup may be closed — ignore
    });
}

function phaseLabel(phase: SessionState["phase"]): string {
  switch (phase) {
    case "work":
      return "Work session started";
    case "shortBreak":
      return "Short break — take a breather";
    case "longBreak":
      return "Long break — well earned!";
    default:
      return "";
  }
}

async function notify(title: string, message: string): Promise<void> {
  const settings = await storage.getSettings();
  if (!settings.notifications) return;
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    title,
    message,
  });
}

// ─── Phase lifecycle ─────────────────────────────────────────────────────────

async function startPhase(
  phase: SessionState["phase"],
  durationMinutes: number,
  cycleCount: number,
): Promise<void> {
  const settings = await storage.getSettings();
  const now = Date.now();

  const session = await storage.getSession();
  const today = new Date().toISOString().slice(0, 10);

  const updatedSession: SessionState = {
    ...session,
    phase,
    cycleCount,
    endTimestamp: now + durationMinutes * 60 * 1000,
    todayDate: today,
  };

  await storage.setSession(updatedSession);

  // Manage blocking rules
  if (phase === "work") {
    const activeProfile =
      settings.profiles.find((p) => p.id === settings.activeProfileId) ??
      settings.profiles[0];
    if (activeProfile) {
      await applyRules(activeProfile.sites, activeProfile.whitelistMode);
    }
  } else {
    // Break — unblock all sites
    await removeAll();
  }

  // Set alarm for phase end
  await chrome.alarms.clear(ALARM_PHASE_END);
  chrome.alarms.create(ALARM_PHASE_END, { delayInMinutes: durationMinutes });

  await notify("Deep Work", phaseLabel(phase));
  await broadcastState();
}

async function onPhaseEnd(): Promise<void> {
  const [session, settings] = await Promise.all([
    storage.getSession(),
    storage.getSettings(),
  ]);

  if (session.phase === "work") {
    // Record completed pomodoro
    await storage.recordCompletedPomodoro(settings.pomodoro.workMinutes);
    const updatedSession = await storage.getSession();
    updatedSession.completedToday += 1;
    await storage.setSession(updatedSession);
  }

  const transition = getNextPhase(
    session.phase,
    session.cycleCount,
    settings.pomodoro,
  );

  if (settings.pomodoro.autoStartNext) {
    await startPhase(
      transition.nextPhase,
      transition.durationMinutes,
      transition.nextCycleCount,
    );
  } else {
    // Stay in idle-like state waiting for user to advance
    const updatedSession = await storage.getSession();
    updatedSession.phase = "idle";
    updatedSession.endTimestamp = 0;
    await storage.setSession(updatedSession);
    await removeAll();
    await notify(
      "Deep Work",
      `${session.phase === "work" ? "Work session complete" : "Break over"} — ready when you are.`,
    );
    await broadcastState();
  }
}

// ─── Message handlers ────────────────────────────────────────────────────────

async function handleStart(taskLabel: string): Promise<void> {
  const [settings, existingSession] = await Promise.all([
    storage.getSettings(),
    storage.getSession(),
  ]);
  const initialState = buildInitialWorkState(
    existingSession,
    settings.pomodoro,
    taskLabel,
  );
  await storage.setSession(initialState);

  const activeProfile =
    settings.profiles.find((p) => p.id === settings.activeProfileId) ??
    settings.profiles[0];
  if (activeProfile) {
    await applyRules(activeProfile.sites, activeProfile.whitelistMode);
  }

  await chrome.alarms.clear(ALARM_PHASE_END);
  chrome.alarms.create(ALARM_PHASE_END, {
    delayInMinutes: settings.pomodoro.workMinutes,
  });

  await notify("Deep Work", "Focus session started. Stay locked in.");
  await broadcastState();
}

async function handleStop(): Promise<void> {
  await chrome.alarms.clear(ALARM_PHASE_END);
  await removeAll();
  await storage.setSession({
    ...DEFAULT_SESSION_STATE,
    todayDate: new Date().toISOString().slice(0, 10),
  });
  await broadcastState();
}

async function handleSkip(): Promise<void> {
  const [session, settings] = await Promise.all([
    storage.getSession(),
    storage.getSettings(),
  ]);
  if (session.phase === "idle") return;

  const transition = getNextPhase(
    session.phase,
    session.cycleCount,
    settings.pomodoro,
  );
  await startPhase(
    transition.nextPhase,
    transition.durationMinutes,
    transition.nextCycleCount,
  );
}

async function handleEmergencyUnlock(): Promise<void> {
  await chrome.alarms.clear(ALARM_PHASE_END);
  await removeAll();
  await storage.setSession({
    ...DEFAULT_SESSION_STATE,
    todayDate: new Date().toISOString().slice(0, 10),
  });
  await broadcastState();
}

// ─── Schedule ────────────────────────────────────────────────────────────────

async function registerScheduleAlarms(): Promise<void> {
  const settings = await storage.getSettings();

  // Clear all existing schedule alarms
  const alarms = await chrome.alarms.getAll();
  for (const alarm of alarms) {
    if (alarm.name.startsWith(ALARM_SCHEDULE_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  if (!settings.schedule) return;

  const { days, startTime } = settings.schedule;
  const [hours, minutes] = startTime.split(":").map(Number);
  const dayIndexMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  for (const day of days) {
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    const todayDay = now.getDay();
    const targetDay = dayIndexMap[day];
    let daysUntil = (targetDay - todayDay + 7) % 7;
    if (daysUntil === 0 && target <= now) daysUntil = 7;
    target.setDate(now.getDate() + daysUntil);

    const delayMs = target.getTime() - now.getTime();
    chrome.alarms.create(`${ALARM_SCHEDULE_PREFIX}${day}`, {
      delayInMinutes: delayMs / 60000,
      periodInMinutes: 7 * 24 * 60, // weekly
    });
  }
}

// ─── Event listeners ─────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await storage.getSettings();
  // Only write defaults if not yet set
  if (!existing.profiles?.length) {
    const { DEFAULT_SETTINGS } = await import("../shared/constants.js");
    await storage.setSettings(DEFAULT_SETTINGS);
  }
  await registerScheduleAlarms();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_PHASE_END) {
    await onPhaseEnd();
    return;
  }
  if (alarm.name.startsWith(ALARM_SCHEDULE_PREFIX)) {
    const session = await storage.getSession();
    if (session.phase === "idle") {
      await handleStart("");
    }
  }
});

chrome.runtime.onMessage.addListener(
  (message: ExtMessage, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case "START": {
          const label =
            typeof message.payload === "string" ? message.payload : "";
          await handleStart(label);
          break;
        }
        case "STOP":
          await handleStop();
          break;
        case "SKIP":
          await handleSkip();
          break;
        case "EMERGENCY_UNLOCK":
          await handleEmergencyUnlock();
          break;
        case "GET_STATE": {
          const [state, settings] = await Promise.all([
            storage.getSession(),
            storage.getSettings(),
          ]);
          sendResponse({ state, settings });
          return;
        }
      }
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ error: String(err) }));

    return true; // keep channel open for async response
  },
);

// Periodically update storage so blocked page can poll remaining time
setInterval(async () => {
  const session = await storage.getSession();
  if (session.phase !== "idle" && session.endTimestamp > 0) {
    // Touch storage to trigger any storage listeners (no-op if nothing changed)
    await chrome.storage.local.set({ _tick: Date.now() });
  }
}, 1000);

// Re-register schedule alarms on startup
chrome.runtime.onStartup.addListener(async () => {
  await registerScheduleAlarms();
  // Restore blocking if a session was active before browser closed
  const [session, settings] = await Promise.all([
    storage.getSession(),
    storage.getSettings(),
  ]);
  if (session.phase === "work" && session.endTimestamp > Date.now()) {
    const activeProfile =
      settings.profiles.find((p) => p.id === settings.activeProfileId) ??
      settings.profiles[0];
    if (activeProfile) {
      await applyRules(activeProfile.sites, activeProfile.whitelistMode);
    }
    const remaining = (session.endTimestamp - Date.now()) / 60000;
    chrome.alarms.create(ALARM_PHASE_END, { delayInMinutes: remaining });
  } else if (session.phase !== "idle") {
    // Session expired while browser was closed — reset
    await handleStop();
  }
});

export {};
