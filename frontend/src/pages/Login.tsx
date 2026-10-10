import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const LoginPage: React.FC = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await login(username, password)
      navigate('/')
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-widget-bg border border-widget-border rounded-2xl shadow-lg p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-brand-primary to-brand-secondary flex items-center justify-center shadow-md shadow-brand-primary/20">
            <svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden className="text-brand-accent-contrast">
              <rect x="14" y="20" width="10" height="28" rx="4" fill="currentColor" opacity="0.65" />
              <rect x="27" y="14" width="10" height="36" rx="4" fill="currentColor" />
              <rect x="40" y="22" width="10" height="22" rx="4" fill="currentColor" opacity="0.8" />
              <circle cx="46" cy="16" r="4" fill="currentColor" opacity="0.9" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary leading-none">dbt-Workbench</h1>
            <p className="text-[11px] font-medium text-brand-primary mt-1">Sign in to your workspace</p>
          </div>
        </div>
        {error && (
          <div className="mb-4 rounded-xl border border-brand-danger/30 bg-brand-danger/10 px-4 py-2 text-sm font-medium text-brand-danger">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-text-secondary uppercase tracking-wider">Username</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary placeholder-text-tertiary focus:bg-bg-secondary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-text-secondary uppercase tracking-wider">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 bg-bg-tertiary border border-border-primary rounded-xl text-sm text-text-primary placeholder-text-tertiary focus:bg-bg-secondary focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-4 py-2.5 text-sm font-bold bg-brand-primary text-brand-accent-contrast rounded-xl hover:bg-brand-primary-hover shadow-md shadow-brand-primary/20 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
