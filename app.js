// =============================================
// Florida 2026 Trip Planner
// =============================================
// CONFIGURE THESE after creating your Supabase project:
const SUPABASE_URL = 'https://wubvxmkpehxhxmyhfxbl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vtVvl0mAQMfoWEhVV7wHlw_wHKQfysF';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Trip dates (Sep 10-17 2026)
const TRIP_START = '2026-09-14';
const TRIP_END = '2026-09-21';

// State
let currentUser = null;
let selectedDate = null;
let calendarEvents = [];
let costItems = [];
let hotels = [];
let tickets = [];
let links = [];

// =============================
//  PIN AUTH
// =============================
const pinScreen = document.getElementById('pin-screen');
const app = document.getElementById('app');
const pinDigits = document.querySelectorAll('.pin-digit');
const pinError = document.getElementById('pin-error');

// Check if already authenticated
const savedPin = localStorage.getItem('florida2026_pin');
const savedUser = localStorage.getItem('florida2026_user');
if (savedPin && savedUser) {
  verifyPin(savedPin).then(valid => {
    if (valid) {
      currentUser = savedUser;
      showApp();
    }
  });
}

// PIN input handling
pinDigits.forEach((input, i) => {
  input.addEventListener('input', (e) => {
    const val = e.target.value.replace(/\D/g, '');
    e.target.value = val;
    if (val && i < 3) {
      pinDigits[i + 1].focus();
    }
    // Check if all filled
    const pin = Array.from(pinDigits).map(d => d.value).join('');
    if (pin.length === 4) {
      verifyPin(pin).then(valid => {
        if (!valid) {
          pinError.textContent = 'Wrong PIN';
          pinDigits.forEach(d => { d.classList.add('error'); d.value = ''; });
          pinDigits[0].focus();
          setTimeout(() => pinDigits.forEach(d => d.classList.remove('error')), 500);
        }
      });
    }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && i > 0) {
      pinDigits[i - 1].focus();
    }
  });
  // Allow paste
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 4);
    pasted.split('').forEach((ch, j) => {
      if (pinDigits[j]) pinDigits[j].value = ch;
    });
    if (pasted.length === 4) {
      verifyPin(pasted);
    }
  });
});

async function verifyPin(pin) {
  try {
    const { data, error } = await sb.from('pins').select('name').eq('pin', pin).single();
    if (error || !data) return false;
    currentUser = data.name;
    localStorage.setItem('florida2026_pin', pin);
    localStorage.setItem('florida2026_user', data.name);
    showApp();
    return true;
  } catch {
    return false;
  }
}

function showApp() {
  pinScreen.classList.add('hidden');
  app.classList.remove('hidden');
  document.getElementById('user-name').textContent = currentUser;
  init();
}

// =============================
//  INIT
// =============================
async function init() {
  updateCountdown();
  setupTabs();
  setupModalClose();
  setupAddButtons();
  await Promise.all([loadCalendarEvents(), loadCosts(), loadHotels(), loadTickets(), loadLinks()]);
  renderCalendar();
  renderCosts();
  renderHotels();
  renderTickets();
  renderLinks();
  subscribeRealtime();
}

// =============================
//  COUNTDOWN
// =============================
function updateCountdown() {
  const trip = new Date(TRIP_START + 'T00:00:00');
  const now = new Date();
  const days = Math.max(0, Math.floor((trip - now) / 86400000));
  document.getElementById('countdown').textContent = days + ' days to go';
}

// =============================
//  TABS
// =============================
function setupTabs() {
  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
  });
}

// =============================
//  MODAL
// =============================
const overlay = document.getElementById('modal-overlay');
const modalForm = document.getElementById('modal-form');
const modalTitle = document.getElementById('modal-title');
let modalSaveHandler = null;

