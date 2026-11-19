import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Field, type FieldDraft, type Record_, type Sheet } from '../../db'
import { keys, patch, patchIfLoaded } from '../../app/cache'
import { useFeedback } from '../../app/feedback'
import { planMove } from '../../reorder'

export function useFields() {
  return useQuery({ queryKey: keys.fields, queryFn: () => api.loadFields() })
}

export function useCreateField() {
  return useMutation({
    mutationFn: (v: { sheetId: string; draft: FieldDraft; position: number; isTitle: boolean }) =>
      api.createField(v.sheetId, v.draft, v.position, v.isTitle),
  })
}

export function useColumnActions(sheet: Sheet | null, sheetFields: Field[], reload: () => void) {
  const qc = useQueryClient()
  const { say } = useFeedback()
  const create = useCreateField()
  const update = useMutation({
    mutationFn: (v: { id: string; draft: FieldDraft }) => api.updateField(v.id, v.draft),
  })
  const remove = useMutation({ mutationFn: (id: string) => api.deleteField(id) })
  const makeTitleM = useMutation({
    mutationFn: (v: { sheetId: string; id: string }) => api.setTitleField(v.sheetId, v.id),
  })

  // One write; the server respaces the columns. A collapsed gap from older data is respaced first.
  const move = useMutation({
    mutationFn: async ({ a, b }: { a: Field; b: Field }) => {
      const spacedBy = (list: { id: string; position: number }[]) =>
        new Map(list.map((p) => [p.id, p.position]))
      let list = sheetFields
      let plan = planMove(list, a.id, b.id)
      if (plan?.kind === 'renumber') {
        const spaced = spacedBy(await api.moveField(a.id, a.position))
        list = list.map((f) => ({ ...f, position: spaced.get(f.id) ?? f.position }))
        plan = planMove(list, a.id, b.id)
      }
      if (plan?.kind !== 'one') return false
      const position = plan.position
      patch<Field>(qc, keys.fields, (fs) => fs.map((f) => (f.id === a.id ? { ...f, position } : f)))
      const spaced = spacedBy(await api.moveField(a.id, position))
      patch<Field>(qc, keys.fields, (fs) =>
        fs.map((f) => (spaced.has(f.id) ? { ...f, position: spaced.get(f.id)! } : f)),
      )
      return true
    },
  })

  async function add(draft: FieldDraft): Promise<boolean> {
    if (!sheet) return false
    const position = sheetFields.reduce((m, f) => Math.max(m, f.position), 0) + 10
    try {
      const created = await create.mutateAsync({
        sheetId: sheet.id,
        draft,
        position,
        isTitle: sheetFields.length === 0,
      })
      patch<Field>(qc, keys.fields, (fs) => [...fs, created])
      say(`Added "${created.name}"`)
      return true
    } catch {
      return false
    }
  }

  async function edit(id: string, draft: FieldDraft): Promise<boolean> {
    try {
      const saved = await update.mutateAsync({ id, draft })
      patch<Field>(qc, keys.fields, (fs) => fs.map((f) => (f.id === id ? saved : f)))
      say('Column saved')
      return true
    } catch {
      return false
    }
  }

  async function destroy(id: string): Promise<boolean> {
    const target = (qc.getQueryData<Field[]>(keys.fields) ?? []).find((f) => f.id === id)
    try {
      await remove.mutateAsync(id)
    } catch {
      return false
    }
    patch<Field>(qc, keys.fields, (fs) => fs.filter((f) => f.id !== id))
    // Mirror the database trigger that strips this column from every row.
    if (target) {
      patchIfLoaded<Record_>(qc, keys.records(target.sheet_id), (rows) =>
        rows.map((r) => {
          if (!(target.key in r.cells)) return r
          const cells = { ...r.cells }
          delete cells[target.key]
          return { ...r, cells }
        }),
      )
    }
    say('Column deleted')
    return true
  }

  async function shift(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= sheetFields.length) return
    const ok = await move
      .mutateAsync({ a: sheetFields[index], b: sheetFields[to] })
      .catch(() => false)
    if (!ok) reload()
  }

  async function makeTitle(id: string) {
    if (!sheet) return
    try {
      await makeTitleM.mutateAsync({ sheetId: sheet.id, id })
    } catch {
      return
    }
    patch<Field>(qc, keys.fields, (fs) =>
      fs.map((f) => (f.sheet_id === sheet.id ? { ...f, is_title: f.id === id } : f)),
    )
  }

  return { add, edit, destroy, shift, makeTitle }
}
