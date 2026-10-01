import { Modal } from './Modal'

export function SupportModal({ onClose }: { onClose: () => void }) {
  const address = 'mochii.support@gmail.com'

  return (
    <Modal title="Contact support" onClose={onClose}>
      <p className="help">
        Contact me for any bugs you want fixed and features that will make yours.db better!
      </p>

      <div className="field">
        <label>Email</label>
        <div className="listrow">
          <input type="text" readOnly value={address} />
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(address)
            }}
          >
            Copy
          </button>
        </div>
      </div>

      <p className="help">I appreciate you reporting. 🩷</p>

      <div className="actions">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}
