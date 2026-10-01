import { useEffect, useState } from 'react'
import { applyTheme, savedAccent, savedTheme, type Theme } from '../../theme'

// Theme and accent for the whole app, applied to <html> and the favicon whenever they change.
export function useAppearance() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme())
  const [accent, setAccent] = useState<string>(() => savedAccent())

  useEffect(() => {
    applyTheme(theme, accent)
  }, [theme, accent])

  useEffect(() => {
    const safeAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#8b5cf6'

    const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="26" fill="${safeAccent}" />
  </svg>
  `

    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')

    if (!favicon) {
      favicon = document.createElement('link')
      favicon.rel = 'icon'
      favicon.type = 'image/svg+xml'
      document.head.appendChild(favicon)
    }

    favicon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  }, [accent])

  return { theme, setTheme, accent, setAccent }
}
