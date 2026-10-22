import { useEffect, useState } from 'react'
import {
  approveAccessRequest,
  loadAccessRequests,
  rejectAccessRequest,
  type AccessRequest,
} from '../data/accessControl'

type AdminAccessPanelProps = {
  adminUserId: string
}

export function AdminAccessPanel({ adminUserId }: AdminAccessPanelProps) {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function refreshRequests() {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      setRequests(await loadAccessRequests())
    } catch {
      setErrorMessage('No pudimos cargar las solicitudes. Inténtalo nuevamente.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshRequests()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [])

  async function reviewRequest(request: AccessRequest, decision: 'approve' | 'reject') {
    setMessage(null)
    setErrorMessage(null)

    try {
      if (decision === 'approve') {
        await approveAccessRequest(request, adminUserId)
        setMessage(`${request.email} ya puede entrar a la app.`)
      } else {
        await rejectAccessRequest(request, adminUserId)
        setMessage(`Se rechazó la solicitud de ${request.email}.`)
      }

      await refreshRequests()
    } catch {
      setErrorMessage('No pudimos guardar la decisión. Revisa las reglas de Firestore.')
    }
  }

  const pendingRequests = requests.filter((request) => request.status === 'pending')

  return (
    <section className="admin-access-panel" aria-label="Administración de accesos">
      <div className="admin-access-heading">
        <div>
          <p className="section-label">ADMINISTRACIÓN</p>
          <h2>Solicitudes de acceso</h2>
        </div>
        <button type="button" className="admin-refresh-button" onClick={() => void refreshRequests()}>
          Actualizar
        </button>
      </div>

      <p className="admin-access-description">
        Aprueba solamente a las personas que quieras dejar entrar. Las cuentas pendientes y rechazadas no pueden usar el crafting log.
      </p>

      {message && <p className="auth-message">{message}</p>}
      {errorMessage && <p className="error-message">{errorMessage}</p>}

      {isLoading ? (
        <p className="empty-state">Cargando solicitudes…</p>
      ) : pendingRequests.length === 0 ? (
        <p className="empty-state">No hay solicitudes pendientes.</p>
      ) : (
        <ul className="access-request-list">
          {pendingRequests.map((request) => (
            <li key={request.uid}>
              <strong>{request.email}</strong>
              <div>
                <button
                  className="approve-access-button"
                  type="button"
                  onClick={() => void reviewRequest(request, 'approve')}
                >
                  Aprobar
                </button>
                <button
                  className="reject-access-button"
                  type="button"
                  onClick={() => void reviewRequest(request, 'reject')}
                >
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
