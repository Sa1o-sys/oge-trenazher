import { state }              from '../state.js';
import { STAGE_ORDER }        from '../constants.js';
import { getCategoryPercent, getSubtopicProgress } from '../progress.js';
import { circleProgress, renderApp } from '../components.js';

export function renderDashboard() {
  try { clearInterval(state.timerInterval); } catch (e) {}
  const cats = state.categoryIndex?.categories || [];
  let cardsHtml = '';

  cats.forEach(cat => {
    const pct        = getCategoryPercent(cat);
    const isComplete = pct >= 100;
    const hasStarted = pct > 0;
    const btnText    = isComplete ? '✓ Повторить' : hasStarted ? 'Продолжить →' : 'Начать';
    const btnCls     = isComplete ? 'btn-success' : 'btn-primary';

    let done = 0, total = 0;
    (cat.subtopics || []).forEach(sub => {
      STAGE_ORDER.forEach(sk => {
        total += sub.stageCounts?.[sk] || 0;
        const sp = getSubtopicProgress(cat.id, sub.id);
        done  += (sp.stageProgress?.[sk]?.correctIds || []).length;
      });
    });

    cardsHtml += `
      <div class="category-card ${isComplete ? 'complete' : ''}" data-cat="${cat.id}">
        <div class="category-card-top">
          <span class="category-icon">${cat.icon}</span>
          ${circleProgress(pct)}
        </div>
        <div>
          <div class="category-name">${cat.name}</div>
          <div class="category-progress-text" style="margin-top:4px">
            ${isComplete ? '⭐ Все задания выполнены!' : `${done} из ${total} заданий выполнено`}
          </div>
        </div>
        <div class="flex gap-10">
          <button class="btn ${btnCls}" style="flex:1" onclick="openCategory('${cat.id}')">${btnText}</button>
        </div>
      </div>`;
  });

  const name = state.currentProfile?.name?.split(' ')[1] || state.currentProfile?.name?.split(' ')[0] || 'друг';

  renderApp(`
    <div>
      <div class="dashboard-header">
        <h1>Тренажёр ОГЭ по английскому языку</h1>
        <div class="dashboard-divider"></div>
        <p class="dashboard-subtitle">Грамматика</p>
        <p class="dashboard-greeting">Привет, ${name}! Выбирай категорию заданий и приступай к выполнению — удачи 🍀</p>
      </div>
      <div class="categories-grid">${cardsHtml}</div>
      <div class="dashboard-actions">
        <button class="btn btn-warning btn-large" onclick="startMiniOge()">
          🎯 Режим Мини-ОГЭ
        </button>
        <button class="btn btn-ghost" onclick="confirmReset()">🗑 Сбросить прогресс</button>
      </div>
    </div>`, 'home');
}
