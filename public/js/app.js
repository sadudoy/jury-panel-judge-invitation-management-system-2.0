import {
  renderAdminCompetitions,
  renderAdminSlots,
  renderAdminAllocation,
} from './adminCompetitionsViews.js';
import {
  renderAdminDashboard,
  renderAdminReports,
  renderAdminSettings,
} from './adminDashboardViews.js';
import {
  renderAdminInvitations,
  renderAdminJudgeDetail,
  renderAdminJudges,
} from './adminJudgesViews.js';
import {
  renderAdminAttendance,
  renderAdminBackups,
} from './adminOperationsViews.js';
import {
  apiFetch,
  BRAND_LOGO_ALT,
  BRAND_LOGO_URL,
  escapeHtml,
  refreshIcons,
  setCsrfToken,
  showToast,
} from './api.js';
import { renderAuthView } from './authViews.js';
import {
  renderJudgeAssignments,
  renderJudgeDashboard,
  renderJudgeInvitations,
  renderJudgeProfile,
  renderJudgeSchedule,
} from './judgeViews.js';

const ADMIN_NAV = [
  { section: 'Overview' },
  { route: '#/admin/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { route: '#/admin/reports', label: 'Reports', icon: 'bar-chart-3' },
  { section: 'People & Invitations' },
  { route: '#/admin/judges', label: 'Judges', icon: 'users' },
  { route: '#/admin/invitations', label: 'Invitations', icon: 'mail' },
  { section: 'Event & Allocation' },
  { route: '#/admin/competitions', label: 'Competitions', icon: 'trophy' },
  { route: '#/admin/slots', label: 'Competition Slots', icon: 'calendar-clock' },
  { route: '#/admin/allocation', label: 'Judge Allocation', icon: 'user-check' },
  { section: 'Competition Day' },
  { route: '#/admin/backups', label: 'Backup Management', icon: 'shield-alert' },
  { route: '#/admin/attendance', label: 'Attendance', icon: 'clipboard-check' },
  { section: 'System' },
  { route: '#/admin/settings', label: 'Settings', icon: 'settings' },
];

const JUDGE_NAV = [
  { section: 'Judge Portal' },
  { route: '#/judge/dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  { route: '#/judge/invitations', label: 'My Invitations', icon: 'mail' },
  { route: '#/judge/assignments', label: 'My Assignments', icon: 'briefcase' },
  { route: '#/judge/schedule', label: 'My Schedule', icon: 'calendar' },
  { route: '#/judge/profile', label: 'Profile', icon: 'user' },
];

const state = {
  user: null,
  needsAdminSetup: false,
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
};

function parseHash() {
  const raw = window.location.hash || '';
  const [pathPart, queryPart] = raw.split('?');
  const params = new URLSearchParams(queryPart || '');
  return { path: pathPart || '', params };
}

function getBreadcrumb(path, role) {
  const prefix = role === 'ADMIN' ? 'Admin' : 'Judge Portal';
  const labels = {
    '#/admin/dashboard': 'Dashboard',
    '#/admin/judges': 'Judges',
    '#/admin/invitations': 'Invitations',
    '#/admin/competitions': 'Competitions',
    '#/admin/slots': 'Competition Slots',
    '#/admin/allocation': 'Judge Allocation',
    '#/admin/backups': 'Backup Management',
    '#/admin/attendance': 'Attendance',
    '#/admin/reports': 'Reports',
    '#/admin/settings': 'Settings',
    '#/judge/dashboard': 'Dashboard',
    '#/judge/invitations': 'My Invitations',
    '#/judge/assignments': 'My Assignments',
    '#/judge/schedule': 'My Schedule',
    '#/judge/profile': 'Profile',
  };
  if (path.startsWith('#/admin/judges/')) {
    return `${prefix} / Judges / Profile`;
  }
  return `${prefix} / ${labels[path] || 'Dashboard'}`;
}

function renderWorkspaceShell(activePath) {
  const root = document.getElementById('app-root');
  const isAdmin = state.user.role === 'ADMIN';
  const navItems = isAdmin ? ADMIN_NAV : JUDGE_NAV;
  const initials = state.user.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  root.innerHTML = `
    <div class="workspace ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''} ${state.mobileSidebarOpen ? 'mobile-sidebar-open' : ''}" id="workspace-el">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <aside class="sidebar" aria-label="Primary Navigation">
        <div class="sidebar-header">
          <a
            href="${isAdmin ? '#/admin/dashboard' : '#/judge/dashboard'}"
            class="sidebar-brand"
            aria-label="JuryPanel – BAUST CSE Fest"
          >
            <img
              src="${BRAND_LOGO_URL}"
              alt="${BRAND_LOGO_ALT}"
              class="sidebar-brand-logo"
            />
            <span class="sidebar-brand-text">JuryPanel</span>
          </a>
        </div>
        <nav class="sidebar-nav">
          ${navItems
            .map((item) => {
              if (item.section) {
                return `<div class="sidebar-section-label">${escapeHtml(item.section)}</div>`;
              }
              const isActive =
                activePath === item.route ||
                (item.route === '#/admin/judges' && activePath.startsWith('#/admin/judges/'));
              return `
                <a href="${item.route}" class="nav-item ${isActive ? 'active' : ''}" title="${escapeHtml(item.label)}">
                  <i data-lucide="${item.icon}"></i>
                  <span class="nav-label">${escapeHtml(item.label)}</span>
                </a>
              `;
            })
            .join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="avatar-circle">${escapeHtml(initials || 'U')}</div>
            <div class="sidebar-user-meta">
              <div class="sidebar-user-name">${escapeHtml(state.user.fullName)}</div>
              <div class="sidebar-user-role">${isAdmin ? 'Administrator' : `${escapeHtml(state.user.judgeType || '')} Judge`}</div>
            </div>
          </div>
          <button type="button" class="btn btn-sm" id="logout-btn" style="width:100%;">
            <i data-lucide="log-out"></i>
            <span class="nav-label">Sign Out</span>
          </button>
        </div>
      </aside>

      <div class="main-area">
        <header class="topbar">
          <div class="topbar-left">
            <button type="button" class="hamburger-btn" id="hamburger-btn" aria-label="Toggle navigation menu">
              <i data-lucide="menu"></i>
            </button>
            <a
              href="${isAdmin ? '#/admin/dashboard' : '#/judge/dashboard'}"
              class="topbar-brand"
              aria-label="JuryPanel Dashboard"
            >
              <img
                src="${BRAND_LOGO_URL}"
                alt="${BRAND_LOGO_ALT}"
                class="topbar-brand-logo"
              />
            </a>
            <span class="topbar-divider" aria-hidden="true"></span>
            <div class="breadcrumb">
              <span class="breadcrumb-muted">BAUST CSE Fest /</span>
              <span>${escapeHtml(getBreadcrumb(activePath, state.user.role))}</span>
            </div>
          </div>
          <div class="topbar-actions">
            ${
              isAdmin
                ? `<a href="#/admin/attendance" class="btn btn-sm"><i data-lucide="clipboard-check"></i><span>Attendance</span></a>`
                : `<a href="#/judge/schedule" class="btn btn-sm"><i data-lucide="calendar"></i><span>My Schedule</span></a>`
            }
          </div>
        </header>
        <main class="page-content" id="page-viewport"></main>
      </div>
    </div>
  `;

  refreshIcons(root);

  const wsEl = root.querySelector('#workspace-el');
  const backdrop = root.querySelector('#sidebar-backdrop');

  root.querySelector('#hamburger-btn').addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      state.mobileSidebarOpen = !state.mobileSidebarOpen;
      wsEl.classList.toggle('mobile-sidebar-open', state.mobileSidebarOpen);
    } else {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      wsEl.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    }
  });

  backdrop.addEventListener('click', () => {
    state.mobileSidebarOpen = false;
    wsEl.classList.remove('mobile-sidebar-open');
  });

  root.querySelectorAll('.sidebar-nav .nav-item').forEach((link) => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        state.mobileSidebarOpen = false;
        wsEl.classList.remove('mobile-sidebar-open');
      }
    });
  });

  root.querySelector('#logout-btn').addEventListener('click', async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout network error and clear client state
    }
    const prevRole = state.user?.role;
    state.user = null;
    setCsrfToken(null);
    showToast('Signed out.', 'info');
    window.location.hash = prevRole === 'JUDGE' ? '#/judge/login' : '#/admin/login';
    await route();
  });

  return root.querySelector('#page-viewport');
}

