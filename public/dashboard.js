window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
const token = localStorage.getItem('kifaru_token');
const userStr = localStorage.getItem('kifaru_user');
if (!token || !userStr) window.location.href = 'index.html';
const me = JSON.parse(userStr);

function initials(name, id) {
  if (name && name.trim()) {
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  return (id || '').replace('KFL-', '').slice(0, 2).toUpperCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const profilePics = {};

async function fetchProfilePic(uniqueId) {
  if (profilePics[uniqueId] !== undefined) return profilePics[uniqueId];
  try {
    const res = await fetch(`/api/auth/profile/${uniqueId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { profilePics[uniqueId] = null; return null; }
    const data = await res.json();
    profilePics[uniqueId] = data.profilePicture || null;
    return profilePics[uniqueId];
  } catch (err) {
    return null;
  }
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

document.getElementById('myName').textContent = me.fullName;
document.getElementById('myId').textContent = me.uniqueId;
document.getElementById('myAvatar').textContent = initials(me.fullName, me.uniqueId);

const contactsKey = `kifaru_contacts_${me.uniqueId}`;
function getContacts() { return JSON.parse(localStorage.getItem(contactsKey) || '[]'); }
function saveContacts(c) { localStorage.setItem(contactsKey, JSON.stringify(c)); }

function getDeletedForMe() {
  return JSON.parse(localStorage.getItem(`kifaru_deleted_for_me_${me.uniqueId}`) || '[]');
}
function addDeletedForMe(id) {
  const list = getDeletedForMe();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(`kifaru_deleted_for_me_${me.uniqueId}`, JSON.stringify(list));
  }
}
function removeBubbleFromDOM(id) {
  const bubble = document.querySelector(`.message-bubble[data-id="${id}"]`);
  if (bubble) {
    const timeEl = bubble.nextElementSibling;
    bubble.remove();
    if (timeEl && timeEl.classList.contains('message-time')) timeEl.remove();
  }
}

function getChatThemeKey() {
  return currentGroup ? `kifaru_chat_theme_${currentGroup.groupId}` : `kifaru_chat_theme_${currentChatContact.id}`;
}

function applyChatTheme() {
  const key = getChatThemeKey();
  const color = localStorage.getItem(key);
  const chatScreen = document.getElementById('chatScreen');
  if (color) {
    chatScreen.style.setProperty('--ember', color);
  } else {
    chatScreen.style.removeProperty('--ember');
  }
}

let onlineIds = new Set();
let inboxSummary = {};
let groupInboxSummary = {};
let myGroups = [];
let currentChatContact = null;
let currentGroup = null;
let typingTimeout = null;
let actionTarget = null;
let replyTarget = null;
let searchMatches = [];
let searchIndex = -1;
let mediaRecorder = null;
let audioChunks = [];
let recordingCancelled = false;
let videoRecorder = null;
let videoChunks = [];
let videoCancelled = false;
let videoStream = null;
let currentFacingMode = 'user';

async function fetchInboxSummary() {
  try {
    const res = await fetch('/api/messages/inbox/summary', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    inboxSummary = {};
    data.forEach(item => inboxSummary[item.otherId] = item);
  } catch (err) {
    console.error('Failed to load inbox summary', err);
  }
}

async function fetchMyGroups() {
  try {
    const res = await fetch('/api/groups/mine', { headers: { Authorization: `Bearer ${token}` } });
    myGroups = await res.json();
    myGroups.forEach(g => socket.emit('joinGroup', g.groupId));
  } catch (err) {
    console.error('Failed to load groups', err);
  }
}

async function fetchGroupInboxSummary() {
  try {
    const res = await fetch('/api/messages/group-inbox/summary', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    groupInboxSummary = {};
    data.forEach(item => groupInboxSummary[item.groupId] = item);
  } catch (err) {
    console.error('Failed to load group inbox summary', err);
  }
}

function renderContacts() {
  const contacts = getContacts();
  const listEl = document.getElementById('contactList');
  const emptyState = document.getElementById('emptyState');
  listEl.innerHTML = '';

  const contactItems = contacts.map(c => ({
    kind: 'contact',
    id: c.id,
    name: c.name,
    lastMessage: inboxSummary[c.id]?.lastMessage,
    lastTimestamp: inboxSummary[c.id]?.lastTimestamp,
    unreadCount: inboxSummary[c.id]?.unreadCount || 0,
    isOnline: onlineIds.has(c.id)
  }));

  const groupItems = myGroups.map(g => ({
    kind: 'group',
    id: g.groupId,
    name: g.name,
    lastMessage: groupInboxSummary[g.groupId]?.lastMessage,
    lastTimestamp: groupInboxSummary[g.groupId]?.lastTimestamp,
    unreadCount: groupInboxSummary[g.groupId]?.unreadCount || 0,
    isOnline: false
  }));

  const all = [...contactItems, ...groupItems];

  if (all.length === 0) {
    listEl.appendChild(emptyState);
    return;
  }

  all.sort((a, b) => {
    const ta = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
    const tb = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
    return tb - ta;
  });

  all.forEach(item => {
    const card = document.createElement('div');
    card.className = 'contact-card';
    card.innerHTML = `
      <div class="avatar clip-br-sm">${item.kind === 'group' ? '👥' : initials(item.name, item.id)}${item.isOnline ? '<span class="online-dot"></span>' : ''}</div>
      <div class="contact-main">
        <div class="contact-card-name" style="${item.unreadCount ? 'font-weight:700;' : ''}">${escapeHtml(item.name || item.id)}</div>
        <div class="contact-preview">${item.lastMessage ? escapeHtml(item.lastMessage) : item.id}</div>
      </div>
      <div class="contact-meta">
        <span class="contact-timestamp">${formatTime(item.lastTimestamp)}</span>
        ${item.unreadCount ? `<span class="unread-badge clip-br-sm">${item.unreadCount}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => {
      if (item.kind === 'group') {
        const group = myGroups.find(g => g.groupId === item.id);
        openGroupChat(group);
      } else {
        openChat({ id: item.id, name: item.name });
      }
    });
    listEl.appendChild(card);
  });
}

async function refreshInbox() {
  await fetchMyGroups();
  await fetchInboxSummary();
  await fetchGroupInboxSummary();
  renderContacts();
}
refreshInbox();
requestNotificationPermission();

const pendingChat = sessionStorage.getItem('kifaru_open_chat');
if (pendingChat) {
  sessionStorage.removeItem('kifaru_open_chat');
  openChat(JSON.parse(pendingChat));
}

const addContactModal = document.getElementById('addContactModal');

document.getElementById('addContactBtn').addEventListener('click', () => {
  document.getElementById('newContactId').value = '';
  document.getElementById('newContactName').value = '';
  document.getElementById('addContactError').textContent = '';
  addContactModal.classList.add('active');
});

document.getElementById('cancelAddContact').addEventListener('click', () => {
  addContactModal.classList.remove('active');
});

document.getElementById('confirmAddContact').addEventListener('click', () => {
  const id = document.getElementById('newContactId').value.trim().toUpperCase();
  const name = document.getElementById('newContactName').value.trim();
  const errorEl = document.getElementById('addContactError');

  if (!id) { errorEl.textContent = 'Unique ID is required.'; return; }
  if (id === me.uniqueId) { errorEl.textContent = "You can't add yourself."; return; }

  const contacts = getContacts();
  if (contacts.find(c => c.id === id)) { errorEl.textContent = 'Contact already added.'; return; }

  contacts.push({ id, name });
  saveContacts(contacts);
  renderContacts();
  addContactModal.classList.remove('active');
});

const newGroupModal = document.getElementById('newGroupModal');

document.getElementById('newGroupBtn').addEventListener('click', () => {
  document.getElementById('newGroupName').value = '';
  document.getElementById('newGroupError').textContent = '';
  const listEl = document.getElementById('groupMemberList');
  const contacts = getContacts();

  if (contacts.length === 0) {
    listEl.innerHTML = '<p style="font-size:13px;color:#9a9a9a;">Add some contacts first to create a group.</p>';
  } else {
    listEl.innerHTML = contacts.map(c => `
      <label class="member-row">
        <input type="checkbox" value="${c.id}">
        <span>${escapeHtml(c.name || c.id)}</span>
      </label>
    `).join('');
  }

  newGroupModal.classList.add('active');
});

document.getElementById('cancelNewGroup').addEventListener('click', () => {
  newGroupModal.classList.remove('active');
});

document.getElementById('confirmNewGroup').addEventListener('click', async () => {
  const name = document.getElementById('newGroupName').value.trim();
  const errorEl = document.getElementById('newGroupError');
  const checked = Array.from(document.querySelectorAll('#groupMemberList input[type="checkbox"]:checked')).map(cb => cb.value);

  if (!name) { errorEl.textContent = 'Group name is required.'; return; }
  if (checked.length === 0) { errorEl.textContent = 'Select at least one member.'; return; }

  try {
    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, memberIds: checked })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Failed to create group.'; return; }

    socket.emit('joinGroup', data.groupId);
    newGroupModal.classList.remove('active');
    await refreshInbox();
  } catch (err) {
    errorEl.textContent = 'Server error. Try again.';
  }
});

const socket = io();
socket.emit('join', me.uniqueId);

socket.on('onlineList', (ids) => {
  onlineIds = new Set(ids);
  renderContacts();
  updateChatStatus();
});

socket.on('receiveMessage', (data) => {
  playNotificationSound();

  if (currentChatContact && data.senderId === currentChatContact.id) {
    appendMessage(data.text, 'received', false, data.timestamp, data.messageId, false, data.imageUrl, data.audioUrl, null, data.videoUrl, data.replyTo);
    markCurrentChatRead();
  } else {
    const prev = inboxSummary[data.senderId];
    const preview = data.imageUrl ? '📷 Photo' : data.audioUrl ? '🎤 Voice message' : data.videoUrl ? '🎥 Video' : data.text;
    inboxSummary[data.senderId] = {
      otherId: data.senderId,
      lastMessage: preview,
      lastTimestamp: data.timestamp || new Date().toISOString(),
      unreadCount: (prev?.unreadCount || 0) + 1
    };
    renderContacts();

    const senderContact = getContacts().find(c => c.id === data.senderId);
    maybeShowNotification(senderContact?.name || data.senderId, preview);
  }
});

socket.on('receiveGroupMessage', (data) => {
  playNotificationSound();
  const preview = data.imageUrl ? '📷 Photo' : data.audioUrl ? '🎤 Voice message' : data.videoUrl ? '🎥 Video' : data.text;

  if (currentGroup && data.groupId === currentGroup.groupId) {
    const senderName = getContacts().find(c => c.id === data.senderId)?.name || data.senderId;
    appendMessage(data.text, 'received', false, data.timestamp, data.messageId, false, data.imageUrl, data.audioUrl, senderName, data.videoUrl, data.replyTo);
    markCurrentGroupRead();
  } else {
    const prev = groupInboxSummary[data.groupId];
    groupInboxSummary[data.groupId] = {
      groupId: data.groupId,
      name: myGroups.find(g => g.groupId === data.groupId)?.name || 'Group',
      lastMessage: preview,
      lastTimestamp: data.timestamp || new Date().toISOString(),
      unreadCount: (prev?.unreadCount || 0) + 1
    };
    renderContacts();

    const group = myGroups.find(g => g.groupId === data.groupId);
    maybeShowNotification(group?.name || 'Group message', preview);
  }
});

socket.on('typing', ({ from }) => {
  if (currentChatContact && from === currentChatContact.id) {
    document.getElementById('chatContactStatus').textContent = 'typing...';
  }
});

socket.on('stopTyping', ({ from }) => {
  if (currentChatContact && from === currentChatContact.id) updateChatStatus();
});

socket.on('groupTyping', ({ from }) => {
  if (currentGroup) {
    const name = getContacts().find(c => c.id === from)?.name || from;
    document.getElementById('chatContactStatus').textContent = `${name} is typing...`;
  }
});

socket.on('groupStopTyping', () => {
  if (currentGroup) document.getElementById('chatContactStatus').textContent = '';
});

socket.on('messagesSeen', ({ by }) => {
  if (currentChatContact && by === currentChatContact.id) markLastSentAsSeen();
});

socket.on('messageEdited', ({ messageId, text }) => {
  const bubble = document.querySelector(`.message-bubble[data-id="${messageId}"]`);
  if (bubble) {
    const tick = bubble.querySelector('.tick');
    const nameLabel = bubble.querySelector('.message-sender-name');
    bubble.textContent = text;
    if (nameLabel) bubble.prepend(nameLabel);
    if (tick) bubble.appendChild(tick);
    addEditedLabel(bubble);
  }
});

socket.on('messageDeleted', ({ messageId }) => {
  removeBubbleFromDOM(messageId);
});

function updateChatStatus() {
  if (currentGroup) return;
  if (!currentChatContact) return;
  document.getElementById('chatContactStatus').textContent =
    onlineIds.has(currentChatContact.id) ? 'Online' : '';
}

async function openChat(contact) {
  currentGroup = null;
  currentChatContact = contact;
  document.getElementById('groupInfoBtn').classList.add('hidden');
  document.getElementById('voiceCallBtn').classList.remove('hidden');
  document.getElementById('videoCallBtn').classList.remove('hidden');
  applyChatTheme();

  const nameEl = document.getElementById('chatContactName');
  nameEl.textContent = contact.name || contact.id;

  const avatarEl = document.getElementById('chatContactAvatar');
  const pic = await fetchProfilePic(contact.id);
  if (pic) {
    avatarEl.innerHTML = `<img src="${pic}" alt="${escapeHtml(contact.name || contact.id)}" class="avatar-img">`;
  } else {
    avatarEl.textContent = initials(contact.name, contact.id);
  }

  updateChatStatus();
  document.getElementById('messagesContainer').innerHTML = '';

  document.getElementById('chatListScreen').classList.remove('active');
  document.getElementById('chatScreen').classList.add('active');
  document.querySelector('.bottom-nav').classList.add('hidden');

  try {
    const res = await fetch(`/api/messages/${contact.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const messages = await res.json();
    const deletedForMe = getDeletedForMe();
    messages
      .filter(msg => !deletedForMe.includes(msg._id))
      .forEach(msg => {
        const type = msg.senderId === me.uniqueId ? 'sent' : 'received';
        appendMessage(msg.text, type, msg.read, msg.timestamp, msg._id, msg.edited, msg.imageUrl, msg.audioUrl, null, msg.videoUrl, msg.replyTo);
      });
  } catch (err) {
    console.error('Failed to load messages', err);
  }

  await markCurrentChatRead();
}

async function openGroupChat(group) {
  currentChatContact = null;
  currentGroup = group;
  applyChatTheme();
  document.getElementById('groupInfoBtn').classList.remove('hidden');
  document.getElementById('voiceCallBtn').classList.add('hidden');
  document.getElementById('videoCallBtn').classList.add('hidden');
  document.getElementById('chatContactName').textContent = group.name;
  document.getElementById('chatContactAvatar').textContent = '👥';
  document.getElementById('chatContactStatus').textContent = `${group.members.length} members`;
  document.getElementById('messagesContainer').innerHTML = '';

  document.getElementById('chatListScreen').classList.remove('active');
  document.getElementById('chatScreen').classList.add('active');
  document.querySelector('.bottom-nav').classList.add('hidden');

  try {
    const res = await fetch(`/api/messages/group/${group.groupId}`, { headers: { Authorization: `Bearer ${token}` } });
    const messages = await res.json();
    const deletedForMe = getDeletedForMe();
    const contacts = getContacts();
    messages
      .filter(msg => !deletedForMe.includes(msg._id))
      .forEach(msg => {
        const type = msg.senderId === me.uniqueId ? 'sent' : 'received';
        const senderName = type === 'received' ? (contacts.find(c => c.id === msg.senderId)?.name || msg.senderId) : null;
        appendMessage(msg.text, type, msg.readBy && msg.readBy.length > 1, msg.timestamp, msg._id, msg.edited, msg.imageUrl, msg.audioUrl, senderName, msg.videoUrl, msg.replyTo);
      });
  } catch (err) {
    console.error('Failed to load group messages', err);
  }

  await markCurrentGroupRead();
}

async function markCurrentChatRead() {
  if (!currentChatContact) return;
  try {
    await fetch(`/api/messages/read/${currentChatContact.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (inboxSummary[currentChatContact.id]) inboxSummary[currentChatContact.id].unreadCount = 0;
    socket.emit('messagesSeen', { by: me.uniqueId, to: currentChatContact.id });
  } catch (err) {
    console.error('Failed to mark read', err);
  }
}

async function markCurrentGroupRead() {
  if (!currentGroup) return;
  try {
    await fetch(`/api/messages/group/${currentGroup.groupId}/read`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (groupInboxSummary[currentGroup.groupId]) groupInboxSummary[currentGroup.groupId].unreadCount = 0;
  } catch (err) {
    console.error('Failed to mark group read', err);
  }
}

document.getElementById('chatThemeBtn').addEventListener('click', () => {
  applyChatTheme();
  document.getElementById('chatThemeModal').classList.add('active');
});

document.getElementById('closeChatTheme').addEventListener('click', () => {
  document.getElementById('chatThemeModal').classList.remove('active');
});

document.querySelectorAll('.theme-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    localStorage.setItem(getChatThemeKey(), swatch.dataset.color);
    applyChatTheme();
  });
});

document.getElementById('customThemeColor').addEventListener('input', (e) => {
  localStorage.setItem(getChatThemeKey(), e.target.value);
  applyChatTheme();
});

document.getElementById('resetChatTheme').addEventListener('click', () => {
  localStorage.removeItem(getChatThemeKey());
  applyChatTheme();
});

document.getElementById('groupInfoBtn').addEventListener('click', async () => {
  if (!currentGroup) return;
  try {
    const res = await fetch(`/api/groups/${currentGroup.groupId}`, { headers: { Authorization: `Bearer ${token}` } });
    const group = await res.json();
    currentGroup = group;
    renderGroupInfo(group);
    document.getElementById('groupInfoModal').classList.add('active');
  } catch (err) {
    console.error('Failed to load group info', err);
  }
});

function renderGroupInfo(group) {
  const isAdmin = group.creatorId === me.uniqueId;
  document.getElementById('groupInfoName').textContent = group.name;
  document.getElementById('groupInfoError').textContent = '';
  document.getElementById('renameGroupBtn').classList.toggle('hidden', !isAdmin);
  document.getElementById('addMemberSection').classList.toggle('hidden', !isAdmin);
  document.getElementById('newMemberId').value = '';

  const contacts = getContacts();
  document.getElementById('groupMembersInfo').innerHTML = group.members.map(memberId => {
    const isCreator = memberId === group.creatorId;
    const displayName = memberId === me.uniqueId ? `${me.fullName} (you)` : (contacts.find(c => c.id === memberId)?.name || memberId);
    return `
      <div class="member-row">
        <span>${escapeHtml(displayName)}${isCreator ? ' 👑' : ''}</span>
        ${isAdmin && !isCreator ? `<button class="remove-member-btn secondary-btn" data-id="${memberId}">Remove</button>` : ''}
      </div>
    `;
  }).join('');

  document.querySelectorAll('.remove-member-btn').forEach(btn => {
    btn.addEventListener('click', () => removeGroupMember(btn.dataset.id));
  });
}

document.getElementById('closeGroupInfo').addEventListener('click', () => {
  document.getElementById('groupInfoModal').classList.remove('active');
});

document.getElementById('renameGroupBtn').addEventListener('click', async () => {
  if (!currentGroup) return;
  const newName = prompt('New group name:', currentGroup.name);
  if (!newName || !newName.trim()) return;

  try {
    const res = await fetch(`/api/groups/${currentGroup.groupId}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName.trim() })
    });
    const data = await res.json();
    if (!res.ok) { document.getElementById('groupInfoError').textContent = data.error || 'Failed to rename.'; return; }

    currentGroup = data;
    document.getElementById('chatContactName').textContent = data.name;
    renderGroupInfo(data);
    await refreshInbox();
  } catch (err) {
    document.getElementById('groupInfoError').textContent = 'Server error. Try again.';
  }
});

document.getElementById('confirmAddMemberBtn').addEventListener('click', async () => {
  if (!currentGroup) return;
  const memberId = document.getElementById('newMemberId').value.trim().toUpperCase();
  const errorEl = document.getElementById('groupInfoError');
  if (!memberId) { errorEl.textContent = 'Unique ID is required.'; return; }

  try {
    const res = await fetch(`/api/groups/${currentGroup.groupId}/add`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ memberId })
    });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || 'Failed to add member.'; return; }

    currentGroup = data;
    document.getElementById('chatContactStatus').textContent = `${data.members.length} members`;
    renderGroupInfo(data);
  } catch (err) {
    errorEl.textContent = 'Server error. Try again.';
  }
});

