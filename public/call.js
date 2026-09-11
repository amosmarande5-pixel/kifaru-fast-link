// ---- WebRTC Call Manager ----
// Depends on: dashboard.js (for `me`, `socket`, `initials`)

let pc = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;
let callTimerInterval = null;
let callSeconds = 0;
let isMuted = false;
let isCameraOff = false;
let pendingCandidates = [];
let disconnectTimer = null;
let callState = 'idle';
let callAnswered = false;
let callLogged = false;
let ringTimeout = null; // idle | calling | ringing | connecting | connected | ending

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};


// ---- Ringtone + vibration ----
let ringtoneAudioCtx = null;
let ringtoneInterval = null;
let vibrationInterval = null;

function startRinging() {
  try {
    if (!ringtoneAudioCtx) {
      ringtoneAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const playBeep = () => {
      if (!ringtoneAudioCtx) return;
      const now = ringtoneAudioCtx.currentTime;
      const osc = ringtoneAudioCtx.createOscillator();
      const gain = ringtoneAudioCtx.createGain();
      osc.connect(gain);
      gain.connect(ringtoneAudioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(660, now + 0.2);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    };
    playBeep();
    ringtoneInterval = setInterval(playBeep, 1500);
  } catch (err) {
    console.warn('[RING] audio failed:', err);
  }

  try {
    if (navigator.vibrate) {
      const pattern = [400, 200, 400, 200, 400];
      navigator.vibrate(pattern);
      vibrationInterval = setInterval(() => navigator.vibrate(pattern), 2000);
    }
  } catch (err) {
    console.warn('[RING] vibration failed:', err);
  }
}

function stopRinging() {
  if (ringtoneInterval) { clearInterval(ringtoneInterval); ringtoneInterval = null; }
  if (vibrationInterval) { clearInterval(vibrationInterval); vibrationInterval = null; }
  try { if (navigator.vibrate) navigator.vibrate(0); } catch (e) {}
}

// ---- Call logging helper (guarded — only logs once per call) ----
async function logCall(receiverId, callType, status, duration) {
  try {
    await fetch('/api/calls/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receiverId, callType, status, duration: Math.floor(duration || 0) })
    });
    console.log('[CALL] logged:', status, 'duration:', duration);
  } catch (err) {
    console.warn('[CALL] log failed:', err);
  }
}

function logCallOnce(receiverId, callType, status, duration) {
  if (callLogged) return;
  callLogged = true;
  logCall(receiverId, callType, status, duration);
}

// ---- UI helpers ----
function showCallOverlay() { document.getElementById('callOverlay').classList.remove('hidden'); }
function hideCallOverlay() { document.getElementById('callOverlay').classList.add('hidden'); }
function showIncoming() { document.getElementById('incomingCallOverlay').classList.remove('hidden'); }
function hideIncoming() { document.getElementById('incomingCallOverlay').classList.add('hidden'); }

function updateCallStatus(text, connected) {
  const el = document.getElementById('callStatusText');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('connected', !!connected);
  console.log('[CALL] status:', text, connected ? '(connected)' : '');
}

function startCallTimer() {
  if (callTimerInterval) return;
  callSeconds = 0;
  document.getElementById('callTimerEl').classList.remove('hidden');
  document.getElementById('callTimerEl').textContent = '00:00';
  callTimerInterval = setInterval(() => {
    callSeconds++;
    const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
    const s = String(callSeconds % 60).padStart(2, '0');
    document.getElementById('callTimerEl').textContent = `${m}:${s}`;
  }, 1000);
}
function stopCallTimer() {
  if (callTimerInterval) clearInterval(callTimerInterval);
  callTimerInterval = null;
  const el = document.getElementById('callTimerEl');
  if (el) el.classList.add('hidden');
}

// ---- Media ----
async function getLocalMedia(callType) {
  const constraints = callType === 'video'
    ? { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }
    : { video: false, audio: true };
  return await navigator.mediaDevices.getUserMedia(constraints);
}

// ---- Peer connection ----
function createPeerConnection(peerId) {
  const conn = new RTCPeerConnection(ICE_SERVERS);

  conn.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('iceCandidate', { to: peerId, candidate: e.candidate });
    }
  };

  conn.onicecandidateerror = (e) => {
    console.warn('[ICE] candidate error:', e.errorCode, e.errorText, e.url);
  };

  conn.ontrack = (e) => {
    console.log('[CALL] remote track:', e.track.kind);
    if (!remoteStream) remoteStream = new MediaStream();
    remoteStream.addTrack(e.track);
    const rv = document.getElementById('remoteVideo');
    rv.srcObject = remoteStream;
    document.getElementById('remoteVideoPlaceholder').classList.add('hidden');
    // Try to play (some mobile browsers need explicit play call)
    rv.play().catch(err => console.warn('[CALL] autoplay blocked:', err));
  };

  conn.oniceconnectionstatechange = () => {
    console.log('[ICE] state:', conn.iceConnectionState);
    handleIceState(conn.iceConnectionState);
  };

  conn.onconnectionstatechange = () => {
    console.log('[CONN] state:', conn.connectionState);
    handleConnState(conn.connectionState);
  };

  conn.onsignalingstatechange = () => {
    console.log('[SIG] state:', conn.signalingState);
  };

  return conn;
}

