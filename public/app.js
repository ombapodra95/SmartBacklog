/* =============================================================
   Agile Kanban AI — app.js
   ============================================================= */

// ── State ─────────────────────────────────────────────────────────────────────
let tickets         = [];
let editingId       = null;
let currentCriteria = [];
let draggedId       = null;

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
}

// ── Board Rendering ───────────────────────────────────────────────────────────
function renderBoard() {
  ['todo', 'inprogress', 'done'].forEach(status => {
    const col   = document.getElementById(`column-${status}`);
    const count = document.getElementById(`count-${status}`);
    const group = tickets.filter(t => t.status === status);

    count.textContent = group.length;
    col.innerHTML = '';

    if (!group.length) {
      col.innerHTML = `<div class="empty-state">
        <span class="empty-icon">📭</span>No tickets yet</div>`;
      return;
    }
    group.forEach(t => col.appendChild(buildCard(t)));
  });
}

function buildCard(ticket) {
  const PRIORITY = {
    blocking: { label: 'Blocking', cls: 'badge-blocking' },
    urgent:   { label: 'Urgent',   cls: 'badge-urgent'   },
    normal:   { label: 'Normal',   cls: 'badge-normal'   },
  };
  const p = PRIORITY[ticket.priority] || PRIORITY.normal;

  const card = document.createElement('div');
  card.className  = 'ticket-card';
  card.draggable  = true;
  card.dataset.id = ticket.id;

  // ── Drag events ──────────────────────────────────────────
  card.addEventListener('dragstart', e => {
    draggedId = ticket.id;
    // Need a tiny delay so the drag image is captured before we dim the card
    requestAnimationFrame(() => card.classList.add('dragging'));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticket.id); // required for Firefox
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedId = null;
    // Clean up any leftover drag-over states
    document.querySelectorAll('.drop-zone').forEach(z => z.classList.remove('drag-over'));
  });

  // ── Build inner HTML ──────────────────────────────────────
  const descHtml = ticket.description
    ? `<p class="card-desc">${esc(ticket.description)}</p>` : '';

  const pointsBadge = ticket.storyPoints
    ? `<span class="badge-points">${ticket.storyPoints}pt</span>` : '';

  const critBadge = ticket.acceptanceCriteria?.length
    ? `<span class="badge-criteria">✓ ${ticket.acceptanceCriteria.length}</span>` : '';

  card.innerHTML = `
    <div class="card-actions">
      <button class="card-action-btn card-action-edit" onclick="openModal('${ticket.id}')">edit</button>
      <button class="card-action-btn card-action-del"  onclick="handleDelete('${ticket.id}')">del</button>
    </div>
    <p class="card-title">${esc(ticket.title)}</p>
    ${descHtml}
    ${(pointsBadge || p || critBadge) ? `<div class="card-divider"></div>` : ''}
    <div class="card-meta">
      ${pointsBadge}
      <span class="badge-priority ${p.cls}">${p.label}</span>
      ${critBadge}
    </div>`;

  return card;
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
    document.getElementById('modal-title').textContent       = 'Edit Ticket';
    document.getElementById('ticket-title').value           = t.title;
    document.getElementById('ticket-description').value     = t.description || '';
    document.getElementById('ticket-points').value          = t.storyPoints || '';
    document.getElementById('ticket-priority').value        = t.priority    || 'normal';
    document.getElementById('ticket-status').value          = t.status;
    currentCriteria = [...(t.acceptanceCriteria || [])];
  } else {
    document.getElementById('modal-title').textContent      = 'New Ticket';
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

async function aiGenerateCriteria() {
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); return; }
  showLoading('Generating acceptance criteria…');
  try {
    const res = await apiPost('/ai/generate', { type: 'acceptance_criteria', ...ctx });
    if (res.acceptanceCriteria) { currentCriteria = res.acceptanceCriteria; renderCriteria(); showToast('Criteria generated'); }
  } catch (err) { showToast(err.message, 'error'); }
  finally { hideLoading(); }
}

async function aiEstimatePoints() {
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); return; }
  showLoading('Estimating story points…');
  try {
    const res = await apiPost('/ai/generate', { type: 'story_points', ...ctx });
    if (res.storyPoints) {
      document.getElementById('ticket-points').value = res.storyPoints;
      if (res.reasoning) showReasoning('points-reasoning', res.reasoning);
      showToast(`Estimated: ${res.storyPoints} pts`);
    }
  } catch (err) { showToast(err.message, 'error'); }
  finally { hideLoading(); }
}

async function aiAnalyzePriority() {
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); return; }
  showLoading('Analyzing priority…');
  try {
    const res = await apiPost('/ai/generate', { type: 'priority', ...ctx });
    if (res.priority) {
      document.getElementById('ticket-priority').value = res.priority;
      if (res.reasoning) showReasoning('priority-reasoning', res.reasoning);
      showToast(`Priority: ${res.priority}`);
    }
  } catch (err) { showToast(err.message, 'error'); }
  finally { hideLoading(); }
}

async function aiAutoFillAll() {
  const ctx = modalCtx();
  if (!ctx.title) { showToast('Enter a title first', 'error'); document.getElementById('ticket-title').focus(); return; }
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
  finally { hideLoading(); }
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function onDragLeave(e) {
  // Only remove class when truly leaving the drop zone (not just entering a child)
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
    // Roll back
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
  document.getElementById('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => document.getElementById('toast').classList.add('hidden'), 3500);
}

function showReasoning(id, text) {
  const el = document.getElementById(id);
  el.textContent = `↳ ${text}`;
  el.classList.remove('hidden');
}

function hide(id) { document.getElementById(id).classList.add('hidden'); }

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