async function removeGroupMember(memberId) {
  if (!currentGroup) return;
  if (!confirm('Remove this member from the group?')) return;

  try {
    const res = await fetch(`/api/groups/${currentGroup.groupId}/remove`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ memberId })
    });
    const data = await res.json();
    if (!res.ok) { document.getElementById('groupInfoError').textContent = data.error || 'Failed to remove member.'; return; }

    currentGroup = data;
    document.getElementById('chatContactStatus').textContent = `${data.members.length} members`;
    renderGroupInfo(data);
  } catch (err) {
    document.getElementById('groupInfoError').textContent = 'Server error. Try again.';
  }
}

document.getElementById('backToListBtn').addEventListener('click', () => {
  currentChatContact = null;
  currentGroup = null;
  document.getElementById('chatScreen').classList.remove('active');
  document.getElementById('chatListScreen').classList.add('active');
  document.querySelector('.bottom-nav').classList.remove('hidden');
  refreshInbox();
});

function addEditedLabel(bubble) {
  if (bubble.querySelector('.edited-label')) return;
  const label = document.createElement('span');
  label.className = 'edited-label';
  label.textContent = ' (edited)';
  bubble.appendChild(label);
}

function showReactionPicker(bubble, messageId) {
  const emojis = ['😀', '❤️', '👍', '👎', '😂', '😢', '😡', '🎉'];

  const existing = document.querySelector('.reaction-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.className = 'reaction-picker';

  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/reactions/${messageId}/react`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ emoji })
        });

        if (res.ok) {
          picker.remove();
          if (currentChatContact) openChat(currentChatContact);
          else if (currentGroup) openGroupChat(currentGroup);
        } else {
          alert('Failed to add reaction.');
        }
      } catch (err) {
        console.error('React error:', err);
        alert('Failed to add reaction.');
      }
    });
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);

  setTimeout(() => {
    document.addEventListener('click', () => picker.remove(), { once: true });
  }, 100);
}

function appendMessage(text, type, seen, timestamp, id, edited, imageUrl, audioUrl, senderName, videoUrl, replyTo) {
  const container = document.getElementById('messagesContainer');
  const bubble = document.createElement('div');
  bubble.className = (imageUrl || videoUrl)
    ? `message-bubble image-bubble ${type}`
    : audioUrl
      ? `message-bubble audio-bubble ${type}`
      : `message-bubble ${type}`;
  if (id) bubble.dataset.id = id;
  if (text) bubble.dataset.text = text;
  bubble.dataset.starred = 'false';

  if (replyTo && replyTo.messageId) {
    const quote = document.createElement('div');
    quote.className = 'message-reply-quote';
    const qs = document.createElement('div');
    qs.className = 'reply-sender';
    qs.textContent = replyTo.senderName || 'Message';
    const qt = document.createElement('div');
    qt.className = 'reply-text';
    qt.textContent = replyTo.text || 'Attachment';
    quote.appendChild(qs);
    quote.appendChild(qt);
    bubble.appendChild(quote);
  }

  if (senderName && type === 'received') {
    const nameLabel = document.createElement('div');
    nameLabel.className = 'message-sender-name';
    nameLabel.textContent = senderName;
    bubble.appendChild(nameLabel);
  }

  if (imageUrl) {
    const img = document.createElement('img');
    img.src = imageUrl;
    bubble.appendChild(img);
    if (text) {
      const caption = document.createElement('div');
      caption.className = 'message-caption';
      caption.textContent = text;
      bubble.appendChild(caption);
    }
  } else if (audioUrl) {
    const audio = document.createElement('audio');
    audio.src = audioUrl;
    audio.controls = true;
    bubble.appendChild(audio);
  } else if (videoUrl) {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    bubble.appendChild(video);
  } else {
    bubble.appendChild(document.createTextNode(text));
  }

  if (type === 'sent' && !imageUrl && !audioUrl && !videoUrl) {
    const tick = document.createElement('span');
    tick.className = `tick ${seen ? 'seen' : ''}`;
    tick.textContent = seen ? '✓✓' : '✓';
    bubble.appendChild(tick);
  }

  if (type === 'sent') {
    bubble.dataset.hasMedia = (imageUrl || audioUrl || videoUrl) ? 'true' : 'false';
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'msg-menu-btn';
    menuBtn.textContent = '⋮';
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMessageActionSheet(bubble);
    });
    bubble.appendChild(menuBtn);
  }

  const reactBtn = document.createElement('button');
  reactBtn.type = 'button';
  reactBtn.className = 'msg-react-btn';
  reactBtn.textContent = '😀';
  reactBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showReactionPicker(bubble, id);
  });
  bubble.appendChild(reactBtn);
  bubble.addEventListener('mouseenter', () => reactBtn.classList.add('visible'));
  bubble.addEventListener('mouseleave', () => reactBtn.classList.remove('visible'));

  const mediaEl = bubble.querySelector('img, video');
  if (mediaEl) {
    mediaEl.draggable = false;
    mediaEl.oncontextmenu = () => false;
  }

  if (edited) addEditedLabel(bubble);

  container.appendChild(bubble);

  const timeEl = document.createElement('div');
  timeEl.className = `message-time ${type}`;
  timeEl.textContent = formatTime(timestamp || new Date().toISOString());
  container.appendChild(timeEl);

  container.scrollTop = container.scrollHeight;
  return bubble;
}

function markLastSentAsSeen() {
  const container = document.getElementById('messagesContainer');
  container.querySelectorAll('.message-bubble.sent .tick').forEach(tick => {
    tick.textContent = '✓✓';
    tick.classList.add('seen');
  });
}

const messageActionSheet = document.getElementById('messageActionSheet');

function openMessageActionSheet(bubble) {
  if (!bubble.dataset.id) return;
  actionTarget = {
    id: bubble.dataset.id,
    text: bubble.dataset.text || '',
    hasMedia: bubble.dataset.hasMedia === 'true',
    starred: bubble.dataset.starred === 'true'
  };
  document.getElementById('editMessageBtn').classList.toggle('hidden', actionTarget.hasMedia);
  document.getElementById('copyMessageBtn').classList.toggle('hidden', !actionTarget.text);
  document.getElementById('starMessageBtn').textContent = actionTarget.starred ? '★ Unstar' : '☆ Star';
  messageActionSheet.classList.add('active');
}

document.getElementById('cancelMessageAction').addEventListener('click', () => {
  messageActionSheet.classList.remove('active');
  actionTarget = null;
});

document.getElementById('editMessageBtn').addEventListener('click', async () => {
  if (!actionTarget) return;
  const targetId = actionTarget.id;
  const bubble = document.querySelector(`.message-bubble[data-id="${targetId}"]`);
  const currentText = bubble ? (bubble.childNodes[bubble.querySelector('.message-sender-name') ? 1 : 0]?.textContent || '') : '';
  const newText = prompt('Edit message:', currentText);
  messageActionSheet.classList.remove('active');
  if (newText === null || !newText.trim()) { actionTarget = null; return; }

  try {
    const res = await fetch(`/api/messages/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: newText.trim() })
    });
    if (res.ok && bubble) {
      const tick = bubble.querySelector('.tick');
      const nameLabel = bubble.querySelector('.message-sender-name');
      bubble.textContent = newText.trim();
      if (nameLabel) bubble.prepend(nameLabel);
      if (tick) bubble.appendChild(tick);
      addEditedLabel(bubble);
    }
  } catch (err) {
    console.error('Failed to edit message', err);
  }
  actionTarget = null;
});

