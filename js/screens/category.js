import { state }        from '../state.js';
import { STAGE_ORDER, STAGE_LABELS, STAGE_DESC } from '../constants.js';
import { getCategoryPercent, getSubtopicProgress, getStagePercent, checkUnlocks } from '../progress.js';
import { circleProgress, renderApp } from '../components.js';
import { fetchAsset } from '../fetch-utils.js';

export async function openCategory(catId) {
  state.navigationHistory.push(() => window.renderDashboard?.());

  if (!state.loadedCats[catId]) {
    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        <div class="app-content" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60vh">
          <div class="spinner" style="margin:0 auto 16px"></div>
          <p style="color:var(--text-muted)">Загружаем тему...</p>
        </div>
      </div>`;
    try {
      const res = await fetchAsset(`data/${catId}.json`);
      state.loadedCats[catId] = await res.json();
    } catch (e) {
      document.getElementById('app').innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--danger)">Ошибка загрузки категории</div>`;
      return;
    }
  }

  state.currentCategory = state.loadedCats[catId];
  renderCategoryScreen();
}

export function renderCategoryScreen() {
  try { clearInterval(state.timerInterval); } catch (e) {}
  const cat = state.currentCategory;
  if (!cat) return renderApp('<div style="text-align:center;padding:40px">Тема не найдена</div>');

  // If multiple subtopics, show selector
  const subs = cat.subtopics || [];
  if (subs.length > 1) {
    const itemsHtml = subs.map(sub => {
      const sp  = getSubtopicProgress(cat.id, sub.id);
      let totalEx = 0, doneEx = 0;
      STAGE_ORDER.forEach(sk => {
        totalEx += sub.stages?.[sk]?.length || 0;
        doneEx  += (sp.stageProgress?.[sk]?.correctIds || []).length;
      });
      const pct = totalEx ? Math.round((doneEx / totalEx) * 100) : 0;
      return `
        <div class="subtopic-card">
          <div class="subtopic-left">
            <div class="subtopic-name">${sub.name}</div>
            <div class="subtopic-meta">${doneEx} из ${totalEx} заданий · ${pct}%</div>
          </div>
          <div class="subtopic-actions">
            <button class="btn btn-ghost" onclick="openSubtopic('${sub.id}')">Открыть</button>
          </div>
        </div>`;
    }).join('');

    renderApp(`
      <div>
        <div class="screen-header">
          <button class="btn btn-ghost" onclick="goBack()">← Назад</button>
          <h2>${cat.icon} ${cat.name}</h2>
        </div>
        <div class="card">
          <div class="section-title">Подтемы</div>
          <div class="subtopic-list">${itemsHtml}</div>
        </div>
      </div>`);
    return;
  }

  // Single subtopic behaviour (legacy)
  const sub = subs[0];
  const sp  = getSubtopicProgress(cat.id, sub.id);

  let totalEx = 0, doneEx = 0;
  STAGE_ORDER.forEach(sk => {
    const exs = sub.stages?.[sk] || [];
    totalEx += exs.length;
    doneEx  += (sp.stageProgress?.[sk]?.correctIds || []).length;
  });
  const pct = totalEx ? Math.round((doneEx / totalEx) * 100) : 0;

  const descItems = sub.description_items || [];
  const descHtml  = descItems.map(([code, name]) => `
    <div class="topic-desc-item">
      <span class="topic-desc-code">${code}</span>
      <span class="topic-desc-name">${name}</span>
    </div>`).join('');

  const stagesHtml = STAGE_ORDER.map(sk => {
    const exs      = sub.stages?.[sk] || [];
    const done     = (sp.stageProgress?.[sk]?.correctIds || []).length;
    const stagePct = exs.length ? Math.round((done / exs.length) * 100) : 0;
    const unlocked = checkUnlocks(cat.id, sub.id).includes(sk);
    const color    = stagePct >= 100 ? 'var(--sage)' : stagePct >= 40 ? 'var(--accent)' : 'var(--text-dim)';
    return `
      <div class="stage-mini-item ${!unlocked ? 'locked' : ''}">
        <span>${STAGE_LABELS[sk]}</span>
        <span style="font-size:0.75rem;font-weight:600;color:${color}">${unlocked ? stagePct + '%' : '🔒'}</span>
      </div>`;
  }).join('');

  const hasStarted = doneEx > 0;
  const btnText    = pct >= 100 ? '✓ Пройдено — повторить' : hasStarted ? `Продолжить → ${pct}%` : 'Начать изучение';
  const btnCls     = pct >= 100 ? 'btn-success' : 'btn-primary';

  renderApp(`
    <div>
      <div class="screen-header">
        <button class="btn btn-ghost" onclick="goBack()">← Назад</button>
        <h2>${cat.icon} ${cat.name}</h2>
      </div>
      <div class="card" style="margin-bottom:16px;display:flex;align-items:center;gap:16px">
        ${circleProgress(pct)}
        <div style="flex:1">
          <div style="font-weight:600;margin-bottom:4px">${doneEx} из ${totalEx} заданий выполнено</div>
          <div class="stage-mini-list">${stagesHtml}</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="section-title" style="margin-bottom:12px">Содержание темы</div>
        <div class="topic-desc-list">${descHtml}</div>
      </div>
      <button class="btn ${btnCls} btn-large" style="width:100%" onclick="openSubtopic('${sub.id}')">
        ${btnText}
      </button>
    </div>`);
}

