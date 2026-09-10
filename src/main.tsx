import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import { QueryCache } from '@tanstack/react-query'
import { SessionExpiredError } from './lib/api'
import { startUpdateLifecycle } from './platform/updateLifecycle'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof SessionExpiredError) {
        window.dispatchEvent(new CustomEvent('session-expired'))
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof SessionExpiredError) return false
        return failureCount < 2
      },
      staleTime: 60 * 1000,
    },
  },
})

if (import.meta.env.PROD) {
  window.addEventListener('load', startUpdateLifecycle)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
