require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const User = require('./models/User');
const resetPasswordRoutes = require('./routes/resetPassword');
const searchRoutes = require('./routes/search');
const statusRoutes = require('./routes/status');
const blockRoutes = require('./routes/block');
const reactionRoutes = require('./routes/reactions');
const callRoutes = require('./routes/calls');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('io', io);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/status', statusRoutes);
app.use('/api/block', blockRoutes);
app.use('/api/reactions', reactionRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/auth/reset', resetPasswordRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

const onlineUsers = new Map();
const socketToUser = new Map();

io.on('connection', (socket) => {
  console.log('🔌 A user connected:', socket.id);

  socket.on('join', (uniqueId) => {
    socket.join(uniqueId);
    onlineUsers.set(uniqueId, socket.id);
    socketToUser.set(socket.id, uniqueId);
    io.emit('onlineList', Array.from(onlineUsers.keys()));
  });

  socket.on('sendMessage', (data) => {
    io.to(data.receiverId).emit('receiveMessage', data);
  });

  socket.on('joinGroup', (groupId) => {
    socket.join(groupId);
  });

socket.on('sendGroupMessage', (data) => {
    socket.to(data.groupId).emit('receiveGroupMessage', data);
});

  socket.on('groupTyping', ({ groupId, from }) => {
    io.to(groupId).emit('groupTyping', { from });
  });

  socket.on('groupStopTyping', ({ groupId, from }) => {
    io.to(groupId).emit('groupStopTyping', { from });
  });

  socket.on('typing', ({ to, from }) => {
    io.to(to).emit('typing', { from });
  });

  socket.on('stopTyping', ({ to, from }) => {
    io.to(to).emit('stopTyping', { from });
  });

  socket.on('messagesSeen', ({ by, to }) => {
    io.to(to).emit('messagesSeen', { by });
  });

  // ---- WebRTC Call Signaling ----
  socket.on('callUser', ({ to, fromName, callType, offer }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    const targetSocketId = onlineUsers.get(to);
    if (!targetSocketId) {
      socket.emit('callFailed', { reason: 'User is offline' });
      return;
    }
    io.to(to).emit('incomingCall', { from, fromName, callType, offer });
  });

  socket.on('answerCall', ({ to, answer }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    io.to(to).emit('callAnswered', { from, answer });
  });

  socket.on('iceCandidate', ({ to, candidate }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    io.to(to).emit('iceCandidate', { from, candidate });
  });

  socket.on('rejectCall', ({ to }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    io.to(to).emit('callRejected', { from });
  });

  socket.on('endCall', ({ to }) => {
    const from = socketToUser.get(socket.id);
    if (!from) return;
    io.to(to).emit('callEnded', { from });
  });

  socket.on('disconnect', () => {
    const uniqueId = socketToUser.get(socket.id);
    if (uniqueId) {
      onlineUsers.delete(uniqueId);
      socketToUser.delete(socket.id);
      io.emit('onlineList', Array.from(onlineUsers.keys()));
      User.findOneAndUpdate({ uniqueId }, { lastSeen: new Date() }).catch(err => console.error(err));
    }
    console.log('🔌 A user disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🦏 Kifaru Fast Link server running on port ${PORT}`);
});
