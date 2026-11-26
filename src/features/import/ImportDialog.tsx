import { useId, useState } from 'react'
import { Modal } from '../../components/Modal'
import type { Sheet, Workspace } from '../../db'
import type { ImportJob, ImportOutcome, ImportProgress } from '../sheets/useSheets'
import { ColumnPreview } from './ColumnPreview'
import { importIssue, openDrafts, setTicked, toJob, type TabDraft } from './drafts'
import { baseName, ImportError, MAX_FILE_BYTES, MAX_ROWS, openFile } from './parse'
import { TabPicker } from './TabPicker'
import { useLeaveWarning } from './useLeaveWarning'

type Failed = { job: ImportJob; message: string }

// Pick a workspace and a file, check the preview, import. Each ticked tab becomes a sheet.
export function ImportDialog({
  workspaces,
  defaultWorkspaceId,
  importSheets,
  onImported,
  onClose,
}: {
  workspaces: Workspace[]
  defaultWorkspaceId: string | null
  importSheets: (
    workspaceId: string,
    jobs: ImportJob[],
    onProgress?: (p: ImportProgress) => void,
  ) => Promise<ImportOutcome>
  onImported: (workspaceId: string, sheetId: string) => void
  onClose: () => void
}) {
  const wsId = useId()
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId ?? workspaces[0]?.id ?? '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<TabDraft[] | null>(null)
  const [active, setActive] = useState(0)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [imported, setImported] = useState<Sheet[]>([])
  const [failed, setFailed] = useState<Failed[]>([])

  useLeaveWarning(running)
  const finished = imported.length > 0 || failed.length > 0
  const locked = running || finished

  async function choose(file: File) {
    setReading(true)
    setReadError(null)
    try {
      const wb = await openFile(file)
      const next = openDrafts(wb)
      // A one-tab workbook is named after the file, not "Sheet1".
      if (next.length === 1) next[0] = { ...next[0], name: baseName(file.name) }
      setDrafts(next)
      setFileName(file.name)
      setActive(
        Math.max(
          0,
          next.findIndex((d) => d.ticked),
        ),
      )
    } catch (e) {
      if (!(e instanceof ImportError)) console.error(e)
      setReadError(e instanceof ImportError ? e.message : "That file couldn't be read.")
    } finally {
      setReading(false)
    }
  }

  function update(index: number, next: TabDraft) {
    setDrafts((ds) => ds && ds.map((d, i) => (i === index ? next : d)))
  }

  async function run(jobs: ImportJob[]) {
    setRunning(true)
    setFailed([])
    let out: ImportOutcome
    try {
      out = await importSheets(workspaceId, jobs, setProgress)
    } catch (e) {
      // importSheets reports per tab; this only catches a bug, so nothing is left locked.
      out = {
        imported: [],
        failed: jobs.map((j, index) => ({ index, name: j.name, message: (e as Error).message })),
      }
    } finally {
      setRunning(false)
      setProgress(null)
    }
    const all = [...imported, ...out.imported]
    setImported(all)
    setFailed(out.failed.map((f) => ({ job: jobs[f.index], message: f.message })))
    if (out.failed.length === 0) finish(all)
  }

  function finish(made = imported) {
    if (made.length > 0) onImported(workspaceId, made[0].id)
    onClose()
  }

  const ticked = drafts?.filter((d) => d.ticked) ?? []
  const issue = drafts ? importIssue(drafts) : null
  const view = drafts?.[active]
  const workspace = workspaces.find((w) => w.id === workspaceId)

  return (
    <Modal
      title="Import a file"
      wide
      locked={running}
      onClose={() => (finished ? finish() : onClose())}
    >
      <div className="field">
        <label htmlFor={wsId}>Workspace</label>
        <select
          id={wsId}
          value={workspaceId}
          disabled={locked}
          onChange={(e) => setWorkspaceId(e.target.value)}
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      {!locked && (
        <label
          className={`dropzone${dragging ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files[0]
            if (file) void choose(file)
          }}
        >
          <input
            type="file"
            accept=".csv,.xlsx"
            disabled={reading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void choose(file)
            }}
          />
          <b>
            {reading
              ? 'Reading file…'
              : fileName
                ? `${fileName} · choose another file`
                : 'Choose a file'}
          </b>
          {!reading && <span> or drop it here</span>}
          <span className="help">
            {`.csv or .xlsx, up to ${MAX_FILE_BYTES / 1024 / 1024} MB and ${MAX_ROWS.toLocaleString()} rows per tab`}
          </span>
        </label>
      )}

      {readError && <div className="alert">{readError}</div>}

      {drafts && !locked && (
        <>
          {drafts.length > 1 && (
            <TabPicker
              drafts={drafts}
              active={active}
              disabled={running}
              onTick={(i, on) => update(i, setTicked(drafts[i], on))}
              onTickAll={(on) => setDrafts(drafts.map((d) => setTicked(d, on)))}
              onView={(i) => {
                setActive(i)
                if (!drafts[i].ticked) update(i, setTicked(drafts[i], true))
              }}
            />
          )}
          {view?.error && drafts.length === 1 && <div className="alert">{view.error}</div>}
          {view?.ticked && (
            <ColumnPreview
              draft={view}
              disabled={running}
              onChange={(next) => update(active, next)}
            />
          )}
        </>
      )}

      {running && progress && (
        <div className="notice" role="status">
          <b>Keep this tab open until the import finishes, or a sheet may be left half-imported.</b>
          <p>
            {`Importing "${progress.name}"${progress.count > 1 ? ` (${progress.index + 1} of ${progress.count})` : ''}: ${progress.rowsDone.toLocaleString()} of ${progress.rowsTotal.toLocaleString()} rows`}
          </p>
          <progress value={progress.rowsDone} max={Math.max(progress.rowsTotal, 1)} />
        </div>
      )}

      {!running && failed.length > 0 && (
        <div className="alert" role="alert">
          {imported.length > 0 && (
            <p>{`Imported into ${workspace?.name ?? 'the workspace'}: ${imported.map((s) => s.name).join(', ')}.`}</p>
          )}
          <p>
            <b>{`${failed.length} ${failed.length === 1 ? 'sheet' : 'sheets'} could not be imported, and nothing from ${failed.length === 1 ? 'it was' : 'them was'} kept:`}</b>
          </p>
          <ul>
            {failed.map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="actions">
        {finished ? (
          <>
            <button disabled={running} onClick={() => finish()}>
              Close
            </button>
            {failed.length > 0 && (
              <button
                className="primary"
                disabled={running}
                onClick={() => void run(failed.map((f) => f.job))}
              >
                {`Retry ${failed.length === 1 ? 'failed sheet' : `${failed.length} failed sheets`}`}
              </button>
            )}
          </>
        ) : (
          <>
            {drafts && issue && <span className="impissue">{issue}</span>}
            <button disabled={running} onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={running || !drafts || issue !== null || !workspaceId}
              onClick={() => void run(ticked.map(toJob))}
            >
              {running
                ? 'Importing…'
                : ticked.length > 1
                  ? `Import ${ticked.length} sheets`
                  : 'Import sheet'}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

export default ImportDialog
