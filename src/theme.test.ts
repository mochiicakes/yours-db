import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCENTS, THEMES, applyTheme, savedAccent, savedTheme } from './theme'

// What Safari private mode and blocked site data do: every access throws.
const throwingStorage = {
  getItem: () => {
    throw new DOMException('The operation is insecure.', 'SecurityError')
  },
  setItem: () => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  },
}

function stubDocument() {
  const props = new Map<string, string>()
  vi.stubGlobal('document', {
    documentElement: { style: { setProperty: (k: string, v: string) => props.set(k, v) } },
  })
  return props
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('theme storage', () => {
  it('falls back to the defaults when localStorage throws', () => {
    vi.stubGlobal('localStorage', throwingStorage)
    expect(savedTheme()).toBe(THEMES[0])
    expect(savedAccent()).toBe(ACCENTS[0])
  })

  it('still applies a theme when saving it throws', () => {
    vi.stubGlobal('localStorage', throwingStorage)
    const props = stubDocument()
    expect(() => applyTheme(THEMES[1], '#00a3a3')).not.toThrow()
    expect(props.get('--accent')).toBe('#00a3a3')
  })

  it('reads back what was saved when localStorage works', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
    stubDocument()
    applyTheme(THEMES[2], '#3a4e9e')
    expect(savedTheme()).toBe(THEMES[2])
    expect(savedAccent()).toBe('#3a4e9e')
  })
})
