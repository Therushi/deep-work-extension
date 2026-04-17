// src/popup/popup.ts
import type {
  SessionState,
  AppSettings,
  StateUpdatePayload,
  Phase,
} from "../shared/types.js";
import { storage } from "../shared/storage.js";

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const profileSelect = document.getElementById(
  "profileSelect",
) as HTMLSelectElement;
const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;
const phaseLabel = document.getElementById("phaseLabel") as HTMLElement;
const timerDisplay = document.getElementById("timerDisplay") as HTMLElement;
const cycleDisplay = document.getElementById("cycleDisplay") as HTMLElement;
const ringProgress = document.getElementById(
  "ringProgress",
) as unknown as SVGCircleElement;
const taskRow = document.getElementById("taskRow") as HTMLElement;
const taskInput = document.getElementById("taskInput") as HTMLInputElement;
const activeTaskRow = document.getElementById("activeTaskRow") as HTMLElement;
const activeTaskLabel = document.getElementById(
  "activeTaskLabel",
) as HTMLElement;
const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
const skipBtn = document.getElementById("skipBtn") as HTMLButtonElement;
const stopBtn = document.getElementById("stopBtn") as HTMLButtonElement;
const todayCount = document.getElementById("todayCount") as HTMLElement;
const todayMinutes = document.getElementById("todayMinutes") as HTMLElement;

const RING_CIRCUMFERENCE = 326; // 2π × 52

let currentSettings: AppSettings | null = null;
let tickIntervalId: ReturnType<typeof setInterval> | null = null;

// ─── Render ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getPhaseDurationSeconds(phase: Phase, settings: AppSettings): number {
  switch (phase) {
    case "work":
      return settings.pomodoro.workMinutes * 60;
    case "shortBreak":
      return settings.pomodoro.shortBreakMinutes * 60;
    case "longBreak":
      return settings.pomodoro.longBreakMinutes * 60;
    default:
      return 0;
  }
}

function phaseName(phase: Phase): string {
  switch (phase) {
    case "work":
      return "FOCUS";
    case "shortBreak":
      return "SHORT BREAK";
    case "longBreak":
      return "LONG BREAK";
    default:
      return "IDLE";
  }
}

function render(state: SessionState, settings: AppSettings): void {
  currentSettings = settings;
  const isActive = state.phase !== "idle";
  const isBreak = state.phase === "shortBreak" || state.phase === "longBreak";

  // Phase label
  phaseLabel.textContent = phaseName(state.phase);

  // Timer
  const remaining = isActive
    ? Math.max(0, Math.ceil((state.endTimestamp - Date.now()) / 1000))
    : 0;
  timerDisplay.textContent = formatTime(remaining);

  // Ring progress
  const total = getPhaseDurationSeconds(state.phase, settings);
  const progress = total > 0 ? remaining / total : 0;
  ringProgress.style.strokeDashoffset = String(
    RING_CIRCUMFERENCE * (1 - progress),
  );
  ringProgress.classList.toggle("break-phase", isBreak);

  // Cycle count
  const cyclesTotal = settings.pomodoro.cyclesBeforeLongBreak;
  const currentCycle =
    (state.cycleCount % cyclesTotal) + (state.phase === "work" ? 1 : 0);
  cycleDisplay.textContent = isActive
    ? `${Math.min(currentCycle, cyclesTotal)} / ${cyclesTotal}`
    : "";

  // Task area
  taskRow.classList.toggle("hidden", isActive);
  activeTaskRow.classList.toggle("hidden", !isActive || !state.taskLabel);
  if (state.taskLabel) activeTaskLabel.textContent = state.taskLabel;

  // Buttons
  startBtn.classList.toggle("hidden", isActive);
  skipBtn.classList.toggle("hidden", !isActive);
  stopBtn.classList.toggle("hidden", !isActive);
  startBtn.textContent = "Start Focus";

  // Profile selector — disable during active session
  profileSelect.disabled = isActive;

  // Update profiles list
  renderProfiles(settings);
}

function renderProfiles(settings: AppSettings): void {
  const existing = Array.from(profileSelect.options).map((o) => o.value);
  const incoming = settings.profiles.map((p) => p.id);

  if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
    profileSelect.innerHTML = "";
    for (const profile of settings.profiles) {
      const opt = document.createElement("option");
      opt.value = profile.id;
      opt.textContent = `${profile.name}${profile.whitelistMode ? " (whitelist)" : ""}`;
      profileSelect.appendChild(opt);
    }
  }
  profileSelect.value = settings.activeProfileId;
}

async function refreshStats(): Promise<void> {
  const stats = await storage.getTodayStats();
  todayCount.textContent = String(stats.completedPomodoros);
  todayMinutes.textContent = `${stats.totalFocusMinutes}m`;
}

// Live countdown tick
function startTick(state: SessionState, settings: AppSettings): void {
  if (tickIntervalId !== null) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
  if (state.phase === "idle") return;

  tickIntervalId = setInterval(() => {
    const remaining = Math.max(
      0,
      Math.ceil((state.endTimestamp - Date.now()) / 1000),
    );
    if (remaining <= 0) {
      clearInterval(tickIntervalId!);
      tickIntervalId = null;
      return;
    }
    timerDisplay.textContent = formatTime(remaining);
    const total = getPhaseDurationSeconds(state.phase, settings);
    const progress = total > 0 ? remaining / total : 0;
    ringProgress.style.strokeDashoffset = String(
      RING_CIRCUMFERENCE * (1 - progress),
    );
  }, 500);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({
    type: "GET_STATE",
  })) as StateUpdatePayload;
  render(response.state, response.settings);
  startTick(response.state, response.settings);
  await refreshStats();
}

// ─── Events ───────────────────────────────────────────────────────────────────

startBtn.addEventListener("click", async () => {
  const label = taskInput.value.trim();
  await chrome.runtime.sendMessage({ type: "START", payload: label });
  taskInput.value = "";
});

stopBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP" });
  await refreshStats();
});

skipBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "SKIP" });
});

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

profileSelect.addEventListener("change", async () => {
  if (!currentSettings) return;
  const updated: AppSettings = {
    ...currentSettings,
    activeProfileId: profileSelect.value,
  };
  await storage.setSettings(updated);
  currentSettings = updated;
});

// Listen for state updates from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE_UPDATE") {
    const { state, settings } = message.payload as StateUpdatePayload;
    render(state, settings);
    startTick(state, settings);
    refreshStats().catch(console.error);
  }
});

init().catch(console.error);
