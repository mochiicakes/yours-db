# yours.db

Your data, your words. Organised, personal, comfy to live in.

A small database you design yourself. Make a **sheet**, decide its **columns**
and what type each one is, then add **rows**. Tick rows off like a checklist,
select a bunch at once and act on all of them together.

Baserow or Airtable, minus the parts you would never use.

---

## Setup (about ten minutes)

### 1. Unzip and install

```bash
cd mochii-db
npm install
```

### 2. Make a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a project. Free tier
is plenty. Pick the region nearest you. Keep the database password somewhere
safe — it is not recoverable.

### 3. Run the database setup

Open **SQL Editor** in the Supabase dashboard, paste in the whole of
`schema.sql`, and run it. One file, once.

If you ever had an earlier version of this app, run these three lines first.
 Otherwise, `create table if not exists` can silently skip a table whose shape is
wrong, leaving you with something that looks right and is not:

```sql
drop table if exists public.items       cascade;
drop table if exists public.collections cascade;
drop table if exists public.workspaces  cascade;
```

Supabase will warn about *destructive operations* and *tables without RLS*.
Both are expected: the destructive lines are `drop trigger if exists` guards so
the file can be re-run, and Row Level Security is switched on at the bottom of
that same file. Choose **Run and enable RLS**. it is fail-closed and cannot
conflict.

Then confirm it worked, rather than assuming:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public'
 order by tablename;
```

Five rows: `fields`, `profiles`, `records`, `sheets`, `workspaces` all with
`rowsecurity = true`.

### 4. Connect the app

In Supabase: **Settings → API Keys**. Copy the **Project URL** and the
**Publishable key** (starts `sb_publishable_`; on older projects it is called
the *anon public* key. It's same thing).

```bash
cp .env.example .env.local
```

Paste both into `.env.local`. Then:

```bash
npm run dev
```

Open http://localhost:5173.

> The publishable key is *meant* to be public. It ships inside the JavaScript
> every visitor downloads. Row Level Security is what protects your data, not
> key secrecy. Never put a **secret** key (`sb_secret_`) or `service_role` key
> in this file: those bypass RLS entirely.

### 5. Make an account, then name your database

Click **Create account**, enter an email and a password. Supabase emails a
confirmation link by default; open it, then sign in.

The first time you sign in you get one screen: *It's yours, name your db.* Type
a name, watch the `.db` sit beside it, and pick the colour of its full stop.
Nothing here is permanent. The account menu (top right) → **Settings** can change
all of it later.

Want to skip the confirmation email while you are testing? Supabase →
**Authentication → Providers → Email** → turn off *Confirm email*. Turn it back
on before anyone else uses this.

Once your account exists, go to **Authentication → Providers** and turn off
*Allow new users to sign up* if you want to be the only account that can exist.

### 6. Deploy (optional)

```bash
npm run build      # dist/ — plain static files, no server needed
```

Push to GitHub, import at vercel.com, add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_KEY` as environment variables.

**The step everyone forgets:** afterwards, go back to Supabase →
**Authentication → URL Configuration** and add your live URL to *Site URL* and
*Redirect URLs*. Confirmation links will not work until you do.

---

## How it works

```
your database
  └── workspace ─── sheet ─┬─ fields    the columns, each typed
                           └─ records   the rows
```

**Workspaces** are the top level and live in the right-hand sidebar, which
collapses to a rail of colour dots. Pick one and the middle column lists its
sheets (may it be a list, one row each, not a grid of cards), open a sheet and the table
takes over.

The **database name** is yours, and the full stop in it takes your accent
colour. That period is the one piece of identity carried through every screen,
so it is the first thing onboarding shows you. Only the part you type is
stored. The `.db` is for display only and is never saved, so it cannot be deleted by accident
or typed twice.

**Projects** group related workspaces. One per client, subject, or whatever aspect 
all in your own terms. **Workspaces** hold sheets that belong together. Open a project to see its
workspaces, open a workspace to see its sheets. The path at the top is
clickable, so getting back up is one click.

Renaming happens inline on the card, not in a dialog. Deleting cascades all the
way down, and says so before it does.

### Column types

| Type | Holds | In the table |
|---|---|---|
| Text | one line | plain |
| Long text | a paragraph | plain, wider column |
| Number | a number | right-aligned, tabular figures |
| Checkbox | yes / no | ✓ or – |
| Date | a calendar date | a date picker when editing |
| Single choice | one of your options | coloured pill |
| Multiple choice | several options | coloured pills |
| Link | a URL | clickable, shortened |

One column per sheet is the **title** (marked ★) that is what a row is called
in confirmation dialogs and elsewhere. Change it with ☆ in **Columns**.