function handleIceState(state) {
  if (state === 'connected' || state === 'completed') {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
    if (callState !== 'connected') {
      callState = 'connected';
      callAnswered = true;
      updateCallStatus('Connected', true);
      startCallTimer();
    }
  } else if (state === 'disconnected') {
    // TRANSIENT — do NOT tear down. Wait to see if it recovers.
    updateCallStatus('Reconnecting...');
    clearTimeout(disconnectTimer);
    disconnectTimer = setTimeout(() => {
      if (callState !== 'connected' || (pc && pc.iceConnectionState === 'disconnected')) {
        console.warn('[CALL] still disconnected after grace period, ending');
        updateCallStatus('Connection lost');
        setTimeout(() => cleanupCall(), 1000);
      }
    }, 12000); // 12 seconds grace
  } else if (state === 'failed') {
    console.error('[CALL] ICE failed');
    updateCallStatus('Connection failed');
    setTimeout(() => cleanupCall(), 1200);
  } else if (state === 'closed') {
    cleanupCall();
  }
}

function handleConnState(state) {
  if (state === 'connected') {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
    if (callState !== 'connected') {
      callState = 'connected';
      callAnswered = true;
      updateCallStatus('Connected', true);
      startCallTimer();
    }
  } else if (state === 'disconnected') {
    // Also transient at connection-state level — don't kill
    updateCallStatus('Reconnecting...');
  } else if (state === 'failed') {
    updateCallStatus('Connection failed');
    setTimeout(() => cleanupCall(), 1200);
  }
  // 'closed' handled by cleanupCall itself
}

// ---- Outgoing ----
async function startCall(peerId, peerName, callType) {
  if (currentCall) {
    alert('You are already in a call.');
    return;
  }

  currentCall = { peerId, peerName, type: callType, direction: 'outgoing' };
  callState = 'calling';

  document.getElementById('callRemoteName').textContent = peerName;
  document.getElementById('callRemoteAvatar').textContent = initials(peerName, peerId);
  updateCallStatus('Calling...');
  document.getElementById('localVideoWrap').classList.toggle('hidden', callType !== 'video');
  document.getElementById('toggleCameraBtn').classList.toggle('hidden', callType !== 'video');
  showCallOverlay();

  try {
    localStream = await getLocalMedia(callType);
    if (callType === 'video') {
      document.getElementById('localVideo').srcObject = localStream;
    }

    pc = createPeerConnection(peerId);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit('callUser', { to: peerId, fromName: me.fullName, callType, offer });
    console.log('[CALL] offer sent');

    // Auto-cancel after 30s if nobody picks up
    ringTimeout = setTimeout(() => {
      if (callState === 'calling' && currentCall && currentCall.direction === 'outgoing') {
        console.log('[CALL] ring timeout — no answer');
        socket.emit('endCall', { to: currentCall.peerId });
        logCallOnce(currentCall.peerId, currentCall.type, 'missed', 0);
        updateCallStatus('No answer');
        setTimeout(() => cleanupCall(), 800);
      }
    }, 30000);
  } catch (err) {
    console.error('[CALL] startCall error:', err);
    alert('Could not access camera/microphone: ' + err.message);
    cleanupCall();
  }
}

// ---- Incoming ----
socket.on('incomingCall', ({ from, fromName, callType, offer }) => {
  if (currentCall) {
    socket.emit('rejectCall', { to: from });
    return;
  }
  currentCall = { peerId: from, peerName: fromName, type: callType, direction: 'incoming', offer };
  callState = 'ringing';
  document.getElementById('incomingAvatar').textContent = initials(fromName, from);
  document.getElementById('incomingName').textContent = fromName;
  document.getElementById('incomingCallType').textContent =
    callType === 'video' ? 'Incoming video call' : 'Incoming voice call';
  showIncoming();
  startRinging();
});

async function acceptCall() {
  if (!currentCall || currentCall.direction !== 'incoming') return;
  stopRinging();
  hideIncoming();
  callState = 'connecting';

  try {
    localStream = await getLocalMedia(currentCall.type);
    if (currentCall.type === 'video') {
      document.getElementById('localVideo').srcObject = localStream;
    }

    pc = createPeerConnection(currentCall.peerId);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    await pc.setRemoteDescription(new RTCSessionDescription(currentCall.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('answerCall', { to: currentCall.peerId, answer });

    document.getElementById('callRemoteName').textContent = currentCall.peerName;
    document.getElementById('callRemoteAvatar').textContent = initials(currentCall.peerName, currentCall.peerId);
    document.getElementById('localVideoWrap').classList.toggle('hidden', currentCall.type !== 'video');
    document.getElementById('toggleCameraBtn').classList.toggle('hidden', currentCall.type !== 'video');
    updateCallStatus('Connecting...');
    showCallOverlay();

    for (const c of pendingCandidates) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e){ console.warn(e); }
    }
    pendingCandidates = [];
  } catch (err) {
    console.error('[CALL] acceptCall error:', err);
    alert('Could not accept call: ' + err.message);
    rejectCall();
  }
}

