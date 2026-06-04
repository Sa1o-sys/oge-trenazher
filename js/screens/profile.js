import { state }        from '../state.js';
import { STAGE_ORDER, STAGE_LABELS } from '../constants.js';
import { ensureAllProgressEntries, getCategoryPercent, getSubtopicProgress, resetAllProgress, getMiniOgeHistory } from '../progress.js';
import { circleProgress, renderApp } from '../components.js';

function showConfirmationModal(text, confirmLabel, onConfirm) {
  const overlay   = document.getElementById('modal-overlay');
  const modalText = overlay?.querySelector('.modal-text');
  const cancelBtn = document.getElementById('modal-cancel');
  const confirmBtn = document.getElementById('modal-confirm');
  const cleanup = () => {
    overlay?.classList.add('hidden');
    if (cancelBtn) cancelBtn.onclick = null;
    if (confirmBtn) confirmBtn.onclick = null;
  };
  if (modalText) modalText.textContent = text;
  if (cancelBtn) cancelBtn.onclick = cleanup;
  if (confirmBtn) {
    confirmBtn.textContent = confirmLabel || 'Подтвердить';
    confirmBtn.onclick = () => { cleanup(); onConfirm?.(); };
  }
  overlay?.classList.remove('hidden');
}

export async function renderProfileScreen() {
  const profile = state.currentProfile;
  if (!profile) return;

  ensureAllProgressEntries();

  const cats = state.categoryIndex?.categories || [];

  const stats              = buildProfileStatsData(cats);
  const miniOgeHistory     = getMiniOgeHistory();
  const completedCategories = stats.categoryCards.filter(c => c.pct >= 100).length;
  const strongestCategory  = stats.categoryCards.find(c => c.total > 0) || null;
  const weakestCategory    = [...stats.categoryCards]
    .filter(c => c.total > 0 && c.done < c.total)
    .sort((a, b) => a.pct - b.pct || b.total - a.total)[0] || null;

  const joined = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  renderApp(`
    <div style="padding-bottom:16px">
      <div class="profile-header">
        <div class="profile-avatar">${profile.name?.[0]?.toUpperCase() || '?'}</div>
        <div class="profile-info">
          <div class="profile-name">${profile.name}</div>
          <div class="profile-email">${profile.email}</div>
          <div class="profile-joined">На платформе с ${joined}</div>
        </div>
        <div class="profile-total-orbit">${circleProgress(stats.totalPct)}</div>
      </div>

      <div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:14px">
        <div style="flex:1">
          <div class="section-title" style="margin-bottom:4px">Ваш уникальный код</div>
          <div style="font-family:monospace;font-size:1.6rem;font-weight:800;letter-spacing:0.18em;color:var(--accent)">${profile.studentCode || '—'}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Сообщите этот код учителю для отслеживания прогресса</div>
        </div>
        <div style="font-size:2rem">🔑</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div class="section-title" style="margin:0">Общий прогресс</div>
          <div style="font-family:var(--font-display);font-size:1.6rem;font-weight:800;color:${stats.totalPct >= 80 ? 'var(--success)' : stats.totalPct >= 40 ? 'var(--accent)' : 'var(--text-muted)'}">${stats.totalPct}%</div>
        </div>
        <div class="profile-kpi-grid">
          <div class="profile-kpi-card">
            <div class="profile-kpi-value">${stats.allDone}</div>
            <div class="profile-kpi-label">решено заданий</div>
          </div>
          <div class="profile-kpi-card">
            <div class="profile-kpi-value">${completedCategories}/${cats.length}</div>
            <div class="profile-kpi-label">тем закрыто</div>
          </div>
          <div class="profile-kpi-card">
            <div class="profile-kpi-value">${strongestCategory ? strongestCategory.pct : 0}%</div>
            <div class="profile-kpi-label">сильнейшая тема</div>
          </div>
        </div>
        <div class="profile-insight-row">
          <div class="profile-insight-card">
            <div class="profile-insight-label">Сильная сторона</div>
            <div class="profile-insight-value">${strongestCategory ? `${strongestCategory.icon} ${strongestCategory.name}` : 'Пока данных нет'}</div>
          </div>
          <div class="profile-insight-card">
            <div class="profile-insight-label">Зона роста</div>
            <div class="profile-insight-value">${weakestCategory ? `${weakestCategory.icon} ${weakestCategory.name}` : 'Все темы закрыты'}</div>
          </div>
        </div>
      </div>

      <div class="profile-category-stack">
        ${buildProfileCategoryCards(stats.categoryCards)}
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="section-title">Динамика — Мини-ОГЭ</div>
        ${buildMiniOgeDynamicsHtml(miniOgeHistory)}
      </div>

      <button class="btn btn-danger" style="width:100%;margin-top:4px" onclick="window._confirmLogout()">
        Выйти из аккаунта
      </button>
    </div>
  `, 'profile');

  window._confirmLogout = () => {
    showConfirmationModal('Вы уверены, что хотите выйти из аккаунта?', 'Выйти', () => {
      window._appLogout?.();
    });
  };
}

