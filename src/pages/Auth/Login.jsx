import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { isSupabaseConfigured } from '../../lib/supabase'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

/* Pure SVG 3D Flowing Ribbon Wave (Top-Left is the exact bottom wave design rotated 180deg) */
function WaveGraphic({ className = '', flipped = false }) {
  const prefix = flipped ? 'tl' : 'br'
  return (
    <svg
      viewBox="0 0 520 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Soft mint backdrop ambient glow */}
        <linearGradient id={`${prefix}-ambient`} x1="100%" y1="100%" x2="20%" y2="20%">
          <stop offset="0%" stopColor="#00B84A" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#86EFAC" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#EAFBF1" stopOpacity="0.0" />
        </linearGradient>

        {/* Translucent mint flowing ribbon */}
        <linearGradient id={`${prefix}-mint`} x1="100%" y1="100%" x2="10%" y2="20%">
          <stop offset="0%" stopColor="#86EFAC" stopOpacity="0.65" />
          <stop offset="55%" stopColor="#34D399" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#EAFBF1" stopOpacity="0.05" />
        </linearGradient>

        {/* Primary vibrant 3D green ribbon */}
        <linearGradient id={`${prefix}-primary`} x1="100%" y1="100%" x2="10%" y2="20%">
          <stop offset="0%" stopColor="#008B3A" />
          <stop offset="35%" stopColor="#00B84A" />
          <stop offset="75%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#4ADE80" />
        </linearGradient>

        {/* Foreground crest fold */}
        <linearGradient id={`${prefix}-crest`} x1="100%" y1="80%" x2="20%" y2="0%">
          <stop offset="0%" stopColor="#00662A" />
          <stop offset="50%" stopColor="#008B3A" />
          <stop offset="100%" stopColor="#00B84A" />
        </linearGradient>
      </defs>

      <g transform={flipped ? 'rotate(180 260 130)' : undefined}>
        {/* Broad soft ambient glow behind waves */}
        <path
          d="M520 260 V40 C430 80 340 140 220 180 C120 215 40 235 0 260 Z"
          fill={`url(#${prefix}-ambient)`}
        />

        {/* Layer 1: Soft translucent mint wave swooping upward */}
        <path
          d="M520 260 V85 C440 115 360 165 250 195 C160 225 60 245 0 260 Z"
          fill={`url(#${prefix}-mint)`}
        />

        {/* Layer 2: Main vibrant 3D undulating green ribbon */}
        <path
          d="M520 260 V135 C450 145 390 190 280 195 C200 198 120 225 60 260 Z"
          fill={`url(#${prefix}-primary)`}
        />

        {/* Layer 3: Foreground deep green ribbon fold along bottom edge */}
        <path
          d="M520 260 V185 C460 190 400 225 310 225 C230 225 160 245 110 260 Z"
          fill={`url(#${prefix}-crest)`}
        />

        {/* Subtle glossy highlight along ribbon crest */}
        <path
          d="M520 135 C450 145 390 190 280 195 C200 198 120 225 60 260"
          stroke="#86EFAC"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeOpacity="0.55"
        />
      </g>
    </svg>
  )
}

function TopLeftWave({ className = 'pointer-events-none absolute top-0 left-0 w-72 sm:w-88 md:w-[440px] lg:w-[520px] xl:w-[580px] z-0 select-none' }) {
  return <WaveGraphic className={className} flipped={true} />
}

function BottomRightWave({ className = 'pointer-events-none absolute bottom-0 right-0 w-72 sm:w-88 md:w-[440px] lg:w-[520px] xl:w-[580px] z-0 select-none' }) {
  return <WaveGraphic className={className} flipped={false} />
}

function GoogleIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function Login() {
  const { session, loading, signIn, signInWithGoogle, authError, setAuthError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const activeError = authError || formError

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  if (!loading && session) {
    return <Navigate to={location.state?.from || '/'} replace />
  }

  const onSubmit = async ({ email, password }) => {
    setFormError('')
    if (setAuthError) setAuthError('')
    try {
      const { error } = await signIn(email, password)
      if (error) {
        setFormError(
          error.message === 'Invalid login credentials'
            ? 'Email or password is incorrect.'
            : error.message
        )
      } else {
        navigate(location.state?.from || '/', { replace: true })
      }
    } catch {
      setFormError('Could not reach the server. Check your connection and try again.')
    }
  }

  const handleGoogleSignIn = async () => {
    setFormError('')
    if (setAuthError) setAuthError('')
    setIsGoogleLoading(true)
    try {
      const redirectTo = location.state?.from
        ? `${window.location.origin}${location.state.from}`
        : window.location.origin
      const { error } = await signInWithGoogle(redirectTo)
      if (error) setFormError(error.message)
    } catch {
      setFormError('Could not start Google sign in. Please try again.')
    } finally {
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-[#fbfdfc] flex items-center justify-center px-4 py-8 sm:py-12 overflow-hidden select-text">
      {/* Pure SVG Corner Waves (Top-Left is the rotated bottom wave) */}
      <TopLeftWave />
      <BottomRightWave />

      {/* Centered Clean Login Card */}
      <div className="relative z-10 w-full max-w-[450px] rounded-[24px] bg-white p-7 sm:p-10 shadow-[0_15px_50px_-10px_rgba(7,26,53,0.08)] border border-[#E4E9EF] transition-all">
        {/* AWENUE Logo placed prominently right above Welcome Back! */}
        <div className="flex justify-center mb-6">
          <img
            src="/brand/awenue-logo.png"
            alt="AWENUE - Global Software Solutions"
            className="h-11 sm:h-13 w-auto object-contain"
          />
        </div>

        {/* Card Header */}
        <div className="text-center mb-7 sm:mb-8">
          <h1 className="text-2xl sm:text-[30px] font-extrabold text-[#071A35] tracking-tight">
            Welcome Back!
          </h1>
          <p className="mt-1 text-sm sm:text-[15px] text-[#647084]">
            Sign in to your Awenue account
          </p>
        </div>

        {/* Supabase Missing Configuration Notice */}
        {!isSupabaseConfigured && (
          <div
            role="alert"
            className="mb-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              Supabase isn't configured. Set your <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code>.
            </span>
          </div>
        )}

        {/* Form Error Alert */}
        {activeError && (
          <div
            role="alert"
            className="mb-5 rounded-xl bg-red-50 p-3.5 text-xs text-red-700 border border-red-200 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <span>{activeError}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 sm:space-y-5">
          {/* Email Field */}
          <div>
            <label
              htmlFor="email"
              className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#071A35] mb-2"
            >
              <Mail className="h-4 w-4 text-[#00B84A] stroke-[2.2]" />
              <span>Email</span>
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              {...register('email')}
              className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-[#071A35] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B84A]/20 transition ${
                errors.email
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-[#E4E9EF] focus:border-[#00B84A]'
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="password"
                className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#071A35]"
              >
                <Lock className="h-4 w-4 text-[#00B84A] stroke-[2.2]" />
                <span>Password</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-[#00B84A] hover:text-[#008B3A] transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register('password')}
                className={`w-full rounded-xl border bg-white px-4 py-3 pr-11 text-sm text-[#071A35] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00B84A]/20 transition ${
                  errors.password
                    ? 'border-red-400 focus:border-red-500'
                    : 'border-[#E4E9EF] focus:border-[#00B84A]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#071A35] transition p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Primary Sign In Button */}
          <button
            type="submit"
            disabled={isSubmitting || isGoogleLoading}
            className="w-full mt-2 py-3.5 px-4 rounded-xl font-bold text-white text-sm sm:text-base bg-gradient-to-r from-[#008B3A] to-[#00B84A] hover:opacity-95 active:scale-[0.99] shadow-md shadow-[#00B84A]/20 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin text-white" />}
            <span>Sign In</span>
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-[#E4E9EF]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-white px-3 text-[#647084] font-medium">
              or sign in with
            </span>
          </div>
        </div>

        {/* Google Authentication Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting || isGoogleLoading}
          className="w-full py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm text-[#071A35] bg-white border border-[#E4E9EF] hover:border-gray-300 hover:bg-gray-50/80 active:scale-[0.99] shadow-2xs disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {isGoogleLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          ) : (
            <GoogleIcon className="h-4 w-4 sm:h-5 sm:w-5" />
          )}
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  )
}