function rejectCall() {
  stopRinging();
  if (currentCall) socket.emit('rejectCall', { to: currentCall.peerId });
  hideIncoming();
  cleanupCall();
}

// ---- Signaling responses ----
socket.on('callAnswered', async ({ from, answer }) => {
  if (!currentCall || currentCall.peerId !== from) return;
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    updateCallStatus('Connecting...');
    for (const c of pendingCandidates) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch(e){ console.warn(e); }
    }
    pendingCandidates = [];
    console.log('[CALL] answer set');
  } catch (err) { console.error('[CALL] callAnswered error:', err); }
});

socket.on('iceCandidate', async ({ from, candidate }) => {
  if (!currentCall || currentCall.peerId !== from) return;
  try {
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      pendingCandidates.push(candidate);
    }
  } catch (err) { console.error('[ICE] add error:', err); }
});

socket.on('callRejected', ({ from }) => {
  if (!currentCall || currentCall.peerId !== from) return;
  if (currentCall.direction === 'outgoing') {
    logCallOnce(currentCall.peerId, currentCall.type, 'rejected', 0);
  }
  updateCallStatus('Call rejected');
  setTimeout(() => cleanupCall(), 1200);
});

socket.on('callEnded', ({ from }) => {
  if (!currentCall || currentCall.peerId !== from) return;
  updateCallStatus('Call ended');
  setTimeout(() => cleanupCall(), 800);
});

socket.on('callFailed', ({ reason }) => {
  if (currentCall && currentCall.direction === 'outgoing') {
    logCallOnce(currentCall.peerId, currentCall.type, 'failed', 0);
  }
  updateCallStatus(reason || 'Call failed');
  setTimeout(() => cleanupCall(), 1500);
});

function endCall() {
  if (currentCall) {
    socket.emit('endCall', { to: currentCall.peerId });
    if (currentCall.direction === 'outgoing') {
      const status = callAnswered ? 'answered' : 'cancelled';
      const dur = callAnswered ? callSeconds : 0;
      logCallOnce(currentCall.peerId, currentCall.type, status, dur);
    }
  }
  updateCallStatus('Call ended');
  setTimeout(() => cleanupCall(), 300);
}

// ---- Cleanup ----
function cleanupCall() {
  stopRinging();

  // Fallback: if this was an outgoing call and nothing logged it, log it now
  if (currentCall && currentCall.direction === 'outgoing' && !callLogged) {
    const status = callAnswered ? 'answered' : 'cancelled';
    const dur = callAnswered ? callSeconds : 0;
    logCallOnce(currentCall.peerId, currentCall.type, status, dur);
  }

  clearTimeout(disconnectTimer);
  clearTimeout(ringTimeout);
  disconnectTimer = null;
  ringTimeout = null;
  if (pc) { try { pc.close(); } catch(e){} pc = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  remoteStream = null;
  currentCall = null;
  callState = 'idle';
  callAnswered = false;
  callLogged = false;
  pendingCandidates = [];
  isMuted = false;
  isCameraOff = false;
  const rv = document.getElementById('remoteVideo');
  const lv = document.getElementById('localVideo');
  if (rv) rv.srcObject = null;
  if (lv) lv.srcObject = null;
  document.getElementById('remoteVideoPlaceholder').classList.remove('hidden');
  document.getElementById('toggleMuteBtn').classList.remove('active');
  document.getElementById('toggleCameraBtn').classList.remove('active');
  stopCallTimer();
  hideCallOverlay();
  hideIncoming();
  console.log('[CALL] cleaned up');
}

// ---- Controls ----
document.getElementById('endCallBtn').addEventListener('click', endCall);
document.getElementById('rejectCallBtn').addEventListener('click', rejectCall);
document.getElementById('acceptCallBtn').addEventListener('click', acceptCall);

document.getElementById('toggleMuteBtn').addEventListener('click', () => {
  if (!localStream) return;
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
  document.getElementById('toggleMuteBtn').classList.toggle('active', isMuted);
});

document.getElementById('toggleCameraBtn').addEventListener('click', () => {
  if (!localStream) return;
  const vt = localStream.getVideoTracks();
  if (vt.length === 0) return;
  isCameraOff = !isCameraOff;
  vt.forEach(t => t.enabled = !isCameraOff);
  document.getElementById('toggleCameraBtn').classList.toggle('active', isCameraOff);
});
