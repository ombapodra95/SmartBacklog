/* =============================================================
   Agile Kanban AI — app.js (Enhanced)
   ============================================================= */

// ── State ─────────────────────────────────────────────────────────────────────
let tickets         = [];
let editingId       = null;
let currentCriteria = [];
let draggedId       = null;
let aiInProgress    = false;
let searchQuery     = '';
let previewId       = null;

const API = '/api';

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch(`${API}/tickets`);
    tickets = await res.json();
  } catch {
    showToast('Could not reach the server', 'error');
  }
  renderBoard();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.getElementById('float-preview')?.classList.contains('open')) {
        closePreview();
      } else {
        closeModal();
      }
    }
  });

  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderBoard();
    });
  }

  // Dark mode init
  initDarkMode();
}

function isInputFocused() {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// ── Dark Mode ─────────────────────────────────────────────────────────────────
function initDarkMode() {
  const saved = localStorage.getItem('kanban-dark-mode');
  if (saved === 'false') {
    document.documentElement.classList.remove('dark');
  } else {
    document.documentElement.classList.add('dark');
  }
  updateDarkModeIcon();
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  localStorage.setItem('kanban-dark-mode', isDark);
  updateDarkModeIcon();
}

function updateDarkModeIcon() {
  const btn = document.getElementById('dark-mode-toggle');
  if (!btn) return;
  const isDark = document.documentElement.classList.contains('dark');
  btn.innerHTML = isDark ? '☀️' : '🌙';
  btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
}

// ── Board Rendering ───────────────────────────────────────────────────────────
function renderBoard() {
  const filtered = searchQuery
    ? tickets.filter(t =>
        t.title.toLowerCase().includes(searchQuery) ||
        (t.description || '').toLowerCase().includes(searchQuery)
      )
    : tickets;

  ['todo', 'inprogress', 'done'].forEach(status => {
    const col   = document.getElementById(`column-${status}`);
    const count = document.getElementById(`count-${status}`);
    const group = filtered.filter(t => t.status === status);

    count.textContent = group.length;
    col.innerHTML = '';

    if (!group.length) {
      const emptyIcons = { todo: '📋', inprogress: '⚡', done: '🎉' };
      const emptyTexts = { todo: 'No tasks queued', inprogress: 'Nothing in flight', done: 'No completions yet' };
      col.innerHTML = `<div class="empty-state">
        <span class="empty-icon">${emptyIcons[status]}</span>
        <span class="empty-label">${emptyTexts[status]}</span></div>`;
      return;
    }
    group.forEach(t => col.appendChild(buildCard(t)));
  });

  renderStats(filtered);

  // Refresh floating preview if open
  if (previewId) {
    const still = tickets.find(t => t.id === previewId);
    if (still) openPreview(previewId);
    else closePreview();
  }
}

// ── Stats Bar ───────────────────────────────────────────────────────────────
function renderStats(filtered) {
  const statsBar = document.getElementById('stats-bar');
  if (!statsBar) return;

  const totalTickets = filtered.length;
  const byStatus = { todo: [], inprogress: [], done: [] };
  filtered.forEach(t => { if (byStatus[t.status]) byStatus[t.status].push(t); });

  const pts = (arr) => arr.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const todoPts   = pts(byStatus.todo);
  const inPts     = pts(byStatus.inprogress);
  const donePts   = pts(byStatus.done);
  const totalPts  = todoPts + inPts + donePts;
  const progress  = totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0;

  statsBar.innerHTML = `
    <div class="stat">
      <span class="stat-num">${totalTickets}</span>
      <span class="stat-tag">Tickets</span>
    </div>
    <div class="stat">
      <span class="stat-num n-todo">${todoPts}</span>
      <span class="stat-tag">To Do</span>
    </div>
    <div class="stat">
      <span class="stat-num n-prog">${inPts}</span>
      <span class="stat-tag">In Progress</span>
    </div>
    <div class="stat">
      <span class="stat-num n-done">${donePts}</span>
      <span class="stat-tag">Done</span>
    </div>
    <div class="stat stat-prog">
      <div class="pbar-track">
        <div class="pbar-fill" style="width: ${progress}%"></div>
      </div>
      <span class="stat-tag">${progress}% complete</span>
    </div>`;
}

// ── Card Building ─────────────────────────────────────────────────────────────
function buildCard(ticket) {
  const PRIORITY = {
    blocking: { label: 'Blocking', cls: 'badge-blocking', border: 'border-priority-blocking' },
    urgent:   { label: 'Urgent',   cls: 'badge-urgent',   border: 'border-priority-urgent'   },
    normal:   { label: 'Normal',   cls: 'badge-normal',   border: 'border-priority-normal'   },
  };
  const p = PRIORITY[ticket.priority] || PRIORITY.normal;

  const card = document.createElement('div');
  card.className  = `ticket-card ${p.border}`;
  card.draggable  = true;
  card.dataset.id = ticket.id;

  // ── Drag events ──────────────────────────────────────────
  card.addEventListener('dragstart', e => {
    draggedId = ticket.id;
    requestAnimationFrame(() => card.classList.add('dragging'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticket.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedId = null;
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  });

  // ── Click to preview ──────────────────────────────────────
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-action-btn')) return;
    openPreview(ticket.id);
  });

  // ── Build inner HTML
  const descHtml = ticket.description
    ? `<p class="card-desc">${esc(ticket.description)}</p>` : '';

  const pointsBadge = ticket.storyPoints
    ? `<span class="badge-points">${ticket.storyPoints} pt</span>` : '';

  const critBadge = ticket.acceptanceCriteria?.length
    ? `<span class="badge-criteria">✓ ${ticket.acceptanceCriteria.length}</span>` : '';

  const timeAgo = ticket.updatedAt || ticket.createdAt
    ? `<span class="card-time">${relativeTime(ticket.updatedAt || ticket.createdAt)}</span>` : '';

  card.innerHTML = `
    <div class="card-header">
      <p class="card-title">${esc(ticket.title)}</p>
      <div class="card-actions">
        <button class="card-action-btn card-action-edit" onclick="openModal('${ticket.id}')" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="card-action-btn card-action-del" onclick="handleDelete('${ticket.id}')" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
    ${descHtml}
    <div class="card-footer">
      <div class="card-meta">
        ${pointsBadge}
        <span class="badge-priority ${p.cls}">${p.label}</span>
        ${critBadge}
      </div>
      ${timeAgo}
    </div>`;

  return card;
}

// ── Relative Time ─────────────────────────────────────────────────────────────
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(ticketId = null, defaultStatus = 'todo') {
  editingId       = ticketId;
  currentCriteria = [];
  hide('points-reasoning');
  hide('priority-reasoning');

  if (ticketId) {
    const t = tickets.find(t => t.id === ticketId);
    if (!t) return;
    closePreview();
    document.getElementById('modal-title').innerHTML = 'Edit Ticket <span class="m-tag">Edit</span>';
    document.getElementById('ticket-title').value           = t.title;
    document.getElementById('ticket-description').value     = t.description || '';
    document.getElementById('ticket-points').value          = t.storyPoints || '';
    document.getElementById('ticket-priority').value        = t.priority    || 'normal';
    document.getElementById('ticket-status').value          = t.status;
    currentCriteria = [...(t.acceptanceCriteria || [])];
  } else {
    document.getElementById('modal-title').innerHTML = 'New Ticket <span class="m-tag">Draft</span>';
    document.getElementById('ticket-title').value           = '';
    document.getElementById('ticket-description').value     = '';
    document.getElementById('ticket-points').value          = '';
    document.getElementById('ticket-priority').value        = 'normal';
    document.getElementById('ticket-status').value          = defaultStatus;
  }

  renderCriteria();
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('ticket-title').focus(), 50);
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  editingId = null;
  currentCriteria = [];
}

