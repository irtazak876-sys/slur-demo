/**
 * PULSE — Real-Time Notification Server
 * Express HTTP API + WebSocket broadcast server
 */

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');

// ── CONFIG ──────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT || 4000;
const DATA_DIR    = path.join(__dirname, 'data');
const NOTIF_FILE  = path.join(DATA_DIR, 'notifications.json');
const MAX_STORED  = 500;   // max notifications kept in memory & on disk

// ── SETUP ────────────────────────────────────────────────────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── STATE ─────────────────────────────────────────────────────────────────────
let notifications = loadNotifications();
let stats = {
  delivered: notifications.length,
  failed: 0,
  connectedClients: 0
};

// ── PERSISTENCE ───────────────────────────────────────────────────────────────
function loadNotifications() {
  try {
    if (fs.existsSync(NOTIF_FILE)) {
      return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[store] Failed to load notifications:', e.message);
  }
  return [];
}

function saveNotifications() {
  try {
    fs.writeFileSync(NOTIF_FILE, JSON.stringify(notifications, null, 2));
  } catch (e) {
    console.error('[store] Failed to save notifications:', e.message);
  }
}

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const clientId = uuidv4().slice(0, 8);
  ws.clientId = clientId;
  stats.connectedClients = wss.clients.size;

  console.log(`[ws] Client ${clientId} connected | total: ${wss.clients.size}`);

  // Send current snapshot to newly connected client
  ws.send(JSON.stringify({
    type: 'snapshot',
    notifications,
    stats,
    timestamp: Date.now()
  }));

  // Broadcast updated client count to all
  broadcast({ type: 'stats_update', stats: { ...stats, connectedClients: wss.clients.size } });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    stats.connectedClients = wss.clients.size;
    console.log(`[ws] Client ${clientId} disconnected | total: ${wss.clients.size}`);
    broadcast({ type: 'stats_update', stats: { ...stats, connectedClients: wss.clients.size } });
  });

  ws.on('error', (err) => {
    console.error(`[ws] Client ${clientId} error:`, err.message);
  });
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// ── API ROUTES ────────────────────────────────────────────────────────────────

/**
 * POST /api/emit
 * Body: { type, event, title, message, priority?, meta? }
 * Emits a new notification and broadcasts to all WS clients
 */
app.post('/api/emit', (req, res) => {
  const { type, event, title, message, priority = 'normal', meta = {} } = req.body;

  if (!type || !event || !title || !message) {
    return res.status(400).json({ error: 'Missing required fields: type, event, title, message' });
  }

  const validTypes = ['ok', 'info', 'warn', 'danger'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` });
  }

  const notif = {
    id:        uuidv4(),
    type,
    event,
    title,
    message,
    priority,
    meta,
    read:      false,
    timestamp: Date.now(),
    createdAt: new Date().toISOString()
  };

  notifications.unshift(notif);
  if (notifications.length > MAX_STORED) notifications = notifications.slice(0, MAX_STORED);
  stats.delivered++;

  saveNotifications();

  // Broadcast new notification to all connected WS clients
  broadcast({
    type:      'new_notification',
    notif,
    stats:     { ...stats, connectedClients: wss.clients.size },
    timestamp: Date.now()
  });

  console.log(`[emit] ${type.toUpperCase()} | ${event} | "${title}"`);

  res.status(201).json({ ok: true, notif });
});

/**
 * GET /api/notifications
 * Query: ?limit=50&type=all&unread=false
 */
app.get('/api/notifications', (req, res) => {
  let result = [...notifications];
  const { type, unread, limit = 100 } = req.query;

  if (type && type !== 'all') result = result.filter(n => n.type === type);
  if (unread === 'true')       result = result.filter(n => !n.read);

  res.json({
    notifications: result.slice(0, Number(limit)),
    total:  notifications.length,
    unread: notifications.filter(n => !n.read).length,
    stats:  { ...stats, connectedClients: wss.clients.size }
  });
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */
app.patch('/api/notifications/:id/read', (req, res) => {
  const n = notifications.find(x => x.id === req.params.id);
  if (!n) return res.status(404).json({ error: 'Notification not found' });

  n.read = true;
  saveNotifications();

  broadcast({ type: 'notification_read', id: n.id });
  res.json({ ok: true, notif: n });
});

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 */
app.patch('/api/notifications/read-all', (req, res) => {
  notifications.forEach(n => { n.read = true; });
  saveNotifications();
  broadcast({ type: 'all_read' });
  res.json({ ok: true, count: notifications.length });
});

/**
 * DELETE /api/notifications/:id
 * Delete a single notification
 */
app.delete('/api/notifications/:id', (req, res) => {
  const idx = notifications.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Notification not found' });

  notifications.splice(idx, 1);
  saveNotifications();

  broadcast({ type: 'notification_deleted', id: req.params.id });
  res.json({ ok: true });
});

/**
 * DELETE /api/notifications
 * Clear all notifications
 */
app.delete('/api/notifications', (req, res) => {
  notifications = [];
  saveNotifications();
  broadcast({ type: 'all_cleared' });
  res.json({ ok: true });
});

/**
 * GET /api/stats
 */
app.get('/api/stats', (req, res) => {
  const byType = { ok: 0, info: 0, warn: 0, danger: 0 };
  notifications.forEach(n => { if (byType[n.type] !== undefined) byType[n.type]++; });

  res.json({
    total:            notifications.length,
    unread:           notifications.filter(n => !n.read).length,
    delivered:        stats.delivered,
    failed:           stats.failed,
    connectedClients: wss.clients.size,
    byType,
    uptime:           process.uptime()
  });
});

// ── START ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ██████╗ ██╗   ██╗██╗     ███████╗███████╗');
  console.log('  ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝');
  console.log('  ██████╔╝██║   ██║██║     ███████╗█████╗  ');
  console.log('  ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝  ');
  console.log('  ██║     ╚██████╔╝███████╗███████║███████╗');
  console.log('  ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝');
  console.log('');
  console.log(`  HTTP  → http://localhost:${PORT}`);
  console.log(`  WS    → ws://localhost:${PORT}`);
  console.log(`  API   → http://localhost:${PORT}/api`);
  console.log('');
});
