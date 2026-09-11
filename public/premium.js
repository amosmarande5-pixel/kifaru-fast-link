const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) {
  window.location.href = 'index.html';
} else {
  const me = JSON.parse(userStr);
  const btn = document.getElementById('upgradeBtn');
  if (me.isPremium) {
    btn.textContent = 'You are Premium!';
    btn.disabled = true;
    btn.classList.add('active-plan');
  }
}

document.getElementById('upgradeBtn').addEventListener('click', () => {
  alert('Premium payment integration coming soon! For now, contact admin at amosmarande5@gmail.com to upgrade manually.');
});
