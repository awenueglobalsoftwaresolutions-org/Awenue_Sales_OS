import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import AuthShell from '../../components/layout/AuthShell'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export default function Login() {
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  if (!loading && session) return <Navigate to={location.state?.from || '/'} replace />

  const onSubmit = async ({ email, password }) => {
    setFormError('')
    try {
      const { error } = await signIn(email, password)
      if (error) setFormError(error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message)
      else navigate(location.state?.from || '/', { replace: true })
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Use your Awenue account to continue.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" {...register('email')} />
          {errors.email && <p className="field-error">{errors.email.message}</p>}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link to="/forgot-password" className="mb-1.5 text-xs font-medium text-brand-600 hover:underline">Forgot password?</Link>
          </div>
          <input id="password" type="password" autoComplete="current-password" className="input" {...register('password')} />
          {errors.password && <p className="field-error">{errors.password.message}</p>}
        </div>
        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Sign in
        </button>
      </form>
    </AuthShell>
  )
}
