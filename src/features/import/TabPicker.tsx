import { problemCount, type TabDraft } from './drafts'

// The tabs of an .xlsx file: tick the ones to import, click one to preview it.
export function TabPicker({
  drafts,
  active,
  disabled,
  onTick,
  onTickAll,
  onView,
}: {
  drafts: TabDraft[]
  active: number
  disabled: boolean
  onTick: (index: number, ticked: boolean) => void
  onTickAll: (ticked: boolean) => void
  onView: (index: number) => void
}) {
  const ticked = drafts.filter((d) => d.ticked).length
  return (
    <div className="field">
      <div className="imptabshead">
        <label>{`Tabs · ${ticked} of ${drafts.length} ticked`}</label>
        <span>
          <button className="ghost" disabled={disabled} onClick={() => onTickAll(true)}>
            Select all
          </button>
          <button className="ghost" disabled={disabled} onClick={() => onTickAll(false)}>
            Clear
          </button>
        </span>
      </div>
      <ul className="imptabs">
        {drafts.map((d, i) => {
          const problems = problemCount(d)
          const rows = d.table?.rows.length ?? 0
          return (
            <li key={d.tab} className={i === active ? 'on' : undefined}>
              <input
                type="checkbox"
                aria-label={`Import ${d.tab}`}
                checked={d.ticked}
                disabled={disabled || d.error !== null}
                onChange={(e) => onTick(i, e.target.checked)}
              />
              <button
                className="imptabname"
                disabled={d.error !== null}
                aria-pressed={i === active}
                onClick={() => onView(i)}
              >
                <span>{d.tab}</span>
                <span className="impmeta">
                  {d.error ?? `${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'}`}
                  {d.ticked && problems > 0 && (
                    <span className="impwarn">{` · ${problems.toLocaleString()} to fix`}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
