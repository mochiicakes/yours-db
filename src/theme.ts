// Themes are CSS custom properties on <html>, with the accent layered on top. Saved per device so boot has no flash.
export interface Theme {
  id: string
  name: string
  light: boolean
  vars: Record<string, string>
}

export const THEMES: Theme[] = [
  {
    // The original palette, kept exactly.
    id: 'dawn',
    name: 'Dawn',
    light: false,
    vars: {
      '--bg': '#0a0511',
      '--panel': '#140a1f',
      '--raised': '#1c1030',
      '--line': '#3a2a52',
      '--text': '#f0e9f5',
      '--muted': '#9a8fb5',
      '--faint': '#6f6488',
      '--deep': '#010006',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    light: false,
    vars: {
      '--bg': '#101215',
      '--panel': '#171a1f',
      '--raised': '#1f242b',
      '--line': '#2c333c',
      '--text': '#e8ecf1',
      '--muted': '#9aa6b4',
      '--faint': '#66727f',
      '--deep': '#080a0c',
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    light: false,
    vars: {
      '--bg': '#0b1410',
      '--panel': '#111d17',
      '--raised': '#17281f',
      '--line': '#22392d',
      '--text': '#e6f2ea',
      '--muted': '#93b3a2',
      '--faint': '#5f7d6c',
      '--deep': '#060d0a',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    light: true,
    vars: {
      '--bg': '#faf8f5',
      '--panel': '#ffffff',
      '--raised': '#f2efe9',
      '--line': '#e0dbd2',
      '--text': '#1f1c18',
      '--muted': '#6b6459',
      '--faint': '#9c948a',
      '--deep': '#f2efe9',
    },
  },
  {
    id: 'mist',
    name: 'Mist',
    light: true,
    vars: {
      '--bg': '#f4f6fa',
      '--panel': '#ffffff',
      '--raised': '#eaeef5',
      '--line': '#d8dfea',
      '--text': '#182030',
      '--muted': '#5d6b80',
      '--faint': '#8e9aad',
      '--deep': '#e6ebf3',
    },
  },
]

export const ACCENTS = [
  '#fe4c01',
  '#ff8a01',
  '#ffb381',
  '#ff5558',
  '#bd9fd1',
  '#815288',
  '#3a4e9e',
  '#00a3a3',
]

const THEME_KEY = 'yoursdb.theme'
const ACCENT_KEY = 'yoursdb.accent'

// localStorage can throw (private mode, blocked site data), so reads fall back and writes are skipped.
function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not saved; the choice still applies until the page is closed.
  }
}

export function savedTheme(): Theme {
  const id = readStore(THEME_KEY)
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function savedAccent(): string {
  const value = readStore(ACCENT_KEY)
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : ACCENTS[0]
}

// Perceived brightness, so yellow gets dark text and navy gets light.
export function readableOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#101010' : '#ffffff'
}

function fade(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function applyTheme(theme: Theme, accent: string): void {
  const root = document.documentElement
  for (const [name, value] of Object.entries(theme.vars)) {
    root.style.setProperty(name, value)
  }
  root.style.setProperty('--accent', accent)
  root.style.setProperty('--on-accent', readableOn(accent))
  root.style.setProperty('--accent-soft', fade(accent, theme.light ? 0.12 : 0.18))
  root.style.setProperty('--accent-line', fade(accent, 0.45))
  root.style.setProperty('color-scheme', theme.light ? 'light' : 'dark')

  writeStore(THEME_KEY, theme.id)
  writeStore(ACCENT_KEY, accent)
}

// Six pill colours made by rotating the accent's hue.
export function choiceColour(slot: number, accent: string): string {
  const r = parseInt(accent.slice(1, 3), 16) / 255
  const g = parseInt(accent.slice(3, 5), 16) / 255
  const b = parseInt(accent.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = (h * 60 + 360) % 360

  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))

  const hue = (h + slot * 52) % 360
  return `hsl(${Math.round(hue)} ${Math.round(Math.max(s, 0.45) * 100)}% ${Math.round(
    Math.min(Math.max(l, 0.42), 0.6) * 100,
  )}%)`
}
