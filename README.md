# Awenue Sales OS — v1.0 MVP

**Status:** Phase 1 (setup, schema, RLS, auth, shell) and Phase 2 (organizations, contacts, leads, org file manager) Phase 3, 4 and enhancement steps 1 (RBAC), 2 (audit, invoices), 3 (invoice design and CRM links) and 4 (email) are done.

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
   - `supabase/migrations/0008_audit.sql` (append-only audit trail, IP/device capture, report queries, retention)
   - `supabase/migrations/0009_invoices.sql` (invoice management, finalization rules, payments, history)
   - `supabase/migrations/0010_invoice_integration.sql` (service prices, deal link, signature, line suggestions, per-record totals)
   - `supabase/migrations/0011_email.sql` (Gmail accounts, email templates, sent-email records linked to CRM records)
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

## Enhancement 2 checklist
- [ ] Run `0008_audit.sql` then `0009_invoices.sql` in the SQL Editor
- [ ] Redeploy the Worker (`cd worker && npx wrangler deploy`): it now handles sign-in (`/auth/login`), audit events and sessions. Set `VITE_API_URL` in `.env`. Audited sign-in (with failed attempts, IP and location) only works through the Worker
- [ ] Reports & Audits: sign out and back in, then open Reports, pick yourself under "Any employee", and the sign-in appears with IP, location and browser
- [ ] Enter a wrong password once and check the failed attempt shows in "All activity"
- [ ] Filter by employee, module, date range, time window and location; the counts in the summary cards update
- [ ] Download a report as CSV, Excel and PDF; confirm all three open correctly with the right data
- [ ] Invoices: create a draft, add five line items, verify the totals match the preview exactly
- [ ] Send the invoice (needs the Approve permission); try editing the bill-to name on a sent invoice — it's blocked
- [ ] Record two payments; the status moves to Partially Paid then Paid
- [ ] Cancel an invoice that has no payments, with a reason
- [ ] Download the PDF; the invoice number, totals and company details are correct
- [ ] Duplicate an invoice; the copy starts as a draft with today's dates
- [ ] Settings > Invoice settings: change the number prefix, create a new invoice, confirm the prefix changed
- [ ] The audit trail on Reports shows all of the above

## Invoice design and CRM connections checklist
- [ ] Run `0010_invoice_integration.sql`
- [ ] Create an invoice and download the PDF: it follows the black-and-white design (Poppins type, black table header and grand-total bar). `npm run sample:invoice` writes `invoice-sample.pdf` from the template for comparison
- [ ] Settings > Invoice settings: upload a signature (PNG with a transparent background works best) and optionally a logo; the Awenue logo from the design is used until you upload one
- [ ] Settings > Services: give a service a default price and tax rate
- [ ] New invoice > Bill to: type two letters of a company, contact or lead; pick one and the name, email, phone and address fill in and the links appear as chips
- [ ] On a line item, start typing a service name; picking it fills the price and tax. Type something you have invoiced before and it suggests the last price
- [ ] Open the organization the invoice is linked to: the **Invoices** tab lists it with billed / paid / outstanding totals. The same list is on its contact, lead and deal pages
- [ ] On an organization, contact, lead or deal, use **New invoice** and see the details pre-filled (a deal brings its service and value)
- [ ] On an invoice with an organization: **Save to files** puts the PDF in the organization's Files > Invoices folder
- [ ] **Preview** opens the PDF before you finalize; a draft shows a DRAFT tag, a paid one PAID, an overdue one OVERDUE

Fonts: Poppins and Public Sans are open-source (SIL Open Font License; licenses in `public/fonts`). The PDF supports Latin text, and the symbols for USD, EUR, GBP and INR; other currencies print their code, for example AED 50.00.

