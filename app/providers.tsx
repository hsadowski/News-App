'use client' // This component needs to be a client component

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import React, { useState } from 'react'

export default function Providers({ children }: { children: React.ReactNode }) {
  // Create a new QueryClient instance for each request on the server,
  // or memoize the client on the client-side.
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Default staleTime can be adjusted based on how fresh data needs to be
        staleTime: 1 * 60 * 1000, // 1 minute
        // Default gcTime (cache time) can also be adjusted
        // gcTime: 5 * 60 * 1000, // 5 minutes (example)
      },
    },
  }))

  return (
    // Provide the client to the rest of your app
    <QueryClientProvider client={queryClient}>
      {children}
      {/* The React Query Devtools are helpful for debugging */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
