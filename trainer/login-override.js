(() => {
  // Git-linked preview sync: 2026-09-07
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

  function show(id, text, type='info') {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = text;
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const formEl = event.currentTarget;
      const data = new FormData(formEl);
      const password = String(data.get('password') || '');
      const button = document.getElementById('registerButton');

      if (!data.get('privacy_ack')) {
        return show('registerMessage','Please acknowledge the Privacy Notice to continue.','danger');
      }
      if (password.length < 8) {
        return show('registerMessage','Password must be at least 8 characters.','danger');
      }

      if (button) button.disabled = true;
      show('registerMessage','Creating your trainer account…','info');
      try {
        const emailRedirectTo = `${window.location.origin}/trainer/index.html?verified=1`;
        const { data: authData, error } = await client.auth.signUp({
          email: String(data.get('email') || '').trim(),
          password,
          options: {
            emailRedirectTo,
            data: {
              full_name: String(data.get('full_name') || '').trim(),
              phone: String(data.get('phone') || '').trim(),
              state: String(data.get('state') || '').trim(),
              expertise_summary: String(data.get('expertise_summary') || '').trim(),
              linkedin_url: String(data.get('linkedin_url') || '').trim(),
              privacy_notice_version: cfg.privacyNoticeVersion,
              privacy_acknowledged_at: new Date().toISOString(),
              marketing_consent: Boolean(data.get('marketing_consent'))
            }
          }
        });
        if (error) throw error;
        if (authData.session) {
          window.location.replace('./dashboard.html');
        } else {
          formEl.reset();
          show('registerMessage','Account created. Please check your email to verify your account, then log in.','success');
        }
      } catch (err) {
        show('registerMessage',err?.message || 'Unable to create account.','danger');
      } finally {
        if (button) button.disabled = false;
      }
    }, true);
  }

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const formEl = event.currentTarget;
      const data = new FormData(formEl);
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');
      const button = document.getElementById('loginButton');
      if (button) button.disabled = true;
      show('loginMessage','Signing in…');
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
        show('loginMessage',err?.message || 'Unable to sign in.','danger');
      } finally {
        if (button) button.disabled = false;
      }
    }, true);
  }
})();
