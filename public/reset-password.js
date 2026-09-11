const urlParams = new URLSearchParams(window.location.search);
const resetToken = urlParams.get('token');
const form = document.getElementById('resetForm');
const errorEl = document.getElementById('resetError');
const successEl = document.getElementById('resetSuccess');

if (!resetToken) {
  errorEl.textContent = 'Invalid or missing reset token.';
  form.classList.add('hidden');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  successEl.textContent = '';

  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    errorEl.textContent = 'Passwords do not match.';
    return;
  }
  if (newPassword.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  try {
    const res = await fetch('/api/auth/reset/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, newPassword })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to reset password.';
      return;
    }

    successEl.textContent = data.message;
    form.classList.add('hidden');

    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
  } catch (err) {
    errorEl.textContent = 'Could not reach server. Try again.';
  }
});
