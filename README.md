# Awenue Sales OS — v1.0 MVP

**Status:** Phase 1 (setup, schema, RLS, auth, shell) and Phase 2 (organizations, contacts, leads, org file manager) Phase 3 (deals, pipeline, tasks) and Phase 4 (activities, dashboard, search, CSV, settings) are done.

## Setup
1. `npm install`
2. Create a Supabase project. In the SQL Editor run, in order:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_phase2.sql` (Phase 2: priority sorting, safe org delete, lead conversion)
   - `supabase/migrations/0004_org_files.sql` (organization file manager)
   - `supabase/migrations/0005_phase3.sql` (Phase 3: deal stage dates + history, task completion)
   - `supabase/migrations/0006_phase4.sql` (Phase 4: dashboard statistics, last-admin protection)
   - `supabase/migrations/0007_rbac.sql` (roles & permissions, richer profiles, safe sign-up, avatars)
3. `cp .env.example .env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only).
4. Supabase > Authentication > URL Configuration: set Site URL to `http://localhost:5173` and add `http://localhost:5173/reset-password` to Redirect URLs.
5. Supabase > Authentication > Users > Add user (email + password, tick "Auto confirm").
   **The first user created becomes Super Admin** and the workspace is created automatically. Everyone after that is added from **Settings > Users** (needs the Worker, below). Anyone else who signs up starts inactive.
   Also turn off "Allow new users to sign up" in Supabase > Authentication > Providers > Email.
6. `npm run dev` and sign in at http://localhost:5173.

## Phase 1 checklist
- [ ] Signing in with wrong password shows an error; correct one lands on the dashboard
- [ ] Refreshing the page keeps you signed in
- [ ] Opening `/leads` while signed out redirects to `/login`
- [ ] "Forgot password" email arrives and the link opens `/reset-password`
- [ ] Sidebar collapses/expands (and remembers), works as a drawer on mobile
- [ ] Quick add, notifications, settings shortcut and account menu open; Sign out works
- [ ] In SQL Editor: `select count(*) from services;` returns 8, `select role from profiles;` returns `admin` for the first user

## Notes
- A `workspaces` table was added to the eight spec tables to carry organization-based ownership.
- RLS: Admin/Sales Manager see all workspace records; Sales Executives see leads, deals and tasks they own or created.
- Never put the Supabase service-role key in this project.

## Phase 2 checklist
- [ ] Add an organization; adding the same name again shows a duplicate error
- [ ] Add a contact linked to it; add a lead linked to it
- [ ] Search, filter and sort on each list; pagination appears after 10 records
- [ ] Deleting an organization that has a contact/lead is blocked with a clear message
- [ ] On a lead: change status (a history entry appears), log a call/note
- [ ] Set a lead to Qualified, click Convert to deal: a contact and a deal are created, the lead shows Converted, and converting again is blocked
- [ ] Sign in as a second user (Sales Executive) and confirm they only see their own leads

## Cloudflare Worker (files + user management)
The Worker now also creates and removes user accounts, so it needs one more secret: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. In the frontend `.env` the variable is now `VITE_API_URL` (`VITE_FILES_API_URL` still works). See `docs/DEPLOYMENT.md`.

## File storage (Cloudflare R2 + Workers, free tier)
Each organization has a **Files** tab with folders and uploads. Metadata is in Supabase (`org_items`); the file bytes live in a private Cloudflare R2 bucket, reached only through a Worker that checks the user's Supabase login.

1. Run `supabase/migrations/0004_org_files.sql` in the Supabase SQL Editor.
2. Cloudflare dashboard > **R2 Object Storage** > enable R2 (a payment method is required to activate it; the free allowance is 10 GB storage, 1M writes and 10M reads per month, no egress fees).
3. In the `worker/` folder: `npm install`, then `npx wrangler login`.
4. `npx wrangler r2 bucket create awenue-org-files` (keep the bucket private; do not enable public access).
5. Edit `worker/wrangler.toml`: set `SUPABASE_URL`, `SUPABASE_ANON_KEY` (anon key only) and `ALLOWED_ORIGINS` (your site URL; add the production URL later).
6. Create the signing secret: `npx wrangler secret put FILE_SIGNING_SECRET` and paste a long random string (for example the output of `openssl rand -hex 32`).
7. `npx wrangler deploy`. Copy the `https://awenue-files-api.<you>.workers.dev` URL into the project `.env` as `VITE_FILES_API_URL`, then restart `npm run dev`.

Limits: 50 MB per file (the Workers free plan allows up to 100 MB request bodies; change `MAX_UPLOAD_BYTES` and `MAX_UPLOAD_MB` together if needed), 100,000 Worker requests per day. Download links are signed and expire after 5 minutes. Organizations that still contain files or folders can't be deleted.

### Files checklist
- [ ] Create a folder, open it, create a subfolder; the breadcrumb navigates back
- [ ] Upload several files at once and by drag and drop; progress bars show
- [ ] PDFs and images open in a new tab; other files download
- [ ] Rename a file and a folder; duplicate names in the same folder are rejected
- [ ] Delete a folder: everything inside disappears (check the R2 bucket is empty too)
- [ ] A Sales Executive can see and add files but can't delete files uploaded by others

## Phase 3 checklist
- [ ] Add a deal; edit it; filter the Deals list by stage, salesperson, service and closing date
- [ ] Open the Pipeline: drag a card to another column, refresh the page, and it stays there
- [ ] Column headers show a count and the total value (per currency)
- [ ] Drag a card to Lost: a reason is required; Won sets the won date; the deal page history shows each stage change
- [ ] On a touch device (or without dragging) use the stage menu on a card
- [ ] Add tasks from Tasks and from a lead/deal page; complete one with the circle button and see it in the history
- [ ] A task with a past due date is highlighted red with an Overdue badge; the summary cards filter the list
- [ ] Convert a qualified lead, then open the new deal from the lead page

## Phase 4 checklist
- [ ] Dashboard: all 10 numbers match what the lists show; with an empty database it shows the welcome message
- [ ] Charts render (lead acquisition, deal conversion, pipeline by stage); recent activities, upcoming tasks and recent leads link to records
- [ ] Top-bar search finds leads, organizations, contacts and deals; arrow keys and Enter work
- [ ] Activities page: filter by type and person, log an activity against a lead/contact/organization/deal
- [ ] CSV: download a template, import it (map columns, see duplicates/errors, download the report), then export with a filter applied
- [ ] Settings: edit your profile, change your password, (admin) add/turn off a service, change a user's role, rename the company
- [ ] Trying to demote or deactivate the only admin is refused

## Tests
`npm test` runs two suites with no external services needed:
- `npm run test:db` applies every migration to an in-process Postgres and checks roles, permissions, record scope, assignment rules, profile guards, lead conversion, deal and task history, files and the last-Super-Admin rule.
- `npm run test:worker` checks the Worker's user-management rules against a simulated Supabase.

## Roles & permissions checklist
- [ ] Run `0007_rbac.sql`. Your existing admin is now **Super Admin**; other roles keep the same access as before
- [ ] Settings > Roles & permissions: pick a role, change a permission, save; sign in as someone with that role to confirm
- [ ] Settings > Users: add a user (invite email or temporary password), change their role and team lead, deactivate and reactivate them, send a password reset
- [ ] A Sales Representative only sees their own leads, deals and tasks, can't reassign them, and has no Delete buttons for organizations or contacts
- [ ] A new user who signs up on their own is inactive until you activate them
- [ ] Settings > Profile: upload a picture, change job title and time zone
- [ ] The only Super Admin can't be demoted, deactivated or removed
