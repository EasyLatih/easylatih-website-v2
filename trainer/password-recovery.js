(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const configured = Boolean(window.supabase && cfg.supabaseUrl && cfg.supabasePublishableKey);
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const $ = id => document.getElementById(id);

  function message(id, text, type='info') {
    const el = $(id);
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = text;
  }

  function resetRedirectUrl() {
    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/forgot-password\.html$/, 'reset-password.html');
    url.hash = '';
    url.search = '';
    return url.toString();
  }

  async function initForgotPassword() {
    if (!client) {
      message('forgotMessage','Password recovery is not configured yet.','danger');
      return;
    }

    $('forgotPasswordForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formEl = event.currentTarget;
      const form = new FormData(formEl);
      const email = String(form.get('email') || '').trim();
      const button = $('sendRecoveryButton');
      if (!email) return;

      button.disabled = true;
      message('forgotMessage','Sending password reset link…','info');
      try {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: resetRedirectUrl()
        });
        if (error) throw error;
        formEl.reset();
        message('forgotMessage','If an EasyLatih Trainer Portal account exists for that email, a password reset link has been sent. Please check your inbox and spam folder.','success');
      } catch (err) {
        message('forgotMessage', err?.message || 'Unable to send the password reset email. Please try again later.','danger');
      } finally {
        button.disabled = false;
      }
    });
  }

  async function initResetPassword() {
    if (!client) {
      message('resetMessage','Password recovery is not configured yet.','danger');
      return;
    }

    const form = $('resetPasswordForm');
    let recoverySessionReady = false;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/,''));
    const query = new URLSearchParams(window.location.search);
    const authError = hash.get('error_description') || query.get('error_description');
    if (authError) {
      message('resetMessage', decodeURIComponent(authError.replace(/\+/g,' ')), 'danger');
      return;
    }

    const revealForm = () => {
      recoverySessionReady = true;
      form?.classList.remove('hidden');
      message('resetMessage','Recovery link verified. Enter your new password below.','success');
    };

    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) revealForm();
    });

    const { data } = await client.auth.getSession();
    if (data?.session) revealForm();

    setTimeout(() => {
      if (!recoverySessionReady) {
        message('resetMessage','This recovery link is invalid, expired, or was not opened correctly. Request a new reset link from the login page.','danger');
      }
    }, 2500);

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!recoverySessionReady) return;
      const formEl = event.currentTarget;
      const data = new FormData(formEl);
      const password = String(data.get('password') || '');
      const confirmPassword = String(data.get('confirm_password') || '');
      const button = $('updatePasswordButton');

      if (password.length < 8) return message('resetMessage','Password must be at least 8 characters.','danger');
      if (password !== confirmPassword) return message('resetMessage','The two passwords do not match.','danger');

      button.disabled = true;
      message('resetMessage','Updating your password…','info');
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        await client.auth.signOut();
        form.classList.add('hidden');
        message('resetMessage','Password updated successfully. You can now log in with your new password.','success');
        setTimeout(() => window.location.replace('index.html?login=1&password_reset=1'), 1200);
      } catch (err) {
        message('resetMessage', err?.message || 'Unable to update password. Please request a new reset link and try again.','danger');
      } finally {
        button.disabled = false;
      }
    });
  }

  window.EasyLatihPasswordRecovery = { initForgotPassword, initResetPassword };
})();
