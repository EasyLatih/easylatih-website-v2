// One login for EasyLatih admin pages.
// A signed-in Admin Centre (Supabase) admin gets an Agent Portal sales session
// automatically, so the Agent ID login is no longer needed for admins.
// Needs SupabaseAdminBridge.gs deployed in the Agent Portal Apps Script project.
(() => {
  'use strict';
  const API_URL = 'https://script.google.com/macros/s/AKfycby5Tl6A7Vip6GdkNsMstjl6026EvH6boWU9de-11DO6EaSR4XJTogXdY7ZDIxyJS6Go/exec';
  const read = key => { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  let pending = null;

  async function exchange(db) {
    if (!db || !db.auth) return '';
    const { data } = await db.auth.getSession();
    const accessToken = data && data.session && data.session.access_token;
    if (!accessToken) return '';
    try {
      // Plain-text body keeps this a simple request (no CORS preflight) for Apps Script.
      const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'supabaseSession', accessToken }) });
      const result = await response.json();
      if (!result || !result.success || !result.sessionToken) return '';
      write('agentId', result.agentId);
      write('agentName', result.name);
      write('role', result.role);
      write('agentSessionToken', result.sessionToken);
      return result.sessionToken;
    } catch (_) {
      return '';
    }
  }

  window.EasyLatihSalesSession = {
    API_URL,
    // Returns a sales session token, creating one from the Supabase login when needed.
    // force: true discards a stored token first (use after SESSION_REQUIRED).
    async ensure(db, options) {
      const force = options && options.force;
      if (!force) { const stored = read('agentSessionToken'); if (stored) return stored; }
      if (!pending) pending = exchange(db).finally(() => { pending = null; });
      return pending;
    }
  };
})();
