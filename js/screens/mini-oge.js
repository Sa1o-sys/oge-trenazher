import { state }       from '../state.js';
import { renderApp }   from '../components.js';
import { rememberMiniOgeAttempt } from '../progress.js';
import { fetchAsset } from '../fetch-utils.js';
import { normalizeAnswer, escapeHtml } from '../utils.js';

let OGE_VARIANTS = null;

async function ensureVariants() {
  if (OGE_VARIANTS) return OGE_VARIANTS;
  const res  = await fetchAsset('oge-variants.json');
  OGE_VARIANTS = await res.json();
  return OGE_VARIANTS;
}

export async function startMiniOge() {
  state.navigationHistory.push(() => window.renderDashboard?.());
  const variants = await ensureVariants();
  const variant  = variants[Math.floor(Math.random() * variants.length)];
  state.miniOgeState = {
    variant,
    answers:  {},
    checked:  {},
    timeLeft: 25 * 60,
    started:  Date.now(),
    finished: false,
  };
  renderMiniOge();
}

export function renderMiniOge() {
  if (!state.miniOgeState) {
    renderApp(`<div style="text-align:center;padding:40px">Нет состояния Мини-ОГЭ. <button class="btn btn-primary" onclick="startMiniOge()">Начать</button></div>`);
    return;
  }

  // Support both { variant } mode and legacy { tasks } mode
  const modeVariant = !!state.miniOgeState.variant;
  const variant = modeVariant ? state.miniOgeState.variant : { id: 'category-test', tasks: state.miniOgeState.tasks || [] };
  const tasks = Array.isArray(variant.tasks) ? variant.tasks : [];
  const answers = state.miniOgeState.answers || {};
  const checked = state.miniOgeState.checked || {};
  const finished = !!state.miniOgeState.finished;
  const timeLeft = state.miniOgeState.timeLeft ?? 0;

  if (!tasks.length) {
    renderApp(`<div style="text-align:center;padding:40px">
      Нет доступных заданий для этого режима.<br/><br/>
      <button class="btn btn-primary" onclick="renderDashboard()">← Вернуться на главную</button>
    </div>`);
    return;
  }

  const mins   = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs   = String(timeLeft % 60).padStart(2, '0');
  const urgent = timeLeft < 180;

  const tasksHtml = tasks.map(t => {
    const userAns  = answers[t.num] || '';
    const result   = checked[t.num];
    let inputClass = 'oge-input';
    let resultIcon = '';
    if (result) {
      inputClass += result.correct ? ' correct' : ' wrong';
      resultIcon  = result.correct
        ? '<span class="oge-result-ok">✓</span>'
        : `<span class="oge-result-err">✗ <em>${escapeHtml(t.answer)}</em></span>`;
    }
    return `
      <div class="oge-task-row">
        <div class="oge-task-num">${t.num}</div>
        <div class="oge-task-body">
          <div class="oge-sentence">${escapeHtml(t.sentence || '').replace('_______',
            `<input class="${inputClass}" id="oge_${t.num}" type="text"
              value="${escapeHtml(userAns).replace(/"/g, '&quot;')}"
              placeholder="______"
              onchange="window._ogeInput(${t.num}, this.value)"
              ${finished ? 'disabled' : ''}
              autocomplete="off" spellcheck="false"/>`
          )}</div>
          <div class="oge-word-hint">Слово: <b>${escapeHtml(t.word || '')}</b></div>
          ${resultIcon}
        </div>
      </div>`;
  }).join('');

  const score = Object.values(checked).filter(c => c.correct).length;
  const total = (variant.tasks || []).length;

  renderApp(`
    <div class="oge-wrapper">
      <div class="oge-header">
        <div class="oge-header-left">
          <div class="oge-title">Раздел 3 — Задания 20–28</div>
          <div class="oge-subtitle">Грамматика и лексика · Вариант ${variant.id}</div>
        </div>
        <div class="oge-timer ${urgent ? 'urgent' : ''}" id="oge-timer">⏱ ${mins}:${secs}</div>
      </div>
      <div class="oge-instruction">
        Прочитайте текст. Преобразуйте слова, напечатанные заглавными буквами,
        так, чтобы они грамматически соответствовали содержанию текста.
        Заполните пропуски полученными словами. Ответ должен быть написан БЕЗ СОКРАЩЕНИЙ.
      </div>
      <div class="oge-tasks">${tasksHtml}</div>
      <div class="oge-actions">
        ${!finished ? `
          <button class="btn btn-primary btn-large" onclick="checkMiniOge()">Проверить работу</button>
          <button class="btn btn-ghost" onclick="renderDashboard()">← Выйти</button>
        ` : `
          <div class="oge-score">
            <div class="oge-score-num">${score}/${total}</div>
            <div class="oge-score-label">правильных ответов</div>
            <div class="oge-score-grade">${score >= 8 ? '🏆 Отлично!' : score >= 6 ? '👍 Хорошо' : score >= 4 ? '📚 Нужно повторить' : '💪 Не сдавайся!'}</div>
          </div>
          <button class="btn btn-primary btn-large" onclick="startMiniOge()">Новый вариант</button>
          <button class="btn btn-secondary" onclick="renderDashboard()">← На главную</button>
        `}
      </div>
    </div>`);

  window._ogeInput = (num, val) => { state.miniOgeState = state.miniOgeState || {}; state.miniOgeState.answers = state.miniOgeState.answers || {}; state.miniOgeState.answers[num] = val; };

  clearInterval(state.timerInterval);
  if (!finished) {
    state.timerInterval = setInterval(() => {
      state.miniOgeState.timeLeft = (state.miniOgeState.timeLeft ?? 0) - 1;
      const el = document.getElementById('oge-timer');
      if (el) {
        const m = String(Math.floor(state.miniOgeState.timeLeft / 60)).padStart(2, '0');
        const s = String(state.miniOgeState.timeLeft % 60).padStart(2, '0');
        el.textContent = `⏱ ${m}:${s}`;
        if (state.miniOgeState.timeLeft < 180) el.classList.add('urgent');
      }
      if ((state.miniOgeState.timeLeft ?? 0) <= 0) { clearInterval(state.timerInterval); checkMiniOge(); }
    }, 1000);
  }
}

