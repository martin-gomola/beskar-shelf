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

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('SW registered:', reg.scope)
        setInterval(() => reg.update(), 5 * 60 * 1000)
      })
      .catch((err) => {
        console.log('SW registration failed:', err)
      })
  })
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