function handleModalBackdrop(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

async function saveTicket() {
  const title = document.getElementById('ticket-title').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }

  const saveBtn = document.querySelector('.btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const payload = {
    title,
    description:        document.getElementById('ticket-description').value.trim(),
    acceptanceCriteria: currentCriteria,
    storyPoints:        document.getElementById('ticket-points').value
                          ? parseInt(document.getElementById('ticket-points').value) : null,
    priority:           document.getElementById('ticket-priority').value,
    status:             document.getElementById('ticket-status').value,
  };

  try {
    if (editingId) {
      const updated = await apiPut(`/tickets/${editingId}`, payload);
      tickets = tickets.map(t => t.id === editingId ? updated : t);
      showToast('Ticket updated');
    } else {
      const created = await apiPost('/tickets', payload);
      tickets.push(created);
      showToast('Ticket created');
    }
    closeModal();
    renderBoard();
  } catch (err) {
    showToast(err.message || 'Save failed', 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Ticket'; }
  }
}

async function handleDelete(id) {
  if (!confirm('Delete this ticket?')) return;
  try {
    await apiFetch(`/tickets/${id}`, { method: 'DELETE' });
    tickets = tickets.filter(t => t.id !== id);
    renderBoard();
    showToast('Ticket deleted');
  } catch { showToast('Delete failed', 'error'); }
}

// ── Acceptance Criteria ───────────────────────────────────────────────────────
function renderCriteria() {
  const container = document.getElementById('criteria-list');
  container.innerHTML = '';
  currentCriteria.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'criteria-row';
    row.innerHTML = `
      <span class="criteria-check">✓</span>
      <span class="criteria-text">${esc(c)}</span>
      <button class="criteria-remove" onclick="removeCriteria(${i})">&times;</button>`;
    container.appendChild(row);
  });
}

