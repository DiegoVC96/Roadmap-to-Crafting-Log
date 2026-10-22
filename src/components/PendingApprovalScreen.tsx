import { signOut, type User } from 'firebase/auth'
import appLogo from '../assets/roadmap-logo.png'
import { auth } from '../data/firebase'

type PendingApprovalScreenProps = {
  user: User
  wasRejected: boolean
}

export function PendingApprovalScreen({
  user,
  wasRejected,
}: PendingApprovalScreenProps) {
  return (
    <main className="auth-page">
      <section className="auth-card access-status-card">
        <img
          className="auth-logo"
          src={appLogo}
          alt="Emblema de Roadmap to Crafting Log"
        />
        <p className="eyebrow">SOLICITUD DE ACCESO</p>
        <h1>{wasRejected ? 'Acceso no aprobado' : 'Cuenta pendiente'}</h1>
        <p className="auth-intro">
          {wasRejected
            ? 'El administrador no aprobó esta solicitud. Si crees que se trata de un error, contáctalo para que la revise.'
            : 'Tu correo fue verificado. Ahora el administrador debe aprobar tu cuenta antes de que puedas entrar al crafting log.'}
        </p>
        <p className="access-account">{user.email}</p>
        <button
          className="auth-link-button"
          type="button"
          onClick={() => void signOut(auth)}
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  )
}
