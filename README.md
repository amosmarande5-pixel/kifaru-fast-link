# 🦏 Kifaru Fast Link

A modern, full-featured real-time messaging platform with text, media, status updates, and peer-to-peer voice/video calling — built with Node.js, Express, Socket.io, and WebRTC.

## ✨ Features

### Messaging
- 1-on-1 real-time chat via Socket.io
- Group chats with member management
- Text, image, audio (voice notes), and video messages
- Reply / quote, star, copy, edit, delete
- Emoji reactions and emoji picker
- In-conversation search
- Typing indicators, read receipts
- Online / last-seen status

### Calling
- Voice and video calls (WebRTC, peer-to-peer)
- Ringtone + vibration on incoming call
- Mute / camera toggle during call
- Call duration timer
- Call history page with call-back buttons

### Status (Stories)
- Text or image status, 24-hour expiry
- View who's seen your status
- Reply to status as a direct message

### Users
- Unique ID login (KFL-XXXXXXX)
- Profile picture upload and avatar colors
- Password reset via email
- Block / unblock users
- Premium tier (badge, larger uploads, bigger groups)

## 🛠 Tech Stack

- **Backend:** Node.js, Express 5
- **Database:** MongoDB (Mongoose 9)
- **Real-time:** Socket.io 4
- **Auth:** JWT, bcryptjs
- **File Uploads:** Multer
- **Email:** Nodemailer
- **Calling:** WebRTC
- **Frontend:** Vanilla HTML / CSS / JS

## 📁 Project Structure

    kifaru-fast-link/
    ├── middleware/    # JWT auth
    ├── models/        # Mongoose schemas
    ├── routes/        # API endpoints
    ├── public/        # Frontend (HTML/CSS/JS)
    ├── server.js      # Express + Socket.io entry
    └── .env           # Secrets (gitignored)

## 🚀 Setup

    git clone https://github.com/amosmarande5-pixel/kifaru-fast-link.git
    cd kifaru-fast-link
    npm install
    # Create .env with MONGO_URI, JWT_SECRET, EMAIL_USER, EMAIL_PASS, PORT
    node server.js

Then open http://localhost:3000

## 🧪 Testing Calls Across Devices

WebRTC requires HTTPS (except localhost). For testing:
- Same device: use Chrome + Firefox on localhost
- Across devices: run `cloudflared tunnel --url http://localhost:3000`

## 🗺 Roadmap

- [x] Messaging, groups, status
- [x] Voice + video calling, call history
- [x] Reply, star, copy, emoji picker
- [ ] Pinned chats, forward, archive
- [ ] Starred messages page
- [ ] Disappearing messages
- [ ] Group video calls
- [ ] End-to-end encryption

## 👤 Author

**Amos Marande** — [@amosmarande5-pixel](https://github.com/amosmarande5-pixel)

---

*Built with 🦏 by Kifaru Fast Link.*
