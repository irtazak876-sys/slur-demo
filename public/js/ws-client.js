/**
 * WS Client — Handles real-time connection to the Pulse Server
 */
class WSClient {
  constructor(url) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url || `${protocol}//${window.location.host}`;
    this.socket = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.listeners = new Map();
    this.status = 'disconnected';
    
    this.connect();
  }

  connect() {
    this.status = 'connecting';
    this.emit('status_change', { status: 'connecting' });
    
    // Check if we should use polling (e.g. on Vercel)
    if (window.location.hostname.includes('vercel.app')) {
      console.log('[ws] Vercel detected, using polling fallback');
      this.startPolling();
      return;
    }

    try {
      this.socket = new WebSocket(this.url);
      
      this.socket.onopen = () => {
        this.status = 'connected';
        this.reconnectAttempts = 0;
        console.log('[ws] Connected to server');
        this.emit('status_change', { status: 'connected' });
        this.startHeartbeat();
      };
      
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.emit(data.type, data);
        } catch (e) {
          console.error('[ws] Failed to parse message:', e);
        }
      };
      
      this.socket.onclose = () => {
        this.status = 'disconnected';
        this.emit('status_change', { status: 'disconnected' });
        this.stopHeartbeat();
        this.reconnect();
      };
      
      this.socket.onerror = (err) => {
        console.error('[ws] Socket error:', err);
        this.socket.close();
      };
    } catch (e) {
      console.error('[ws] Connection failed:', e);
      this.reconnect();
    }
  }

  startPolling() {
    this.status = 'connected'; // Show as connected for the demo
    this.emit('status_change', { status: 'connected' });
    
    this.pollingInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/notifications?limit=50');
        const data = await res.json();
        
        // Emit a snapshot update
        this.emit('snapshot', {
          type: 'snapshot',
          notifications: data.notifications,
          stats: data.stats,
          timestamp: Date.now()
        });
      } catch (e) {
        console.error('[poll] Failed to fetch updates:', e);
      }
    }, 3000); // Poll every 3 seconds
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      console.log(`[ws] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
      this.status = 'reconnecting';
      this.emit('status_change', { status: 'reconnecting', delay, attempt: this.reconnectAttempts });
      
      setTimeout(() => this.connect(), delay);
    } else {
      console.log('[ws] Falling back to polling...');
      this.startPolling();
    }
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => cb(data));
    }
  }
}

// Global instance
window._ws = new WSClient();
