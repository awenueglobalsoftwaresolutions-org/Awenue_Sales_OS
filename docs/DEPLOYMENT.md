# Deployment

Everything below fits the free tiers except Supabase backups (use a paid Supabase plan for production).

## 1. Supabase
1. Create the project and run every file in `supabase/migrations` in order (0001 to 0011).
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


## Gmail setup (one-time, by the Google Cloud project owner)
Each person connects their own Gmail. The app needs a Google OAuth client:

1. Go to console.cloud.google.com and create a project (for example "Awenue Sales OS").
2. APIs & Services > Library: enable the **Gmail API**.
3. APIs & Services > OAuth consent screen: choose **Internal** if your company uses Google Workspace (no review needed, company accounts only). Otherwise choose **External**, fill in the app name and support email, and add the scopes `openid`, `email` and `https://www.googleapis.com/auth/gmail.send`.
4. External apps in "Testing" can have at most 100 test users, and their permissions expire after 7 days. To keep connections alive, publish the app. Google requires a verification review for the `gmail.send` scope (it can take several weeks and needs a privacy policy and a homepage on your domain). Internal Workspace apps skip this.
5. APIs & Services > Credentials > Create credentials > OAuth client ID > **Web application**. Add the authorized redirect URI exactly: `https://<your-worker>.workers.dev/gmail/callback`.
6. Set the Worker configuration in `worker/wrangler.toml`: `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI` (the same callback URL), and `APP_URL` (your site address).
7. Set the secrets:
   ```
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put TOKEN_ENCRYPTION_KEY    # paste the output of: openssl rand -hex 32
   ```
   Keep `TOKEN_ENCRYPTION_KEY` safe. If it changes, everyone must reconnect Gmail, because stored tokens can't be decrypted without the old key.
8. Redeploy the Worker: `npx wrangler deploy`.

Gmail's own sending limits apply: about 500 messages a day for personal accounts and 2,000 for Google Workspace.

## Email environment variables
| Where | Name | Purpose |
|---|---|---|
| Worker var | `GOOGLE_CLIENT_ID` | Google OAuth client |
| Worker var | `GOOGLE_REDIRECT_URI` | Callback URL registered with Google |
| Worker var | `APP_URL` | Where users return after connecting Gmail |
| Worker secret | `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| Worker secret | `TOKEN_ENCRYPTION_KEY` | 64 hex characters; encrypts stored Gmail tokens |
