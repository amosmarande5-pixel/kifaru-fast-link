window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) window.location.href = 'index.html';
const me = JSON.parse(userStr);

const avatarColorKey = `kifaru_avatar_color_${me.uniqueId}`;

function initials(name) {
  if (!name || !name.trim()) return '-';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function applyAvatarPreview() {
  const nameVal = document.getElementById('fullNameInput').value || me.fullName;
  const color = localStorage.getItem(avatarColorKey) || '#1e1e1e';
  const avatarEl = document.getElementById('previewAvatar');
  avatarEl.textContent = initials(nameVal);
  avatarEl.style.backgroundColor = color;

  document.querySelectorAll('.swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === color);
  });
}

document.getElementById('fullNameInput').value = me.fullName;
applyAvatarPreview();

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

document.querySelectorAll('.swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    localStorage.setItem(avatarColorKey, swatch.dataset.color);
    applyAvatarPreview();
  });
});

document.getElementById('saveNameBtn').addEventListener('click', async () => {
  const fullName = document.getElementById('fullNameInput').value.trim();
  const errorEl = document.getElementById('nameError');
  errorEl.textContent = '';

  if (!fullName) { errorEl.textContent = 'Name cannot be empty.'; return; }

  try {
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fullName })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Failed to update name.'; return; }

    me.fullName = data.fullName;
    localStorage.setItem('kifaru_user', JSON.stringify(me));
    applyAvatarPreview();
  } catch (err) {
    errorEl.textContent = 'Server error. Try again.';
  }
});

document.getElementById('savePasswordBtn').addEventListener('click', async () => {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const errorEl = document.getElementById('passwordError');
  const successEl = document.getElementById('passwordSuccess');
  errorEl.textContent = '';
  successEl.textContent = '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    errorEl.textContent = 'All password fields are required.';
    return;
  }
  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'New passwords do not match.';
    return;
  }

  try {
    const res = await fetch('/api/auth/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Failed to update password.'; return; }

    successEl.textContent = data.message || 'Password updated.';
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
  } catch (err) {
    errorEl.textContent = 'Server error. Try again.';
  }
});