Every sheet also has a built-in **checklist column**, separate from your own
columns, and you name what ticking it means: Done, Read, Packed, Filmed. It is
what the group actions and the strike-through use.

### Rows and group actions

Every row shows its number. **Hover the number and it becomes a checkbox.**
Click one, then **shift-click** another to take the whole range in between. The
header checkbox takes everything currently on screen — which respects your
search, so it cannot quietly grab rows you cannot see.

Select anything and a bar appears, always leading with the count:

- Mark / unmark the checklist column
- Duplicate
- Set a single-choice column across every selected row
- Delete

### Appearance

Click your avatar, top right: **Profile**, **Settings**, **Contact support**,
**Sign out**. Settings renames the database and sets the look with five themes
(Dawn, Slate, Forest, Paper, Mist) and an accent colour, eight presets or
anything from the picker.

**Dawn** is the default and is the original palette exactly: aubergine ground,
violet panels, plum keylines, orange accent. The typeface is Rubik rather than
the original monospace. The uppercase micro-labels and letter spacing are what
carried that feel, and those are kept.

The choice-pill colours are generated from your accent by rotating its hue, so
they always suit whatever you choose instead of clashing with it. Text on the
accent flips between black and white based on perceived brightness, so a yellow
accent stays readable.

Theme and accent are saved per device and read before the first paint, so there
is no flash of the wrong colours. The database name is saved to your account,
because it is not a device preference.

---

## Things worth knowing

**Types are enforced by the database, not just the form.** The
`validate_cells` trigger in `schema.sql` reads your column definitions on every
write and rejects anything that does not fit — including values for columns
that do not exist. The checks in `db.ts` are a copy of the same rules, there so
you get a readable message in the form instead of a database error after a
round trip. If they ever disagree, the database wins.

**Changing a column's type can invalidate stored data.** The app warns you when
you do it. Nothing is deleted; rows holding values that no longer fit will
refuse to save until you fix them.

**Deleting a column clears its data from every row.** That happens in a
database trigger, so it cannot leave orphaned values behind. It is not undoable.

**It needs a connection.** No offline mode. Ticking a checkbox is optimistic so
it feels instant, and a failure rolls back visibly with the reason — but a cold
load with no network fails.

**Two devices do not live-update each other.** Edit on your phone and an open
laptop tab will not know until you reload.

**Rows keep the order they were added.** There is a `position` column and no
drag-to-reorder UI yet.

**Group "set column" writes one request per row.** Marking and deleting are
single requests for any number of rows. Fine at a few hundred; slow at tens of
thousands.

**Free tier pauses** after roughly a week of no activity. It wakes when you
visit; the first load is slow.

---

## What is verified

Strict TypeScript compiles with no errors and the production build succeeds.
`schema.sql` parses against the real Postgres grammar (36 statements). Every
screen was rendered server-side to catch crash-on-render bugs. Onboarding in
both its normal and saving states, settings with the rename field, the group
action bar at zero, one and two selected rows. The sign-in
screen, the table with all nine column types including an entirely empty row,
the table with no columns at all, the row editor in both new and editing modes,
the column manager, sheet settings and the theme picker. The value engine has
unit tests covering coercion, validation, blank-stripping, row titles, search
and column-key generation, including the cases that bite: `0` and `false` are
values rather than blanks, a key generated from "Ünïcödé Näme" still matches the
database's `^[a-z0-9_]+$` constraint, and duplicate names get suffixed.

The account dropdown is only render-tested closed. Its four items appear on
click, and a server render cannot click.

**Not verified:** nothing has run against a live Supabase project. The RLS
policies, the trigger's runtime behaviour, and email/password signup are careful
applications of documented patterns, not empirical results. The plpgsql inside
the trigger functions cannot be checked by a SQL parser, only the statements
around it were.

If something fails on first run, the two most likely causes are the environment
variables (restart `npm run dev` after editing `.env.local`. Vite only reads it
at startup) and the Site URL configuration in step 6.

---

## Files

```
schema.sql          the entire database: five tables, triggers, security
index.html          loads Rubik
src/db.ts           types, Supabase client, every database call
src/theme.ts        themes, accent handling, generated pill colours
src/App.tsx         sign-in, onboarding gate, layout, all state
src/Onboarding.tsx  first-run screen: name your db
src/Brand.tsx       the name.db mark and its accent full stop
src/UserMenu.tsx    account dropdown
src/Shell.tsx       workspace sidebar and the sheet list
src/Sheet.tsx       the table: numbered rows, selection, group bar
src/Editors.tsx     row editor, column manager, sheet settings, appearance
src/styles.css      all styling, built on theme variables
src/main.tsx        entry point
```