function removeCriteria(i) { currentCriteria.splice(i, 1); renderCriteria(); }

function addCriteriaManually() {
  const input = document.getElementById('criteria-input');
  const val   = input.value.trim();
  if (!val) return;
  currentCriteria.push(val);
  input.value = '';
  renderCriteria();
}

function handleCriteriaKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); addCriteriaManually(); }
}

// ── AI Functions ──────────────────────────────────────────────────────────────
function modalCtx() {
  return {
    title:              document.getElementById('ticket-title').value.trim(),
    description:        document.getElementById('ticket-description').value.trim(),
    acceptanceCriteria: currentCriteria,
  };
}

function setAiLock(locked) {
  aiInProgress = locked;
  document.querySelectorAll('.ai-btn').forEach(btn => {
    btn.disabled = locked;
    if (locked) btn.classList.add('ai-btn-disabled');
    else btn.classList.remove('ai-btn-disabled');
  });
}

async function aiGenerateCriteria() {
  if (aiInProgress) return;
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); return; }
  setAiLock(true);
  showLoading('Generating acceptance criteria…');
  try {
    const res = await apiPost('/ai/generate', { type: 'acceptance_criteria', ...ctx });
    if (res.acceptanceCriteria) { currentCriteria = res.acceptanceCriteria; renderCriteria(); showToast('Criteria generated'); }
  } catch (err) { showToast(err.message, 'error'); }
  finally { hideLoading(); setAiLock(false); }
}

async function aiEstimatePoints() {
  if (aiInProgress) return;
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); return; }
  setAiLock(true);
  showLoading('Estimating story points…');
  try {
    const res = await apiPost('/ai/generate', { type: 'story_points', ...ctx });
    if (res.storyPoints) {
      document.getElementById('ticket-points').value = res.storyPoints;
      if (res.reasoning) showReasoning('points-reasoning', res.reasoning);
      showToast(`Estimated: ${res.storyPoints} pts`);
    }
  } catch (err) { showToast(err.message, 'error'); }
  finally { hideLoading(); setAiLock(false); }
}

async function aiAnalyzePriority() {
  if (aiInProgress) return;
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); return; }
  setAiLock(true);
  showLoading('Analyzing priority…');
  try {
    const res = await apiPost('/ai/generate', { type: 'priority', ...ctx });
    if (res.priority) {
      document.getElementById('ticket-priority').value = res.priority;
      if (res.reasoning) showReasoning('priority-reasoning', res.reasoning);
      showToast(`Priority: ${res.priority}`);
    }
  } catch (err) { showToast(err.message, 'error'); }
  finally { hideLoading(); setAiLock(false); }
}

async function aiAutoFillAll() {
  if (aiInProgress) return;
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); document.getElementById('ticket-title').focus(); return; }
  setAiLock(true);
  showLoading('AI Agile Coach is analysing your story…');
  try {
    const res = await apiPost('/ai/generate', { type: 'all', ...ctx });
    if (res.acceptanceCriteria)   { currentCriteria = res.acceptanceCriteria; renderCriteria(); }
    if (res.storyPoints)          { document.getElementById('ticket-points').value = res.storyPoints; }
    if (res.storyPointsReasoning) showReasoning('points-reasoning', res.storyPointsReasoning);
    if (res.priority)             { document.getElementById('ticket-priority').value = res.priority; }
    if (res.priorityReasoning)    showReasoning('priority-reasoning', res.priorityReasoning);
    showToast('AI auto-fill complete!');
  } catch (err) { showToast(err.message, 'error'); }
  finally { hideLoading(); setAiLock(false); }
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