export function openSubtopic(subId) {
  state.navigationHistory.push(() => window.renderCategoryScreen?.());
  state.currentSubtopic = state.currentCategory.subtopics.find(s => s.id === subId);
  renderStageSelect();
}

export function renderStageSelect() {
  const sub   = state.currentSubtopic;
  const catId = state.currentCategory.id;
  const unlocked = checkUnlocks(catId, sub.id);

  const buttonsHtml = STAGE_ORDER.map(key => {
    const isUnlocked = unlocked.includes(key);
    const pct   = getStagePercent(catId, sub.id, key);
    const total = (sub.stages?.[key] || []).length;
    const done  = Math.round(pct / 100 * total);
    const isComplete = pct >= 100;

    if (!isUnlocked) {
      const prevKey = STAGE_ORDER[STAGE_ORDER.indexOf(key) - 1];
      const prevPct = getStagePercent(catId, sub.id, prevKey);
      return `
        <div class="stage-select-btn locked">
          <div class="stage-select-left">
            <div class="stage-select-icon">🔒</div>
            <div>
              <div class="stage-select-name">${STAGE_LABELS[key]}</div>
              <div class="stage-select-desc">Нужно набрать 40% в предыдущем этапе (сейчас ${prevPct}%)</div>
            </div>
          </div>
        </div>`;
    }

    const colorClass = isComplete ? 'complete' : pct > 0 ? 'started' : '';
    return `
      <button class="stage-select-btn ${colorClass}" onclick="startStage('${key}')">
        <div class="stage-select-left">
          <div class="stage-select-icon">${STAGE_LABELS[key].split(' ')[0]}</div>
          <div>
            <div class="stage-select-name">${STAGE_LABELS[key].replace(/^\S+\s/, '')}</div>
            <div class="stage-select-desc">${STAGE_DESC[key]}</div>
          </div>
        </div>
        <div class="stage-select-right">
          ${isComplete
            ? '<span style="color:var(--sage);font-size:1.1rem">✅</span>'
            : pct > 0
              ? `<span style="font-size:0.78rem;color:var(--accent);font-weight:600">${done}/${total}</span>`
              : `<span style="font-size:0.75rem;color:var(--text-dim)">${total} заданий</span>`}
        </div>
      </button>`;
  }).join('');

  renderApp(`
    <div>
      <div class="screen-header">
        <button class="btn btn-ghost" onclick="goBack()">← Назад</button>
        <h2>${sub.name}</h2>
      </div>
      <div class="stage-select-list">${buttonsHtml}</div>
    </div>`);
}

export function startStage(stageKey) {
  state.currentStageKey = stageKey;
  window.renderStageExercises?.(stageKey);
}

export function goToStage(stage) {
  const map = { 1: 'razberis', 2: 'rule', 3: 'practice', 4: 'test' };
  state.currentStageKey = (typeof stage === 'number') ? (map[stage] || 'razberis') : stage;
  window.renderStageExercises?.(state.currentStageKey);
}
