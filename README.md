# ConnectLive

A real-time video meeting and collaboration MVP built with Node.js, Express, Socket.IO and WebRTC.

## Features
- User registration and login (bcrypt password hashing; local JSON user store)
- Create and join meeting rooms
- WebRTC peer-to-peer audio/video and screen sharing
- Socket.IO room signaling, chat and collaborative drawing
- File upload and room notification (10 MB limit)

## Run locally
1. Install Node.js LTS.
2. Open this folder in VS Code.
3. In PowerShell run:
   ```powershell
   npm.cmd install
   npm.cmd start
   ```
4. Open http://localhost:3000
5. Register two accounts in separate browsers/profiles to test a meeting.

## Important limitations / production checklist
This is an educational MVP, not a production-hardened conferencing service.
- WebRTC media uses DTLS-SRTP encryption in supported browsers; use HTTPS in deployment.
- A public STUN server is configured for basic connectivity. Add a TURN server for restrictive NAT/firewall environments.
- The session store is Express MemoryStore and user records are a local JSON file; replace with a persistent database and production session store.
- Configure a strong SESSION_SECRET, secure HTTPS cookies, rate limiting, CSRF protection, upload malware scanning and authenticated room-scoped file downloads before public deployment.
- Peer-to-peer mesh video is suitable only for small rooms; use an SFU for larger meetings.
- Test camera, microphone, screen share and cross-network calls on supported browsers.