function openModal(title, fields, onSave) {
  modalTitle.textContent = title;
  modalForm.innerHTML = fields.map(f => {
    if (f.type === 'select') {
      const opts = f.options.map(o => `<option value="${o.value}"${f.default === o.value ? ' selected' : ''}>${o.label}</option>`).join('');
      return `<div class="form-group"><label>${f.label}</label><select name="${f.name}">${opts}</select></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="form-group"><label>${f.label}</label><textarea name="${f.name}" placeholder="${f.placeholder || ''}">${f.default || ''}</textarea></div>`;
    }
    return `<div class="form-group"><label>${f.label}</label><input type="${f.type || 'text'}" name="${f.name}" placeholder="${f.placeholder || ''}" value="${f.default || ''}"></div>`;
  }).join('');
  overlay.classList.add('show');
  const firstInput = modalForm.querySelector('input, select, textarea');
  if (firstInput) setTimeout(() => firstInput.focus(), 50);

  if (modalSaveHandler) document.getElementById('modal-save').removeEventListener('click', modalSaveHandler);
  modalSaveHandler = () => {
    const data = {};
    const inputs = modalForm.querySelectorAll('input, select, textarea');
    inputs.forEach(inp => { data[inp.name] = inp.value; });
    onSave(data);
    closeModal();
  };
  document.getElementById('modal-save').addEventListener('click', modalSaveHandler);
}

function closeModal() {
  overlay.classList.remove('show');
}

function setupModalClose() {
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// =============================
//  ADD BUTTONS
// =============================
function setupAddButtons() {
  document.getElementById('add-event-btn').addEventListener('click', () => openAddEvent());
  document.getElementById('add-cost-btn').addEventListener('click', () => openAddCost());
  document.getElementById('add-hotel-btn').addEventListener('click', () => openAddHotel());
  document.getElementById('add-ticket-btn').addEventListener('click', () => openAddTicket());
  document.getElementById('add-link-btn').addEventListener('click', () => openAddLink());
}

// =============================
//  CALENDAR
// =============================
async function loadCalendarEvents() {
  const { data } = await sb.from('calendar_events').select('*').order('sort_order').order('time_slot', { nullsFirst: false });
  calendarEvents = data || [];
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  // Sep 2026: starts on Tuesday (day 2), 30 days
  const year = 2026, month = 8; // JS month is 0-indexed
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  // Convert to Mon-start: Mon=0, Tue=1, ... Sun=6
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = '';
  // Headers
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => {
    html += `<div class="cal-head">${d}</div>`;
  });
  // Empty leading cells
  for (let i = 0; i < startOffset; i++) {
    html += '<div class="cal-day empty"></div>';
  }
  // Days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `2026-09-${String(d).padStart(2, '0')}`;
    const isTrip = dateStr >= TRIP_START && dateStr <= TRIP_END;
    const isSel = selectedDate === dateStr;
    const events = calendarEvents.filter(e => e.date === dateStr);

    let cls = 'cal-day';
    // no special styling for trip dates — events show what's planned
    if (isSel) cls += ' selected';

    html += `<div class="${cls}" data-date="${dateStr}">`;
    html += `<div class="cal-num">${d}</div>`;
    html += '<div class="cal-events">';
    events.forEach(ev => {
      html += `<span class="cal-event ${ev.type}">${ev.title}</span>`;
    });
    html += '</div></div>';
  }
  // Trailing empty
  const totalCells = startOffset + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  grid.innerHTML = html;

  // Click handlers
  grid.querySelectorAll('.cal-day:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      selectedDate = cell.dataset.date;
      grid.querySelectorAll('.cal-day').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      renderDayDetail();
    });
  });
}

