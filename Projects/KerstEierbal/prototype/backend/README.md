Backend demo server
===================

This small Express server serves the static frontend (project root) and provides a tiny API to persist demo orders to `backend/orders.json`.

Quick start (Windows PowerShell):

```powershell
cd backend
npm install
npm start
# open http://localhost:3000/checkout.html
```

Notes:
- The server serves the repo root so you can open `/checkout.html` and `/adminpanel.html` via the local server.
- Orders are written to `backend/orders.json`.
- This is a demo helper. Do NOT use in production (no auth, no input sanitization, no concurrency locking).