async function onDrop(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const id = draggedId || e.dataTransfer.getData('text/plain');
  if (!id) return;

  const ticket = tickets.find(t => t.id === id);
  if (!ticket || ticket.status === targetStatus) return;

  // Optimistic update
  tickets = tickets.map(t => t.id === id ? { ...t, status: targetStatus } : t);
  renderBoard();

  try {
    const updated = await apiPut(`/tickets/${id}`, { ...ticket, status: targetStatus });
    tickets = tickets.map(t => t.id === id ? updated : t);
    renderBoard();
  } catch {
    tickets = tickets.map(t => t.id === id ? ticket : t);
    renderBoard();
    showToast('Move failed', 'error');
  }
}

// ── HTTP Helpers ──────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res  = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}
const apiPost = (path, data) => apiFetch(path, { method: 'POST', body: JSON.stringify(data) });
const apiPut  = (path, data) => apiFetch(path, { method: 'PUT',  body: JSON.stringify(data) });

// ── UI Helpers ────────────────────────────────────────────────────────────────
function showLoading(text = 'AI is thinking…') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loading').classList.add('hidden'); }

let toastTimer;
function showToast(msg, type = 'success') {
  const inner = document.getElementById('toast-inner');
  inner.className   = `toast-inner ${type === 'error' ? 'toast-error' : 'toast-success'}`;
  inner.textContent = msg;
  const toast = document.getElementById('toast');
  toast.classList.remove('hidden');
  toast.classList.add('toast-enter');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('toast-enter');
    toast.classList.add('hidden');
  }, 3500);
}

function showReasoning(id, text) {
  const el = document.getElementById(id);
  el.textContent = `↳ ${text}`;
  el.classList.remove('hidden');
}

function hide(id) { document.getElementById(id)?.classList.add('hidden'); }

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Floating Preview ──────────────────────────────────────────────────────────
function openPreview(id) {
  const t = tickets.find(x => x.id === id);
  if (!t) return;
  previewId = id;

  const panel = document.getElementById('float-preview');
  panel.dataset.tid = id;

  // Status
  const sMap = { todo: ['ci-todo','To Do'], inprogress: ['ci-prog','In Progress'], done: ['ci-done','Done'] };
  const [ciCls, sLabel] = sMap[t.status] || sMap.todo;
  document.getElementById('fp-indicator').className = 'fp-indicator ' + ciCls;
  document.getElementById('fp-status').textContent = sLabel;

  // Content
  document.getElementById('fp-title').textContent = t.title;
  const descEl = document.getElementById('fp-desc');
  descEl.textContent = t.description || '';
  descEl.style.display = t.description ? '' : 'none';

  // Meta
  const PRI = { blocking: ['Blocking','badge-blocking'], urgent: ['Urgent','badge-urgent'], normal: ['Normal','badge-normal'] };
  const [pL, pC] = PRI[t.priority] || PRI.normal;
  let m = `<span class="badge-priority ${pC}">${pL}</span>`;
  if (t.storyPoints) m += `<span class="badge-points">${t.storyPoints} pt</span>`;
  if (t.acceptanceCriteria?.length) m += `<span class="badge-criteria">✓ ${t.acceptanceCriteria.length}</span>`;
  document.getElementById('fp-meta').innerHTML = m;

  // Criteria
  const cs = document.getElementById('fp-criteria-section');
  const cl = document.getElementById('fp-criteria');
  if (t.acceptanceCriteria?.length) {
    cs.style.display = '';
    cl.innerHTML = t.acceptanceCriteria.map(c =>
      `<div class="fp-criteria-item"><span class="fp-check">✓</span><span>${esc(c)}</span></div>`
    ).join('');
  } else { cs.style.display = 'none'; }

  // Time
  const ts = t.updatedAt || t.createdAt;
  document.getElementById('fp-time').textContent = ts ? `${t.updatedAt ? 'Updated' : 'Created'} ${relativeTime(ts)}` : '';

  // Open
  panel.classList.add('open');
  document.querySelector('.board')?.classList.add('board-shifted');

  // Highlight
  document.querySelectorAll('.ticket-card').forEach(c => c.classList.remove('active-card'));
  const ac = document.querySelector(`.ticket-card[data-id="${id}"]`);
  if (ac) ac.classList.add('active-card');
}

function closePreview() {
  previewId = null;
  document.getElementById('float-preview')?.classList.remove('open');
  document.querySelector('.board')?.classList.remove('board-shifted');
  document.querySelectorAll('.ticket-card').forEach(c => c.classList.remove('active-card'));
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
