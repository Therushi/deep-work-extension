// src/blocked/blocked.ts
import type { SessionState, AppSettings } from "../shared/types.js";
import { STORAGE_KEYS, DEFAULT_SETTINGS } from "../shared/constants.js";
import quotes from "../shared/quotes.json";

const RING_CIRCUMFERENCE = 553; // 2π × 88

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const siteNameEl = document.getElementById("siteName") as HTMLElement;
const phaseLabelEl = document.getElementById("phaseLabel") as HTMLElement;
const timerDisplayEl = document.getElementById("timerDisplay") as HTMLElement;
const ringProgressEl = document.getElementById(
  "ringProgress",
) as unknown as SVGCircleElement;
const taskBadge = document.getElementById("taskBadge") as HTMLElement;
const taskTextEl = document.getElementById("taskText") as HTMLElement;
const quoteTextEl = document.getElementById("quoteText") as HTMLElement;
const quoteAuthorEl = document.getElementById("quoteAuthor") as HTMLElement;

const unlockToggleBtn = document.getElementById(
  "unlockToggleBtn",
) as HTMLButtonElement;
const unlockForm = document.getElementById("unlockForm") as HTMLElement;
const unlockHint = document.getElementById("unlockHint") as HTMLElement;
const unlockInput = document.getElementById("unlockInput") as HTMLInputElement;
const unlockSubmitBtn = document.getElementById(
  "unlockSubmitBtn",
) as HTMLButtonElement;
const unlockError = document.getElementById("unlockError") as HTMLElement;

// ─── Quote ────────────────────────────────────────────────────────────────────
const quote = quotes[Math.floor(Math.random() * quotes.length)];
quoteTextEl.textContent = `"${quote.text}"`;
quoteAuthorEl.textContent = quote.author;

// ─── Site name from URL ───────────────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const blockedSite = params.get("site") ?? "";
siteNameEl.textContent = blockedSite || "This site";

// ─── Timer rendering ──────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function getPhaseDurationSeconds(
  phase: SessionState["phase"],
  settings: AppSettings,
): number {
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

function updateTimer(state: SessionState, settings: AppSettings): void {
  if (state.phase === "idle") {
    timerDisplayEl.textContent = "--:--";
    phaseLabelEl.textContent = "IDLE";
    ringProgressEl.style.strokeDashoffset = "0";
    return;
  }

  const remaining = Math.max(
    0,
    Math.ceil((state.endTimestamp - Date.now()) / 1000),
  );
  timerDisplayEl.textContent = formatTime(remaining);
  phaseLabelEl.textContent = state.phase === "work" ? "FOCUS" : "BREAK";

  const total = getPhaseDurationSeconds(state.phase, settings);
  const fraction = total > 0 ? remaining / total : 0;
  ringProgressEl.style.strokeDashoffset = String(
    RING_CIRCUMFERENCE * (1 - fraction),
  );

  // Task label
  if (state.taskLabel) {
    taskBadge.classList.remove("hidden");
    taskTextEl.textContent = `Working on: ${state.taskLabel}`;
  } else {
    taskBadge.classList.add("hidden");
  }
}

// ─── State cache ─────────────────────────────────────────────────────────────
let cachedState: SessionState | undefined;
let cachedSettings: AppSettings | undefined;

async function loadAndRender(): Promise<void> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.SESSION,
    STORAGE_KEYS.SETTINGS,
  ]);
  cachedState = result[STORAGE_KEYS.SESSION] as SessionState | undefined;
  cachedSettings = (result[STORAGE_KEYS.SETTINGS] as AppSettings | undefined) ?? DEFAULT_SETTINGS;

  if (cachedState) {
    updateTimer(cachedState, cachedSettings);

    if (cachedState.phase !== "work") {
      setTimeout(() => {
        window.location.href = blockedSite
          ? `https://${blockedSite}`
          : "chrome://newtab";
      }, 800);
    }

    if (cachedSettings.emergencyUnlockPhrase) {
      unlockHint.textContent = `Type your unlock phrase to end this session:`;
    }
  }
}

// Re-render every second using cached endTimestamp (no storage read needed)
function tickRender(): void {
  if (cachedState) {
    updateTimer(cachedState, cachedSettings ?? DEFAULT_SETTINGS);
  }
}

// React to _tick written by SW — also re-reads state in case phase changed
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes["_tick"] || changes[STORAGE_KEYS.SESSION]) {
    loadAndRender().catch(console.error);
  }
});

// Initial load
loadAndRender().catch(console.error);

// Local tick so the countdown is smooth even when SW is idle
const tickInterval = setInterval(tickRender, 1000);
window.addEventListener("beforeunload", () => clearInterval(tickInterval));

// ─── Emergency unlock ─────────────────────────────────────────────────────────
unlockToggleBtn.addEventListener("click", () => {
  const visible = !unlockForm.classList.contains("hidden");
  unlockForm.classList.toggle("hidden", visible);
  unlockToggleBtn.textContent = visible ? "Need to unlock? ↓" : "Hide ↑";
  if (!visible) unlockInput.focus();
});

async function attemptUnlock(): Promise<void> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = result[STORAGE_KEYS.SETTINGS] as AppSettings | undefined;
  const phrase = settings?.emergencyUnlockPhrase ?? "I choose to break focus";

  if (unlockInput.value.trim() === phrase) {
    await chrome.runtime.sendMessage({ type: "EMERGENCY_UNLOCK" });
    unlockError.classList.add("hidden");
    // Redirect to blank or original site after unlock
    window.location.href = blockedSite
      ? `https://${blockedSite}`
      : "chrome://newtab";
  } else {
    unlockInput.classList.add("shake");
    unlockError.classList.remove("hidden");
    unlockInput.value = "";
    setTimeout(() => unlockInput.classList.remove("shake"), 400);
  }
}

unlockSubmitBtn.addEventListener("click", () =>
  attemptUnlock().catch(console.error),
);
unlockInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attemptUnlock().catch(console.error);
});
