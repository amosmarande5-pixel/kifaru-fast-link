const API = '/api/auth';

// ---- FORM SWITCHING ----
document.querySelectorAll('[data-target]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(link.dataset.target).classList.add('active');
  });
});

// ---- REGISTER ----
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('registerError');
  errorEl.textContent = '';

  const fullName = document.getElementById('registerFullName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;

  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Registration failed.';
      return;
    }

    // Show the unique ID reveal screen
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById('generatedId').textContent = data.uniqueId;
    document.getElementById('idReveal').classList.add('active');

  } catch (err) {
    errorEl.textContent = 'Could not reach server. Try again.';
  }
});

// ---- COPY ID BUTTON ----
document.getElementById('copyIdBtn').addEventListener('click', () => {
  const id = document.getElementById('generatedId').textContent;
  navigator.clipboard.writeText(id).then(() => {
    const btn = document.getElementById('copyIdBtn');
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = original, 1500);
  });
});

// ---- CONTINUE TO LOGIN (after ID reveal) ----
document.getElementById('continueToLoginBtn').addEventListener('click', () => {
  document.getElementById('idReveal').classList.remove('active');
  document.getElementById('loginForm').classList.add('active');
});

// ---- LOGIN ----
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  const uniqueId = document.getElementById('loginUniqueId').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Login failed.';
      return;
    }

    // Save session info and go to the dashboard
    localStorage.setItem('kifaru_token', data.token);
    localStorage.setItem('kifaru_user', JSON.stringify(data.user));
    window.location.href = 'dashboard.html';

  } catch (err) {
    errorEl.textContent = 'Could not reach server. Try again.';
  }
});
