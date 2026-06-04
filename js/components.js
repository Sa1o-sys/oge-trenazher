import { state }       from './state.js';

export function circleProgress(pct) {
  const r    = 22;
  const circ = 2 * Math.PI * r;
  const off  = circ - (pct / 100) * circ;
  const cls  = pct >= 100 ? 'complete' : '';
  return `
    <div class="circle-progress">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle class="track" cx="28" cy="28" r="${r}"/>
        <circle class="fill ${cls}" cx="28" cy="28" r="${r}"
          stroke-dasharray="${circ}" stroke-dashoffset="${off}"/>
      </svg>
      <div class="circle-pct">${pct}%</div>
    </div>`;
}

export function renderBottomNav(active) {
  const tabs = [
    { id: 'home',    icon: '🏠', label: 'Главная' },
    { id: 'profile', icon: '👤', label: 'Профиль' },
  ];
  return `
    <nav class="bottom-nav">
      ${tabs.map(t => `
        <button class="bottom-nav-btn ${active === t.id ? 'active' : ''}"
          onclick="window._navTab('${t.id}')">
          <span class="bottom-nav-icon">${t.icon}</span>
          <span class="bottom-nav-label">${t.label}</span>
        </button>`).join('')}
    </nav>`;
}

export function renderApp(html, activeTab = 'home') {
  // Stop any running timers when changing screens and reset scroll
  try { clearInterval(state.timerInterval); } catch (e) {}
  window.scrollTo(0, 0);
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      <div class="app-content screen-enter">${html}</div>
      ${renderBottomNav(activeTab)}
    </div>`;
}

export function goBack() {
  if (state.navigationHistory.length > 0) {
    state.navigationHistory.pop()();
  } else {
    window.renderDashboard?.();
  }
}
