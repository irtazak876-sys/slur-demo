/**
 * Main Application — Orchestrates the SLUR Instant Alert Hub
 */
class PulseApp {
  constructor() {
    this.notifications = [];
    this.soundOn = true;
    this.currentScreen = 'inbox';
    this.ws = window._ws;
    
    // Modules
    this.analytics = new AnalyticsManager(this);
    this.feed = new FeedManager(this);
    
    window._app = this;
    window._feed = this.feed;
    window._analytics = this.analytics;

    this.init();
  }

  async init() {
    this.bindEvents();
    this.setupWS();
    await this.fetchInitialData();
    
    // Initial UI state
    document.body.style.opacity = '1';
    this.log('ok', 'SLUR Active', 'Secure signal uplink established.');
  }

  bindEvents() {
    // Bottom Nav Switching
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchScreen(btn.dataset.screen);
      });
    });

    // Producer buttons (Admin screen)
    document.querySelectorAll('.producer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.emitNotification({
          type: btn.dataset.type,
          event: btn.dataset.event,
          title: btn.dataset.title,
          message: this.getDefaultMessage(btn.dataset.event)
        });
      });
    });

    // Custom Dispatch (Admin screen)
    document.getElementById('btn-custom').addEventListener('click', () => {
      const title = prompt('Signal Title:', 'System Alert');
      if (!title) return;
      this.emitNotification({
        type: 'info',
        event: 'admin.broadcast',
        title: title,
        message: 'A priority signal has been broadcasted by the SLUR network administrator.'
      });
    });

    // Toolbar actions
    document.getElementById('soundToggleBtn').addEventListener('click', () => this.toggleSound());
    document.getElementById('btnClearLog').addEventListener('click', () => {
      document.getElementById('log-stream').innerHTML = '';
      this.log('info', 'Log Purged', 'Local audit log was cleared.');
    });

    // Settings actions
    document.getElementById('btn-hard-clear').addEventListener('click', () => this.clearAllNotifications());
    document.getElementById('btnReadAll').addEventListener('click', () => this.markAllAsRead());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        this.switchScreen('inbox');
        document.getElementById('searchInput').focus();
      }
    });
  }

  switchScreen(screenId) {
    this.currentScreen = screenId;
    
    // Update Screens
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.toggle('active', s.id === `screen-${screenId}`);
    });
    
    // Update Nav
    document.querySelectorAll('.nav-item').forEach(item => {
      const isActive = item.dataset.screen === screenId;
      item.classList.toggle('text-primary', isActive);
      item.classList.toggle('text-on-surface-variant', !isActive);
      
      const pill = item.querySelector('.bg-secondary-container');
      if (pill) {
        if (isActive) pill.classList.add('bg-secondary-container');
        else pill.classList.remove('bg-secondary-container');
      }
    });
  }

  setupWS() {
    this.ws.on('status_change', ({ status }) => {
      const indicator = document.getElementById('conn-indicator');
      const label = document.getElementById('conn-status');
      
      if (status === 'connected') {
        indicator.className = 'w-2 h-2 rounded-full bg-ok animate-pulse-custom';
        label.textContent = 'Online';
      } else {
        indicator.className = 'w-2 h-2 rounded-full bg-error';
        label.textContent = 'Offline';
      }
    });

    this.ws.on('snapshot', (data) => {
      this.notifications = data.notifications;
      this.feed.render();
      this.analytics.update(data.stats);
    });

    this.ws.on('new_notification', (data) => {
      this.notifications.unshift(data.notif);
      this.feed.render();
      this.analytics.update(data.stats);
      this.playSound(data.notif.type);
      this.showToast(data.notif);
      this.log(data.notif.type, data.notif.title, data.notif.event);
    });

    this.ws.on('notification_read', (data) => {
      const n = this.notifications.find(x => x.id === data.id);
      if (n) {
        n.read = true;
        this.feed.render();
      }
    });

    this.ws.on('notification_deleted', (data) => {
      this.notifications = this.notifications.filter(x => x.id !== data.id);
      this.feed.render();
    });

    this.ws.on('all_cleared', () => {
      this.notifications = [];
      this.feed.render();
      this.log('warn', 'Database Wiped', 'All signals were purged from server.');
    });
  }

  async fetchInitialData() {
    try {
      const res = await fetch('/api/notifications');
      const data = await res.json();
      this.notifications = data.notifications;
      this.feed.render();
      this.analytics.update(data.stats);
    } catch (e) {
      this.log('error', 'Fetch Error', 'Failed to retrieve signal history.');
    }
  }

  async emitNotification(payload) {
    try {
      await fetch('/api/emit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      this.log('error', 'Dispatch Failed', e.message);
    }
  }

  async markRead(id) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    } catch (e) {}
  }

  async markAllAsRead() {
    try {
      await fetch('/api/notifications/read-all', { method: 'PATCH' });
    } catch (e) {}
  }

  async deleteNotification(id) {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    } catch (e) {}
  }

  async clearAllNotifications() {
    if (!confirm('This will wipe the entire SLUR signal database. Proceed?')) return;
    try {
      await fetch('/api/notifications', { method: 'DELETE' });
    } catch (e) {}
  }

  getDefaultMessage(event) {
    const messages = {
      'order.shipped': 'Security clearance obtained. Package SL-882 is in motion.',
      'system.update': 'Patch SL-v4.2 applied. Integrity check 100% complete.',
      'auth.retry': 'Credential verification failed on Node 7. Access denied.',
      'security.breach': 'Perimeter breach detected in Sector 4. Level 2 lockdown active.'
    };
    return messages[event] || 'New encrypted signal received from external relay.';
  }

  toggleSound() {
    this.soundOn = !this.soundOn;
    const icon = document.getElementById('soundIcon');
    icon.textContent = this.soundOn ? 'notifications_active' : 'notifications_off';
    this.log('info', 'Acoustics', `Sound signals turned ${this.soundOn ? 'on' : 'off'}.`);
  }

  playSound(type) {
    if (!this.soundOn) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = type === 'danger' ? 220 : 440;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
  }

  log(type, title, msg) {
    const stream = document.getElementById('log-stream');
    if (!stream) return;
    
    const entry = document.createElement('div');
    entry.className = 'flex gap-md py-xs border-b border-surface-container-high last:border-0';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    entry.innerHTML = `
      <span class="text-label-md font-medium text-outline w-12 flex-shrink-0">${time}</span>
      <span class="text-label-md font-bold uppercase w-16 flex-shrink-0 ${this.getLogColor(type)}">${type}</span>
      <div class="flex-1 min-w-0">
        <p class="text-body-sm font-medium text-on-surface truncate">${title}</p>
        <p class="text-label-md text-on-surface-variant truncate">${msg}</p>
      </div>
    `;
    
    stream.prepend(entry);
    if (stream.children.length > 30) stream.removeChild(stream.lastChild);
  }

  getLogColor(type) {
    switch(type) {
      case 'ok': return 'text-secondary';
      case 'info': return 'text-primary';
      case 'warn': return 'text-tertiary';
      case 'danger': return 'text-error';
      default: return 'text-outline';
    }
  }

  showToast(n) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const config = this.feed.getCardConfig(n.type);
    
    toast.className = `
      pointer-events-auto bg-surface-container-lowest border border-outline-variant rounded-xl p-md soft-lift
      flex items-center gap-md transform transition-all duration-500 translate-y-[-20px] opacity-0
    `;
    
    toast.innerHTML = `
      <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${config.iconBg}">
        <span class="material-symbols-outlined text-[20px] ${config.iconColor}">${config.icon}</span>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-label-md font-bold text-on-surface truncate">${n.title}</p>
        <p class="text-body-sm text-on-surface-variant truncate">${n.message}</p>
      </div>
      <button class="text-outline hover:text-on-surface p-1" onclick="this.parentElement.remove()">
        <span class="material-symbols-outlined text-[18px]">close</span>
      </button>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-[-20px]', 'opacity-0');
    });

    // Remove after 5 seconds
    setTimeout(() => {
      toast.classList.add('translate-y-[-20px]', 'opacity-0');
      setTimeout(() => toast.remove(), 500);
    }, 5000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PulseApp();
});