function renderDayDetail() {
  const detail = document.getElementById('day-detail');
  if (!selectedDate) {
    detail.innerHTML = '<div class="empty-state">Click a day to see its plan</div>';
    return;
  }

  const d = new Date(selectedDate + 'T12:00:00');
  const dayName = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const events = calendarEvents.filter(e => e.date === selectedDate).sort((a, b) => {
    if (!a.time_slot && !b.time_slot) return 0;
    if (!a.time_slot) return 1;
    if (!b.time_slot) return -1;
    return a.time_slot.localeCompare(b.time_slot);
  });

  const isTrip = selectedDate >= TRIP_START && selectedDate <= TRIP_END;

  let html = `<div class="day-title">${dayName}</div>`;
  if (isTrip) {
    const dayNum = Math.floor((new Date(selectedDate) - new Date(TRIP_START)) / 86400000) + 1;
    html += `<div class="day-subtitle">Trip Day ${dayNum}</div>`;
  } else {
    html += `<div class="day-subtitle"></div>`;
  }

  if (events.length === 0) {
    html += '<div class="empty-state" style="padding:16px 0;">Nothing planned yet</div>';
  } else {
    html += '<div class="plan-list">';
    events.forEach(ev => {
      const time = ev.time_slot ? ev.time_slot.slice(0, 5) : '';
      html += `<div class="plan-row" data-edit-event="${ev.id}" style="cursor:pointer;" title="Click to edit">`;
      html += `<div class="plan-time">${time}</div>`;
      html += `<div class="plan-line ${ev.type}"></div>`;
      html += `<div style="flex:1;min-width:0"><div class="plan-text">${esc(ev.title)}</div>`;
      if (ev.notes) html += `<div class="plan-note">${esc(ev.notes)}</div>`;
      html += `</div>`;
      html += `<button class="plan-delete" data-id="${ev.id}" title="Delete">&times;</button>`;
      html += `</div>`;
    });
    html += '</div>';
  }

  html += `<button class="add-btn" style="margin-top:14px; width:100%;" id="add-event-day">+ Add to this day</button>`;

  detail.innerHTML = html;

  // Edit handlers
  detail.querySelectorAll('[data-edit-event]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.plan-delete')) return;
      const ev = calendarEvents.find(x => x.id === row.dataset.editEvent);
      if (ev) openEditEvent(ev);
    });
  });

  // Delete handlers
  detail.querySelectorAll('.plan-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sb.from('calendar_events').delete().eq('id', btn.dataset.id);
      await loadCalendarEvents();
      renderCalendar();
      renderDayDetail();
    });
  });

  // Add to this day
  document.getElementById('add-event-day').addEventListener('click', () => openAddEvent(selectedDate));
}

function openAddEvent(prefillDate) {
  openModal('Add Event', [
    { name: 'date', label: 'Date', type: 'date', default: prefillDate || selectedDate || TRIP_START },
    { name: 'title', label: 'Title', placeholder: 'e.g. Universal Studios' },
    { name: 'type', label: 'Type', type: 'select', default: 'note', options: [
      { value: 'hhn', label: 'HHN' },
      { value: 'park', label: 'Park' },
      { value: 'travel', label: 'Travel' },
      { value: 'hotel', label: 'Hotel' },
      { value: 'food', label: 'Food' },
      { value: 'note', label: 'Note' },
    ]},
    { name: 'time_slot', label: 'Time (optional)', type: 'time' },
    { name: 'notes', label: 'Notes (optional)', type: 'textarea', placeholder: 'Any extra details...' },
  ], async (data) => {
    if (!data.title.trim()) return;
    await sb.from('calendar_events').insert({
      date: data.date,
      title: data.title.trim(),
      type: data.type,
      time_slot: data.time_slot || null,
      notes: data.notes.trim() || null,
    });
    await loadCalendarEvents();
    renderCalendar();
    if (selectedDate === data.date) renderDayDetail();
  });
}

function openEditEvent(ev) {
  openModal('Edit Event', [
    { name: 'date', label: 'Date', type: 'date', default: ev.date },
    { name: 'title', label: 'Title', default: ev.title },
    { name: 'type', label: 'Type', type: 'select', default: ev.type, options: [
      { value: 'hhn', label: 'HHN' },
      { value: 'park', label: 'Park' },
      { value: 'travel', label: 'Travel' },
      { value: 'hotel', label: 'Hotel' },
      { value: 'food', label: 'Food' },
      { value: 'note', label: 'Note' },
    ]},
    { name: 'time_slot', label: 'Time (optional)', type: 'time', default: ev.time_slot ? ev.time_slot.slice(0, 5) : '' },
    { name: 'notes', label: 'Notes (optional)', type: 'textarea', default: ev.notes || '' },
  ], async (data) => {
    if (!data.title.trim()) return;
    await sb.from('calendar_events').update({
      date: data.date,
      title: data.title.trim(),
      type: data.type,
      time_slot: data.time_slot || null,
      notes: data.notes.trim() || null,
    }).eq('id', ev.id);
    await loadCalendarEvents();
    renderCalendar();
    renderDayDetail();
  });
}

