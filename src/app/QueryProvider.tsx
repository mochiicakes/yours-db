import { useState, type ReactNode } from 'react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFeedback } from './feedback'

// Load once and never refetch on our own, as before. Any failed write shows in the banner; any success clears it.
export function QueryProvider({ children }: { children: ReactNode }) {
  const { setError } = useFeedback()
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            staleTime: Infinity,
            gcTime: Infinity,
          },
          mutations: { retry: false },
        },
        mutationCache: new MutationCache({
          onError: (e) => setError((e as Error).message),
          onSuccess: () => setError(null),
        }),
      }),
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
