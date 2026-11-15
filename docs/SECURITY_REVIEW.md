# Security review (Awenue Sales OS)

Last reviewed against migrations 0001 to 0007. The database rules are covered by `npm run test:db` (real Postgres) and the Worker rules by `npm run test:worker`.

## What protects the data
| Layer | Control |
|---|---|
| Database | Row level security on every table. All rules use one permission model (`has_permission`, `can_do`) so the frontend cannot grant itself anything. |
| Roles | Super Admin, Admin, Sales Manager, Sales Representative plus custom roles. Permissions are rows in `role_permissions`; the Super Admin role cannot be edited. |
| Record scope | Leads, deals and tasks: *Manage* sees everything; otherwise people see records they own, created, or that belong to their team (`profiles.manager_id`). |
| Assignment | A trigger blocks reassigning records without the Assign permission, even through direct API calls. |
| Profiles | A trigger blocks changing your own role, email, workspace or active flag; only a Super Admin can create or change a Super Admin. |
| Last admin | The database refuses to demote, deactivate or delete the last active Super Admin. |
| Sign-up | Anyone who signs up after the first user starts **inactive** and sees no data until a user manager activates them. Roles are never read from client-supplied metadata. |
| Secrets | Only the anon key is in the browser. The service-role key lives only as a Worker secret and is used only after the caller's permission has been checked in the database. |
| Files | Private R2 bucket, short-lived signed links, names never used in storage keys, uploads authorised by row level security. |
| CSV | Cells starting with `=`, `+`, `-` or `@` are prefixed on export so spreadsheets don't run them as formulas. |

## Findings fixed in this phase
1. **Open sign-up gave data access (high).** With Supabase's default settings anyone could create an account and was added to the workspace as a Sales Executive. New accounts are now inactive until approved. Also turn sign-ups off in Supabase (see DEPLOYMENT.md).
2. **Silent permission failures (medium).** Row level security skips rows you can't change without raising an error, so the app showed a success message. Every update and delete now confirms a row was actually changed.
3. **Admin power was one flag (medium).** Replaced with a permission matrix and escalation guards.
4. **Per-row permission lookups (performance).** Policies now evaluate permissions once per query.

## Known limits (accepted for now)
- `must_change_password` is enforced by the interface only. It is a courtesy for temporary passwords, not a security boundary.
- Supabase's free plan pauses idle projects and has no point-in-time recovery. Use a paid plan for production and enable backups.
- Failed sign-in attempts and IP/device details are not recorded yet. They arrive with the audit module (next phase), which needs the Worker in the login path.
- Rate limiting for public endpoints (website lead capture, webhooks) arrives with those endpoints. Cloudflare WAF rate-limit rules are recommended in front of the Worker.

## Review checklist before go-live
- [ ] Sign-ups disabled in Supabase; the first user is your Super Admin
- [ ] `FILE_SIGNING_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` set as Worker secrets, never committed
- [ ] `ALLOWED_ORIGINS` lists only your real site URL(s)
- [ ] R2 bucket has no public access
- [ ] Supabase Auth redirect URLs list only your real site
- [ ] Backups enabled; tested restore
- [ ] `npm test` passes
