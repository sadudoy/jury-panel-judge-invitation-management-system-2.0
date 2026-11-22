import {
  apiFetch,
  closeModal,
  downloadCsv,
  escapeHtml,
  formatDateTime,
  formatTimeRange,
  openModal,
  refreshIcons,
  renderEmpty,
  renderError,
  renderLoading,
  showToast,
  statusTag,
} from './api.js';

export async function renderAdminDashboard(container) {
  container.innerHTML = renderLoading('Loading fest overview...');
  try {
    const data = await apiFetch('/api/dashboard/summary');
    const m = data.metrics;
    const slots = data.slotSummaries || [];
    const activity = data.recentActivity || [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Fest Operations Dashboard</h1>
          <p class="page-subtitle">Real-time judge invitations, slot allocations, attendance, and vacant seats for BAUST CSE Fest.</p>
        </div>
        <div class="header-actions">
          <a href="#/admin/invitations" class="btn"><i data-lucide="mail"></i><span>Manage Invitations</span></a>
          <a href="#/admin/allocation" class="btn btn-primary"><i data-lucide="user-check"></i><span>Allocate Judges</span></a>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Judges</div>
          <div class="kpi-value">${m.total_judges}</div>
          <div class="kpi-sub">${m.external_judges} External · ${m.faculty_judges} Faculty (${m.active_judges} active)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Invitations Sent</div>
          <div class="kpi-value">${m.invitations_sent}</div>
          <div class="kpi-sub">${m.accepted_invitations} Accepted · ${m.pending_invitations} Pending · ${m.rejected_invitations} Rejected</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Competitions</div>
          <div class="kpi-value">${m.total_competitions}</div>
          <div class="kpi-sub">${m.active_competitions} Active · ${m.cancelled_competitions} Cancelled</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Judge Assignments</div>
          <div class="kpi-value">${m.primary_assignments + m.activated_backup_assignments}</div>
          <div class="kpi-sub">${m.primary_assignments} Primary · ${m.backup_assignments} Standby · ${m.activated_backup_assignments} Activated Backup</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Attendance Summary</div>
          <div class="kpi-value">${m.present_judges} Present</div>
          <div class="kpi-sub">${m.absent_judges} Absent · ${m.late_judges} Late · ${m.excused_judges} Excused</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Vacant Judge Positions</div>
          <div class="kpi-value" style="color:${m.vacant_positions > 0 ? 'var(--warning-text)' : 'var(--success-text)'};">${m.vacant_positions}</div>
          <div class="kpi-sub">${m.expired_invitations} Expired Invitations</div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:16px;">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Invitation Status</h2>
          </div>
          <div class="card-body" style="height:220px;">
            <canvas id="invitations-chart"></canvas>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Judge Attendance</h2>
          </div>
          <div class="card-body" style="height:220px;">
            <canvas id="attendance-chart"></canvas>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Competition Slot Coverage</h2>
            <a href="#/admin/slots" class="btn btn-sm">All Slots</a>
          </div>
          <div class="table-wrap">
            ${
              slots.length === 0
                ? renderEmpty('No competition slots scheduled', 'Create competitions and slots to start allocating judges.', '<a href="#/admin/competitions" class="btn btn-primary btn-sm">Go to Competitions</a>')
                : `<table>
                    <thead>
                      <tr>
                        <th>Competition &amp; Slot</th>
                        <th class="td-right">Primary</th>
                        <th class="td-right">Backup</th>
                        <th class="td-right">Vacant</th>
                        <th class="td-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${slots
                        .map(
                          (s) => `
                        <tr>
                          <td>
                            <div class="cell-title">${escapeHtml(s.competition_name)}</div>
                            <div class="cell-meta">${escapeHtml(s.slot_label)} · ${escapeHtml(s.venue)}</div>
                          </td>
                          <td class="td-right mono">${s.filled_primary}/${s.required_primary_judges}</td>
                          <td class="td-right mono">${s.standby_backups}</td>
                          <td class="td-right">${
                            s.vacant_positions > 0
                              ? statusTag(`${s.vacant_positions} VACANT`)
                              : statusTag('CONFIRMED')
                          }</td>
                          <td class="td-right">
                            <a href="#/admin/allocation?slotId=${s.slot_id}" class="btn btn-sm">Allocate</a>
                          </td>
                        </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Recent System Activity</h2>
            <a href="#/admin/reports" class="btn btn-sm">View Reports</a>
          </div>
          <div class="table-wrap">
            ${
              activity.length === 0
                ? renderEmpty('No activity logged yet', 'Actions performed by admins and judges appear here.')
                : `<table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Actor</th>
                        <th class="td-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${activity
                        .map(
                          (a) => `
                        <tr>
                          <td>
                            <div class="cell-title">${escapeHtml(a.action.replace(/_/g, ' '))}</div>
                            <div class="cell-meta">${escapeHtml(a.entity_type)}${a.entity_id ? ` #${a.entity_id}` : ''}</div>
                          </td>
                          <td>${escapeHtml(a.actor_name || a.actor_role || 'System')}</td>
                          <td class="td-right mono" style="font-size:12px;">${escapeHtml(formatDateTime(a.created_at))}</td>
                        </tr>`
                        )
                        .join('')}
                    </tbody>
                  </table>`
            }
          </div>
        </div>
      </div>
    `;
    refreshIcons(container);

    if (window.Chart) {
      const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#43484e', font: { size: 12 } },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0, color: '#686f78', font: { size: 12 } },
            grid: { color: '#ebedf0' },
          },
        },
      };

      new window.Chart(container.querySelector('#invitations-chart'), {
        type: 'bar',
        data: {
          labels: ['Accepted', 'Pending', 'Rejected', 'Expired'],
          datasets: [
            {
              data: [
                m.accepted_invitations ?? 0,
                m.pending_invitations ?? 0,
                m.rejected_invitations ?? 0,
                m.expired_invitations ?? 0,
              ],
              backgroundColor: ['#16a34a', '#d97706', '#dc2626', '#6b7280'],
              borderRadius: 3,
              maxBarThickness: 44,
            },
          ],
        },
        options: commonOptions,
      });

      new window.Chart(container.querySelector('#attendance-chart'), {
        type: 'bar',
        data: {
          labels: ['Present', 'Absent', 'Late', 'Excused'],
          datasets: [
            {
              data: [
                m.present_judges ?? 0,
                m.absent_judges ?? 0,
                m.late_judges ?? 0,
                m.excused_judges ?? 0,
              ],
              backgroundColor: ['#1d4ed8', '#dc2626', '#d97706', '#4b5563'],
              borderRadius: 3,
              maxBarThickness: 44,
            },
          ],
        },
        options: commonOptions,
      });
    }
  } catch (err) {
    container.innerHTML = renderError(err.message, 'retry-dash-btn');
    container.querySelector('#retry-dash-btn')?.addEventListener('click', () => renderAdminDashboard(container));
  }
}

export async function renderAdminReports(container) {
  let activeTab = 'competitions';
  let reportData = null;
  let activityLogs = [];

  async function load() {
    container.innerHTML = renderLoading('Generating reports from live database...');
    try {
      const [rep, act] = await Promise.all([
        apiFetch('/api/reports/overview'),
        apiFetch('/api/activity?limit=60'),
      ]);
      reportData = rep;
      activityLogs = act.activityLogs || [];
      render();
    } catch (err) {
      container.innerHTML = renderError(err.message, 'retry-rep-btn');
      container.querySelector('#retry-rep-btn')?.addEventListener('click', load);
    }
  }

  function render() {
    const compRows = reportData.competitionReport || [];
    const judgeRows = reportData.judgeWorkload || [];
    const repRows = reportData.replacementsReport || [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Reports &amp; Audit Trail</h1>
          <p class="page-subtitle">Competition allocation coverage, judge workload, replacement history, and activity logs.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn" id="export-csv-btn">
            <i data-lucide="download"></i>
            <span>Export Current CSV</span>
          </button>
        </div>
      </div>

      <div class="tab-bar">
        <button type="button" class="tab-btn ${activeTab === 'competitions' ? 'active' : ''}" data-tab="competitions">Competition Summary</button>
        <button type="button" class="tab-btn ${activeTab === 'workload' ? 'active' : ''}" data-tab="workload">Judge Workload</button>
        <button type="button" class="tab-btn ${activeTab === 'replacements' ? 'active' : ''}" data-tab="replacements">Replacement History</button>
        <button type="button" class="tab-btn ${activeTab === 'activity' ? 'active' : ''}" data-tab="activity">Activity Logs</button>
      </div>

      <div class="card">
        <div class="table-wrap" id="report-table-body"></div>
      </div>
    `;

    const body = container.querySelector('#report-table-body');
    if (activeTab === 'competitions') {
      body.innerHTML =
        compRows.length === 0
          ? renderEmpty('No competitions recorded', 'Add competitions to view allocation statistics.')
          : `<table>
              <thead>
                <tr>
                  <th>Competition</th>
                  <th>Status</th>
                  <th class="td-right">Slots</th>
                  <th class="td-right">Filled Primary</th>
                  <th class="td-right">Standby Backups</th>
                  <th class="td-right">Replaced</th>
                  <th class="td-right">Present / Absent / Late</th>
                </tr>
              </thead>
              <tbody>
                ${compRows
                  .map(
                    (c) => `
                  <tr>
                    <td class="cell-title">${escapeHtml(c.name)}</td>
                    <td>${statusTag(c.status)}</td>
                    <td class="td-right mono">${c.active_slots}</td>
                    <td class="td-right mono">${c.filled_primary}</td>
                    <td class="td-right mono">${c.standby_backups}</td>
                    <td class="td-right mono">${c.replaced_count}</td>
                    <td class="td-right mono">${c.present_count} / ${c.absent_count} / ${c.late_count}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`;
    } else if (activeTab === 'workload') {
      body.innerHTML =
        judgeRows.length === 0
          ? renderEmpty('No judges recorded', 'Add judges to view workload metrics.')
          : `<table>
              <thead>
                <tr>
                  <th>Judge</th>
                  <th>Type</th>
                  <th>Invitation</th>
                  <th class="td-right">Active Primary</th>
                  <th class="td-right">Standby Backup</th>
                  <th class="td-right">Activated Backup</th>
                  <th class="td-right">Exceptions</th>
                </tr>
              </thead>
              <tbody>
                ${judgeRows
                  .map(
                    (j) => `
                  <tr>
                    <td>
                      <a href="#/admin/judges/${j.id}" class="cell-title">${escapeHtml(j.name)}</a>
                      <div class="cell-meta">${escapeHtml(j.institution)}</div>
                    </td>
                    <td>${statusTag(j.judge_type)}</td>
                    <td>${statusTag(j.invitation_status)}</td>
                    <td class="td-right mono">${j.active_primary_slots}</td>
                    <td class="td-right mono">${j.standby_backup_slots}</td>
                    <td class="td-right mono">${j.activated_backup_slots}</td>
                    <td class="td-right mono">${j.historical_exceptions}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`;
    } else if (activeTab === 'replacements') {
      body.innerHTML =
        repRows.length === 0
          ? renderEmpty('No backup replacements recorded', 'Backup activations and replacement chains will appear here.')
          : `<table>
              <thead>
                <tr>
                  <th>Competition &amp; Slot</th>
                  <th>Original Judge</th>
                  <th>Original Attendance</th>
                  <th>Replaced By (Faculty)</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                ${repRows
                  .map(
                    (r) => `
                  <tr>
                    <td>
                      <div class="cell-title">${escapeHtml(r.competition_name)}</div>
                      <div class="cell-meta">${escapeHtml(r.slot_label)}</div>
                    </td>
                    <td>${escapeHtml(r.original_judge_name)}</td>
                    <td>${r.original_attendance ? statusTag(r.original_attendance) : '—'}</td>
                    <td class="cell-title">${escapeHtml(r.replacement_judge_name)}</td>
                    <td>${escapeHtml(r.status_reason || '—')}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`;
    } else {
      body.innerHTML =
        activityLogs.length === 0
          ? renderEmpty('No audit events found', '')
          : `<table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${activityLogs
                  .map(
                    (a) => `
                  <tr>
                    <td class="mono" style="font-size:12px;">${escapeHtml(formatDateTime(a.created_at))}</td>
                    <td>${escapeHtml(a.actor_name || a.actor_role || 'SYSTEM')}</td>
                    <td class="cell-title">${escapeHtml(a.action)}</td>
                    <td>${escapeHtml(a.entity_type)} ${a.entity_id ? `#${a.entity_id}` : ''}</td>
                    <td class="mono" style="font-size:11.5px; max-width:340px; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(JSON.stringify(a.details))}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>`;
    }

    refreshIcons(container);

    container.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    container.querySelector('#export-csv-btn').addEventListener('click', () => {
      if (activeTab === 'competitions') {
        downloadCsv(
          'baust-competition-report.csv',
          ['Competition', 'Status', 'Active Slots', 'Filled Primary', 'Standby Backups', 'Replaced', 'Present', 'Absent', 'Late'],
          compRows.map((c) => [c.name, c.status, c.active_slots, c.filled_primary, c.standby_backups, c.replaced_count, c.present_count, c.absent_count, c.late_count])
        );
      } else if (activeTab === 'workload') {
        downloadCsv(
          'baust-judge-workload.csv',
          ['Judge', 'Email', 'Type', 'Institution', 'Invitation', 'Primary Slots', 'Standby Backups', 'Activated Backups', 'Exceptions'],
          judgeRows.map((j) => [j.name, j.email, j.judge_type, j.institution, j.invitation_status, j.active_primary_slots, j.standby_backup_slots, j.activated_backup_slots, j.historical_exceptions])
        );
      } else if (activeTab === 'replacements') {
        downloadCsv(
          'baust-replacement-history.csv',
          ['Competition', 'Slot', 'Original Judge', 'Original Attendance', 'Replacement Judge', 'Reason'],
          repRows.map((r) => [r.competition_name, r.slot_label, r.original_judge_name, r.original_attendance || '', r.replacement_judge_name, r.status_reason || ''])
        );
      } else {
        downloadCsv(
          'baust-activity-logs.csv',
          ['Timestamp', 'Actor', 'Role', 'Action', 'Entity Type', 'Entity ID', 'Details'],
          activityLogs.map((a) => [a.created_at, a.actor_name || '', a.actor_role || '', a.action, a.entity_type, a.entity_id || '', JSON.stringify(a.details)])
        );
      }
      showToast('CSV exported.', 'success');
    });
  }

  await load();
}

export async function renderAdminSettings(container) {
  container.innerHTML = renderLoading('Loading system settings...');
  try {
    const data = await apiFetch('/api/settings/summary');
    const admins = data.admins || [];
    const sys = data.system || {};

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">System Settings</h1>
          <p class="page-subtitle">Manage administrator accounts, password security, and invitation deadline checks.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn" id="run-expire-btn">
            <i data-lucide="clock"></i>
            <span>Expire Overdue Invitations</span>
          </button>
          <button type="button" class="btn btn-primary" id="add-admin-btn">
            <i data-lucide="user-plus"></i>
            <span>Add Administrator</span>
          </button>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));">
        <div class="kpi-card">
          <div class="kpi-label">Active User Sessions</div>
          <div class="kpi-value">${sys.active_sessions ?? 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Audit Log Events</div>
          <div class="kpi-value">${sys.total_audit_events ?? 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Database Migrations Applied</div>
          <div class="kpi-value">${sys.applied_migrations ?? 0}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Administrator Accounts</h2>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name &amp; Email</th>
                  <th>Status</th>
                  <th class="td-right">Last Login</th>
                </tr>
              </thead>
              <tbody>
                ${admins
                  .map(
                    (a) => `
                  <tr>
                    <td>
                      <div class="cell-title">${escapeHtml(a.full_name)}</div>
                      <div class="cell-meta">${escapeHtml(a.email)}</div>
                    </td>
                    <td>${statusTag(a.is_active ? 'ACTIVE' : 'DEACTIVATED')}</td>
                    <td class="td-right mono" style="font-size:12px;">${escapeHtml(formatDateTime(a.last_login_at))}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Change My Password</h2>
          </div>
          <div class="card-body">
            <form id="admin-change-pw-form">
              <div class="form-group">
                <label for="cur-pw">Current Password</label>
                <input id="cur-pw" class="input" type="password" required />
              </div>
              <div class="form-group">
                <label for="new-pw">New Password</label>
                <input id="new-pw" class="input" type="password" required minlength="8" placeholder="Minimum 8 characters" />
              </div>
              <button type="submit" class="btn btn-primary">Update Password</button>
            </form>
          </div>
        </div>
      </div>
    `;

    refreshIcons(container);

    container.querySelector('#run-expire-btn').addEventListener('click', async () => {
      try {
        const res = await apiFetch('/api/invitations/expire-overdue', { method: 'POST' });
        showToast(`Expired ${res.expiredCount} overdue invitation(s).`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    container.querySelector('#admin-change-pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = container.querySelector('#cur-pw').value;
      const newPassword = container.querySelector('#new-pw').value;
      try {
        await apiFetch('/api/auth/change-password', {
          method: 'POST',
          body: { currentPassword, newPassword },
        });
        showToast('Password updated successfully.', 'success');
        e.target.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    container.querySelector('#add-admin-btn').addEventListener('click', () => {
      openModal({
        title: 'Create Administrator Account',
        bodyHtml: `
          <form id="create-admin-form">
            <div class="form-group">
              <label for="new-admin-name">Full Name</label>
              <input id="new-admin-name" class="input" type="text" required />
            </div>
            <div class="form-group">
              <label for="new-admin-email">Email Address</label>
              <input id="new-admin-email" class="input" type="email" required />
            </div>
            <div class="form-group">
              <label for="new-admin-pw">Initial Password</label>
              <input id="new-admin-pw" class="input" type="password" required minlength="8" />
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
              <button type="button" class="btn" id="cancel-new-admin">Cancel</button>
              <button type="submit" class="btn btn-primary">Create Admin</button>
            </div>
          </form>
        `,
        onMount: (root) => {
          root.querySelector('#cancel-new-admin').addEventListener('click', closeModal);
          root.querySelector('#create-admin-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
              await apiFetch('/api/settings/admins', {
                method: 'POST',
                body: {
                  fullName: root.querySelector('#new-admin-name').value.trim(),
                  email: root.querySelector('#new-admin-email').value.trim(),
                  password: root.querySelector('#new-admin-pw').value,
                },
              });
              closeModal();
              showToast('Administrator created.', 'success');
              renderAdminSettings(container);
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        },
      });
    });
  } catch (err) {
    container.innerHTML = renderError(err.message, 'retry-set-btn');
    container.querySelector('#retry-set-btn')?.addEventListener('click', () => renderAdminSettings(container));
  }
}