// =============================
//  COSTS
// =============================
async function loadCosts() {
  const { data } = await sb.from('cost_items').select('*').order('created_at');
  costItems = data || [];
}

function renderCosts() {
  const body = document.getElementById('costs-body');
  const empty = document.getElementById('costs-empty');

  if (costItems.length === 0) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    renderCostSummary();
    return;
  }
  empty.classList.add('hidden');

  body.innerHTML = costItems.map(item => `
    <tr data-edit-cost="${item.id}" style="cursor:pointer;" title="Click to edit">
      <td class="item-name">${esc(item.name)}</td>
      <td><span class="item-cat cat-${item.category}">${item.category}</span></td>
      <td>${item.quantity || '—'}</td>
      <td class="amount">£${Number(item.amount).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
      <td><button class="delete-row-btn" data-id="${item.id}">&times;</button></td>
    </tr>
  `).join('');

  body.querySelectorAll('[data-edit-cost]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.delete-row-btn')) return;
      const item = costItems.find(x => x.id === row.dataset.editCost);
      if (item) openEditCost(item);
    });
  });

  body.querySelectorAll('.delete-row-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sb.from('cost_items').delete().eq('id', btn.dataset.id);
      await loadCosts();
      renderCosts();
    });
  });

  renderCostSummary();
}

function renderCostSummary() {
  const summary = document.getElementById('cost-summary');
  const categories = {};
  let total = 0;

  costItems.forEach(item => {
    const amt = Number(item.amount);
    total += amt;
    categories[item.category] = (categories[item.category] || 0) + amt;
  });

  const fmt = (n) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  let html = '<div style="font-size:14px; font-weight:600; margin-bottom:16px;">Summary</div>';

  const catOrder = ['tickets', 'hotel', 'flights', 'food', 'other'];
  catOrder.forEach(cat => {
    if (categories[cat]) {
      html += `<div class="summary-row"><span class="summary-label" style="text-transform:capitalize">${cat}</span><span>${fmt(categories[cat])}</span></div>`;
    }
  });
  // Any categories not in the predefined order
  Object.keys(categories).forEach(cat => {
    if (!catOrder.includes(cat)) {
      html += `<div class="summary-row"><span class="summary-label" style="text-transform:capitalize">${cat}</span><span>${fmt(categories[cat])}</span></div>`;
    }
  });

  html += `<div class="summary-row total"><span>Total</span><span>${fmt(total)}</span></div>`;
  html += `<div class="summary-row each"><span>Each (÷ 2)</span><span>${fmt(total / 2)}</span></div>`;

  summary.innerHTML = html;
}

function openAddCost() {
  openModal('Add Cost Item', [
    { name: 'name', label: 'Item', placeholder: 'e.g. HHN Express Pass' },
    { name: 'category', label: 'Category', type: 'select', default: 'tickets', options: [
      { value: 'tickets', label: 'Tickets' },
      { value: 'hotel', label: 'Hotel' },
      { value: 'flights', label: 'Flights' },
      { value: 'food', label: 'Food' },
      { value: 'other', label: 'Other' },
    ]},
    { name: 'quantity', label: 'Quantity', type: 'number', default: '1' },
    { name: 'amount', label: 'Total Amount ($)', type: 'number', placeholder: '0.00' },
    { name: 'notes', label: 'Notes (optional)', type: 'textarea', placeholder: 'Any details...' },
  ], async (data) => {
    if (!data.name.trim() || !data.amount) return;
    await sb.from('cost_items').insert({
      name: data.name.trim(),
      category: data.category,
      quantity: parseInt(data.quantity) || 1,
      amount: parseFloat(data.amount) || 0,
      notes: data.notes.trim() || null,
    });
    await loadCosts();
    renderCosts();
  });
}

