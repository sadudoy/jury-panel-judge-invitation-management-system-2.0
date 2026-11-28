import {
  apiFetch,
  closeModal,
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

export async function renderJudgeDashboard(container) {
  container.innerHTML = renderLoading('Loading your judge dashboard...');
  try {
    const data = await apiFetch('/api/judge/dashboard');
    const p = data.profile;
    const inv = data.invitation;
    const s = data.stats;
    const upcoming = data.upcomingAssignments || [];

    const needsInvitationResponse = inv && inv.response_status === 'PENDING';
    const hasPendingAssignments = Number(s.pending_confirmation || 0) > 0;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Welcome, ${escapeHtml(p.name)}</h1>
          <p class="page-subtitle">${escapeHtml(p.designation)} · ${escapeHtml(p.institution)} · ${p.judge_type === 'FACULTY' ? 'Faculty' : 'External'} Judge</p>
        </div>
        <div class="header-actions">
          <a href="#/judge/schedule" class="btn"><i data-lucide="calendar"></i><span>My Schedule</span></a>
          <a href="#/judge/assignments" class="btn btn-primary"><i data-lucide="briefcase"></i><span>My Assignments</span></a>
        </div>
      </div>

      ${
        needsInvitationResponse
          ? `<div class="callout callout-warning" style="margin-bottom:20px;">
              <div>
                <strong>Official Fest Invitation Awaiting Your Response:</strong>
                Please accept or decline before <strong>${escapeHtml(formatDateTime(inv.expiration_date))}</strong> so the committee can schedule your judging duties.
              </div>
              <a href="#/judge/invitations" class="btn btn-primary btn-sm">Respond to Invitation</a>
            </div>`
          : hasPendingAssignments
            ? `<div class="callout callout-info" style="margin-bottom:20px;">
                <div>
                  <strong>${s.pending_confirmation} Competition Assignment(s) Awaiting Confirmation:</strong>
                  Review your assigned time slot(s) and confirm or decline directly in My Assignments.
                </div>
                <a href="#/judge/assignments" class="btn btn-primary btn-sm">Review Assignments</a>
              </div>`
            : ''
      }

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Fest Invitation</div>
          <div class="kpi-value" style="font-size:18px; padding-top:4px;">${inv ? statusTag(inv.response_status) : statusTag('NOT_INVITED')}</div>
          <div class="kpi-sub">${inv ? `Deadline: ${escapeHtml(formatDateTime(inv.expiration_date))}` : 'Awaiting invitation from admin'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Pending Confirmation</div>
          <div class="kpi-value">${s.pending_confirmation}</div>
          <div class="kpi-sub">Assignments awaiting your acceptance</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Confirmed Judging Slots</div>
          <div class="kpi-value">${s.confirmed_assignments}</div>
          <div class="kpi-sub">${s.standby_assignments} Standby Backup slot(s)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Past &amp; Closed Assignments</div>
          <div class="kpi-value">${s.historical_assignments}</div>
          <div class="kpi-sub">Declined, withdrawn, or replaced slots</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Upcoming Assigned Slots</h2>
          <a href="#/judge/assignments" class="btn btn-sm">Manage Assignments</a>
        </div>
        <div class="table-wrap">
          ${
            upcoming.length === 0
              ? renderEmpty(
                  'No upcoming assignments yet',
                  inv?.response_status === 'ACCEPTED'
                    ? 'You have accepted the fest invitation. The organizing committee will assign your competition slots soon.'
                    : 'Accept your fest invitation to become eligible for competition judging assignments.'
                )
              : `<table>
                  <thead>
                    <tr>
                      <th>Competition &amp; Slot</th>
                      <th>Schedule</th>
                      <th>Venue</th>
                      <th>Role</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${upcoming
                      .map(
                        (a) => `
                      <tr>
                        <td>
                          <div class="cell-title">${escapeHtml(a.competition_name)}</div>
                          <div class="cell-meta">${escapeHtml(a.slot_label)}</div>
                        </td>
                        <td class="mono" style="font-size:12px;">${escapeHtml(formatTimeRange(a.start_time, a.end_time))}</td>
                        <td>${escapeHtml(a.venue)}</td>
                        <td>${statusTag(a.role)}</td>
                        <td>${statusTag(a.assignment_status)}</td>
                      </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>`
          }
        </div>
      </div>
    `;
    refreshIcons(container);
  } catch (err) {
    container.innerHTML = renderError(err.message, 'retry-jdash');
    container.querySelector('#retry-jdash')?.addEventListener('click', () => renderJudgeDashboard(container));
  }
}

export async function renderJudgeInvitations(container) {
  container.innerHTML = renderLoading('Loading your fest invitation...');
  try {
    const data = await apiFetch('/api/judge/invitation');
    const inv = data.invitation;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">My Fest Invitation</h1>
          <p class="page-subtitle">Review and respond to your official BAUST CSE Fest judging invitation.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">BAUST CSE Fest Judging Invitation</h2>
          ${inv ? statusTag(inv.response_status) : statusTag('NOT_INVITED')}
        </div>
        <div class="card-body">
          ${
            !inv
              ? renderEmpty('No invitation received yet', 'The Fest Administrator has not sent your invitation yet.')
              : `
                <div class="kv-grid" style="margin-bottom:20px;">
                  <div>
                    <div class="kv-item-label">Invited By</div>
                    <div class="kv-item-value">${escapeHtml(inv.sent_by_admin_name || 'Fest Administrator')}</div>
                  </div>
                  <div>
                    <div class="kv-item-label">Sent Date</div>
                    <div class="kv-item-value mono" style="font-size:13px;">${escapeHtml(formatDateTime(inv.sent_date))}</div>
                  </div>
                  <div>
                    <div class="kv-item-label">Response Deadline</div>
                    <div class="kv-item-value mono" style="font-size:13px;">${escapeHtml(formatDateTime(inv.expiration_date))}</div>
                  </div>
                  <div>
                    <div class="kv-item-label">Response Date</div>
                    <div class="kv-item-value mono" style="font-size:13px;">${escapeHtml(formatDateTime(inv.response_date))}</div>
                  </div>
                </div>

                ${
                  inv.response_status === 'PENDING'
                    ? `<div style="border-top:1px solid var(--border); padding-top:16px;">
                        <div class="form-group">
                          <label for="j-inv-note">Optional Note to Organizing Committee</label>
                          <textarea id="j-inv-note" class="input" placeholder="Any remarks, arrival timing, or preferences..."></textarea>
                        </div>
                        <div style="display:flex; gap:10px; flex-wrap:wrap;">
                          <button type="button" class="btn btn-primary" id="inv-accept-btn">Accept Invitation</button>
                          <button type="button" class="btn btn-danger" id="inv-reject-btn">Decline / Reject Invitation</button>
                        </div>
                      </div>`
                    : `<div class="callout ${
                        inv.response_status === 'ACCEPTED'
                          ? 'callout-success'
                          : inv.response_status === 'EXPIRED'
                            ? 'callout-warning'
                            : 'callout-danger'
                      }">
                        <div>
                          <strong>Invitation ${escapeHtml(inv.response_status)}</strong>
                          ${inv.response_note ? `<div class="cell-meta">Note: ${escapeHtml(inv.response_note)}</div>` : ''}
                        </div>
                      </div>`
                }
              `
          }
        </div>
      </div>
    `;
    refreshIcons(container);

    const respond = async (decision) => {
      const note = container.querySelector('#j-inv-note')?.value.trim() || null;
      try {
        await apiFetch('/api/judge/invitation/respond', {
          method: 'POST',
          body: { decision, note },
        });
        showToast(`Invitation ${decision.toLowerCase()}.`, 'success');
        renderJudgeInvitations(container);
      } catch (err) {
        showToast(err.message, 'error');
        renderJudgeInvitations(container);
      }
    };

    container.querySelector('#inv-accept-btn')?.addEventListener('click', () => respond('ACCEPTED'));
    container.querySelector('#inv-reject-btn')?.addEventListener('click', () => respond('REJECTED'));
  } catch (err) {
    container.innerHTML = renderError(err.message);
  }
}

export async function renderJudgeAssignments(container) {
  let activeTab = 'active';
  let assignments = [];

  async function load() {
    container.innerHTML = renderLoading('Loading your assignments...');
    try {
      const data = await apiFetch('/api/judge/assignments');
      assignments = data.assignments || [];
      render();
    } catch (err) {
      container.innerHTML = renderError(err.message, 'retry-jassign');
      container.querySelector('#retry-jassign')?.addEventListener('click', load);
    }
  }

  function render() {
    const activeStatuses = ['ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP'];
    const filtered =
      activeTab === 'active'
        ? assignments.filter((a) => activeStatuses.includes(a.assignment_status))
        : assignments.filter((a) => !activeStatuses.includes(a.assignment_status));

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">My Assignments</h1>
          <p class="page-subtitle">Confirm or decline assigned competition slots and review your complete judging assignment history.</p>
        </div>
      </div>

      <div class="tab-bar">
        <button type="button" class="tab-btn ${activeTab === 'active' ? 'active' : ''}" data-tab="active">
          Active &amp; Pending (${assignments.filter((a) => activeStatuses.includes(a.assignment_status)).length})
        </button>
        <button type="button" class="tab-btn ${activeTab === 'history' ? 'active' : ''}" data-tab="history">
          Past &amp; Closed (${assignments.filter((a) => !activeStatuses.includes(a.assignment_status)).length})
        </button>
      </div>

      <div class="card">
        <div class="table-wrap">
          ${
            filtered.length === 0
              ? renderEmpty(
                  activeTab === 'active' ? 'No active or pending assignments' : 'No historical assignments',
                  activeTab === 'active'
                    ? 'When the committee assigns you to a competition slot, it will appear here for confirmation.'
                    : 'Declined, withdrawn, replaced, or cancelled assignments remain archived here.'
                )
              : `<table>
                  <thead>
                    <tr>
                      <th>Competition &amp; Slot</th>
                      <th>Schedule &amp; Venue</th>
                      <th>Role</th>
                      <th>Your Response</th>
                      <th>Status</th>
                      <th>Attendance</th>
                      <th class="td-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filtered
                      .map(
                        (a) => `
                      <tr>
                        <td>
                          <div class="cell-title">${escapeHtml(a.competition_name)}</div>
                          <div class="cell-meta">${escapeHtml(a.slot_label)}</div>
                        </td>
                        <td>
                          <div class="mono" style="font-size:12px;">${escapeHtml(formatTimeRange(a.start_time, a.end_time))}</div>
                          <div class="cell-meta">${escapeHtml(a.venue)}</div>
                        </td>
                        <td>${statusTag(a.role)}</td>
                        <td>${statusTag(a.response_status)}</td>
                        <td>
                          ${statusTag(a.assignment_status)}
                          ${a.status_reason ? `<div class="cell-meta">${escapeHtml(a.status_reason)}</div>` : ''}
                        </td>
                        <td>${a.attendance_status ? statusTag(a.attendance_status) : '—'}</td>
                        <td class="td-right">
                          <div class="td-actions">
                            ${
                              a.response_status === 'PENDING' &&
                              ['ASSIGNED', 'STANDBY'].includes(a.assignment_status)
                                ? `<button type="button" class="btn btn-sm btn-primary j-accept-btn" data-id="${a.id}">Accept</button>
                                   <button type="button" class="btn btn-sm btn-danger j-decline-btn" data-id="${a.id}">Decline</button>`
                                : activeStatuses.includes(a.assignment_status)
                                  ? `<button type="button" class="btn btn-sm btn-danger j-withdraw-btn" data-id="${a.id}">Withdraw</button>`
                                  : ''
                            }
                          </div>
                        </td>
                      </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>`
          }
        </div>
      </div>
    `;
    refreshIcons(container);

    container.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    container.querySelectorAll('.j-accept-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/judge/assignments/${btn.dataset.id}/respond`, {
            method: 'POST',
            body: { decision: 'ACCEPT' },
          });
          showToast('Assignment confirmed.', 'success');
          load();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    const openReasonModal = (id, decision, title, btnLabel) => {
      openModal({
        title,
        bodyHtml: `
          <form id="j-resp-form">
            <div class="form-group">
              <label for="j-resp-note">Reason / Note</label>
              <textarea id="j-resp-note" class="input" required placeholder="Please provide a brief reason for the organizing committee..."></textarea>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
              <button type="button" class="btn" id="j-resp-cancel">Cancel</button>
              <button type="submit" class="btn btn-danger">${escapeHtml(btnLabel)}</button>
            </div>
          </form>
        `,
        onMount: (root) => {
          root.querySelector('#j-resp-cancel').addEventListener('click', closeModal);
          root.querySelector('#j-resp-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
              await apiFetch(`/api/judge/assignments/${id}/respond`, {
                method: 'POST',
                body: { decision, note: root.querySelector('#j-resp-note').value.trim() },
              });
              closeModal();
              showToast(`Assignment ${decision.toLowerCase()}ed.`, 'success');
              load();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        },
      });
    };

    container.querySelectorAll('.j-decline-btn').forEach((btn) => {
      btn.addEventListener('click', () =>
        openReasonModal(btn.dataset.id, 'DECLINE', 'Decline Assignment', 'Confirm Decline')
      );
    });
    container.querySelectorAll('.j-withdraw-btn').forEach((btn) => {
      btn.addEventListener('click', () =>
        openReasonModal(btn.dataset.id, 'WITHDRAW', 'Withdraw From Assignment', 'Confirm Withdrawal')
      );
    });
  }

  await load();
}

export async function renderJudgeSchedule(container) {
  container.innerHTML = renderLoading('Loading competition schedule...');
  try {
    const data = await apiFetch('/api/judge/schedule');
    const mySchedule = data.mySchedule || [];
    const allSlots = data.slotsWithAvailability || [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">My Schedule &amp; Availability</h1>
          <p class="page-subtitle">View your confirmed judging timetable and declare your availability for fest slots.</p>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">My Assigned Timetable (${mySchedule.length})</h2>
          </div>
          <div class="table-wrap">
            ${
              mySchedule.length === 0
                ? renderEmpty('No scheduled judging slots', 'Confirmed and pending slot assignments will appear here in chronological order.')
                : `<table>
                    <thead>
                      <tr>
                        <th>Date &amp; Time</th>
                        <th>Competition &amp; Slot</th>
                        <th>Venue</th>
                        <th>Role</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${mySchedule
                        .map(
                          (s) => `
                        <tr>
                          <td class="mono" style="font-size:12px;">${escapeHtml(formatTimeRange(s.start_time, s.end_time))}</td>
                          <td>
                            <div class="cell-title">${escapeHtml(s.competition_name)}</div>
                            <div class="cell-meta">${escapeHtml(s.slot_label)}</div>
                          </td>
                          <td>${escapeHtml(s.venue)}</td>
                          <td>${statusTag(s.role)}</td>
                          <td>${statusTag(s.assignment_status)}</td>
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
            <h2 class="card-title">Declare Slot Availability</h2>
            <span class="cell-meta">Lets organizers know when you are free so they can avoid scheduling clashes.</span>
          </div>
          <div class="table-wrap">
            ${
              allSlots.length === 0
                ? renderEmpty('No competition slots published yet', '')
                : `<table>
                    <thead>
                      <tr>
                        <th>Competition &amp; Slot</th>
                        <th>Schedule</th>
                        <th>Venue</th>
                        <th>Current Status</th>
                        <th class="td-right">Set Availability</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${allSlots
                        .map(
                          (s) => `
                        <tr>
                          <td>
                            <div class="cell-title">${escapeHtml(s.competition_name)}</div>
                            <div class="cell-meta">${escapeHtml(s.slot_label)}</div>
                          </td>
                          <td class="mono" style="font-size:12px;">${escapeHtml(formatTimeRange(s.start_time, s.end_time))}</td>
                          <td>${escapeHtml(s.venue)}</td>
                          <td>${statusTag(s.availability_status)}</td>
                          <td class="td-right">
                            <div class="td-actions">
                              <button type="button" class="btn btn-sm ${s.availability_status === 'AVAILABLE' ? 'btn-success' : ''} set-avail-btn" data-slot-id="${s.slot_id}" data-status="AVAILABLE">Available</button>
                              <button type="button" class="btn btn-sm ${s.availability_status === 'TENTATIVE' ? 'btn-warning' : ''} set-avail-btn" data-slot-id="${s.slot_id}" data-status="TENTATIVE">Tentative</button>
                              <button type="button" class="btn btn-sm ${s.availability_status === 'UNAVAILABLE' ? 'btn-danger' : ''} set-avail-btn" data-slot-id="${s.slot_id}" data-status="UNAVAILABLE">Unavailable</button>
                            </div>
                          </td>
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

    container.querySelectorAll('.set-avail-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiFetch('/api/judge/availability', {
            method: 'POST',
            body: {
              slotId: Number(btn.dataset.slotId),
              availabilityStatus: btn.dataset.status,
            },
          });
          showToast(`Availability set to ${btn.dataset.status}.`, 'success');
          renderJudgeSchedule(container);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = renderError(err.message);
  }
}

export async function renderJudgeProfile(container) {
  container.innerHTML = renderLoading('Loading your profile...');
  try {
    const data = await apiFetch('/api/judge/profile');
    const p = data.profile;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">My Profile</h1>
          <p class="page-subtitle">Review your judge profile details and update contact information or password.</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Judge Information</h2>
            <div>${statusTag(p.judge_type)} ${statusTag(p.is_active ? 'ACTIVE' : 'DEACTIVATED')}</div>
          </div>
          <div class="card-body">
            <form id="judge-profile-form">
              <div class="form-row">
                <div class="form-group">
                  <label>Full Name</label>
                  <input class="input" type="text" value="${escapeHtml(p.name)}" disabled />
                </div>
                <div class="form-group">
                  <label>Email Address</label>
                  <input class="input" type="email" value="${escapeHtml(p.email)}" disabled />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="jp-desig">Designation</label>
                  <input id="jp-desig" class="input" type="text" required value="${escapeHtml(p.designation)}" />
                </div>
                <div class="form-group">
                  <label for="jp-inst">Institution</label>
                  <input id="jp-inst" class="input" type="text" required value="${escapeHtml(p.institution)}" />
                </div>
              </div>
              <div class="form-group">
                <label for="jp-phone">Phone Number</label>
                <input id="jp-phone" class="input" type="text" value="${escapeHtml(p.phone || '')}" />
              </div>
              <div class="form-group">
                <label for="jp-exp">Areas of Expertise</label>
                <input id="jp-exp" class="input" type="text" value="${escapeHtml(p.expertise || '')}" />
              </div>
              <button type="submit" class="btn btn-primary">Save Profile</button>
            </form>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Change Password</h2>
          </div>
          <div class="card-body">
            <form id="judge-pw-form">
              <div class="form-group">
                <label for="j-cur-pw">Current Password</label>
                <input id="j-cur-pw" class="input" type="password" required />
              </div>
              <div class="form-group">
                <label for="j-new-pw">New Password</label>
                <input id="j-new-pw" class="input" type="password" required minlength="8" placeholder="Minimum 8 characters" />
              </div>
              <button type="submit" class="btn btn-primary">Update Password</button>
            </form>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#judge-profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiFetch('/api/judge/profile', {
          method: 'PUT',
          body: {
            designation: container.querySelector('#jp-desig').value.trim(),
            institution: container.querySelector('#jp-inst').value.trim(),
            phone: container.querySelector('#jp-phone').value.trim() || null,
            expertise: container.querySelector('#jp-exp').value.trim() || null,
          },
        });
        showToast('Profile saved.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    container.querySelector('#judge-pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await apiFetch('/api/auth/change-password', {
          method: 'POST',
          body: {
            currentPassword: container.querySelector('#j-cur-pw').value,
            newPassword: container.querySelector('#j-new-pw').value,
          },
        });
        showToast('Password updated.', 'success');
        e.target.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  } catch (err) {
    container.innerHTML = renderError(err.message);
  }
}
