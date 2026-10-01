import { Brand } from '../Brand'
import { Modal } from './Modal'

export function ProfileModal({
  email,
  dbName,
  since,
  workspaces,
  sheets,
  rows,
  onClose,
}: {
  email: string
  dbName: string
  since: string
  workspaces: number
  sheets: number
  rows: number
  onClose: () => void
}) {
  return (
    <Modal title="Profile" onClose={onClose}>
      <div className="profilehead">
        <span className="avatar big">{(email.trim()[0] ?? '?').toUpperCase()}</span>
        <div>
          <Brand name={dbName} className="profilebrand" />
          <p className="help" style={{ margin: 0 }}>
            {email}
          </p>
        </div>
      </div>

      <dl className="statlist">
        <div>
          <dt>Workspaces</dt>
          <dd>{workspaces}</dd>
        </div>
        <div>
          <dt>Sheets</dt>
          <dd>{sheets}</dd>
        </div>
        <div>
          <dt>Rows</dt>
          <dd>{rows}</dd>
        </div>
        <div>
          <dt>Member since</dt>
          <dd>{since ? since.slice(0, 10) : '—'}</dd>
        </div>
      </dl>

      <p className="help">Your email and password are handled by Supabase Auth.</p>

      <div className="actions">
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