export function checkMiniOge() {
  clearInterval(state.timerInterval);
  if (state.miniOgeState?.finished) { renderMiniOge(); return; }
  const variant = state.miniOgeState?.variant || { id: 'category-test', tasks: state.miniOgeState?.tasks || [] };
  const tasks = Array.isArray(variant.tasks) ? variant.tasks : [];
  const answers = state.miniOgeState?.answers || {};
  const checked = {};
  tasks.forEach(t => {
    const user   = normalizeAnswer(answers[t.num] || '');
    const correct = normalizeAnswer(t.answer || '');
    checked[t.num] = { correct: user === correct, userAnswer: answers[t.num] || '' };
  });
  state.miniOgeState = state.miniOgeState || {};
  state.miniOgeState.checked  = checked;
  state.miniOgeState.finished = true;
  const score = Object.values(checked).filter(c => c.correct).length;
  rememberMiniOgeAttempt(score, tasks.length, variant.id);
  renderMiniOge();
}

export function submitMiniAnswer() { checkMiniOge(); }

export function startCategoryTest() {
  const cat  = state.currentCategory;
  const pool = [];
  (cat.subtopics || []).forEach(sub => {
    const exs = sub.stages ? Object.values(sub.stages).flat() : (sub.exercises || []);
    exs.forEach(ex => pool.push({ ...ex, _subName: sub.name, _subId: sub.id }));
  });
  pool.sort(() => Math.random() - 0.5);
  // create variant-shaped state so renderMiniOge can handle it
  const numberedTasks = pool.map((item, index) => ({ ...item, num: index + 1 }));
  state.miniOgeState = {
    variant: { id: `cat-${state.currentCategory?.id || 'unknown'}`, tasks: numberedTasks },
    answers: {},
    checked: {},
    timeLeft: 10 * 60,
    started: Date.now(),
    finished: false,
  };
  state.navigationHistory.push(() => window.renderCategoryScreen?.());
  renderMiniOge();
}
