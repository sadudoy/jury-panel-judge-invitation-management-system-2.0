// Shared client-side API, escaping, modal, toast, and formatting helpers

export const BRAND_LOGO_URL = '/assets/aistudio/Picsart_26-11-22_18-50-55-910_057c96ea.png';
export const BRAND_LOGO_ALT = 'JuryPanel – BAUST CSE Fest';

let currentCsrfToken = null;

export function setCsrfToken(token) {
  currentCsrfToken = token || null;
}

export function getCsrfToken() {
  return currentCsrfToken;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function apiFetch(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };

  if (method !== 'GET' && method !== 'HEAD' && currentCsrfToken) {
    headers['X-CSRF-Token'] = currentCsrfToken;
  }

  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }

  return data;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimeRange(startIso, endIso) {
  if (!startIso || !endIso) return '—';
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '—';
  const datePart = s.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const startPart = s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const endPart = e.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${startPart} – ${endPart}`;
}

export function toLocalDatetimeInputValue(iso) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 86400_000);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function statusTag(status) {
  const s = String(status || 'UNKNOWN').toUpperCase();
  const map = {
    ACCEPTED: 'status-success',
    CONFIRMED: 'status-success',
    PRESENT: 'status-success',
    AVAILABLE: 'status-success',
    ACTIVE: 'status-success',
    OPEN: 'status-success',
    COMPLETED: 'status-success',
    ACTIVATED_BACKUP: 'status-info',
    SCHEDULED: 'status-info',
    PRIMARY: 'status-info',
    FACULTY: 'status-info',
    EXTERNAL: 'status-neutral',
    PENDING: 'status-warning',
    ASSIGNED: 'status-warning',
    STANDBY: 'status-warning',
    BACKUP: 'status-warning',
    TENTATIVE: 'status-warning',
    LATE: 'status-warning',
    RESCHEDULED: 'status-warning',
    ONGOING: 'status-info',
    REJECTED: 'status-danger',
    DECLINED: 'status-danger',
    WITHDRAWN: 'status-danger',
    ABSENT: 'status-danger',
    EXPIRED: 'status-danger',
    CANCELLED: 'status-danger',
    CANCELLED_SLOT: 'status-danger',
    CANCELLED_DEACTIVATED: 'status-danger',
    UNAVAILABLE: 'status-danger',
    DEACTIVATED: 'status-danger',
    REPLACED: 'status-neutral',
    EXCUSED: 'status-neutral',
    DRAFT: 'status-neutral',
    NOT_INVITED: 'status-neutral',
    UNSPECIFIED: 'status-neutral',
    ACCOUNT_CREATED: 'status-success',
    ACCOUNT_DISABLED: 'status-danger',
    NO_ACCOUNT: 'status-neutral',
  };
  const cls = map[s] || 'status-neutral';
  const label = s.replace(/_/g, ' ');
  return `<span class="status-tag ${cls}">${escapeHtml(label)}</span>`;
}

export function showToast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4200);
}

export function openModal({ title, bodyHtml, footerHtml = '', large = false, onMount }) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.innerHTML = `
    <div class="modal-dialog ${large ? 'modal-lg' : ''}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <button type="button" class="btn btn-ghost btn-sm" id="modal-close-x" aria-label="Close modal">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;
  root.classList.add('open');
  root.setAttribute('aria-hidden', 'false');
  refreshIcons(root);

  const closeBtn = root.querySelector('#modal-close-x');
  closeBtn?.addEventListener('click', closeModal);

  const onBackdrop = (e) => {
    if (e.target === root) {
      closeModal();
      root.removeEventListener('click', onBackdrop);
    }
  };
  root.addEventListener('click', onBackdrop);

  if (typeof onMount === 'function') {
    onMount(root);
  }
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root) return;
  root.classList.remove('open');
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '';
}

export function renderLoading(label = 'Loading records...') {
  return `
    <div class="state-box">
      <div class="spinner" aria-hidden="true"></div>
      <p>${escapeHtml(label)}</p>
    </div>
  `;
}

export function renderEmpty(title, description, actionHtml = '') {
  return `
    <div class="state-box">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      ${actionHtml}
    </div>
  `;
}

export function renderError(message, retryId = '') {
  return `
    <div class="state-box">
      <h3>Unable to load data</h3>
      <p>${escapeHtml(message)}</p>
      ${retryId ? `<button type="button" class="btn" id="${escapeHtml(retryId)}">Retry</button>` : ''}
    </div>
  `;
}

export function refreshIcons(scope = document) {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: scope });
  }
}

export function downloadCsv(filename, headers, rows) {
  const csvCell = (v) => {
    const str = v === null || v === undefined ? '' : String(v);
    return `"${str.replace(/"/g, '""')}"`;
  };
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((r) => r.map(csvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
