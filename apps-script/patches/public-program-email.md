# Poster and draft email editor

Open **Public Registrations → Open programme → Poster & Draf Email**. Upload JPG/PNG (up to 5 MB), edit subject/body and preview. Leave **Aktifkan templat untuk ejen** unchecked to save a draft; check it to make the saved template available in Agent Portal. Saving never sends email. Select an existing unlinked template to reuse earlier drafts.

Install in **EasyLatih Agent CRM / Agent Portal** Apps Script, not Management System V2:

1. Add `AgentEmailAdmin.gs` as a new Script file alongside the existing `AgentEmail.gs`.
2. Update `SupabaseAdminBridge.gs`; its `doPost` routes three admin email actions after the existing session exchange.
3. Deploy a **New version** on the existing Web App deployment, keeping its URL and access settings unchanged. If Google asks the owner to authorize Drive write access, complete authorization in the editor before uploading.
4. Publish the frontend files `registrations.html`, `registrations.js`, `public-program-email.js`, `public-program-email.css`, and `email-renderer.js`.

The editor adds **Course ID** to column H of **Email Templates**, linking one template per programme. Existing seven columns and agent sending behavior are preserved. If column H already has another header, it stops rather than overwriting it.

First upload creates a private **EasyLatih Email Posters** Drive folder (Script Property `AGENT_EMAIL_POSTER_FOLDER_ID`). Replaced images are retained. Saved poster previews are fetched through the authenticated admin endpoint; public sharing is unnecessary. Stale edits are rejected with a reload message. Uploads are checked by size, MIME type and PNG/JPEG signature. After a timeout, reload to check saved state before retrying.

Validation: `node --test scripts/test-agent-email-admin.cjs` uses mocked Apps Script services. After deployment verify one draft upload/save and reopen in the live portal without sending a promotional email.
