import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import AuthShell from '../../components/layout/AuthShell'
import Spinner from '../../components/common/Spinner'

const schema = z.object({
  password: z.string().min(8, 'Use at least 8 characters'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export default function ResetPassword() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  if (loading) return <Spinner className="h-screen" />

  const onSubmit = async ({ password }) => {
    setFormError('')
    try {
      const { error } = await updatePassword(password)
      if (error) setFormError(error.message)
      else { toast.success('Password updated'); navigate('/', { replace: true }) }
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    }
  }

  return (
    <AuthShell title="Choose a new password">
      {!session ? (
        <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This reset link is invalid or has expired. <Link to="/forgot-password" className="font-semibold underline">Request a new one</Link>.</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          <div>
            <label className="label" htmlFor="password">New password</label>
            <input id="password" type="password" autoComplete="new-password" className="input" {...register('password')} />
            {errors.password && <p className="field-error">{errors.password.message}</p>}
          </div>
          <div>
            <label className="label" htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" autoComplete="new-password" className="input" {...register('confirm')} />
            {errors.confirm && <p className="field-error">{errors.confirm.message}</p>}
          </div>
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Update password
          </button>
        </form>
      )}
    </AuthShell>
  )
}
