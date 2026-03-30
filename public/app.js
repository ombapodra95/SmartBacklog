/* =============================================================
   Agile Kanban AI — Frontend Logic
   ============================================================= */

// ── State ─────────────────────────────────────────────────────────────────────
let tickets         = [];
let editingId       = null;   // null = create, string = edit
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
      col.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs select-none">
        <div class="text-3xl mb-1">📭</div>No tickets yet</div>`;
      return;
    }
    group.forEach(t => col.appendChild(buildCard(t)));
  });
}

function buildCard(ticket) {
  const PRIORITY = {
    blocking: { label: 'Blocking', cls: 'bg-red-100 text-red-700 border border-red-200' },
    urgent:   { label: 'Urgent',   cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
    normal:   { label: 'Normal',   cls: 'bg-slate-100 text-slate-500' },
  };
  const p = PRIORITY[ticket.priority] || PRIORITY.normal;

  const card = document.createElement('div');
  card.className  = 'ticket-card bg-white border border-slate-200 rounded-xl p-3 shadow-sm cursor-grab hover:shadow-md transition-shadow group relative select-none';
  card.draggable  = true;
  card.dataset.id = ticket.id;

  card.addEventListener('dragstart', e => {
    draggedId = ticket.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedId = null;
  });

  const descHtml = ticket.description
    ? `<p class="text-slate-400 text-xs line-clamp-2 mt-0.5 mb-2">${esc(ticket.description)}</p>` : '';

  const pointsBadge = ticket.storyPoints
    ? `<span class="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">${ticket.storyPoints} pts</span>` : '';

  const critBadge = ticket.acceptanceCriteria?.length
    ? `<span class="text-xs text-slate-400">✓ ${ticket.acceptanceCriteria.length} criteria</span>` : '';

  card.innerHTML = `
    <div class="absolute top-2 right-2 hidden group-hover:flex gap-1 z-10">
      <button onclick="openModal('${ticket.id}')"
        class="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded-md hover:bg-indigo-200 font-medium">Edit</button>
      <button onclick="handleDelete('${ticket.id}')"
        class="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-md hover:bg-red-200 font-medium">Del</button>
    </div>
    <h3 class="font-semibold text-slate-800 text-sm pr-20 leading-snug">${esc(ticket.title)}</h3>
    ${descHtml}
    <div class="flex items-center gap-2 flex-wrap mt-1">
      ${pointsBadge}
      <span class="text-xs px-2 py-0.5 rounded-full font-medium ${p.cls}">${p.label}</span>
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
    document.getElementById('modal-title').textContent       = 'New Ticket';
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
  editingId = null; currentCriteria = [];
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
    row.className = 'flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2 text-sm';
    row.innerHTML = `
      <span class="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
      <span class="flex-1 text-slate-700">${esc(c)}</span>
      <button onclick="removeCriteria(${i})" class="text-slate-300 hover:text-red-500 text-lg leading-none">&times;</button>`;
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
function onDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

async function onDrop(e, targetStatus) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggedId) return;
  const ticket = tickets.find(t => t.id === draggedId);
  if (!ticket || ticket.status === targetStatus) return;
  try {
    const updated = await apiPut(`/tickets/${draggedId}`, { ...ticket, status: targetStatus });
    tickets = tickets.map(t => t.id === draggedId ? updated : t);
    renderBoard();
  } catch { showToast('Move failed', 'error'); }
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
  inner.className   = `px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${type === 'error' ? 'bg-red-600' : 'bg-slate-800'}`;
  inner.textContent = msg;
  document.getElementById('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => document.getElementById('toast').classList.add('hidden'), 3500);
}

function showReasoning(id, text) {
  const el = document.getElementById(id);
  el.textContent = `💡 ${text}`;
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
