import { useState } from 'react'
import { sendPasswordResetEmail, signOut, type User } from 'firebase/auth'
import { auth } from '../data/firebase'

type AccountActionsProps = {
  user: User
}

export function AccountActions({ user }: AccountActionsProps) {
  const [message, setMessage] = useState<string | null>(null)

  async function requestPasswordChange() {
    if (!user.email) {
      return
    }

    try {
      await sendPasswordResetEmail(auth, user.email, {
        url: window.location.origin,
      })
      setMessage('Enviamos un enlace seguro a tu correo para cambiar la contraseña.')
    } catch {
      setMessage('No pudimos enviar el enlace. Inténtalo nuevamente en unos minutos.')
    }
  }

  return (
    <div className="account-actions">
      <span>{user.email}</span>
      <button type="button" onClick={() => void requestPasswordChange()}>
        Cambiar contraseña
      </button>
      <button type="button" onClick={() => void signOut(auth)}>
        Cerrar sesión
      </button>
      {message && <p>{message}</p>}
    </div>
  )
}