function buildProfileStatsData(cats) {
  let allDone = 0, allTotal = 0;

  const categoryCards = cats.map(cat => {
    let done = 0, total = 0;
    const stageBreakdown = STAGE_ORDER.map(stageKey => {
      let stageDone = 0, stageTotal = 0;
      (cat.subtopics || []).forEach(sub => {
        const fullSub = state.loadedCats[cat.id]?.subtopics?.find(s => s.id === sub.id);
        stageTotal += fullSub ? (fullSub.stages?.[stageKey] || []).length : (sub.stageCounts?.[stageKey] || 0);
        const sp    = getSubtopicProgress(cat.id, sub.id);
        stageDone  += (sp.stageProgress?.[stageKey]?.correctIds || []).length;
      });
      done  += stageDone;
      total += stageTotal;
      return { key: stageKey, label: STAGE_LABELS[stageKey], done: stageDone, total: stageTotal,
        pct: stageTotal ? Math.round((stageDone / stageTotal) * 100) : 0 };
    });

    allDone  += done;
    allTotal += total;
    return { id: cat.id, name: cat.name, icon: cat.icon, done, total,
      pct: total ? Math.round((done / total) * 100) : 0, stageBreakdown };
  }).sort((a, b) => b.pct - a.pct || b.done - a.done || a.name.localeCompare(b.name, 'ru'));

  return { allDone, allTotal, totalPct: allTotal ? Math.round((allDone / allTotal) * 100) : 0, categoryCards };
}

function buildProfileCategoryCards(cards) {
  if (!cards.length) return '';
  return cards.map(card => {
    const statusText = card.pct >= 100 ? 'Тема пройдена' : card.pct >= 40 ? 'Хороший прогресс' : card.pct > 0 ? 'В процессе' : 'Пока 0% — можно начать';
    const chipsHtml  = card.stageBreakdown.map(stage => `
      <div class="profile-stage-chip ${stage.pct >= 100 ? 'done' : stage.pct > 0 ? 'active' : ''}">
        <span>${stage.label}</span>
        <strong>${stage.done}/${stage.total}</strong>
      </div>`).join('');
    return `
      <div class="profile-topic-card">
        <div class="profile-topic-top">
          <div class="profile-topic-title-wrap">
            <div class="profile-topic-icon">${card.icon}</div>
            <div>
              <div class="profile-topic-name">${card.name}</div>
              <div class="profile-topic-meta">${statusText} · ${card.done}/${card.total} заданий</div>
            </div>
          </div>
          <div class="profile-topic-pct">${card.pct}%</div>
        </div>
        <div class="profile-topic-bar">
          <div class="profile-topic-fill" style="width:${card.pct}%"></div>
        </div>
        <div class="profile-stage-grid">${chipsHtml}</div>
      </div>`;
  }).join('');
}

function buildMiniOgeDynamicsHtml(history) {
  if (!history.length) return `<div class="empty-state" style="padding:24px 18px">Ты ещё не проходил Мини-ОГЭ. Попробуй — это полезно для подготовки к экзамену.</div>`;
  const chartItems = history.map((a, i) => ({ attemptNumber: i + 1, scorePercent: a.total ? Math.round((a.score / a.total) * 100) : 0 }));
  const best       = Math.max(...chartItems.map(i => i.scorePercent));
  const average    = Math.round(chartItems.reduce((s, i) => s + i.scorePercent, 0) / chartItems.length);
  const barsHtml   = chartItems.map((item, idx) => `
    <div class="mini-oge-bar-item">
      <div class="mini-oge-bar-value">${item.scorePercent}%</div>
      <div class="mini-oge-bar-track">
        <div class="mini-oge-bar-fill ${idx === chartItems.length - 1 ? 'last' : ''}" style="height:${Math.max(8, item.scorePercent)}%"></div>
      </div>
      <div class="mini-oge-bar-label">#${item.attemptNumber}</div>
    </div>`).join('');
  return `
    <div class="mini-oge-chart">${barsHtml}</div>
    <div class="mini-oge-summary-row">
      <div class="mini-oge-summary-item"><strong>${best}%</strong><span>Лучший результат</span></div>
      <div class="mini-oge-summary-item"><strong>${average}%</strong><span>Средний</span></div>
      <div class="mini-oge-summary-item"><strong>${chartItems.length}</strong><span>Попыток</span></div>
    </div>`;
}

export function confirmReset() {
  showConfirmationModal(
    'Вы уверены, что хотите сбросить весь прогресс? Это действие нельзя отменить.',
    'Да, сбросить',
    () => { resetAllProgress(); window.renderDashboard?.(); }
  );
}
