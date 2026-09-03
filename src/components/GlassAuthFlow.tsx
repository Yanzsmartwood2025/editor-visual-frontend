import { FormEvent, useEffect, useState } from 'react'

type GlassAuthFlowProps = {
  onEmailSubmit: (email: string) => void | Promise<void>
  onGoogleSignIn: () => void | Promise<void>
  projectName?: string
  projectMark?: string
  splashDuration?: number
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.42-.18-2.09H12v3.95h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.25Z" />
      <path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5Z" />
      <path fill="#FBBC05" d="M6.54 13.58a5.85 5.85 0 0 1 0-3.16V7.89H3.3a9.75 9.75 0 0 0 0 8.22l3.24-2.53Z" />
      <path fill="#EA4335" d="M12 6.39c1.43 0 2.72.49 3.73 1.45l2.8-2.8C16.84 3.43 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 8.11 9.46 6.39 12 6.39Z" />
    </svg>
  )
}

export function GlassAuthFlow({
  onEmailSubmit,
  onGoogleSignIn,
  projectName = 'NAYLA',
  projectMark = 'N',
  splashDuration = 2400,
}: GlassAuthFlowProps) {
  const [screen, setScreen] = useState<'splash' | 'login'>('splash')
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setScreen('login'), splashDuration)
    return () => window.clearTimeout(timer)
  }, [splashDuration])

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onEmailSubmit(email.trim())
    } finally {
      setIsSubmitting(false)
    }
  }

  const showLogin = () => setScreen('login')

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070516] font-sans text-white selection:bg-[#a78bfa]/30">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(91,33,182,0.38),transparent_34%),radial-gradient(circle_at_85%_86%,rgba(30,64,175,0.3),transparent_38%),linear-gradient(135deg,#070516_0%,#11102d_48%,#061329_100%)]" />
      <div className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute left-[12%] top-[18%] h-2 w-2 animate-pulse rounded-full bg-violet-300/70 shadow-[0_0_24px_8px_rgba(167,139,250,0.28)]" />
      <div className="absolute bottom-[20%] right-[16%] h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300/70 shadow-[0_0_20px_7px_rgba(96,165,250,0.24)] [animation-delay:700ms]" />

      {screen === 'splash' ? (
        <button
          type="button"
          onClick={showLogin}
          aria-label="Continuar al inicio de sesión"
          className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center outline-none"
        >
          <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/20 bg-white/[0.08] text-4xl font-semibold tracking-[-0.08em] text-white shadow-[0_0_70px_rgba(124,58,237,0.32)] backdrop-blur-xl transition duration-1000 ease-out animate-[pulse_4s_ease-in-out_infinite]">
            {projectMark}
          </div>
          <p className="mt-7 translate-y-0 text-sm font-medium tracking-[0.5em] text-white/90 opacity-100 transition duration-1000">{projectName}</p>
          <p className="mt-3 text-xs tracking-[0.18em] text-white/35">TOCA PARA CONTINUAR</p>
        </button>
      ) : (
        <section className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md translate-y-0 rounded-[2rem] border border-white/[0.16] bg-white/[0.09] p-6 opacity-100 shadow-[0_24px_90px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl transition-all duration-700 sm:p-9">
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-xl font-semibold tracking-[-0.08em] text-white shadow-lg shadow-violet-950/30">{projectMark}</div>
              <h1 className="mt-5 text-lg font-semibold tracking-[0.32em] text-white">{projectName}</h1>
              <p className="mt-2 text-sm leading-6 text-white/55">Solicita acceso para continuar</p>
            </div>

            <form onSubmit={submitEmail} className="space-y-4">
              <label htmlFor="glass-auth-email" className="sr-only">Correo electrónico</label>
              <input
                id="glass-auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
                className="h-14 w-full rounded-2xl border border-white/15 bg-black/20 px-5 text-center text-sm text-white outline-none backdrop-blur-md transition placeholder:text-white/35 focus:border-violet-300/60 focus:bg-white/[0.12] focus:ring-4 focus:ring-violet-400/10"
              />
              <button type="submit" disabled={isSubmitting} className="h-14 w-full rounded-2xl border border-violet-200/30 bg-violet-400/20 px-5 text-sm font-semibold tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_30px_rgba(76,29,149,0.2)] backdrop-blur-xl transition hover:border-violet-200/55 hover:bg-violet-300/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_12px_38px_rgba(124,58,237,0.3)] disabled:cursor-wait disabled:opacity-60">{isSubmitting ? 'PROCESANDO...' : 'SOLICITAR ACCESO'}</button>
            </form>

            <div className="my-7 flex items-center gap-4 text-[0.65rem] tracking-[0.22em] text-white/35"><span className="h-px flex-1 bg-white/10" /><span>O</span><span className="h-px flex-1 bg-white/10" /></div>
            <button type="button" onClick={onGoogleSignIn} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/[0.12] px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] backdrop-blur-xl transition hover:border-white/35 hover:bg-white/[0.2] hover:shadow-[0_10px_30px_rgba(255,255,255,0.08)]"><GoogleIcon />Continuar con Google</button>
          </div>
        </section>
      )}
    </main>
  )
}

export default GlassAuthFlow
