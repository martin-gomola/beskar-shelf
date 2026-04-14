import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { ToastContext, type ToastType } from '../contexts/ToastContext'

interface Toast {
  id: number
  message: string
  type: ToastType
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const id of timers) clearTimeout(id)
    }
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    const timer = setTimeout(() => {
      timersRef.current.delete(timer)
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
    timersRef.current.add(timer)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
