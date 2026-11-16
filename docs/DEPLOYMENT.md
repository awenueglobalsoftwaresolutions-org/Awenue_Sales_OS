# Deployment

Everything below fits the free tiers except Supabase backups (use a paid Supabase plan for production).

## 1. Supabase
1. Create the project and run every file in `supabase/migrations` in order (0001 to 0009).
2. **Authentication > Providers > Email:** turn **off** "Allow new users to sign up". People are added from Settings > Users.
3. **Authentication > URL Configuration:** set Site URL to your production URL and add `<your URL>/reset-password` to Redirect URLs.
4. **Authentication > Emails:** for invitation emails to work reliably, configure your own SMTP. (The built-in sender is limited to a few emails per hour.)
5. Create your own account (Authentication > Users > Add user, auto-confirm). The first user becomes **Super Admin**.

## 2. Cloudflare Worker (files and user management)
```
cd worker
npm install
npx wrangler login
npx wrangler r2 bucket create awenue-org-files
# edit wrangler.toml: SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS (your production URL)
npx wrangler secret put FILE_SIGNING_SECRET          # long random string
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY    # Supabase > Project Settings > API > service_role
npx wrangler deploy
```
Keep the service-role key out of git and out of the frontend. Add every site URL that will call the Worker to `ALLOWED_ORIGINS` (comma separated), then redeploy.

## 3. Frontend on Cloudflare Pages
1. Push the project to GitHub. In Cloudflare: **Workers & Pages > Create > Pages > Connect to Git**.
2. Build command `npm run build`, output directory `dist`.
3. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` (your Worker URL).
4. `public/_headers` adds security headers and a content security policy; `public/_redirects` makes page links work on refresh. If you use a custom domain for the Worker, add it to `connect-src` in `_headers`.
5. Add the Pages URL to the Worker's `ALLOWED_ORIGINS` and to Supabase's redirect URLs.

(Vercel or Netlify also work: same build command and variables. Copy the headers from `_headers` into their config.)

## 4. After deploying
- Sign in, open Settings > Users, add a teammate, and confirm they only see what their role allows.
- Run through the checklists in the README.
- Re-run `npm test` whenever you change a migration.

## Environment variables
| Where | Name | Purpose |
|---|---|---|
| Frontend | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase project (anon key only) |
| Frontend | `VITE_API_URL` | Worker URL |
| Worker var | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS`, `MAX_UPLOAD_BYTES` | Configuration |
| Worker secret | `FILE_SIGNING_SECRET` | Signs file download links |
| Worker secret | `SUPABASE_SERVICE_ROLE_KEY` | Creating and removing user accounts |
