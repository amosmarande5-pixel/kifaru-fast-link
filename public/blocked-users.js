const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) window.location.href = 'index.html';
const me = JSON.parse(userStr);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function fetchBlockedUsers() {
  try {
    const res = await fetch('/api/block/list', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.blockedUsers || [];
  } catch (err) {
    return [];
  }
}

async function renderBlockedUsers() {
  const blocked = await fetchBlockedUsers();
  const listEl = document.getElementById('blockedList');

  if (blocked.length === 0) {
    listEl.innerHTML = '<p class="empty-blocked">No blocked users yet.</p>';
    return;
  }

  listEl.innerHTML = '';
  blocked.forEach(id => {
    const row = document.createElement('div');
    row.className = 'blocked-item';
    row.innerHTML = `
      <div class="blocked-id">${escapeHtml(id)}</div>
      <button class="unblock-btn">Unblock</button>
    `;
    row.querySelector('.unblock-btn').addEventListener('click', () => unblockUser(id));
    listEl.appendChild(row);
  });
}

async function unblockUser(uniqueId) {
  if (!confirm(`Unblock ${uniqueId}?`)) return;
  try {
    const res = await fetch(`/api/block/unblock/${uniqueId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) renderBlockedUsers();
    else alert('Failed to unblock.');
  } catch (err) {
    alert('Failed to unblock.');
  }
}

document.getElementById('blockUserBtn').addEventListener('click', async () => {
  const uniqueId = document.getElementById('blockUserId').value.trim().toUpperCase();
  if (!uniqueId) { alert('Enter a Unique ID.'); return; }
  if (uniqueId === me.uniqueId) { alert("Can't block yourself."); return; }
  if (!confirm(`Block ${uniqueId}?`)) return;

  try {
    const res = await fetch(`/api/block/block/${uniqueId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      document.getElementById('blockUserId').value = '';
      renderBlockedUsers();
    } else {
      alert('Failed to block.');
    }
  } catch (err) {
    alert('Failed to block.');
  }
});

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

renderBlockedUsers();
