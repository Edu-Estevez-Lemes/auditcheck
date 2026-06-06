import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

// Aplica el tema guardado antes de renderizar para evitar parpadeo
try {
  const raw = localStorage.getItem('auditcheck-theme')
  if (raw) {
    const { state } = JSON.parse(raw)
    if (state?.theme === 'light') {
      document.documentElement.classList.add('theme-light')
    }
  }
} catch {}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgb(var(--ac-surface))',
              color: 'rgb(var(--ac-text-primary))',
              border: '1px solid rgb(var(--ac-border))',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
