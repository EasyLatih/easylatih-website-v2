# EasyLatih Venue Invoice & Receipt

Installed: internal/venue-documents.js and .css in Room Booking Admin; Supabase venue_documents and protected venue-documents Edge Function.

## Manual Google Apps Script activation needed
Until this section is completed, Save Draft and the content preview work, but Google Docs Draft, Finalize and Send are NOT available.

1. Open the existing EasyLatih Google Apps Script project connected to EasyLatih Master Database V2 - STAGING.
2. Add a new file with the contents of apps-script/VenueDocumentsBridge.gs.
3. At the TOP of the existing doPost(e), add this route (do not create a second doPost):
   if (e && e.parameter && String(e.parameter.action||'').indexOf('venueDocs')===0) return handleVenueDocs_(e);
4. Generate one long random secret and set it as script property VENUE_DOC_BRIDGE_SECRET.
5. Deploy a new version of the existing web app. Execute as Me; access Anyone (token protects the bridge).
6. Configure Supabase EasyLatih Edge Function secrets:
   VENUE_DOCS_SCRIPT_URL = the web app /exec URL
   VENUE_DOCS_SECRET = same secret as the Apps Script property
7. Test Generate Draft, Finalize invoice, verify payment, Finalize Receipt, email delivery.

## Sources
Invoice Google Docs template ID: 1_eLfH-lIwGQaqiwivvpN_GB7FYvx5GAYlKXaST1Qits
Receipt Google Docs template ID: 1NwoQGJNQfP8Xy0ihkgd6z8YqyHSi2Y5J4rkJ-y1GwuM
V2 STAGING spreadsheet ID: 1W6mLl9U2xdlfrlWHTs7VYmmRk34BcfaKTBo7gJatGsc

## Security and counting
Final invoice numbers are allocated only on Finalize using a ScriptLock and an idempotency log VenueInvoiceAllocation. Shared training invoice issuance must also use the same lock to avoid collisions with other scripts.
Final PDF is retained as the immutable official record; copies of Google Docs remain editable separately.
Receipt is blocked until a finalized invoice is marked fully paid with amount and transaction reference.
Customer email is sent only after admin deliberately selects Send.

## Combined multi-day rental invoices
- In the admin documents panel, select one customer's booking and tick up to 31 consecutive days (same room and applicant email) in **Gabungkan Tarikh Dalam Satu Invoice**.
- Use **Apply Selected Dates**, adjust daily rates, **Save Draft**, then **Preview / Edit**. All selected daily charges appear on one invoice and one receipt.
- The Google Docs invoice master now includes `{{RENTAL_LINE_ITEMS}}` and displays each rental date, session, time, and fee. Due date uses one calendar day before the first booked date.
- A database guard prevents the same booking being attached to another invoice, non-consecutive dates, multiple bookings on the same day, and mixing customers/rooms.
- This consolidates bookings already submitted as one record per date. The public booking form still submits one date per request; it does not yet submit a multi-day range in a single request.
