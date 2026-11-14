"use client";

let audioContext: AudioContext | null = null;
const NOTIFICATION_PREFERENCE = "syncmove:notifications-enabled";

export function getNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(NOTIFICATION_PREFERENCE) !== "false";
}

export function setNotificationsEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFICATION_PREFERENCE, String(enabled));
  window.dispatchEvent(new CustomEvent("syncmove:notifications", { detail: { enabled } }));
}

/** Play a short, unobtrusive incoming-message tone. */
export function playMessageNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === "suspended") void audioContext.resume();

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.17);
  } catch {
    // Notification audio is optional and may be blocked by browser policy.
  }
}
