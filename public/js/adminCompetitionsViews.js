import {
  apiFetch,
  closeModal,
  escapeHtml,
  formatTimeRange,
  openModal,
  refreshIcons,
  renderEmpty,
  renderError,
  renderLoading,
  showToast,
  statusTag,
  toLocalDatetimeInputValue,
} from './api.js';

export async function renderAdminCompetitions(container) {
  let competitions = [];

  async function load() {
    container.innerHTML = renderLoading('Loading competitions...');
    try {
      const data = await apiFetch('/api/competitions');
      competitions = data.competitions || [];
      render();
    } catch (err) {
      container.innerHTML = renderError(err.message, 'retry-comp-btn');
      container.querySelector('#retry-comp-btn')?.addEventListener('click', load);
    }
  }

  function openCompModal(comp = null) {
    const isEdit = Boolean(comp);
    openModal({
      title: isEdit ? `Edit Competition – ${comp.name}` : 'Create Competition',
      bodyHtml: `
        <form id="comp-form">
          <div class="form-group">
            <label for="c-name">Competition Name</label>
            <input id="c-name" class="input" type="text" required value="${escapeHtml(comp?.name || '')}" placeholder="e.g. Line Follower Robot, Hackathon" />
          </div>
          <div class="form-group">
            <label for="c-desc">Description</label>
            <textarea id="c-desc" class="input" placeholder="Scope, judging criteria, or notes...">${escapeHtml(comp?.description || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="c-req">Required Primary Judges per Slot</label>
              <input id="c-req" class="input" type="number" min="1" required value="${comp?.required_primary_judges || 2}" />
            </div>
            <div class="form-group">
              <label for="c-status">Status</label>
              <select id="c-status" class="input">
                <option value="DRAFT" ${comp?.status === 'DRAFT' ? 'selected' : ''}>Draft (Not Open Yet)</option>
                <option value="OPEN" ${!comp || comp?.status === 'OPEN' ? 'selected' : ''}>Open</option>
                <option value="ONGOING" ${comp?.status === 'ONGOING' ? 'selected' : ''}>Ongoing</option>
                <option value="COMPLETED" ${comp?.status === 'COMPLETED' ? 'selected' : ''}>Completed</option>
              </select>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn" id="c-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Competition'}</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#c-cancel').addEventListener('click', closeModal);
        root.querySelector('#comp-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const payload = {
            name: root.querySelector('#c-name').value.trim(),
            description: root.querySelector('#c-desc').value.trim() || null,
            requiredPrimaryJudges: Number(root.querySelector('#c-req').value),
            status: root.querySelector('#c-status').value,
          };
          try {
            if (isEdit) {
              await apiFetch(`/api/competitions/${comp.id}`, { method: 'PUT', body: payload });
              showToast('Competition updated.', 'success');
            } else {
              await apiFetch('/api/competitions', { method: 'POST', body: payload });
              showToast('Competition created.', 'success');
            }
            closeModal();
            load();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      },
    });
  }

  function render() {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Competitions</h1>
          <p class="page-subtitle">Set up BAUST CSE Fest competitions, how many primary judges each slot needs, and their current status.</p>
        </div>
        <div class="header-actions">
          <a href="#/admin/slots" class="btn"><i data-lucide="calendar"></i><span>Manage Slots</span></a>
          <button type="button" class="btn btn-primary" id="new-comp-btn">
            <i data-lucide="plus"></i>
            <span>New Competition</span>
          </button>
        </div>
      </div>

      <div class="card">
        <div class="table-wrap">
          ${
            competitions.length === 0
              ? renderEmpty(
                  'No competitions created',
                  'Create your first competition to configure time slots and judge allocations.',
                  '<button type="button" class="btn btn-primary btn-sm" id="empty-new-comp">Create Competition</button>'
                )
              : `<table>
                  <thead>
                    <tr>
                      <th>Competition</th>
                      <th class="td-right">Required / Slot</th>
                      <th class="td-right">Active Slots</th>
                      <th class="td-right">Filled Primary</th>
                      <th class="td-right">Standby Backups</th>
                      <th class="td-right">Vacant</th>
                      <th>Status</th>
                      <th class="td-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${competitions
                      .map(
                        (c) => `
                      <tr>
                        <td>
                          <div class="cell-title">${escapeHtml(c.name)}</div>
                          <div class="cell-meta">${escapeHtml(c.description || '—')}</div>
                        </td>
                        <td class="td-right mono">${c.required_primary_judges}</td>
                        <td class="td-right mono">${c.active_slots} / ${c.total_slots}</td>
                        <td class="td-right mono">${c.filled_primary_positions}</td>
                        <td class="td-right mono">${c.standby_backup_positions}</td>
                        <td class="td-right">${
                          c.vacant_positions > 0
                            ? statusTag(`${c.vacant_positions} VACANT`)
                            : statusTag('CONFIRMED')
                        }</td>
                        <td>${statusTag(c.status)}</td>
                        <td class="td-right">
                          <div class="td-actions">
                            <a href="#/admin/slots?competitionId=${c.id}" class="btn btn-sm">Slots</a>
                            ${
                              c.status !== 'CANCELLED'
                                ? `<button type="button" class="btn btn-sm edit-comp-btn" data-id="${c.id}">Edit</button>
                                   <button type="button" class="btn btn-sm btn-danger cancel-comp-btn" data-id="${c.id}">Cancel</button>`
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

    container.querySelector('#new-comp-btn')?.addEventListener('click', () => openCompModal(null));
    container.querySelector('#empty-new-comp')?.addEventListener('click', () => openCompModal(null));

    const byId = new Map(competitions.map((c) => [c.id, c]));
    container.querySelectorAll('.edit-comp-btn').forEach((btn) => {
      btn.addEventListener('click', () => openCompModal(byId.get(Number(btn.dataset.id))));
    });

    container.querySelectorAll('.cancel-comp-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const comp = byId.get(Number(btn.dataset.id));
        openModal({
          title: `Cancel Competition – ${comp.name}`,
          bodyHtml: `
            <div class="callout callout-danger" style="margin-bottom:14px;">
              Cancelling this competition will cancel all of its time slots and release all
              assigned and backup judges (past records will still be saved).
            </div>
            <div class="form-group">
              <label for="cancel-comp-reason">Cancellation Reason</label>
              <input id="cancel-comp-reason" class="input" type="text" required value="Competition cancelled by organizing committee" />
            </div>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
              <button type="button" class="btn" id="cc-abort">Back</button>
              <button type="button" class="btn btn-danger" id="cc-confirm">Confirm Cancellation</button>
            </div>
          `,
          onMount: (root) => {
            root.querySelector('#cc-abort').addEventListener('click', closeModal);
            root.querySelector('#cc-confirm').addEventListener('click', async () => {
              try {
                const res = await apiFetch(`/api/competitions/${comp.id}/cancel`, {
                  method: 'POST',
                  body: { reason: root.querySelector('#cancel-comp-reason').value.trim() },
                });
                closeModal();
                showToast(
                  `Competition cancelled (${res.cancelledSlotsCount} slot(s) and ${res.cancelledAssignmentsCount} assignment(s) marked cancelled).`,
                  'success'
                );
                load();
              } catch (err) {
                showToast(err.message, 'error');
              }
            });
          },
        });
      });
    });
  }

  await load();
}

export async function renderAdminSlots(container, initialCompetitionId = '') {
  let competitions = [];
  let slots = [];
  let selectedCompetitionId = initialCompetitionId ? String(initialCompetitionId) : '';
  let selectedStatus = '';

  async function load() {
    container.innerHTML = renderLoading('Loading competition slots...');
    try {
      const params = new URLSearchParams();
      if (selectedCompetitionId) params.set('competitionId', selectedCompetitionId);
      if (selectedStatus) params.set('status', selectedStatus);

      const [compData, slotData] = await Promise.all([
        apiFetch('/api/competitions'),
        apiFetch(`/api/slots?${params.toString()}`),
      ]);
      competitions = compData.competitions || [];
      slots = slotData.slots || [];
      render();
    } catch (err) {
      container.innerHTML = renderError(err.message, 'retry-slots-btn');
      container.querySelector('#retry-slots-btn')?.addEventListener('click', load);
    }
  }

  function openSlotModal(slot = null) {
    const isEdit = Boolean(slot);
    const activeComps = competitions.filter((c) => c.status !== 'CANCELLED');
    if (!isEdit && activeComps.length === 0) {
      showToast('Create an active competition first.', 'warning');
      return;
    }

    const defaultStart = toLocalDatetimeInputValue(
      slot?.start_time || new Date(Date.now() + 3 * 86400_000).toISOString()
    );
    const defaultEnd = toLocalDatetimeInputValue(
      slot?.end_time || new Date(Date.now() + 3 * 86400_000 + 2 * 3600_000).toISOString()
    );

    openModal({
      title: isEdit ? `Reschedule / Edit Slot – ${slot.slot_label}` : 'Create Competition Slot',
      bodyHtml: `
        <form id="slot-form">
          ${
            !isEdit
              ? `<div class="form-group">
                  <label for="s-comp">Competition</label>
                  <select id="s-comp" class="input" required>
                    ${activeComps
                      .map(
                        (c) =>
                          `<option value="${c.id}" ${String(c.id) === selectedCompetitionId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
                      )
                      .join('')}
                  </select>
                </div>`
              : `<p class="form-hint" style="margin-top:0;">Competition: <strong>${escapeHtml(slot.competition_name)}</strong></p>`
          }
          <div class="form-row">
            <div class="form-group">
              <label for="s-label">Slot Label</label>
              <input id="s-label" class="input" type="text" required value="${escapeHtml(slot?.slot_label || '')}" placeholder="e.g. Round 1 – Morning" />
            </div>
            <div class="form-group">
              <label for="s-venue">Venue</label>
              <input id="s-venue" class="input" type="text" required value="${escapeHtml(slot?.venue || '')}" placeholder="e.g. Main Auditorium" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="s-start">Start Time</label>
              <input id="s-start" class="input" type="datetime-local" required value="${escapeHtml(defaultStart)}" />
            </div>
            <div class="form-group">
              <label for="s-end">End Time</label>
              <input id="s-end" class="input" type="datetime-local" required value="${escapeHtml(defaultEnd)}" />
            </div>
          </div>
          <div id="slot-conflict-box" style="display:none; margin-bottom:14px;"></div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;" id="slot-modal-actions">
            <button type="button" class="btn" id="s-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" id="s-save">${isEdit ? 'Save Slot' : 'Create Slot'}</button>
          </div>
        </form>
      `,
      onMount: (root) => {
        root.querySelector('#s-cancel').addEventListener('click', closeModal);
        const conflictBox = root.querySelector('#slot-conflict-box');

        async function submitSlot(conflictResolution = 'BLOCK') {
          const payload = {
            slotLabel: root.querySelector('#s-label').value.trim(),
            venue: root.querySelector('#s-venue').value.trim(),
            startTime: new Date(root.querySelector('#s-start').value).toISOString(),
            endTime: new Date(root.querySelector('#s-end').value).toISOString(),
            ...(isEdit ? { conflictResolution } : { competitionId: Number(root.querySelector('#s-comp').value) }),
          };

          try {
            if (isEdit) {
              const res = await apiFetch(`/api/slots/${slot.id}`, { method: 'PUT', body: payload });
              closeModal();
              const withdrawnCount = res.withdrawnConflictingAssignments?.length || 0;
              showToast(
                withdrawnCount > 0
                  ? `Slot rescheduled; ${withdrawnCount} conflicting assignment(s) withdrawn.`
                  : 'Slot updated.',
                'success'
              );
            } else {
              await apiFetch('/api/slots', { method: 'POST', body: payload });
              closeModal();
              showToast('Competition slot created.', 'success');
            }
            load();
          } catch (err) {
            if (err.status === 409 && Array.isArray(err.details?.conflicts)) {
              const items = err.details.conflicts
                .map(
                  (c) =>
                    `<li><strong>${escapeHtml(c.judge_name)}</strong> (${escapeHtml(c.role)}) overlaps with <em>${escapeHtml(c.conflicting_competition)} – ${escapeHtml(c.conflicting_slot_label)}</em></li>`
                )
                .join('');
              conflictBox.style.display = 'block';
              conflictBox.innerHTML = `
                <div class="callout callout-danger" style="flex-direction:column;">
                  <div><strong>Time Conflict Found!</strong> Changing this slot overlaps with another assignment for:</div>
                  <ul style="margin:6px 0 8px 18px; padding:0;">${items}</ul>
                  <button type="button" class="btn btn-danger btn-sm" id="force-resched-btn">
                    Save New Time &amp; Release Conflicting Judges
                  </button>
                </div>
              `;
              conflictBox.querySelector('#force-resched-btn').addEventListener('click', () => {
                submitSlot('WITHDRAW_CONFLICTING');
              });
            } else {
              showToast(err.message, 'error');
            }
          }
        }

        root.querySelector('#slot-form').addEventListener('submit', (e) => {
          e.preventDefault();
          submitSlot('BLOCK');
        });
      },
    });
  }

  function render() {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Competition Slots</h1>
          <p class="page-subtitle">Set venues and time schedules, catch time overlaps, and monitor open judge seats.</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-primary" id="add-slot-btn">
            <i data-lucide="plus"></i>
            <span>Add Slot</span>
          </button>
        </div>
      </div>

      <div class="card">
        <div class="filter-bar">
          <select id="slot-comp-filter" class="input" style="width:auto; min-width:220px;">
            <option value="">All Competitions</option>
            ${competitions
              .map(
                (c) =>
                  `<option value="${c.id}" ${String(c.id) === selectedCompetitionId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
              )
              .join('')}
          </select>
          <select id="slot-status-filter" class="input" style="width:auto; min-width:150px;">
            <option value="">All Statuses</option>
            <option value="SCHEDULED" ${selectedStatus === 'SCHEDULED' ? 'selected' : ''}>Scheduled</option>
            <option value="RESCHEDULED" ${selectedStatus === 'RESCHEDULED' ? 'selected' : ''}>Rescheduled</option>
            <option value="COMPLETED" ${selectedStatus === 'COMPLETED' ? 'selected' : ''}>Completed</option>
            <option value="CANCELLED" ${selectedStatus === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        <div class="table-wrap">
          ${
            slots.length === 0
              ? renderEmpty('No slots found', 'Create a time slot for an active competition.')
              : `<table>
                  <thead>
                    <tr>
                      <th>Competition &amp; Slot</th>
                      <th>Schedule Window</th>
                      <th>Venue</th>
                      <th class="td-right">Primary</th>
                      <th class="td-right">Standby</th>
                      <th class="td-right">Vacant</th>
                      <th>Status</th>
                      <th class="td-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${slots
                      .map(
                        (s) => `
                      <tr>
                        <td>
                          <div class="cell-title">${escapeHtml(s.competition_name)}</div>
                          <div class="cell-meta">${escapeHtml(s.slot_label)}</div>
                        </td>
                        <td class="mono" style="font-size:12px;">${escapeHtml(formatTimeRange(s.start_time, s.end_time))}</td>
                        <td>${escapeHtml(s.venue)}</td>
                        <td class="td-right mono">${s.filled_primary_count}/${s.required_primary_judges}</td>
                        <td class="td-right mono">${s.standby_backup_count}</td>
                        <td class="td-right">${
                          s.vacant_positions > 0
                            ? statusTag(`${s.vacant_positions} VACANT`)
                            : statusTag('CONFIRMED')
                        }</td>
                        <td>${statusTag(s.status)}</td>
                        <td class="td-right">
                          <div class="td-actions">
                            ${
                              s.status !== 'CANCELLED' && s.competition_status !== 'CANCELLED'
                                ? `<a href="#/admin/allocation?slotId=${s.id}" class="btn btn-sm btn-primary">Allocate</a>
                                   <button type="button" class="btn btn-sm edit-slot-btn" data-id="${s.id}">Reschedule</button>
                                   <button type="button" class="btn btn-sm btn-danger cancel-slot-btn" data-id="${s.id}">Cancel</button>`
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

    container.querySelector('#add-slot-btn').addEventListener('click', () => openSlotModal(null));
    container.querySelector('#slot-comp-filter').addEventListener('change', (e) => {
      selectedCompetitionId = e.target.value;
      load();
    });
    container.querySelector('#slot-status-filter').addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      load();
    });

    const byId = new Map(slots.map((s) => [s.id, s]));
    container.querySelectorAll('.edit-slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => openSlotModal(byId.get(Number(btn.dataset.id))));
    });
    container.querySelectorAll('.cancel-slot-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const s = byId.get(Number(btn.dataset.id));
        try {
          const res = await apiFetch(`/api/slots/${s.id}/cancel`, { method: 'POST', body: {} });
          showToast(`Slot cancelled (${res.cancelledAssignmentsCount} assignment(s) released).`, 'success');
          load();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  await load();
}

export async function renderAdminAllocation(container, initialSlotId = '') {
  let slots = [];
  let selectedSlotId = initialSlotId ? Number(initialSlotId) : null;

  async function loadAll() {
    container.innerHTML = renderLoading('Loading allocation workspace...');
    try {
      const slotData = await apiFetch('/api/slots');
      slots = (slotData.slots || []).filter(
        (s) => s.status !== 'CANCELLED' && s.competition_status !== 'CANCELLED'
      );

      if (slots.length === 0) {
        container.innerHTML = `
          <div class="page-header">
            <div>
              <h1 class="page-title">Judge Allocation</h1>
              <p class="page-subtitle">Assign accepted judges to competition slots as Primary or Standby Backup.</p>
            </div>
          </div>
          <div class="card">
            ${renderEmpty('No active competition slots available', 'Create a competition and slot before assigning judges.', '<a href="#/admin/slots" class="btn btn-primary btn-sm">Go to Slots</a>')}
          </div>
        `;
        return;
      }

      if (!selectedSlotId || !slots.some((s) => s.id === selectedSlotId)) {
        selectedSlotId = slots[0].id;
      }

      const [slotDetail, eligibleData] = await Promise.all([
        apiFetch(`/api/slots/${selectedSlotId}`),
        apiFetch(`/api/assignments/eligible/${selectedSlotId}`),
      ]);

      renderWorkspace(slotDetail.slot, slotDetail.assignments || [], eligibleData.eligibleJudges || []);
    } catch (err) {
      container.innerHTML = renderError(err.message, 'retry-alloc-btn');
      container.querySelector('#retry-alloc-btn')?.addEventListener('click', loadAll);
    }
  }

  function renderWorkspace(slot, assignments, eligibleJudges) {
    const filledPrimary = assignments.filter(
      (a) =>
        (a.role === 'PRIMARY' && ['ASSIGNED', 'CONFIRMED'].includes(a.assignment_status)) ||
        a.assignment_status === 'ACTIVATED_BACKUP'
    ).length;
    const standbyCount = assignments.filter(
      (a) => a.role === 'BACKUP' && a.assignment_status === 'STANDBY'
    ).length;
    const vacant = Math.max(0, Number(slot.required_primary_judges) - filledPrimary);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Judge Allocation</h1>
          <p class="page-subtitle">Assign judges who accepted their fest invitation, with live availability and time-conflict checks.</p>
        </div>
        <div class="header-actions">
          <select id="alloc-slot-select" class="input" style="min-width:280px;">
            ${slots
              .map(
                (s) =>
                  `<option value="${s.id}" ${s.id === selectedSlotId ? 'selected' : ''}>${escapeHtml(s.competition_name)} — ${escapeHtml(s.slot_label)} (${s.vacant_positions} vacant)</option>`
              )
              .join('')}
          </select>
        </div>
      </div>

      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));">
        <div class="kpi-card">
          <div class="kpi-label">Selected Slot</div>
          <div class="kpi-value" style="font-size:17px;">${escapeHtml(slot.competition_name)}</div>
          <div class="kpi-sub">${escapeHtml(slot.slot_label)} · ${escapeHtml(slot.venue)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Schedule Window</div>
          <div class="kpi-value mono" style="font-size:14.5px; line-height:1.35;">${escapeHtml(formatTimeRange(slot.start_time, slot.end_time))}</div>
          <div class="kpi-sub">Status: ${escapeHtml(slot.status)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Primary Coverage</div>
          <div class="kpi-value">${filledPrimary} / ${slot.required_primary_judges}</div>
          <div class="kpi-sub">${vacant > 0 ? `${vacant} vacant position(s)` : 'All primary positions filled'}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Standby Faculty Backups</div>
          <div class="kpi-value">${standbyCount}</div>
          <div class="kpi-sub">Ready for competition-day activation</div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">Current Slot Assignments (${assignments.length})</h2>
            <a href="#/admin/backups" class="btn btn-sm">Backup Management</a>
          </div>
          <div class="table-wrap">
            ${
              assignments.length === 0
                ? renderEmpty('No judges assigned to this slot yet', 'Select accepted judges from the eligible roster below.')
                : `<table>
                    <thead>
                      <tr>
                        <th>Judge</th>
                        <th>Type</th>
                        <th>Role</th>
                        <th>Judge Response</th>
                        <th>Assignment Status</th>
                        <th>Notes</th>
                        <th class="td-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${assignments
                        .map(
                          (a) => `
                        <tr>
                          <td>
                            <a href="#/admin/judges/${a.judge_id}" class="cell-title">${escapeHtml(a.judge_name)}</a>
                            <div class="cell-meta">${escapeHtml(a.institution)}</div>
                          </td>
                          <td>${statusTag(a.judge_type)}</td>
                          <td>${statusTag(a.role)}</td>
                          <td>${statusTag(a.response_status)}</td>
                          <td>${statusTag(a.assignment_status)}</td>
                          <td class="cell-meta">
                            ${a.replaced_judge_name ? `Replaced ${escapeHtml(a.replaced_judge_name)}. ` : ''}
                            ${escapeHtml(a.status_reason || '—')}
                          </td>
                          <td class="td-right">
                            ${
                              ['ASSIGNED', 'CONFIRMED', 'STANDBY', 'ACTIVATED_BACKUP'].includes(a.assignment_status)
                                ? `<button type="button" class="btn btn-sm btn-danger withdraw-assign-btn" data-id="${a.id}">Withdraw</button>`
                                : ''
                            }
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
            <h2 class="card-title">Eligible Accepted Judges (${eligibleJudges.length})</h2>
            <span class="cell-meta">Only active judges who have accepted their fest invitation appear here. Only Faculty judges can be assigned as backups.</span>
          </div>
          <div class="table-wrap">
            ${
              eligibleJudges.length === 0
                ? renderEmpty('No accepted judges available yet', 'Judges need to accept their fest invitation before they can be assigned to slots.')
                : `<table>
                    <thead>
                      <tr>
                        <th>Judge</th>
                        <th>Type</th>
                        <th>Slot Availability</th>
                        <th class="td-right">Workload</th>
                        <th>Conflict Check</th>
                        <th class="td-right">Assign</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${eligibleJudges
                        .map((j) => {
                          const conflicts = j.conflicting_slots || [];
                          const disabledReason = j.already_assigned_to_slot
                            ? 'Already assigned to this slot'
                            : j.has_conflict
                              ? 'Overlapping schedule conflict'
                              : '';
                          return `
                          <tr>
                            <td>
                              <div class="cell-title">${escapeHtml(j.name)}</div>
                              <div class="cell-meta">${escapeHtml(j.designation)} · ${escapeHtml(j.institution)}</div>
                            </td>
                            <td>${statusTag(j.judge_type)}</td>
                            <td>${statusTag(j.availability_status)}</td>
                            <td class="td-right mono">${j.total_active_assignments} active</td>
                            <td>
                              ${
                                j.already_assigned_to_slot
                                  ? statusTag('ASSIGNED')
                                  : j.has_conflict
                                    ? `<div style="color:var(--danger-text); font-size:12px; font-weight:600;">
                                        Conflict: ${escapeHtml(conflicts.map((c) => `${c.competitionName} (${c.slotLabel})`).join(', '))}
                                       </div>`
                                    : '<span style="color:var(--success-text); font-size:12px; font-weight:600;">Available (no conflict)</span>'
                              }
                            </td>
                            <td class="td-right">
                              <div class="td-actions">
                                <button
                                  type="button"
                                  class="btn btn-sm btn-primary assign-btn"
                                  data-judge-id="${j.id}"
                                  data-role="PRIMARY"
                                  ${disabledReason || vacant === 0 ? 'disabled' : ''}
                                  title="${escapeHtml(disabledReason || (vacant === 0 ? 'Primary positions full' : 'Assign as Primary Judge'))}"
                                >
                                  Primary
                                </button>
                                ${
                                  j.judge_type === 'FACULTY'
                                    ? `<button
                                        type="button"
                                        class="btn btn-sm assign-btn"
                                        data-judge-id="${j.id}"
                                        data-role="BACKUP"
                                        ${disabledReason ? 'disabled' : ''}
                                        title="${escapeHtml(disabledReason || 'Pre-assign as Standby Backup')}"
                                      >
                                        Backup
                                      </button>`
                                    : ''
                                }
                              </div>
                            </td>
                          </tr>`;
                        })
                        .join('')}
                    </tbody>
                  </table>`
            }
          </div>
        </div>
      </div>
    `;
    refreshIcons(container);

    container.querySelector('#alloc-slot-select').addEventListener('change', (e) => {
      selectedSlotId = Number(e.target.value);
      loadAll();
    });

    container.querySelectorAll('.assign-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const judgeId = Number(btn.dataset.judgeId);
        const role = btn.dataset.role;
        btn.disabled = true;
        try {
          await apiFetch('/api/assignments', {
            method: 'POST',
            body: { judgeId, slotId: selectedSlotId, role },
          });
          showToast(`Assigned judge as ${role}.`, 'success');
          loadAll();
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll('.withdraw-assign-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        try {
          await apiFetch(`/api/assignments/${id}/withdraw`, {
            method: 'POST',
            body: { reason: 'Withdrawn from allocation workspace' },
          });
          showToast('Judge removed from slot.', 'success');
          loadAll();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  await loadAll();
}
