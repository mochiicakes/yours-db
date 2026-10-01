# yours.db

[![CI](https://github.com/mochiicakes/yours-db/actions/workflows/ci.yml/badge.svg)](https://github.com/mochiicakes/yours-db/actions/workflows/ci.yml)

Your data, your words. Organised, personal, comfy to live in.

A small database you design yourself. Make a **sheet**, decide its **columns**
and what type each one is, then add **rows**. Tick rows off like a checklist,
select a bunch at once and act on all of them together.

Baserow or Airtable, minus the parts you would never use.

---

## Setup (about ten minutes)

### 1. Clone and install

```bash
git clone https://github.com/mochiicakes/yours-db.git
cd yours-db
npm install
npm test           # unit tests for the value engine and row reordering
```

### 2. Make a Supabase project

Sign up at [supabase.com](https://supabase.com) and create a project. Pick the region nearest you.

### 3. Create the database

The schema lives in `supabase/migrations/`, applied with the Supabase CLI
(installed by `npm install`; run it with `npx supabase`).

**Your Supabase project.** Link it once (find the project ref in the dashboard
URL), then push every migration:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

**A local copy, for development** (needs Docker running):

```bash
npx supabase start      # local Postgres, API and auth; prints a URL and keys
npx supabase db reset   # rebuild the local database from the migrations
```

With the local copy running, `npm run test:db` runs the database tests in
`supabase/tests/`: row level security between two users, share links, and the
column-type checks.

To work against the local copy, put the printed `API_URL` and
`PUBLISHABLE_KEY` in `.env.local` (step 4) instead of the hosted ones.

Then confirm it worked, rather than assuming:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public'
 order by tablename;
```

Six rows: `fields`, `profiles`, `records`, `shares`, `sheets`, `workspaces`,
all with `rowsecurity = true`.

### 4. Connect the app

In Supabase: **Settings → API Keys**. Copy the **Project URL** and the
**Publishable key** (starts `sb_publishable_`; on older projects it is called
the _anon public_ key. It's same thing).

```bash
cp .env.example .env.local
```

Paste both into `.env.local`. Then:

```bash
npm run dev
```

Open http://localhost:5173.

> The publishable key is _meant_ to be public. It ships inside the JavaScript
> every visitor downloads. Row Level Security is what protects your data, not
> key secrecy. Never put a **secret** key (`sb_secret_`) or `service_role` key
> in this file: those bypass RLS entirely.

### 5. Make an account, then name your database

Click **Create account**, enter an email and a password. Supabase emails a
confirmation link by default; open it, then sign in.

The first time you sign in you get one screen: _It's yours, name your db._ Type
a name, watch the `.db` sit beside it, and pick the colour of its full stop.
Nothing here is permanent. The account menu (top right) → **Settings** can change
all of it later.

Want to skip the confirmation email while you are testing? Supabase →
**Authentication → Providers → Email** → turn off _Confirm email_. Turn it back
on before anyone else uses this.

Once your account exists, go to **Authentication → Providers** and turn off
_Allow new users to sign up_ if you want to be the only account that can exist.

### 6. Deploy (optional)

```bash
npm run build      # dist/ — plain static files, no server needed
```

Push to GitHub, import at vercel.com, add `VITE_SUPABASE_URL` and
`VITE_SUPABASE_KEY` as environment variables.

**The step everyone forgets:** afterwards, go back to Supabase →
**Authentication → URL Configuration** and add your live URL to _Site URL_ and
_Redirect URLs_. Confirmation links will not work until you do.

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

**Workspaces** hold sheets that belong together: one per client, subject, or
whatever aspect of your life, in your own terms. Deleting cascades all the way
down, and says so before it does.

### Column types

| Type            | Holds               | In the table                   |
| --------------- | ------------------- | ------------------------------ |
| Text            | one line            | plain                          |
| Long text       | a paragraph         | plain, wider column            |
| Number          | a number            | right-aligned, tabular figures |
| Checkbox        | yes / no            | ✓ or –                         |
| Date            | a calendar date     | a date picker when editing     |
| Single choice   | one of your options | coloured pill                  |
| Multiple choice | several options     | coloured pills                 |
| Link            | a URL               | clickable, shortened           |

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

### Sharing

**Share** on a sheet or a workspace creates a link anyone can open without
signing in. Links are **read-only**: visitors see the rows and columns, and
cannot change anything. A link can **expire** after 7, 30 or 90 days, or never.
**Revoke** kills a link immediately and permanently; it cannot be re-enabled.
Visitors read only through the `get_shared` database function, which refuses
revoked and expired tokens and returns only what the token points at.

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
`validate_cells` trigger in the database reads your column definitions on every
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

**Rows can be dragged to reorder.** A move writes one row's `position` (the
midpoint of its new neighbours). When repeated drops in one spot run out of
room, the sheet is respaced server-side by `renumber_sheet` and the move retried.

**Multi-step changes are all-or-nothing.** Group actions (mark, set a column,
duplicate, delete) are one request for any number of rows. Setting a column,
duplicating a sheet, changing the title column and moving a column each run as
one database function in one transaction, so a failure part-way changes
nothing. If one selected row rejects a value, no row is changed.

**Free tier pauses** after roughly a week of no activity. It wakes when you
visit; the first load is slow.

---

## What is verified

`npm run typecheck` (strict TypeScript), `npm test` and `npm run build` all
pass. `npm test` runs:

- `src/values.test.ts`: the value engine. Coercion, validation, blank-stripping,
  row titles, search text and column-key generation, including the cases that
  bite: `0` and `false` are values rather than blanks, "Ünïcödé Näme" becomes
  `unicode_name`, a name with no latin letters falls back to `field`, and
  duplicate names get suffixed.
- `src/reorder.test.ts`: every drag direction lands exactly where dnd-kit shows
  it, and 300 drops into one gap stay in order, renumbering when room runs out.

`npm run test:db` (local Supabase, needs Docker) runs
`supabase/tests/rls.test.sql` with pgTAP: for two users, each table refuses
select, update and delete of the other's rows; nothing can be attached to the
other's workspace or sheet, including share links; a forged `owner_id` is
refused; anon reads nothing; `get_shared` refuses revoked and expired tokens
and returns only what a token points at; `validate_cells` rejects a wrong type,
an unknown column and a missing required value.

**Not verified by the tests:** anything that needs the live Supabase project or
a browser, such as email/password signup and the UI itself.

If something fails on first run, the two most likely causes are the environment
variables (restart `npm run dev` after editing `.env.local`. Vite only reads it
at startup) and the Site URL configuration in step 6.

---

## Files

```
supabase/migrations the entire database: six tables, triggers, security
supabase/config.toml  local Supabase settings (`npx supabase start`)
index.html          loads Rubik
src/db.ts           Supabase client, row types, every database call
src/values.ts       column types and value helpers (no Supabase; unit-tested)
src/reorder.ts      where a dragged row lands (unit-tested)
src/theme.ts        themes, accent handling, generated pill colours
src/App.tsx         sign-in, onboarding gate, layout, all state
src/Onboarding.tsx  first-run screen: name your db
src/Brand.tsx       the name.db mark and its accent full stop
src/UserMenu.tsx    account dropdown
src/Shell.tsx       workspace sidebar and the sheet list
src/Sheet.tsx       the table: numbered rows, selection, group bar
src/Editors.tsx     row editor, column manager, sheet settings, appearance
src/ShareModal.tsx  create, copy and revoke share links
src/Shared.tsx      the read-only page a share link opens
src/ResetPassword.tsx  password reset flow
src/styles.css      all styling, built on theme variables
src/main.tsx        entry point
```
