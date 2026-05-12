/**
 * Analytics Manager — Handles system metrics for the Stitch Dashboard
 */
class AnalyticsManager {
  constructor(app) {
    this.app = app;
    this.prevTotal = 0;
  }

  update(stats) {
    if (!stats) return;

    // Update Dashboard Stats
    const totalEl = document.getElementById('stat-total');
    if (totalEl) {
      totalEl.textContent = stats.delivered.toLocaleString();
    }

    const nodesEl = document.getElementById('stat-nodes');
    if (nodesEl) {
      nodesEl.textContent = stats.connectedClients.toLocaleString();
    }

    const epsEl = document.getElementById('stat-eps');
    if (epsEl) {
      epsEl.textContent = stats.eps || '0.0';
    }

    const epsHeaderEl = document.getElementById('eps-stat');
    if (epsHeaderEl) {
      epsHeaderEl.textContent = `${stats.eps || '0.0'} evt/s`;
    }

    const clientsHeaderEl = document.getElementById('clients-stat');
    if (clientsHeaderEl) {
      clientsHeaderEl.textContent = stats.connectedClients;
    }

    this.prevTotal = stats.delivered;
  }
}
