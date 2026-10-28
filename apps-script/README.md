# Agent Portal Apps Script

Replace the existing Google Apps Script web-app source with `AgentPortalSecure.gs`, then create a new deployment:

1. Open the Apps Script project linked to the `Agents` and `Prospects` spreadsheet.
2. Replace the contents of `Code.gs` with `AgentPortalSecure.gs`.
3. Save, then select **Deploy → Manage deployments → Edit → New version → Deploy**.
4. Keep the existing Web App URL if Apps Script offers that deployment; otherwise paste the new `/exec` URL into both `internal/agent-dashboard.html` and `internal/admin-dashboard.html`.

The code issues a six-hour session after login. All subsequent requests require that session. Agents may only see and edit their own rows. Duplicate checking remains available to signed-in agents and reports the company, owner, status and state only; it does not disclose another agent’s contact details.

For the admin dashboard, use an account whose `Role` in the `Agents` sheet is `ADMIN` and log in via `agent-dashboard.html` first.

## One login for admins (SupabaseAdminBridge.gs)

Admins no longer need an Agent ID login. A signed-in Admin Centre (Supabase) admin gets an Agent Portal session automatically.

1. In the same Apps Script project as `AgentPortalSecure.gs`, click **+ → Script**, name it `SupabaseAdminBridge`, and paste in `SupabaseAdminBridge.gs`.
2. Save, then **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, so the Web App URL stays the same.
3. Approve the new permission prompt ("Connect to an external service"); the script uses it to check the admin login with Supabase.

Agents keep logging in with their Agent ID and password as before.
