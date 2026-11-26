import { useEffect } from 'react'

// While active, closing, reloading or leaving the tab asks for confirmation.
// Browsers show their own wording; a page cannot set the message.
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Older Chrome and Safari still need returnValue set.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}
