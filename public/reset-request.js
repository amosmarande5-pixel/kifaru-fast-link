document.getElementById('resetRequestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('resetRequestError');
  const successEl = document.getElementById('resetRequestSuccess');
  const form = document.getElementById('resetRequestForm');
  errorEl.textContent = '';
  successEl.textContent = '';

  const email = document.getElementById('resetEmail').value.trim();
  if (!email) {
    errorEl.textContent = 'Email is required.';
    return;
  }

  try {
    const res = await fetch('/api/auth/reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to send reset email.';
      return;
    }

    successEl.textContent = data.message;
    form.classList.add('hidden');
  } catch (err) {
    errorEl.textContent = 'Could not reach server. Try again.';
  }
});
