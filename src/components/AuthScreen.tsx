import { useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import appLogo from '../assets/roadmap-logo.png'
import { auth } from '../data/firebase'

type AuthMode = 'sign-in' | 'sign-up' | 'reset'

function getAuthErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code)
      : ''

  if (code === 'auth/email-already-in-use') {
    return 'Ya existe una cuenta con este correo.'
  }

  if (code === 'auth/invalid-credential') {
    return 'El correo o la contraseña no son correctos.'
  }

  if (code === 'auth/too-many-requests') {
    return 'Demasiados intentos. Espera un momento antes de volver a intentarlo.'
  }

  if (code === 'auth/weak-password') {
    return 'La contraseña no cumple los requisitos de seguridad.'
  }

  return 'No pudimos completar la solicitud. Inténtalo nuevamente.'
}

function isStrongPassword(password: string) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setPassword('')
    setMessage(null)
    setErrorMessage(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setErrorMessage(null)

    if (mode === 'sign-up' && !isStrongPassword(password)) {
      setErrorMessage(
        'Usa al menos 12 caracteres, con mayúscula, minúscula, número y símbolo.',
      )
      return
    }

    setIsSubmitting(true)

    try {
      if (mode === 'sign-in') {
        const credential = await signInWithEmailAndPassword(auth, email, password)
        await credential.user.reload()

        if (!credential.user.emailVerified) {
          await signOut(auth)
          setErrorMessage(
            'Confirma primero el enlace enviado a tu correo antes de iniciar sesión.',
          )
        }
      }

      if (mode === 'sign-up') {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        )

        await sendEmailVerification(credential.user, {
          url: window.location.origin,
        })
        await signOut(auth)
        setPassword('')
        setMode('sign-in')
        setMessage(
          'Cuenta creada. Revisa tu correo y confirma el enlace antes de iniciar sesión.',
        )
      }

      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email, {
          url: window.location.origin,
        })
        setMessage(
          'Si existe una cuenta asociada, recibirás un correo con los pasos para restablecer la contraseña.',
        )
      }
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isResetMode = mode === 'reset'

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label="Acceso a Roadmap to Crafting Log">
        <img
          className="auth-logo"
          src={appLogo}
          alt="Emblema de Roadmap to Crafting Log"
        />
        <p className="eyebrow">FINAL FANTASY XIV</p>
        <h1>Roadmap to Crafting Log</h1>
        <p className="auth-intro">
          Guarda tu progreso de crafting en una cuenta protegida.
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Acceso">
          <button
            className={mode === 'sign-in' ? 'active' : ''}
            type="button"
            onClick={() => changeMode('sign-in')}
          >
            Iniciar sesión
          </button>
          <button
            className={mode === 'sign-up' ? 'active' : ''}
            type="button"
            onClick={() => changeMode('sign-up')}
          >
            Crear cuenta
          </button>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Correo electrónico
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          {!isResetMode && (
            <label>
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                minLength={mode === 'sign-up' ? 12 : undefined}
                required
              />
            </label>
          )}

          {mode === 'sign-up' && (
            <p className="password-requirements">
              Mínimo 12 caracteres: mayúscula, minúscula, número y símbolo.
            </p>
          )}

          {message && <p className="auth-message">{message}</p>}
          {errorMessage && <p className="error-message">{errorMessage}</p>}

          <button className="auth-submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Procesando…'
              : mode === 'sign-in'
                ? 'Entrar'
                : mode === 'sign-up'
                  ? 'Crear cuenta segura'
                  : 'Enviar enlace de recuperación'}
          </button>
        </form>

        {mode !== 'reset' && (
          <button
            className="auth-link-button"
            type="button"
            onClick={() => changeMode('reset')}
          >
            ¿Olvidaste tu contraseña?
          </button>
        )}

        {mode === 'reset' && (
          <button
            className="auth-link-button"
            type="button"
            onClick={() => changeMode('sign-in')}
          >
            ← Volver a iniciar sesión
          </button>
        )}
      </section>
    </main>
  )
}
