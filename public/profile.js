document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('kifaru_token');
  const userStr = localStorage.getItem('kifaru_user');
  if (!token || !userStr) { window.location.href = 'index.html'; return; }
  const me = JSON.parse(userStr);

  const name = me.fullName;
  const uniqueId = me.uniqueId;
  const profilePicture = me.profilePicture;

  const avatarInitialsEl = document.getElementById('avatarInitials');
  const avatarImageEl = document.getElementById('avatarImage');

  document.getElementById('profileName').textContent = name;
  document.getElementById('profileId').textContent = uniqueId;

  if (me.isPremium) {
    document.getElementById('premiumBadge').classList.remove('hidden');
  }

  if (profilePicture && profilePicture.trim()) {
    avatarImageEl.src = profilePicture;
    avatarImageEl.classList.remove('hidden');
    avatarInitialsEl.classList.add('hidden');
  } else {
    avatarInitialsEl.textContent = name
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    avatarImageEl.classList.add('hidden');
    avatarInitialsEl.classList.remove('hidden');
  }

  const profilePicInput = document.getElementById('profilePicInput');
  const uploadStatus = document.getElementById('uploadStatus');

  profilePicInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      uploadStatus.textContent = 'Please select an image file.';
      uploadStatus.className = 'upload-status error';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      uploadStatus.textContent = 'Image must be less than 5MB.';
      uploadStatus.className = 'upload-status error';
      return;
    }

    uploadStatus.textContent = 'Uploading...';
    uploadStatus.className = 'upload-status';

    const formData = new FormData();
    formData.append('profilePic', file);

    try {
      const res = await fetch('/api/auth/upload-profile-pic', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        uploadStatus.textContent = data.error || 'Upload failed.';
        uploadStatus.className = 'upload-status error';
        return;
      }

      avatarImageEl.src = data.profilePicture;
      avatarImageEl.classList.remove('hidden');
      avatarInitialsEl.classList.add('hidden');

      me.profilePicture = data.profilePicture;
      localStorage.setItem('kifaru_user', JSON.stringify(me));

      uploadStatus.textContent = 'Profile picture updated!';
      uploadStatus.className = 'upload-status success';

      setTimeout(() => { uploadStatus.textContent = ''; }, 3000);

    } catch (err) {
      console.error('Upload error:', err);
      uploadStatus.textContent = 'Upload failed. Try again.';
      uploadStatus.className = 'upload-status error';
    }

    profilePicInput.value = '';
  });

  document.getElementById('copyIdBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(uniqueId).then(() => {
      alert('Unique ID copied: ' + uniqueId);
    });
  });

  document.getElementById('editProfileBtn').addEventListener('click', () => {
    window.location.href = 'edit-profile.html';
  });

  document.getElementById('settingsBtn').addEventListener('click', () => {
    window.location.href = 'settings.html';
  });

  document.getElementById('blockedUsersBtn').addEventListener('click', () => {
    window.location.href = 'blocked-users.html';
  });

  document.getElementById('premiumBtn').addEventListener('click', () => {
    window.location.href = 'premium.html';
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('kifaru_token');
    localStorage.removeItem('kifaru_user');
    window.location.href = 'index.html';
  });
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
