// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import '../../test/blob'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Sheet, Workspace } from '../../db'
import type { ImportJob, ImportOutcome } from '../sheets/useSheets'
import { ImportDialog } from './ImportDialog'

const now = '2026-01-01T00:00:00Z'
const ws = (id: string, name: string): Workspace => ({
  id,
  owner_id: 'u1',
  name,
  description: '',
  accent: '#6d5efc',
  position: 1,
  created_at: now,
})
const sheet = (id: string, name: string): Sheet => ({
  id,
  owner_id: 'u1',
  workspace_id: 'w-1',
  name,
  description: '',
  accent: '#6d5efc',
  done_label: 'Done',
  position: 1,
  created_at: now,
})

const csv = () =>
  new File(['Name;Age;Joined\nAna;31;2026-03-04\nBen;27;2026-03-05\n'], 'people.csv', {
    type: 'text/csv',
  })
// People (5 columns, 2 rows), Empty, Notes (1 row).
const xlsx = () =>
  new File([readFileSync(resolve('src/features/import/fixtures/tabs.xlsx'))], 'tabs.xlsx')

function setup(
  importSheets: (wsId: string, jobs: ImportJob[]) => Promise<ImportOutcome> = async (_w, jobs) => ({
    imported: jobs.map((j, i) => sheet(`s-${i}`, j.name)),
    failed: [],
  }),
) {
  const calls = vi.fn(importSheets)
  const onImported = vi.fn()
  const onClose = vi.fn()
  const user = userEvent.setup()
  const view = render(
    <ImportDialog
      workspaces={[ws('w-1', 'Home'), ws('w-2', 'Archive')]}
      defaultWorkspaceId="w-1"
      importSheets={calls}
      onImported={onImported}
      onClose={onClose}
    />,
  )
  const fileInput = view.container.querySelector('input[type=file]') as HTMLInputElement
  return { user, calls, onImported, onClose, upload: (f: File) => user.upload(fileInput, f) }
}

afterEach(() => cleanup())

describe('ImportDialog', () => {
  it('imports a CSV as one sheet named after the file, with guessed types', async () => {
    const { user, upload, calls, onImported, onClose } = setup()
    await upload(csv())

    expect(await screen.findByLabelText('Sheet name')).toHaveValue('people')
    expect(screen.getByLabelText('Type for column Age')).toHaveValue('number')
    expect(screen.getByLabelText('Type for column Joined')).toHaveValue('date')

    await user.click(screen.getByRole('button', { name: 'Import sheet' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [wsId, jobs] = calls.mock.calls[0]
    expect(wsId).toBe('w-1')
    expect(jobs).toHaveLength(1)
    expect(jobs[0].name).toBe('people')
    expect(jobs[0].rows[0]).toEqual({ name: 'Ana', age: 31, joined: '2026-03-04' })
    expect(onImported).toHaveBeenCalledWith('w-1', 's-0')
  })

  it('imports only the ticked tabs, into the chosen workspace', async () => {
    const { user, upload, calls } = setup()
    await user.selectOptions(screen.getByLabelText('Workspace'), 'Archive')
    await upload(xlsx())

    expect(await screen.findByText('Tabs · 2 of 3 ticked')).toBeInTheDocument()
    expect(screen.getByLabelText('Import Empty')).toBeDisabled()
    expect(screen.getByText('This tab is empty.')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Import Notes'))

    await user.click(screen.getByRole('button', { name: 'Import sheet' }))
    await waitFor(() => expect(calls).toHaveBeenCalled())
    const [wsId, jobs] = calls.mock.calls[0]
    expect(wsId).toBe('w-2')
    expect(jobs.map((j) => j.name)).toEqual(['People'])
    expect(jobs[0].rows).toHaveLength(2)
  })

  it('blocks the import until cells that do not fit are dealt with', async () => {
    const { user, upload } = setup()
    await upload(csv())
    await user.selectOptions(await screen.findByLabelText('Type for column Name'), 'number')

    expect(
      screen.getByText(/2 cells do not fit\. Row 1: "Ana" is not a number\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import sheet' })).toBeDisabled()
    expect(screen.getByText('2 cells do not fit their column type.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use text' }))
    expect(screen.getByRole('button', { name: 'Import sheet' })).toBeEnabled()
  })

  it('warns before leaving and cannot be closed while importing', async () => {
    let finish!: (o: ImportOutcome) => void
    const { user, upload, onClose } = setup(() => new Promise((res) => (finish = res)))
    await upload(csv())
    await user.click(await screen.findByRole('button', { name: 'Import sheet' }))

    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect(await screen.findByRole('button', { name: 'Importing…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(leave()).toBe(true)
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()

    finish({ imported: [sheet('s-9', 'people')], failed: [] })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(leave()).toBe(false)
  })

  it('lists failed sheets and retries only those', async () => {
    const { user, upload, calls, onImported, onClose } = setup()
    calls.mockImplementationOnce(async (_w, jobs) => ({
      imported: [sheet('s-1', jobs[0].name)],
      failed: [{ index: 1, name: jobs[1].name, message: 'Could not import "Notes": timeout.' }],
    }))
    await upload(xlsx())
    await user.click(await screen.findByRole('button', { name: 'Import 2 sheets' }))

    expect(await screen.findByText('Could not import "Notes": timeout.')).toBeInTheDocument()
    expect(screen.getByText('Imported into Home: People.')).toBeInTheDocument()
    expect(onImported).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Retry failed sheet' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(calls.mock.calls[1][1].map((j) => j.name)).toEqual(['Notes'])
    // The first sheet that made it in is the one that opens.
    expect(onImported).toHaveBeenCalledWith('w-1', 's-1')
  })

  it('explains files it cannot read', async () => {
    const { upload } = setup()
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    input.removeAttribute('accept')
    await upload(new File(['x'], 'old.xls'))
    expect(await screen.findByText(/Old \.xls files are not supported/)).toBeInTheDocument()
  })
})
