const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) window.location.href = 'index.html';
const me = JSON.parse(userStr);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function initials(name, id) {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  return (id || '').replace('KFL-', '').slice(0, 2).toUpperCase();
}

function formatCallTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  const isYest = d.toDateString() === yest.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  if (isYest) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function loadCalls() {
  const listEl = document.getElementById('callList');
  listEl.innerHTML = '<p class="empty-calls">Loading...</p>';
  try {
    const res = await fetch('/api/calls/history', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const logs = await res.json();
    if (!Array.isArray(logs) || logs.length === 0) {
      listEl.innerHTML = '<p class="empty-calls">No calls yet.</p>';
      return;
    }
    listEl.innerHTML = '';
    logs.forEach(log => {
      const isOutgoing = log.callerId === me.uniqueId;
      const otherId = isOutgoing ? log.receiverId : log.callerId;
      const otherName = isOutgoing ? log.receiverName : log.callerName;
      const isMissed = !isOutgoing && (log.status === 'missed' || log.status === 'cancelled' || log.status === 'rejected');

      let dirIcon = isOutgoing ? '↗' : '↙';
      let dirClass = isOutgoing ? 'outgoing' : 'incoming';
      if (isMissed) { dirIcon = '↙'; dirClass = 'missed'; }

      const statusText = log.status === 'answered'
        ? formatDuration(log.duration)
        : log.status;

      const item = document.createElement('div');
      item.className = 'call-item';
      item.innerHTML = `
        <div class="call-avatar">${initials(otherName, otherId)}</div>
        <div class="call-info">
          <div class="call-name ${isMissed ? 'missed' : ''}">${escapeHtml(otherName || otherId)}</div>
          <div class="call-meta">
            <span class="call-direction-icon ${dirClass}">${dirIcon}</span>
            <span>${escapeHtml(statusText || '')}</span>
            <span>·</span>
            <span>${formatCallTime(log.createdAt)}</span>
          </div>
        </div>
        <div class="call-actions">
          <button class="call-action-btn" data-action="voice" data-id="${otherId}" data-name="${escapeHtml(otherName || otherId)}" title="Voice call">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </button>
          <button class="call-action-btn" data-action="video" data-id="${otherId}" data-name="${escapeHtml(otherName || otherId)}" title="Video call">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
          </button>
        </div>
      `;
      listEl.appendChild(item);
    });

    listEl.querySelectorAll('.call-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        const action = btn.dataset.action;
        sessionStorage.setItem('kifaru_open_chat', JSON.stringify({ id, name }));
        sessionStorage.setItem('kifaru_autostart_call', JSON.stringify({ id, name, type: action }));
        window.location.href = 'dashboard.html';
      });
    });
  } catch (err) {
    console.error('Calls load error:', err);
    listEl.innerHTML = '<p class="empty-calls">Failed to load calls.</p>';
  }
}

document.getElementById('clearCallsBtn').addEventListener('click', async () => {
  if (!confirm('Clear all call history?')) return;
  try {
    await fetch('/api/calls/history', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    loadCalls();
  } catch (err) {
    alert('Failed to clear.');
  }
});

loadCalls();
