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

## Documents, JD14 and Certificates in the Admin Centre (AdminToolsBridge.gs)

The Admin Centre page `internal/documents.html` runs the existing Document Generator, JD14 Generator and Certificates through the **EasyLatih Management System V2 - STAGING** Apps Script project. Requests are accepted only with a signed-in Supabase admin.

1. In that project, click **+ → Script**, name it `AdminToolsBridge`, and paste in `AdminToolsBridge.gs`.
2. In `Code.gs`, add this as the first line inside `function doPost(e) {`:
   ```js
   if (e && e.parameter && String(e.parameter.action || '').indexOf('adminTools.') === 0) return handleAdminTools_(e);
   ```
3. In `Code.gs`, at the end of `doGet`, replace the final `return HtmlService.createTemplateFromFile("Index")…;` with the version below, so the old dashboard is no longer open to the public:
   ```js
   try {
     assertTrainerAdminAccess_();
   } catch (error) {
     return HtmlService
       .createHtmlOutput('This dashboard has moved to the EasyLatih Admin Centre: <a href="https://www.easylatih.my/admin" target="_top">easylatih.my/admin</a>')
       .setTitle("EasyLatih Admin Dashboard");
   }
   return HtmlService
     .createTemplateFromFile("Index")
     .evaluate()
     .setTitle("EasyLatih Admin Dashboard")
     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
   ```
4. Save, then **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy** so the Web App URL stays the same.
