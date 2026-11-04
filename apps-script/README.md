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

## Prospect Pool (ProspectPool.gs)

Daily pool of new companies for agents: first agent to press **Ambil** gets the company, 10 per agent per day, then fills in the PIC. Prospects not contacted within 3 days of being taken, or with no activity for 30 days, go back to the pool (Quotation Sent, HRD Application, Registered and Not Interested are never released; 7-day grace at launch).

1. In the same Apps Script project as `AgentPortalSecure.gs`, click **+ → Script**, name it `ProspectPool`, and paste in `ProspectPool.gs`.
2. Replace `Code.gs` (or wherever `AgentPortalSecure.gs` lives) with the updated `AgentPortalSecure.gs`.
3. In the function dropdown pick **setupProspectPool** and click **Run**. Approve the permission prompt (Google Drive and triggers). This creates the **Prospect Pool** tab, adds 8 columns to **Prospects** (Source … Industry), and creates two daily triggers: `releaseStaleProspects` at 7am and `importPoolFromDrive` at 8am (Asia/Kuala_Lumpur).
4. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, so the Web App URL stays the same.
5. Optional: pick **importPoolFromDrive** and click **Run** to load any CSV already waiting instead of waiting for 8am.

The daily CSV goes to the Drive folder **EasyLatih Prospect Pool Import** (ID in `POOL_DEFAULT_IMPORT_FOLDER_ID`, or override with Script property `POOL_IMPORT_FOLDER_ID`). Headers: `company, industry, address, district, state, phone, email, website, est_employees, employee_confidence, source`. Imported files are renamed `DONE_…`; companies already in the pool or in Prospects are skipped.

## Automatic HRD Corp grant folder (GrantPack.gs)

Every time **Save details** is pressed on Admin Centre → Appendices, the programme gets its own Drive folder with the HRD Corp grant guideline PDF and an Appendices PDF, shared as view-only. The folder link is saved as the programme's guideline link, so HRD registration emails include it automatically. Saving again replaces the Appendices PDF in the same folder.

1. In the **EasyLatih Management System V2 - STAGING** project, click **+ → Script**, name it `GrantPack`, and paste in `GrantPack.gs`.
2. Replace `PublicRegistrationAdmin` with the updated `PublicRegistrationAdmin.gs`.
3. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**, so the Web App URL stays the same. Approve the Drive permission prompt if asked.

Defaults: programme folders go in the parent folder `1rY5bAux_8QRD4y5x1q8TUyymlDW_jdoq` and the guideline is copied from file `14oLvOWU6OdlR7nTNcTK4i9bCJWHkteH4`. Override with Script properties `GRANT_PACK_PARENT_FOLDER_ID` and `GRANT_GUIDELINE_FILE_ID`. If a programme has no grant folder yet, the registration email links the master guideline PDF instead of leaving it out.

## Agent access rules (AgentAccess.gs)

Last-login tracking, automatic deactivation and the data-ownership notice.

1. In the same Apps Script project, click **+ → Script**, name it `AgentAccess`, and paste in `AgentAccess.gs`. Update `AgentPortalSecure.gs` (Code.gs) and `ProspectPool.gs` too.
2. Run **setupProspectPool** again and approve the new permission (sending email). This adds the **Last Login**, **Data Agreement** and **Deactivated At** columns to **Agents** and a daily `checkInactiveAgents` trigger at 6am.
3. Optional: run **previewAgentCheck** to see in the log what the next daily check will do, without changing anything.
4. **Deploy → Manage deployments → Edit → New version → Deploy**.

What the daily check does:
- An ACTIVE agent (not an admin) with no login for 30 days becomes INACTIVE and loses access at once. Days are counted from the later of last login, the day the rules started, or the last deactivation (so an agent an admin reactivates gets a fresh 30 days).
- Warning email 9 days and 2 days before, to the address in the Agents sheet's email column.
- Every prospect owned by an agent who is not ACTIVE, including ones they keyed in, goes back to the Prospect Pool. Prospects at Quotation Sent / HRD Application / Registered or Not Interested / Do Not Contact go to the house account instead (Script properties `HOUSE_AGENT_ID` / `HOUSE_AGENT_NAME`, or the first active admin row).

Agents accept the notice once in the portal; the time and version are stored in **Data Agreement**.

## Agent sign-in with Supabase (AgentAuth.gs)

Agents sign in with email + password (Supabase). The Agent ID login is closed and
sessions from it stop working.

1. Supabase: run `supabase/agent-accounts.sql` (invited agents do not get a trainer profile),
   deploy `supabase/functions/agent-auth-link` with JWT verification off, and add the
   secret `AGENT_AUTH_SECRET` (a random string of 40+ characters).
2. Supabase → Authentication → URL Configuration → Redirect URLs must include
   `https://www.easylatih.my/internal/agent-dashboard.html`. Run `probeAgentRedirect`
   from the editor to check where links land.
3. Apps Script: add `AgentAuth.gs`, update the other files, and add the Script property
   `AGENT_AUTH_SECRET` with the same value. Run `auditAgentEmails` to list agents
   whose email is missing or used twice. Deploy a new version.
4. In the Agent Portal (admin), open **Prospek Baharu → Akaun Ejen** and press
   **Hantar jemputan**. Each agent gets a BM + English email with a one-time link to set
   a password. "Lupa / tetapkan kata laluan" on the login page sends a new link.

The email column in Agents is the login. To add an agent: add a row with status ACTIVE
and their email, then send the invite.

## Programmes offered

Agents tick which public programmes they offered a prospect (Prospects column
**Programmes Offered**, course IDs such as `CS002, HR007`). The list of active
programmes comes from the public calendar (`public_training_calendar_mirror`):
not started and registration not closed. The Prospects tab filters by programme,
including "not offered any programme yet".
