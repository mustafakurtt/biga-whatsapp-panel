// Tema: "system" (prefers-color-scheme) | "light" | "dark"; localStorage'da hatırlanır.
// index.html içindeki küçük betik ilk boyamadan önce data-theme'yi koyar.
import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "theme";
const mq = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export const effectiveTheme = (pref: ThemePref = getThemePref()): "light" | "dark" =>
  pref === "system" ? (mq.matches ? "dark" : "light") : pref;

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effectiveTheme(pref) === "dark" ? "#0e100f" : "#f3f6f4");
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // depolama kapalıysa sadece bu oturum
  }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

export const toggleTheme = () => setThemePref(effectiveTheme() === "dark" ? "light" : "dark");

mq.addEventListener("change", () => {
  applyTheme();
  listeners.forEach((l) => l());
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** [tercih, etkin tema] — değişince yeniden çizer */
export function useTheme(): { pref: ThemePref; effective: "light" | "dark" } {
  const pref = useSyncExternalStore(subscribe, getThemePref);
  const effective = useSyncExternalStore(subscribe, () => effectiveTheme());
  return { pref, effective };
}