## Email checklist (Gmail, per person)
Set up the Google connection first (see docs/DEPLOYMENT.md > Gmail setup).
- [ ] Run `0011_email.sql`; redeploy the Worker (`cd worker && npx wrangler deploy`) after adding `GOOGLE_CLIENT_SECRET` and `TOKEN_ENCRYPTION_KEY`
- [ ] Settings > Email account: Connect Gmail, approve the Google prompt; your address shows as Connected
- [ ] Add a signature and save it
- [ ] Settings > Email templates: create a shared template with fields such as {{contact.first_name}} and {{invoice.number}}; the preview fills in sample data
- [ ] Contact page > Compose email: the To field is filled from the contact; insert a field from the dropdown; Preview shows the result; Send
- [ ] The sent email appears in the contact's Emails section and in its timeline, with the sender's address
- [ ] Lead, organization and deal pages: send an email; it appears on that record and on the others it is linked to
- [ ] Invoice page > Send invoice by email: the PDF is attached and the invoice history shows "Emailed"
- [ ] Tasks & Follow-ups: use the mail icon on a task; the follow-up sends from your address and appears on the linked contact
- [ ] Sign in as a second person: their mail goes from their own Gmail address, and they cannot see yours unless they can see the record
- [ ] Empty fields block sending with a message naming them; unknown fields are reported too
- [ ] Disconnect Gmail in Settings; sending is refused until you reconnect

Limits to know: replies arrive in each person's normal Gmail (the app can't read the inbox without a much stricter Google review); read and open tracking aren't available from Gmail; the hourly limit is 200 emails per person, and Gmail's own daily limits also apply.

## Projects & support tickets
Migration: `supabase/migrations/0018_projects_and_tickets.sql` (run it after 0017).

- **Projects** belong to a client organization. Creating one copies the workspace's stage templates (Requirement Gathering → Deployment) into the project. Admins with `projects.manage` edit those templates on the Projects page ("Stages").
- **Progress** is the share of stages marked done, calculated by the database. Every status and stage change is written to the project's update log, which can't be edited.
- **Reminders** have a title, description, due date, assignee, priority and completion status.
- **Support tickets** are raised against a project and must match its client. Categories: bug report, technical issue, feature request, enhancement request, UI/UX issue, general query, other. A ticket can't be resolved without a resolution, and closing needs `tickets.approve`. Assignment needs `tickets.assign`.
- **History** of tickets is append-only. Projects and tickets are also in the audit trail.
- Permissions: `projects.*` and `tickets.*` are granted to the existing roles (Super Admin and Admin: all; Sales Manager: everything except nothing else; Sales Representative: view, create and edit). Adjust them on Settings > Roles & permissions.

### Projects & tickets checklist
- [ ] Projects > New project: pick a client, the project gets seven stages
- [ ] Stages tab: change a stage to done and record the work completed; progress updates
- [ ] Updates tab: post a progress update and a remark; status changes appear automatically
- [ ] Reminders tab: add a reminder with a due date, mark it done
- [ ] Organization > Projects tab lists the client's projects and tickets
- [ ] Support tickets > Raise ticket: an issue against a project; it appears in the project's tickets tab
- [ ] Ticket: set status, assign, resolve with a resolution, then close (needs the Approve permission)
- [ ] A Sales Representative can't close tickets or delete projects

## Notifications, remarks, deal → project
Migration: `supabase/migrations/0019_notifications_remarks_conversion.sql` (run after 0018).

- **Notifications** are created by the database when a ticket is assigned, a remark is posted, a ticket's status changes, or a project, reminder, task or deal is assigned to someone. People are never notified about their own actions. Each person can switch off any type (bell icon > settings).
- **Live delivery:** new notifications appear in the bell instantly and as a toast while the CRM is open. Turn on browser alerts from the bell to also get a system notification. Realtime needs `supabase_realtime` enabled for the project (on by default in Supabase).
- **Remarks** can be added to any ticket. They're append-only, notify the assignee and the creator, and appear in the ticket's timeline with the history.
- **Stages** on a project are shown left to right, like the pipeline.
- **Deal → project:** a deal with an organization gets a "Convert to project" button. The client, team and service carry over, and the standard stages are added. A deal converts only once, and the deal links to its project.
- **Tickets** appear in each organization's overview and in a "Delivery & Support" section of the dashboard.

### Checklist
- [ ] Assign a ticket to someone else: they get a bell notification and a toast within seconds
- [ ] Add a remark to a ticket: the assignee and the creator are notified, the author isn't
- [ ] Turn "Ticket status changes" off in notification settings: those stop for you only
- [ ] Notifications page: filter unread, open an item (it's marked read and takes you to the record)
- [ ] Deal with an organization > Convert to project: the project has seven stages, shown left to right
- [ ] Deal without an organization shows a clear message that it needs a client first
- [ ] Organization overview shows its support tickets; the dashboard shows open tickets and projects in progress