document.getElementById('deleteForMeBtn').addEventListener('click', () => {
  if (!actionTarget) return;
  const id = actionTarget.id;
  messageActionSheet.classList.remove('active');
  addDeletedForMe(id);
  removeBubbleFromDOM(id);
  actionTarget = null;
});

document.getElementById('deleteForEveryoneBtn').addEventListener('click', async () => {
  if (!actionTarget) return;
  const id = actionTarget.id;
  messageActionSheet.classList.remove('active');
  if (!confirm('Delete this message for everyone?')) { actionTarget = null; return; }

  try {
    const res = await fetch(`/api/messages/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) removeBubbleFromDOM(id);
  } catch (err) {
    console.error('Failed to delete message', err);
  }
  actionTarget = null;
});

document.getElementById('searchToggleBtn').addEventListener('click', () => {
  const bar = document.getElementById('searchBar');
  const isOpen = !bar.classList.contains('hidden');
  bar.classList.toggle('hidden');
  if (isOpen) document.getElementById('searchInput').focus();
  else clearSearch(true);
});

document.getElementById('searchCloseBtn').addEventListener('click', () => {
  document.getElementById('searchBar').classList.add('hidden');
  clearSearch(true);
});

function clearSearch(resetInput) {
  document.querySelectorAll('.search-match, .search-current').forEach(el => {
    el.classList.remove('search-match', 'search-current');
  });
  searchMatches = [];
  searchIndex = -1;
  if (resetInput) document.getElementById('searchInput').value = '';
  document.getElementById('searchCount').textContent = '';
}

document.getElementById('searchInput').addEventListener('input', (e) => {
  clearSearch(false);
  const term = e.target.value.trim().toLowerCase();
  if (!term) return;

  const bubbles = document.querySelectorAll('#messagesContainer .message-bubble');
  bubbles.forEach(bubble => {
    if (bubble.textContent.toLowerCase().includes(term)) {
      bubble.classList.add('search-match');
      searchMatches.push(bubble);
    }
  });

  document.getElementById('searchCount').textContent = searchMatches.length
    ? `1/${searchMatches.length}`
    : 'No results';

  if (searchMatches.length) {
    searchIndex = 0;
    goToMatch(0);
  }
});

function goToMatch(i) {
  searchMatches.forEach(b => b.classList.remove('search-current'));
  const bubble = searchMatches[i];
  bubble.classList.add('search-current');
  bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('searchCount').textContent = `${i + 1}/${searchMatches.length}`;
}

document.getElementById('searchNextBtn').addEventListener('click', () => {
  if (!searchMatches.length) return;
  searchIndex = (searchIndex + 1) % searchMatches.length;
  goToMatch(searchIndex);
});

document.getElementById('searchPrevBtn').addEventListener('click', () => {
  if (!searchMatches.length) return;
  searchIndex = (searchIndex - 1 + searchMatches.length) % searchMatches.length;
  goToMatch(searchIndex);
});

async function uploadAndSendMedia(fileOrBlob, urlField, previewLabel) {
  if (!currentChatContact && !currentGroup) return;
  const formData = new FormData();
  formData.append('image', fileOrBlob, fileOrBlob.name || 'clip.webm');

  try {
    const uploadRes = await fetch('/api/messages/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) { alert(uploadData.error || 'Upload failed.'); return; }

    const timestamp = new Date().toISOString();
    const bubble = urlField === 'videoUrl'
      ? appendMessage('', 'sent', false, timestamp, null, false, null, null, null, uploadData.url)
      : urlField === 'audioUrl'
        ? appendMessage('', 'sent', false, timestamp, null, false, null, uploadData.url)
        : appendMessage('', 'sent', false, timestamp, null, false, uploadData.url);

    const payload = { [urlField]: uploadData.url };

    if (currentGroup) {
      const sendRes = await fetch('/api/messages/group/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: currentGroup.groupId, ...payload })
      });
      const saved = await sendRes.json();
      if (saved._id) {
        bubble.dataset.id = saved._id;
        socket.emit('sendGroupMessage', { senderId: me.uniqueId, groupId: currentGroup.groupId, text: '', ...payload, timestamp, messageId: saved._id });
      }
      groupInboxSummary[currentGroup.groupId] = { groupId: currentGroup.groupId, name: currentGroup.name, lastMessage: previewLabel, lastTimestamp: timestamp, unreadCount: 0 };
    } else {
      const sendRes = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiverId: currentChatContact.id, ...payload })
      });
      const saved = await sendRes.json();
      if (saved._id) {
        bubble.dataset.id = saved._id;
        socket.emit('sendMessage', { senderId: me.uniqueId, receiverId: currentChatContact.id, text: '', ...payload, timestamp, messageId: saved._id });
      }
      inboxSummary[currentChatContact.id] = { otherId: currentChatContact.id, lastMessage: previewLabel, lastTimestamp: timestamp, unreadCount: 0 };
    }
  } catch (err) {
    console.error('Failed to upload media', err);
    alert('Failed to send.');
  }
}

const attachMenu = document.getElementById('attachMenu');

document.getElementById('attachBtn').addEventListener('click', () => {
  attachMenu.classList.toggle('hidden');
});

document.getElementById('attachPhotoBtn').addEventListener('click', () => {
  attachMenu.classList.add('hidden');
  document.getElementById('imageInput').click();
});

document.getElementById('attachGalleryVideoBtn').addEventListener('click', () => {
  attachMenu.classList.add('hidden');
  document.getElementById('videoInput').click();
});

document.getElementById('attachRecordVideoBtn').addEventListener('click', () => {
  attachMenu.classList.add('hidden');
  startVideoRecording();
});

document.getElementById('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await uploadAndSendMedia(file, 'imageUrl', '📷 Photo');
  e.target.value = '';
});

document.getElementById('videoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await uploadAndSendMedia(file, 'videoUrl', '🎥 Video');
  e.target.value = '';
});

async function getCameraStream(facingMode) {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: true });
  } catch (err) {
    console.error('Preferred camera failed, trying default camera', err);
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  }
}

async function startVideoRecording() {
  try {
    videoStream = await getCameraStream(currentFacingMode);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
    videoRecorder = new MediaRecorder(videoStream, { mimeType });
    videoChunks = [];
    videoCancelled = false;

    videoRecorder.ondataavailable = (e) => videoChunks.push(e.data);
    videoRecorder.onstop = async () => {
      videoStream.getTracks().forEach(track => track.stop());
      if (videoCancelled || videoChunks.length === 0) return;
      const blob = new Blob(videoChunks, { type: 'video/webm' });
      await uploadAndSendMedia(blob, 'videoUrl', '🎥 Video');
    };

    videoRecorder.start();
    document.getElementById('recordingText').textContent = '🔴 Recording video... tap here to stop and send';
    document.getElementById('flipCameraBtn').classList.remove('hidden');
    document.getElementById('recordingIndicator').classList.remove('hidden');
  } catch (err) {
    console.error('Camera access denied or unavailable', err);
    alert('Camera error: ' + err.name + (err.message ? ' - ' + err.message : ''));
  }
}

function stopVideoRecording(cancel) {
  videoCancelled = !!cancel;
  if (videoRecorder && videoRecorder.state !== 'inactive') videoRecorder.stop();
  document.getElementById('flipCameraBtn').classList.add('hidden');
  document.getElementById('recordingIndicator').classList.add('hidden');
}

document.getElementById('recordingIndicator').addEventListener('click', () => {
  if (videoRecorder && videoRecorder.state !== 'inactive') stopVideoRecording(false);
  else if (mediaRecorder && mediaRecorder.state !== 'inactive') stopRecording(false);
});

document.getElementById('flipCameraBtn').addEventListener('click', async (e) => {
  e.stopPropagation();
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  if (videoRecorder && videoRecorder.state !== 'inactive') {
    videoCancelled = true;
    videoRecorder.stop();
    setTimeout(() => startVideoRecording(), 200);
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    recordingCancelled = false;

    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      if (recordingCancelled || audioChunks.length === 0) return;
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      await uploadAndSendMedia(blob, 'audioUrl', '🎤 Voice message');
    };

    mediaRecorder.start();
    document.getElementById('micBtn').classList.add('recording');
    document.getElementById('recordingText').textContent = '🔴 Recording audio... release to send';
    document.getElementById('recordingIndicator').classList.remove('hidden');
  } catch (err) {
    console.error('Microphone access denied or unavailable', err);
    alert('Could not access microphone.');
  }
}

function stopRecording(cancel) {
  recordingCancelled = !!cancel;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  document.getElementById('micBtn').classList.remove('recording');
  document.getElementById('recordingIndicator').classList.add('hidden');
}

const micBtn = document.getElementById('micBtn');
micBtn.addEventListener('touchstart', (e) => {
  e.preventDefault();
  startRecording();
});
micBtn.addEventListener('touchend', () => stopRecording(false));
micBtn.addEventListener('touchcancel', () => stopRecording(true));

document.getElementById('messageInput').addEventListener('input', () => {
  if (currentGroup) {
    socket.emit('groupTyping', { groupId: currentGroup.groupId, from: me.uniqueId });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('groupStopTyping', { groupId: currentGroup.groupId, from: me.uniqueId });
    }, 1500);
    return;
  }
  if (!currentChatContact) return;
  socket.emit('typing', { to: currentChatContact.id, from: me.uniqueId });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stopTyping', { to: currentChatContact.id, from: me.uniqueId });
  }, 1500);
});

document.getElementById('messageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || (!currentChatContact && !currentGroup)) return;

  clearTimeout(typingTimeout);

  const timestamp = new Date().toISOString();
  const bubble = appendMessage(text, 'sent', false, timestamp);
  input.value = '';

  if (currentGroup) {
    socket.emit('groupStopTyping', { groupId: currentGroup.groupId, from: me.uniqueId });
    groupInboxSummary[currentGroup.groupId] = { groupId: currentGroup.groupId, name: currentGroup.name, lastMessage: text, lastTimestamp: timestamp, unreadCount: 0 };
    try {
      const res = await fetch('/api/messages/group/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: currentGroup.groupId, text })
      });
      const saved = await res.json();
      if (saved._id) {
        bubble.dataset.id = saved._id;
        socket.emit('sendGroupMessage', { senderId: me.uniqueId, groupId: currentGroup.groupId, text, timestamp, messageId: saved._id });
      }
    } catch (err) {
      console.error('Failed to save group message', err);
    }
  } else {
    socket.emit('stopTyping', { to: currentChatContact.id, from: me.uniqueId });
    inboxSummary[currentChatContact.id] = { otherId: currentChatContact.id, lastMessage: text, lastTimestamp: timestamp, unreadCount: 0 };
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiverId: currentChatContact.id, text })
      });
      const saved = await res.json();
      if (saved._id) {
        bubble.dataset.id = saved._id;
        socket.emit('sendMessage', { senderId: me.uniqueId, receiverId: currentChatContact.id, text, timestamp, messageId: saved._id });
      }
    } catch (err) {
      console.error('Failed to save message', err);
    }
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('kifaru_token');
  localStorage.removeItem('kifaru_user');
  window.location.href = 'index.html';
});

document.getElementById('statusBtn').addEventListener('click', () => {
  window.location.href = 'status.html';
});


// ---- Call buttons ----
document.getElementById('voiceCallBtn').addEventListener('click', () => {
  if (!currentChatContact) return;
  startCall(currentChatContact.id, currentChatContact.name || currentChatContact.id, 'voice');
});

document.getElementById('videoCallBtn').addEventListener('click', () => {
  if (!currentChatContact) return;
  startCall(currentChatContact.id, currentChatContact.name || currentChatContact.id, 'video');
});

// ============================================================
// ---- FEATURE: REPLY / STAR / COPY / EMOJI PICKER ----
// ============================================================

// ---- Reply preview bar ----
function showReplyPreview(messageId, senderName, text) {
  replyTarget = { messageId, senderName, text: text || 'Attachment' };
  document.getElementById('replyPreviewSender').textContent = senderName;
  document.getElementById('replyPreviewText').textContent = replyTarget.text;
  document.getElementById('replyPreviewBar').classList.remove('hidden');
  document.getElementById('messageInput').focus();
}

function clearReplyPreview() {
  replyTarget = null;
  document.getElementById('replyPreviewBar').classList.add('hidden');
}

document.getElementById('replyPreviewClose').addEventListener('click', clearReplyPreview);

// ---- Reply action ----
document.getElementById('replyMessageBtn').addEventListener('click', () => {
  if (!actionTarget) return;
  const bubble = document.querySelector(`.message-bubble[data-id="${actionTarget.id}"]`);
  const senderEl = bubble?.querySelector('.message-sender-name');
  const senderName = bubble?.classList.contains('sent')
    ? 'You'
    : (senderEl?.textContent || (currentChatContact?.name || currentChatContact?.id || 'Message'));
  messageActionSheet.classList.remove('active');
  showReplyPreview(actionTarget.id, senderName, actionTarget.text);
  actionTarget = null;
});

// ---- Star action ----
document.getElementById('starMessageBtn').addEventListener('click', async () => {
  if (!actionTarget) return;
  const id = actionTarget.id;
  messageActionSheet.classList.remove('active');
  actionTarget = null;
  try {
    const res = await fetch(`/api/messages/${id}/star`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Failed to star.'); return; }
    const bubble = document.querySelector(`.message-bubble[data-id="${id}"]`);
    if (bubble) {
      bubble.dataset.starred = data.starred ? 'true' : 'false';
      bubble.classList.toggle('starred', data.starred);
    }
  } catch (err) {
    alert('Failed to star.');
  }
});

// ---- Copy action ----
document.getElementById('copyMessageBtn').addEventListener('click', async () => {
  if (!actionTarget || !actionTarget.text) return;
  const text = actionTarget.text;
  messageActionSheet.classList.remove('active');
  actionTarget = null;
  try {
    await navigator.clipboard.writeText(text);
    // subtle toast — reuse an existing element if needed
  } catch (err) {
    alert('Copy failed.');
  }
});

// ---- Emoji picker ----
const EMOJI_SET = [
  '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰',
  '😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥳','🤩','😏',
  '😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠',
  '😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
  '👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️',
  '🙏','🤝','👏','🙌','🤲','💪','🦾','🎉','🎊','🎈','🎁','🔥','⭐','🌟','✨','💯'
];

function buildEmojiPicker() {
  const el = document.getElementById('emojiPicker');
  el.innerHTML = '';
  EMOJI_SET.forEach(emoji => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = emoji;
    b.addEventListener('click', () => {
      const input = document.getElementById('messageInput');
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
      input.focus();
      input.selectionStart = input.selectionEnd = start + emoji.length;
    });
    el.appendChild(b);
  });
}
buildEmojiPicker();

document.getElementById('emojiBtn').addEventListener('click', () => {
  document.getElementById('emojiPicker').classList.toggle('hidden');
});

// ---- Override messageForm submit to include replyTo ----
document.getElementById('messageForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || (!currentChatContact && !currentGroup)) return;

  clearTimeout(typingTimeout);
  document.getElementById('emojiPicker').classList.add('hidden');

  const timestamp = new Date().toISOString();
  const replyPayload = replyTarget ? { ...replyTarget } : undefined;
  const bubble = appendMessage(text, 'sent', false, timestamp, null, false, null, null, null, null, replyPayload);
  input.value = '';
  clearReplyPreview();

  if (currentGroup) {
    socket.emit('groupStopTyping', { groupId: currentGroup.groupId, from: me.uniqueId });
    groupInboxSummary[currentGroup.groupId] = { groupId: currentGroup.groupId, name: currentGroup.name, lastMessage: text, lastTimestamp: timestamp, unreadCount: 0 };
    try {
      const res = await fetch('/api/messages/group/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ groupId: currentGroup.groupId, text, replyTo: replyPayload })
      });
      const saved = await res.json();
      if (saved._id) {
        bubble.dataset.id = saved._id;
        socket.emit('sendGroupMessage', { senderId: me.uniqueId, groupId: currentGroup.groupId, text, timestamp, messageId: saved._id, replyTo: replyPayload });
      }
    } catch (err) {
      console.error('Failed to save group message', err);
    }
  } else {
    socket.emit('stopTyping', { to: currentChatContact.id, from: me.uniqueId });
    inboxSummary[currentChatContact.id] = { otherId: currentChatContact.id, lastMessage: text, lastTimestamp: timestamp, unreadCount: 0 };
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiverId: currentChatContact.id, text, replyTo: replyPayload })
      });
      const saved = await res.json();
      if (saved._id) {
        bubble.dataset.id = saved._id;
        socket.emit('sendMessage', { senderId: me.uniqueId, receiverId: currentChatContact.id, text, timestamp, messageId: saved._id, replyTo: replyPayload });
      }
    } catch (err) {
      console.error('Failed to save message', err);
    }
  }
}, true);  // capture-phase: run AFTER the original listener registered in the file

console.log('[FEATURES] reply/star/copy/emoji loaded');

// ---- Auto-start call if arriving from Calls page ----
(function checkAutoStartCall() {
  const pending = sessionStorage.getItem('kifaru_autostart_call');
  if (!pending) return;
  sessionStorage.removeItem('kifaru_autostart_call');
  try {
    const { id, name, type } = JSON.parse(pending);
    // Wait for the chat to open first
    setTimeout(() => {
      if (typeof startCall === 'function') {
        startCall(id, name, type);
      }
    }, 800);
  } catch (err) {
    console.warn('[CALL] autostart failed:', err);
  }
})();