function openEditCost(item) {
  openModal('Edit Cost Item', [
    { name: 'name', label: 'Item', default: item.name },
    { name: 'category', label: 'Category', type: 'select', default: item.category, options: [
      { value: 'tickets', label: 'Tickets' },
      { value: 'hotel', label: 'Hotel' },
      { value: 'flights', label: 'Flights' },
      { value: 'food', label: 'Food' },
      { value: 'other', label: 'Other' },
    ]},
    { name: 'quantity', label: 'Quantity', type: 'number', default: String(item.quantity || 1) },
    { name: 'amount', label: 'Total Amount (£)', type: 'number', default: String(item.amount) },
    { name: 'notes', label: 'Notes (optional)', type: 'textarea', default: item.notes || '' },
  ], async (data) => {
    if (!data.name.trim() || !data.amount) return;
    await sb.from('cost_items').update({
      name: data.name.trim(),
      category: data.category,
      quantity: parseInt(data.quantity) || 1,
      amount: parseFloat(data.amount) || 0,
      notes: data.notes.trim() || null,
    }).eq('id', item.id);
    await loadCosts();
    renderCosts();
  });
}

// =============================
//  HOTELS
// =============================
async function loadHotels() {
  const { data } = await sb.from('hotels').select('*').order('created_at');
  hotels = data || [];
}

