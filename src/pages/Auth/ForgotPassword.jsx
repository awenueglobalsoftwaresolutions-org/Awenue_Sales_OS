import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import AuthShell from '../../components/layout/AuthShell'

const schema = z.object({ email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address') })

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }) => {
    setFormError('')
    try {
      const { error } = await sendPasswordReset(email)
      if (error) setFormError(error.message)
      else setSent(true)
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">If an account exists for that email, a reset link is on its way.</p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" className="input" {...register('email')} />
            {errors.email && <p className="field-error">{errors.email.message}</p>}
          </div>
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Send reset link
          </button>
        </form>
      )}
      <Link to="/login" className="mt-5 block text-center text-sm font-medium text-brand-600 hover:underline">Back to sign in</Link>
    </AuthShell>
  )
}
