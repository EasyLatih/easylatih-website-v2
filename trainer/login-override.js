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
        const code = String(err?.code || '');
        const message = String(err?.message || '');
        const needsVerification = code === 'email_not_confirmed' || /email not confirmed/i.test(message);
        if (needsVerification) {
          document.getElementById('resendVerificationWrap')?.classList.remove('hidden');
          show('loginMessage','Your email has not been verified. Please resend the verification email and use the newest link.','danger');
        } else {
          show('loginMessage',message || 'Unable to sign in.','danger');
        }
      } finally {
        if (button) button.disabled = false;
      }
    }, true);
  }

  const resendButton = document.getElementById('resendVerificationButton');
  if (resendButton && loginForm) {
    resendButton.addEventListener('click', async () => {
      const emailInput = loginForm.querySelector('input[name="email"]');
      const email = String(emailInput?.value || '').trim();
      if (!email) {
        show('loginMessage','Enter your email address first, then resend the verification email.','danger');
        emailInput?.focus();
        return;
      }

      resendButton.disabled = true;
      show('loginMessage','Sending a new verification email…','info');
      try {
        const { error } = await client.auth.resend({
          type: 'signup',
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/trainer/index.html?verified=1`
          }
        });
        if (error) throw error;
        show('loginMessage','Verification email sent. Please use the newest link in your inbox.','success');
      } catch (err) {
        const message = String(err?.message || '');
        if (/rate limit|too many requests/i.test(message)) {
          show('loginMessage','A verification email was requested recently. Please check your inbox before trying again.','warning');
        } else {
          show('loginMessage',message || 'Unable to resend the verification email.','danger');
        }
      } finally {
        resendButton.disabled = false;
      }
    });
  }
})();