function renderHotels() {
  const list = document.getElementById('hotels-list');
  const empty = document.getElementById('hotels-empty');

  if (hotels.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = hotels.map(h => {
    const tags = (h.tags || []).map(t => {
      const cls = t.toLowerCase().includes('express') ? 'tag-purple' :
                  t.toLowerCase().includes('budget') ? 'tag-green' :
                  t.toLowerCase().includes('top') ? 'tag-orange' : 'tag-blue';
      return `<span class="tag ${cls}">${esc(t)}</span>`;
    }).join('');

    const pros = (h.pros || '').split('\n').filter(Boolean).map(p => `<span class="pro">+ ${esc(p)}</span>`).join('<br>');
    const cons = (h.cons || '').split('\n').filter(Boolean).map(c => `<span class="con">- ${esc(c)}</span>`).join('<br>');

    return `
      <div class="hotel${h.is_top_pick ? ' top-pick' : ''}">
        <div class="hotel-top">
          <div>
            <div class="hotel-name">${esc(h.name)}</div>
            <div class="hotel-loc">${esc(h.location || '')}</div>
          </div>
          ${h.price_per_night ? `<div class="hotel-price">£${Number(h.price_per_night).toFixed(0)}<small>/night</small></div>` : ''}
        </div>
        ${tags ? `<div style="margin-bottom:8px">${tags}</div>` : ''}
        <div class="hotel-detail">${pros}${pros && cons ? '<br>' : ''}${cons}</div>
        <div class="hotel-actions">
          ${h.link ? `<a href="${esc(h.link)}" target="_blank" rel="noopener" class="btn btn-primary">View ↗</a>` : ''}
          <button class="hotel-edit" data-id="${h.id}">Edit</button>
          <button class="hotel-delete" data-id="${h.id}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.hotel-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const h = hotels.find(x => x.id === btn.dataset.id);
      if (h) openEditHotel(h);
    });
  });

  list.querySelectorAll('.hotel-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('hotels').delete().eq('id', btn.dataset.id);
      await loadHotels();
      renderHotels();
    });
  });
}

function openAddHotel() {
  openModal('Add Hotel Option', [
    { name: 'name', label: 'Hotel Name', placeholder: 'e.g. Royal Pacific Resort' },
    { name: 'location', label: 'Location', placeholder: 'e.g. On-site, 5 min walk' },
    { name: 'price_per_night', label: 'Price Per Night ($)', type: 'number', placeholder: '0' },
    { name: 'link', label: 'Booking Link', type: 'url', placeholder: 'https://...' },
    { name: 'pros', label: 'Pros (one per line)', type: 'textarea', placeholder: 'Walking distance\nGreat pool' },
    { name: 'cons', label: 'Cons (one per line)', type: 'textarea', placeholder: 'Expensive\nNo Express Pass' },
    { name: 'tags', label: 'Tags (comma separated)', placeholder: 'e.g. Top Pick, Early Entry' },
    { name: 'is_top_pick', label: 'Top Pick?', type: 'select', default: 'false', options: [
      { value: 'false', label: 'No' },
      { value: 'true', label: 'Yes' },
    ]},
  ], async (data) => {
    if (!data.name.trim()) return;
    await sb.from('hotels').insert({
      name: data.name.trim(),
      location: data.location.trim() || null,
      price_per_night: parseFloat(data.price_per_night) || null,
      link: data.link.trim() || null,
      pros: data.pros.trim() || null,
      cons: data.cons.trim() || null,
      tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      is_top_pick: data.is_top_pick === 'true',
    });
    await loadHotels();
    renderHotels();
  });
}

function openEditHotel(h) {
  openModal('Edit Hotel', [
    { name: 'name', label: 'Hotel Name', default: h.name },
    { name: 'location', label: 'Location', default: h.location || '' },
    { name: 'price_per_night', label: 'Price Per Night (£)', type: 'number', default: String(h.price_per_night || '') },
    { name: 'link', label: 'Booking Link', type: 'url', default: h.link || '' },
    { name: 'pros', label: 'Pros (one per line)', type: 'textarea', default: h.pros || '' },
    { name: 'cons', label: 'Cons (one per line)', type: 'textarea', default: h.cons || '' },
    { name: 'tags', label: 'Tags (comma separated)', default: (h.tags || []).join(', ') },
    { name: 'is_top_pick', label: 'Top Pick?', type: 'select', default: String(h.is_top_pick), options: [
      { value: 'false', label: 'No' },
      { value: 'true', label: 'Yes' },
    ]},
  ], async (data) => {
    if (!data.name.trim()) return;
    await sb.from('hotels').update({
      name: data.name.trim(),
      location: data.location.trim() || null,
      price_per_night: parseFloat(data.price_per_night) || null,
      link: data.link.trim() || null,
      pros: data.pros.trim() || null,
      cons: data.cons.trim() || null,
      tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      is_top_pick: data.is_top_pick === 'true',
    }).eq('id', h.id);
    await loadHotels();
    renderHotels();
  });
}

// =============================
//  TICKETS
// =============================
async function loadTickets() {
  const { data } = await sb.from('tickets').select('*').order('created_at');
  tickets = data || [];
}

function renderTickets() {
  const list = document.getElementById('tickets-list');
  const empty = document.getElementById('tickets-empty');

  if (tickets.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = tickets.map(t => `
    <div class="ticket" data-edit-ticket="${t.id}" style="cursor:pointer;" title="Click to edit">
      <div class="ticket-top-row">
        <div>
          <div class="ticket-type">${esc(t.name)}</div>
          <div class="ticket-price">${esc(t.price)}</div>
          <div class="ticket-per">${esc(t.per || '')}</div>
        </div>
        <button class="ticket-delete" data-id="${t.id}" title="Remove">&times;</button>
      </div>
      ${t.description ? `<div class="ticket-desc">${esc(t.description)}</div>` : ''}
      ${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener" class="btn" style="margin-top:10px;">View ↗</a>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('[data-edit-ticket]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.ticket-delete') || e.target.closest('a')) return;
      const t = tickets.find(x => x.id === el.dataset.editTicket);
      if (t) openEditTicket(t);
    });
  });

  list.querySelectorAll('.ticket-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await sb.from('tickets').delete().eq('id', btn.dataset.id);
      await loadTickets();
      renderTickets();
    });
  });
}