async function route() {
  const { path, params } = parseHash();
  const root = document.getElementById('app-root');

  if (!state.user) {
    const initialRole = path.startsWith('#/judge') ? 'JUDGE' : 'ADMIN';
    renderAuthView(root, {
      needsAdminSetup: state.needsAdminSetup,
      initialRole,
      onAuthenticated: async (user) => {
        state.user = user;
        state.needsAdminSetup = false;
        window.location.hash = user.role === 'ADMIN' ? '#/admin/dashboard' : '#/judge/dashboard';
        await route();
      },
    });
    return;
  }

  if (state.user.role === 'ADMIN') {
    let targetPath = path;
    if (!targetPath.startsWith('#/admin/') || targetPath === '#/admin/login') {
      targetPath = '#/admin/dashboard';
      window.history.replaceState(null, '', targetPath);
    }

    const viewport = renderWorkspaceShell(targetPath);

    if (targetPath === '#/admin/dashboard') {
      await renderAdminDashboard(viewport);
    } else if (targetPath === '#/admin/judges') {
      await renderAdminJudges(viewport);
    } else if (targetPath.startsWith('#/admin/judges/')) {
      const id = Number(targetPath.split('/')[3]);
      await renderAdminJudgeDetail(viewport, id);
    } else if (targetPath === '#/admin/invitations') {
      await renderAdminInvitations(viewport);
    } else if (targetPath === '#/admin/competitions') {
      await renderAdminCompetitions(viewport);
    } else if (targetPath === '#/admin/slots') {
      await renderAdminSlots(viewport, params.get('competitionId') || '');
    } else if (targetPath === '#/admin/allocation') {
      await renderAdminAllocation(viewport, params.get('slotId') || '');
    } else if (targetPath === '#/admin/backups') {
      await renderAdminBackups(viewport);
    } else if (targetPath === '#/admin/attendance') {
      await renderAdminAttendance(viewport);
    } else if (targetPath === '#/admin/reports') {
      await renderAdminReports(viewport);
    } else if (targetPath === '#/admin/settings') {
      await renderAdminSettings(viewport);
    } else {
      await renderAdminDashboard(viewport);
    }
    return;
  }

  // JUDGE portal routing
  let targetPath = path;
  if (!targetPath.startsWith('#/judge/') || targetPath === '#/judge/login') {
    targetPath = '#/judge/dashboard';
    window.history.replaceState(null, '', targetPath);
  }

  const viewport = renderWorkspaceShell(targetPath);

  if (targetPath === '#/judge/dashboard') {
    await renderJudgeDashboard(viewport);
  } else if (targetPath === '#/judge/invitations') {
    await renderJudgeInvitations(viewport);
  } else if (targetPath === '#/judge/assignments') {
    await renderJudgeAssignments(viewport);
  } else if (targetPath === '#/judge/schedule') {
    await renderJudgeSchedule(viewport);
  } else if (targetPath === '#/judge/profile') {
    await renderJudgeProfile(viewport);
  } else {
    await renderJudgeDashboard(viewport);
  }
}

async function bootstrap() {
  try {
    const status = await apiFetch('/api/auth/status');
    state.needsAdminSetup = Boolean(status.needsAdminSetup);

    if (!state.needsAdminSetup) {
      try {
        const me = await apiFetch('/api/auth/me');
        state.user = me.user;
        setCsrfToken(me.csrfToken);
      } catch {
        state.user = null;
        setCsrfToken(null);
      }
    }
  } catch (err) {
    showToast(`Unable to reach server: ${err.message}`, 'error');
  }

  window.addEventListener('hashchange', route);
  await route();
}

bootstrap();
