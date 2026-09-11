const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) window.location.href = 'index.html';

const notifKey = 'kifaru_pref_notifications';
const soundKey = 'kifaru_pref_sound';

const notifToggle = document.getElementById('notifToggle');
const soundToggle = document.getElementById('soundToggle');

notifToggle.checked = localStorage.getItem(notifKey) !== 'off';
soundToggle.checked = localStorage.getItem(soundKey) !== 'off';

notifToggle.addEventListener('change', () => {
  localStorage.setItem(notifKey, notifToggle.checked ? 'on' : 'off');
});

soundToggle.addEventListener('change', () => {
  localStorage.setItem(soundKey, soundToggle.checked ? 'on' : 'off');
});

document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

document.getElementById('blockedUsersBtn').addEventListener('click', () => {
  window.location.href = 'blocked-users.html';
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('kifaru_token');
  localStorage.removeItem('kifaru_user');
  window.location.href = 'index.html';
});
