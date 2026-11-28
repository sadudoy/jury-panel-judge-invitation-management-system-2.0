import { apiFetch, BRAND_LOGO_ALT, BRAND_LOGO_URL, refreshIcons, setCsrfToken, showToast } from './api.js';

export function renderAuthView(container, { needsAdminSetup, initialRole = 'ADMIN', onAuthenticated }) {
  if (needsAdminSetup) {
    container.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card">
          <div class="auth-brand-wrap">
            <img src="${BRAND_LOGO_URL}" alt="${BRAND_LOGO_ALT}" class="auth-brand-logo" />
            <div class="auth-kicker">BAUST CSE Fest · Judge Management System</div>
          </div>
          <h1 class="auth-heading">Set Up Administrator Account</h1>
          <p class="auth-desc">
            Welcome! Create the first Fest Administrator account to open the management dashboard.
          </p>
          <div id="auth-error" class="callout callout-danger" style="display:none; margin-bottom:16px;"></div>
          <form id="setup-admin-form">
            <div class="form-group">
              <label for="setup-name">Full Name</label>
              <input id="setup-name" class="input" type="text" required placeholder="e.g. Dr. Rahman (Convener)" />
            </div>
            <div class="form-group">
              <label for="setup-email">Email Address</label>
              <input id="setup-email" class="input" type="email" required placeholder="admin@baust.edu.bd" />
            </div>
            <div class="form-group">
              <label for="setup-password">Password</label>
              <input id="setup-password" class="input" type="password" required minlength="8" placeholder="Minimum 8 characters" />
            </div>
            <button type="submit" class="btn btn-primary btn-lg" style="width:100%;" id="setup-submit-btn">
              <i data-lucide="shield-check"></i>
              <span>Create Administrator &amp; Sign In</span>
            </button>
          </form>
        </div>
      </div>
    `;
    refreshIcons(container);

    const form = container.querySelector('#setup-admin-form');
    const errBox = container.querySelector('#auth-error');
    const btn = container.querySelector('#setup-submit-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      const fullName = container.querySelector('#setup-name').value.trim();
      const email = container.querySelector('#setup-email').value.trim();
      const password = container.querySelector('#setup-password').value;

      if (!fullName || !email || password.length < 8) {
        errBox.textContent = 'Please provide a valid name, email, and password (8+ characters).';
        errBox.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Setting up...';
      try {
        const data = await apiFetch('/api/auth/setup-admin', {
          method: 'POST',
          body: { fullName, email, password },
        });
        setCsrfToken(data.csrfToken);
        showToast('Administrator account created.', 'success');
        onAuthenticated(data.user);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Administrator & Sign In';
      }
    });
    return;
  }

  let selectedRole = initialRole === 'JUDGE' ? 'JUDGE' : 'ADMIN';
  let demoAccounts = null;
  let demoLoaded = false;

  function applyAutofill(targetRole) {
    const account = targetRole === 'ADMIN' ? demoAccounts?.admin : demoAccounts?.judge;
    if (!account) {
      showToast(
        targetRole === 'ADMIN'
          ? 'No demo administrator login is available.'
          : 'No demo judge login is available yet. Sign in as Admin to add a judge.',
        'warning'
      );
      return;
    }

    if (selectedRole !== targetRole) {
      selectedRole = targetRole;
      window.location.hash = targetRole === 'ADMIN' ? '#/admin/login' : '#/judge/login';
      renderLogin({ email: account.email, password: account.password });
    } else {
      const emailInput = container.querySelector('#login-email');
      const passwordInput = container.querySelector('#login-password');
      if (emailInput) emailInput.value = account.email;
      if (passwordInput) passwordInput.value = account.password;
    }

    const submitBtn = container.querySelector('#login-submit-btn');
    if (submitBtn) submitBtn.focus();
    showToast(
      `Filled ${targetRole === 'ADMIN' ? 'Admin' : 'Judge'} credentials (${account.email}). Click Sign In to continue.`,
      'success'
    );
  }

  function renderAutofillMarkup() {
    if (!demoLoaded || !demoAccounts?.enabled) return '';
    const hasAdmin = Boolean(demoAccounts.admin);
    const hasJudge = Boolean(demoAccounts.judge);
    if (!hasAdmin && !hasJudge) return '';

    return `
      <div class="auth-autofill" id="auth-autofill-bar">
        <div class="auth-autofill-header">
          <i data-lucide="sparkles"></i>
          <span>1-Click Demo Login Autofill</span>
        </div>
        <div class="auth-autofill-actions">
          ${
            hasAdmin
              ? `<button type="button" class="btn btn-secondary btn-sm auth-autofill-btn ${selectedRole === 'ADMIN' ? 'is-target' : ''}" id="autofill-admin-btn">
                  <i data-lucide="shield"></i>
                  <span>Autofill Admin</span>
                </button>`
              : ''
          }
          ${
            hasJudge
              ? `<button type="button" class="btn btn-secondary btn-sm auth-autofill-btn ${selectedRole === 'JUDGE' ? 'is-target' : ''}" id="autofill-judge-btn">
                  <i data-lucide="award"></i>
                  <span>Autofill Judge</span>
                </button>`
              : ''
          }
        </div>
      </div>
    `;
  }

  function bindAutofillEvents() {
    const adminFillBtn = container.querySelector('#autofill-admin-btn');
    if (adminFillBtn) {
      adminFillBtn.addEventListener('click', () => applyAutofill('ADMIN'));
    }
    const judgeFillBtn = container.querySelector('#autofill-judge-btn');
    if (judgeFillBtn) {
      judgeFillBtn.addEventListener('click', () => applyAutofill('JUDGE'));
    }
  }

  function renderLogin(prefill = null) {
    const isAdmin = selectedRole === 'ADMIN';
    container.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card">
          <div class="auth-brand-wrap">
            <img src="${BRAND_LOGO_URL}" alt="${BRAND_LOGO_ALT}" class="auth-brand-logo" />
            <div class="auth-kicker">BAUST CSE Fest · Judge Management System</div>
          </div>

          <div class="segmented-control" role="tablist" aria-label="Portal Role">
            <button type="button" id="role-tab-admin" class="${isAdmin ? 'active' : ''}">
              <i data-lucide="shield"></i>
              <span>Admin Portal</span>
            </button>
            <button type="button" id="role-tab-judge" class="${!isAdmin ? 'active' : ''}">
              <i data-lucide="award"></i>
              <span>Judge Portal</span>
            </button>
          </div>

          <h1 class="auth-heading">${isAdmin ? 'Administrator Sign In' : 'Judge Portal Sign In'}</h1>
          <p class="auth-desc">
            ${
              isAdmin
                ? 'Sign in to manage judges, invitations, competition slots, allocations, backups, and attendance.'
                : 'Sign in with the email and password provided by the BAUST CSE Fest organizing committee.'
            }
          </p>

          <div id="auth-error" class="callout callout-danger" style="display:none; margin-bottom:16px;"></div>

          <form id="login-form">
            <div class="form-group">
              <label for="login-email">Email Address</label>
              <input id="login-email" class="input" type="email" required autocomplete="email" placeholder="${
                isAdmin ? 'admin@baust.edu.bd' : 'judge@institution.edu'
              }" />
            </div>
            <div class="form-group">
              <label for="login-password">Password</label>
              <input id="login-password" class="input" type="password" required autocomplete="current-password" placeholder="Enter your password" />
            </div>
            <button type="submit" class="btn btn-primary btn-lg" style="width:100%;" id="login-submit-btn">
              <i data-lucide="log-in"></i>
              <span>Sign In to ${isAdmin ? 'Admin Dashboard' : 'Judge Portal'}</span>
            </button>
          </form>

          <div id="auth-autofill-slot">${renderAutofillMarkup()}</div>

          <div class="auth-card-footer">
            <i data-lucide="lock"></i>
            <span>Only invited judges and administrators can sign in. Contact the Fest Administrator if you need login access.</span>
          </div>
        </div>
      </div>
    `;

    if (prefill) {
      const emailInput = container.querySelector('#login-email');
      const passwordInput = container.querySelector('#login-password');
      if (emailInput) emailInput.value = prefill.email || '';
      if (passwordInput) passwordInput.value = prefill.password || '';
    }

    refreshIcons(container);
    bindAutofillEvents();

    container.querySelector('#role-tab-admin').addEventListener('click', () => {
      selectedRole = 'ADMIN';
      window.location.hash = '#/admin/login';
      renderLogin();
    });

    container.querySelector('#role-tab-judge').addEventListener('click', () => {
      selectedRole = 'JUDGE';
      window.location.hash = '#/judge/login';
      renderLogin();
    });

    const form = container.querySelector('#login-form');
    const errBox = container.querySelector('#auth-error');
    const btn = container.querySelector('#login-submit-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      const email = container.querySelector('#login-email').value.trim();
      const password = container.querySelector('#login-password').value;

      if (!email || !password) {
        errBox.textContent = 'Email and password are required.';
        errBox.style.display = 'block';
        return;
      }

      btn.disabled = true;
      try {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: { email, password, expectedRole: selectedRole },
        });
        setCsrfToken(data.csrfToken);
        showToast(`Signed in as ${data.user.fullName}`, 'success');
        onAuthenticated(data.user);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    });
  }

  renderLogin();

  apiFetch('/api/auth/demo-credentials')
    .then((data) => {
      demoAccounts = data;
      demoLoaded = true;
      const slot = container.querySelector('#auth-autofill-slot');
      if (slot) {
        slot.innerHTML = renderAutofillMarkup();
        refreshIcons(slot);
        bindAutofillEvents();
      }
    })
    .catch(() => {
      demoLoaded = true;
    });
}
