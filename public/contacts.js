const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) window.location.href = 'index.html';
const me = JSON.parse(userStr);

const contactsKey = `kifaru_contacts_${me.uniqueId}`;
function getContacts() { return JSON.parse(localStorage.getItem(contactsKey) || '[]'); }
function saveContacts(c) { localStorage.setItem(contactsKey, JSON.stringify(c)); }

let onlineIds = new Set();
const lastSeenCache = {};

function initials(name, id) {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  return id.replace('KFL-', '').slice(0, 2).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatLastSeen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? `Last seen ${time}` : `Last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

async function fetchLastSeen(id) {
  if (lastSeenCache[id]) return lastSeenCache[id];
  try {
    const res = await fetch(`/api/auth/status/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    lastSeenCache[id] = data.lastSeen;
    return data.lastSeen;
  } catch (err) {
    return null;
  }
}

function attachSwipe(card, onDelete) {
  let startX = 0;
  let currentX = 0;
  let dragging = false;
  let dragged = false;
  const OPEN_X = -80;

  card.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    dragging = true;
    dragged = false;
    card.classList.add('swiping');
  });

  card.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    currentX = e.touches[0].clientX - startX;
    if (currentX > 0) currentX = 0;
    if (currentX < OPEN_X) currentX = OPEN_X;
    if (Math.abs(currentX) > 5) dragged = true;
    card.style.transform = `translateX(${currentX}px)`;
  });

  card.addEventListener('touchend', () => {
    dragging = false;
    card.classList.remove('swiping');
    if (currentX < OPEN_X / 2) {
      card.style.transform = `translateX(${OPEN_X}px)`;
    } else {
      card.style.transform = 'translateX(0)';
    }
    currentX = 0;
  });

  card.addEventListener('click', (e) => {
    if (dragged) {
      e.stopPropagation();
      dragged = false;
      return;
    }
    onDelete();
  });
}

async function renderContacts() {
  const contacts = getContacts();
  const listEl = document.getElementById('contactList');
  const emptyState = document.getElementById('emptyState');
  listEl.innerHTML = '';

  if (contacts.length === 0) {
    listEl.appendChild(emptyState);
    return;
  }

  const sorted = [...contacts].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  for (const contact of sorted) {
    const isOnline = onlineIds.has(contact.id);
    let statusText = contact.id;

    if (isOnline) {
      statusText = 'Online';
    } else {
      const lastSeen = await fetchLastSeen(contact.id);
      if (lastSeen) statusText = formatLastSeen(lastSeen);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'contact-wrapper';

    const deleteAction = document.createElement('div');
    deleteAction.className = 'delete-action';
    deleteAction.textContent = 'Delete';

    const card = document.createElement('div');
    card.className = 'contact-card';
    card.innerHTML = `
      <div class="avatar clip-br-sm">${initials(contact.name, contact.id)}${isOnline ? '<span class="online-dot"></span>' : ''}</div>
      <div class="contact-main">
        <div class="contact-card-name">${escapeHtml(contact.name || contact.id)}</div>
        <div class="contact-preview">${escapeHtml(statusText)}</div>
      </div>
    `;

    deleteAction.addEventListener('click', () => {
      if (confirm(`Remove ${contact.name || contact.id} from your contacts?`)) {
        const updated = getContacts().filter(c => c.id !== contact.id);
        saveContacts(updated);
        renderContacts();
      }
    });

    wrapper.appendChild(deleteAction);
    wrapper.appendChild(card);
    listEl.appendChild(wrapper);

    attachSwipe(card, () => {
      const transform = card.style.transform;
      if (transform && transform !== 'translateX(0px)') {
        card.style.transform = 'translateX(0)';
      } else {
        sessionStorage.setItem('kifaru_open_chat', JSON.stringify(contact));
        window.location.href = 'dashboard.html';
      }
    });
  }
}
renderContacts();

const socket = io();
socket.emit('join', me.uniqueId);

socket.on('onlineList', (ids) => {
  onlineIds = new Set(ids);
  renderContacts();
});

const addContactModal = document.getElementById('addContactModal');

document.getElementById('addContactBtn').addEventListener('click', () => {
  document.getElementById('newContactId').value = '';
  document.getElementById('newContactName').value = '';
  document.getElementById('addContactError').textContent = '';
  addContactModal.classList.add('active');
});

document.getElementById('cancelAddContact').addEventListener('click', () => {
  addContactModal.classList.remove('active');
});

document.getElementById('confirmAddContact').addEventListener('click', () => {
  const id = document.getElementById('newContactId').value.trim().toUpperCase();
  const name = document.getElementById('newContactName').value.trim();
  const errorEl = document.getElementById('addContactError');

  if (!id) { errorEl.textContent = 'Unique ID is required.'; return; }
  if (id === me.uniqueId) { errorEl.textContent = "You can't add yourself."; return; }

  const contacts = getContacts();
  if (contacts.find(c => c.id === id)) { errorEl.textContent = 'Contact already added.'; return; }

  contacts.push({ id, name });
  saveContacts(contacts);
  renderContacts();
  addContactModal.classList.remove('active');
});

// ---- SEARCH FUNCTIONALITY ----
document.getElementById('searchUserBtn').addEventListener('click', async () => {
  const uniqueId = document.getElementById('searchUserInput').value.trim().toUpperCase();
  const resultsEl = document.getElementById('searchResults');

  if (!uniqueId) {
    resultsEl.innerHTML = '<p class="search-message">Enter a Unique ID to search</p>';
    return;
  }

  if (uniqueId === me.uniqueId) {
    resultsEl.innerHTML = '<p class="search-message error">You cannot search for yourself</p>';
    return;
  }

  resultsEl.innerHTML = '<p class="search-message">Searching...</p>';

  try {
    const res = await fetch(`/api/search/user/${uniqueId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    if (!res.ok) {
      resultsEl.innerHTML = `<p class="search-message error">${escapeHtml(data.error || 'User not found')}</p>`;
      return;
    }

    const isOnline = onlineIds.has(data.uniqueId);
    const statusText = isOnline ? 'Online' : formatLastSeen(data.lastSeen);

    const card = document.createElement('div');
    card.className = 'search-result-card';
    card.innerHTML = `
      <div class="avatar clip-br-sm">${initials(data.fullName, data.uniqueId)}${isOnline ? '<span class="online-dot"></span>' : ''}</div>
      <div class="search-result-info">
        <div class="search-result-name">${escapeHtml(data.fullName)}</div>
        <div class="search-result-id">${data.uniqueId}</div>
        <div class="search-result-status">${statusText}</div>
      </div>
      <button class="add-btn">Add</button>
    `;

    card.querySelector('.add-btn').addEventListener('click', () => {
      addSearchedContact(data.uniqueId, data.fullName);
    });

    resultsEl.innerHTML = '';
    resultsEl.appendChild(card);
  } catch (err) {
    console.error('Search error:', err);
    resultsEl.innerHTML = '<p class="search-message error">Search failed. Try again.</p>';
  }
});

function addSearchedContact(id, name) {
  const contacts = getContacts();
  if (contacts.find(c => c.id === id)) {
    alert('Contact already added.');
    return;
  }

  contacts.push({ id, name });
  saveContacts(contacts);
  renderContacts();
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('searchUserInput').value = '';
  alert(`Added ${name} to your contacts!`);
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
