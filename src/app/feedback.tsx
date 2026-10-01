import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

interface Feedback {
  error: string | null
  setError: (message: string | null) => void
  toast: string
  say: (message: string) => void
}

const FeedbackContext = createContext<Feedback | null>(null)

// The error banner and the toast, shared by every feature.
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const timer = useRef<number>()

  const say = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(''), 2600)
  }, [])

  const value = useMemo(() => ({ error, setError, toast, say }), [error, toast, say])
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>
}

export function useFeedback(): Feedback {
  const value = useContext(FeedbackContext)
  if (!value) throw new Error('useFeedback must be used inside FeedbackProvider')
  return value
}
