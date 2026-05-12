/**
 * Feed Manager — Handles rendering grouped notification cards in Stitch design system
 */
class FeedManager {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById('feed-container');
    this.filter = 'all';
    this.searchQuery = '';
    
    this.init();
  }

  init() {
    // Filter chips
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(b => {
          b.classList.remove('active', 'bg-primary-container', 'text-on-primary');
          b.classList.add('bg-surface-container-high', 'text-on-surface-variant');
        });
        btn.classList.add('active', 'bg-primary-container', 'text-on-primary');
        btn.classList.remove('bg-surface-container-high', 'text-on-surface-variant');
        this.filter = btn.dataset.filter;
        this.render();
      });
    });

    // Search
    document.getElementById('searchInput').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.render();
    });
  }

  render() {
    let notifications = this.app.notifications;

    // Apply filters
    if (this.filter === 'unread') {
      notifications = notifications.filter(n => !n.read);
    } else if (this.filter !== 'all') {
      notifications = notifications.filter(n => n.type === this.filter);
    }

    // Apply search
    if (this.searchQuery) {
      notifications = notifications.filter(n => 
        n.title.toLowerCase().includes(this.searchQuery) ||
        n.message.toLowerCase().includes(this.searchQuery)
      );
    }

    if (notifications.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Group by date
    const groups = this.groupByDate(notifications);
    this.container.innerHTML = Object.entries(groups).map(([date, items]) => `
      <div class="space-y-sm">
        <h3 class="text-label-xs font-bold text-outline uppercase tracking-widest px-xs">${date}</h3>
        <div class="space-y-sm">
          ${items.map(n => this.createCardHtml(n)).join('')}
        </div>
      </div>
    `).join('');
    
    this.updateTimeline(notifications);
  }

  groupByDate(notifications) {
    const groups = {};
    notifications.forEach(n => {
      const date = this.formatDateLabel(n.timestamp);
      if (!groups[date]) groups[date] = [];
      groups[date].push(n);
    });
    return groups;
  }

  formatDateLabel(ts) {
    const date = new Date(ts);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  createCardHtml(n) {
    const time = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const config = this.getCardConfig(n.type);
    const cardClass = n.read 
      ? 'opacity-80 bg-surface' 
      : 'soft-lift border-outline-variant';
    
    return `
      <div class="relative bg-surface-container-lowest border rounded-xl p-md flex gap-md transition-all duration-200 active:scale-[0.99] group ${cardClass}" onclick="window._app.markRead('${n.id}')">
        ${!n.read ? `<div class="absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${config.indicator}"></div>` : ''}
        
        <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${config.iconBg}">
          <span class="material-symbols-outlined text-[20px] ${config.iconColor}">${config.icon}</span>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-start mb-xs">
            <h4 class="text-headline-sm text-on-surface truncate pr-md font-semibold">${n.title}</h4>
            <span class="text-label-md font-medium text-outline whitespace-nowrap">${time}</span>
          </div>
          <p class="text-body-sm text-on-surface-variant line-clamp-2">${n.message}</p>
          
          ${n.priority === 'high' ? `
            <div class="mt-sm flex gap-sm">
              <button class="px-md py-xs rounded-lg bg-error text-on-error text-label-md font-medium active:scale-95 transition-all">Take Action</button>
              <button class="px-md py-xs rounded-lg bg-surface-container-high text-on-surface-variant text-label-md font-medium active:scale-95 transition-all">Dismiss</button>
            </div>
          ` : ''}
        </div>

        <div class="flex flex-col items-center justify-center gap-sm">
          ${!n.read ? `<div class="w-2 h-2 rounded-full bg-primary"></div>` : ''}
          <button class="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors" onclick="event.stopPropagation(); window._app.deleteNotification('${n.id}')">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
      </div>
    `;
  }

  getCardConfig(type) {
    switch(type) {
      case 'ok': return { icon: 'check_circle', indicator: 'bg-secondary', iconBg: 'bg-surface-container-high', iconColor: 'text-primary' };
      case 'info': return { icon: 'info', indicator: 'bg-primary', iconBg: 'bg-secondary-container', iconColor: 'text-primary' };
      case 'warn': return { icon: 'warning', indicator: 'bg-tertiary', iconBg: 'bg-tertiary-fixed', iconColor: 'text-on-tertiary-fixed-variant' };
      case 'danger': return { icon: 'shield', indicator: 'bg-error', iconBg: 'bg-error-container', iconColor: 'text-on-error-container' };
      default: return { icon: 'notifications', indicator: 'bg-outline', iconBg: 'bg-surface-container', iconColor: 'text-on-surface-variant' };
    }
  }

  renderEmptyState() {
    this.container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-xl gap-md text-center">
        <span class="material-symbols-outlined text-[48px] text-outline">notifications_off</span>
        <h3 class="text-headline-sm font-semibold text-on-surface-variant">All quiet on the front</h3>
        <p class="text-body-sm text-outline max-w-xs">No signals match your current filters. Check back later or adjust your view.</p>
      </div>
    `;
  }

  updateTimeline(notifications) {
    const timeline = document.getElementById('activity-timeline');
    if (!timeline) return;
    
    timeline.innerHTML = notifications.slice(0, 10).map(n => `
      <div class="flex gap-md group">
        <div class="flex flex-col items-center">
          <div class="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0"></div>
          <div class="w-px bg-outline-variant flex-1 mt-xs group-last:hidden"></div>
        </div>
        <div class="flex-1 pb-md">
          <p class="text-label-md font-medium text-outline mb-xs">${new Date(n.timestamp).toLocaleTimeString()}</p>
          <p class="text-body-sm font-medium text-on-surface">${n.title}</p>
          <p class="text-body-sm text-on-surface-variant">${n.event || 'System Event'}</p>
        </div>
      </div>
    `).join('');
  }
}

window._feed = null;