function openAddTicket() {
  openModal('Add Ticket / Pass', [
    { name: 'name', label: 'Name', placeholder: 'e.g. HHN Single Night' },
    { name: 'price', label: 'Price', placeholder: 'e.g. $89.99' },
    { name: 'per', label: 'Per', placeholder: 'e.g. per person, per night' },
    { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Details about this ticket...' },
    { name: 'link', label: 'Link (optional)', type: 'url', placeholder: 'https://...' },
  ], async (data) => {
    if (!data.name.trim()) return;
    await sb.from('tickets').insert({
      name: data.name.trim(),
      price: data.price.trim() || null,
      per: data.per.trim() || null,
      description: data.description.trim() || null,
      link: data.link.trim() || null,
    });
    await loadTickets();
    renderTickets();
  });
}

function openEditTicket(t) {
  openModal('Edit Ticket', [
    { name: 'name', label: 'Name', default: t.name },
    { name: 'price', label: 'Price', default: t.price || '' },
    { name: 'per', label: 'Per', default: t.per || '' },
    { name: 'description', label: 'Description', type: 'textarea', default: t.description || '' },
    { name: 'link', label: 'Link (optional)', type: 'url', default: t.link || '' },
  ], async (data) => {
    if (!data.name.trim()) return;
    await sb.from('tickets').update({
      name: data.name.trim(),
      price: data.price.trim() || null,
      per: data.per.trim() || null,
      description: data.description.trim() || null,
      link: data.link.trim() || null,
    }).eq('id', t.id);
    await loadTickets();
    renderTickets();
  });
}

// =============================
//  LINKS
// =============================
async function loadLinks() {
  const { data } = await sb.from('links').select('*').order('created_at');
  links = data || [];
}

function renderLinks() {
  const list = document.getElementById('links-list');
  const empty = document.getElementById('links-empty');

  if (links.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = links.map(l => `
    <div class="link-row">
      <div class="link-emoji">${l.emoji || '📍'}</div>
      <a href="${esc(l.url)}" target="_blank" rel="noopener" class="link-info" style="text-decoration:none; color:inherit;">
        <div class="link-title">${esc(l.title)}</div>
        ${l.description ? `<div class="link-desc">${esc(l.description)}</div>` : ''}
      </a>
      <button class="link-edit" data-id="${l.id}" title="Edit">&#9998;</button>
      <button class="link-delete" data-id="${l.id}" title="Remove">&times;</button>
    </div>
  `).join('');

  list.querySelectorAll('.link-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const l = links.find(x => x.id === btn.dataset.id);
      if (l) openEditLink(l);
    });
  });

  list.querySelectorAll('.link-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await sb.from('links').delete().eq('id', btn.dataset.id);
      await loadLinks();
      renderLinks();
    });
  });
}

function openAddLink() {
  openModal('Add Link', [
    { name: 'title', label: 'Title', placeholder: 'e.g. Buy HHN Tickets' },
    { name: 'url', label: 'URL', type: 'url', placeholder: 'https://...' },
    { name: 'description', label: 'Description (optional)', placeholder: 'Short note about this link' },
    { name: 'emoji', label: 'Emoji', default: '📍', placeholder: '📍' },
  ], async (data) => {
    if (!data.title.trim() || !data.url.trim()) return;
    await sb.from('links').insert({
      title: data.title.trim(),
      url: data.url.trim(),
      description: data.description.trim() || null,
      emoji: data.emoji || '📍',
    });
    await loadLinks();
    renderLinks();
  });
}

function openEditLink(l) {
  openModal('Edit Link', [
    { name: 'title', label: 'Title', default: l.title },
    { name: 'url', label: 'URL', type: 'url', default: l.url },
    { name: 'description', label: 'Description (optional)', default: l.description || '' },
    { name: 'emoji', label: 'Emoji', default: l.emoji || '📍' },
  ], async (data) => {
    if (!data.title.trim() || !data.url.trim()) return;
    await sb.from('links').update({
      title: data.title.trim(),
      url: data.url.trim(),
      description: data.description.trim() || null,
      emoji: data.emoji || '📍',
    }).eq('id', l.id);
    await loadLinks();
    renderLinks();
  });
}

// =============================
//  REALTIME
// =============================
function subscribeRealtime() {
  sb.channel('all-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, async () => {
      await loadCalendarEvents();
      renderCalendar();
      if (selectedDate) renderDayDetail();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cost_items' }, async () => {
      await loadCosts();
      renderCosts();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hotels' }, async () => {
      await loadHotels();
      renderHotels();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, async () => {
      await loadTickets();
      renderTickets();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, async () => {
      await loadLinks();
      renderLinks();
    })
    .subscribe();
}

// =============================
//  UTILITY
// =============================
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
