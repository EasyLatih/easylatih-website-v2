(() => {
  // Git-linked preview sync: 2026-09-07
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const form = document.getElementById('loginForm');
  if (!form) return;

  function show(text, type='info') {
    const el = document.getElementById('loginMessage');
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = text;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const formEl = event.currentTarget;
    const data = new FormData(formEl);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const button = document.getElementById('loginButton');
    if (button) button.disabled = true;
    show('Signing in…');
    try {
      const { data: authData, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = authData?.user || authData?.session?.user;
      if (user?.app_metadata?.role === 'admin') {
        window.location.replace('../internal/trainer-admin.html');
      } else {
        window.location.replace('./dashboard.html');
      }
    } catch (err) {
      show(err?.message || 'Unable to sign in.','danger');
    } finally {
      if (button) button.disabled = false;
    }
  }, true);
})();
