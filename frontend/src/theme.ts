// Light / dark theme: the device's setting by default, or what the user picked. The choice stays
// in this browser (localStorage), never sent to the server. public/theme-init.js applies the same
// rules before React starts, so the page does not flash the wrong colours.

import { useEffect, useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'skinwise.theme'
const THEME_COLOR = { light: '#f5f2f8', dark: '#11111f' } // the page background (neutral)

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system' // storage blocked: follow the device
  }
}

let choice: ThemeChoice = readChoice()
const listeners = new Set<() => void>()

function deviceIsDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** Put the theme on <html> and in the browser bar colour. */
function apply(forceLight: boolean): void {
  const dark = !forceLight && (choice === 'dark' || (choice === 'system' && deviceIsDark()))
  const theme = dark ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

export function setThemeChoice(next: ThemeChoice): void {
  choice = next
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  listeners.forEach((l) => l())
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** The current choice ("Theo máy" / "Sáng" / "Tối"). */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, () => choice)
}

function subscribeDevice(onChange: () => void): () => void {
  const unsubscribe = subscribe(onChange)
  let media: MediaQueryList | null = null
  try {
    media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onChange)
  } catch {
    // No matchMedia: only the user's choice counts.
  }
  return () => {
    unsubscribe()
    media?.removeEventListener('change', onChange)
  }
}

/** Whether the page is dark now: the user's choice, or the device's setting while on "Theo máy". */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribeDevice, () => choice === 'dark' || (choice === 'system' && deviceIsDark()))
}

/**
 * Keep <html data-theme> in step with the choice and, for "Theo máy", with the device. Mounted
 * once, in App. `forceLight`: the reviewers' page keeps the light theme.
 */
export function useApplyTheme(forceLight: boolean): void {
  const current = useThemeChoice()
  useEffect(() => {
    apply(forceLight)
    if (current !== 'system') return
    let media: MediaQueryList | null = null
    try {
      media = window.matchMedia('(prefers-color-scheme: dark)')
    } catch {
      return
    }
    const onChange = () => apply(forceLight)
    media.addEventListener('change', onChange)
    return () => media?.removeEventListener('change', onChange)
  }, [current, forceLight])
}
