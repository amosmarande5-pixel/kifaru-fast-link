const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) window.location.href = 'index.html';
const me = JSON.parse(userStr);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function addTextStatus() {
  const text = prompt('Enter your status:');
  if (!text || !text.trim()) return;

  try {
    const res = await fetch('/api/status/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'text', content: text.trim() })
    });

    if (res.ok) {
      alert('Status posted!');
      loadFeed();
      loadMyStatus();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to post.');
    }
  } catch (err) {
    alert('Failed to post status.');
  }
}

async function uploadStatus(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/status/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    if (res.ok) {
      alert('Status posted!');
      loadFeed();
      loadMyStatus();
    } else {
      alert('Failed to upload.');
    }
  } catch (err) {
    alert('Failed to upload.');
  }

  input.value = '';
}

async function loadFeed() {
  try {
    const contacts = JSON.parse(localStorage.getItem(`kifaru_contacts_${me.uniqueId}`) || '[]');
    const res = await fetch(`/api/status/feed?contacts=${encodeURIComponent(JSON.stringify(contacts))}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const statuses = await res.json();

    const feedEl = document.getElementById('statusFeed');
    if (statuses.length === 0) {
      feedEl.innerHTML = '<p class="status-empty">No statuses yet.</p>';
      return;
    }

    feedEl.innerHTML = statuses.map(s => `
      <div class="status-item">
        <strong>${escapeHtml(s.user.fullName)}</strong>
        ${s.type === 'image' ? `<img src="${s.content}" alt="Status">` : `<p>${escapeHtml(s.content)}</p>`}
        <small>${new Date(s.createdAt).toLocaleString()}</small>
        <div class="status-actions">
          <button class="status-btn-plate reply-btn" data-user-id="${s.user.uniqueId}" data-user-name="${escapeHtml(s.user.fullName)}">💬 Reply</button>
        </div>
      </div>
    `).join('');

    feedEl.querySelectorAll('.reply-btn').forEach(btn => {
      btn.addEventListener('click', () => replyToStatus(btn.dataset.userId, btn.dataset.userName));
    });

    statuses.forEach(s => markStatusViewed(s._id));
  } catch (err) {
    console.error(err);
  }
}

async function loadMyStatus() {
  try {
    const res = await fetch('/api/status/my', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const status = await res.json();
    const section = document.getElementById('myStatusSection');
    const card = document.getElementById('myStatusCard');

    if (!status) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    card.innerHTML = `
      <div class="status-item">
        ${status.type === 'image' ? `<img src="${status.content}" alt="My Status">` : `<p>${escapeHtml(status.content)}</p>`}
        <small>${new Date(status.createdAt).toLocaleString()}</small>
        <div class="status-actions">
          <button class="status-btn-plate viewers-btn" data-status-id="${status._id}">👁 View viewers</button>
          <button class="status-btn-danger delete-status-btn">Delete</button>
        </div>
      </div>
    `;

    card.querySelector('.viewers-btn').addEventListener('click', () => showViewers(status._id));
    card.querySelector('.delete-status-btn').addEventListener('click', deleteMyStatus);
  } catch (err) {
    console.error(err);
  }
}

async function showViewers(statusId) {
  try {
    const res = await fetch(`/api/status/${statusId}/viewers`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const viewers = await res.json();
    const listEl = document.getElementById('viewersList');

    if (viewers.length === 0) {
      listEl.innerHTML = '<p class="status-empty">No views yet.</p>';
    } else {
      listEl.innerHTML = viewers.map(v => `<p class="viewer-row">${escapeHtml(v.fullName)}</p>`).join('');
    }

    document.getElementById('viewersModal').classList.remove('hidden');
  } catch (err) {
    alert('Failed to load viewers.');
  }
}

async function deleteMyStatus() {
  if (!confirm('Delete your status?')) return;
  try {
    const res = await fetch('/api/status/my', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      loadMyStatus();
      loadFeed();
    }
  } catch (err) {
    alert('Failed to delete status.');
  }
}

async function replyToStatus(uniqueId, fullName) {
  const text = prompt(`Reply to ${fullName}'s status:`);
  if (!text || !text.trim()) return;

  try {
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receiverId: uniqueId, text: text.trim() })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Failed to send reply.');
      return;
    }

    sessionStorage.setItem('kifaru_open_chat', JSON.stringify({ id: uniqueId, name: fullName }));
    window.location.href = 'dashboard.html';
  } catch (err) {
    alert('Failed to send reply.');
  }
}

async function markStatusViewed(statusId) {
  try {
    await fetch(`/api/status/${statusId}/view`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err) {
    console.error('Failed to mark viewed', err);
  }
}

document.getElementById('addTextStatusBtn').addEventListener('click', addTextStatus);
document.getElementById('addPhotoStatusBtn').addEventListener('click', () => {
  document.getElementById('statusInput').click();
});
document.getElementById('statusInput').addEventListener('change', (e) => uploadStatus(e.target));
document.getElementById('closeViewersBtn').addEventListener('click', () => {
  document.getElementById('viewersModal').classList.add('hidden');
});

loadFeed();
loadMyStatus();
