import { state }              from '../state.js';
import { STAGE_ORDER, STAGE_LABELS, STAGE_NEXT } from '../constants.js';
import { getSubtopicProgress, setSubtopicProgress, checkUnlocks, getStagePercent } from '../progress.js';
import { renderApp }          from '../components.js';
import { launchConfetti }     from '../confetti.js';
import { normalizeAnswer, escapeHtml, formatOptionText, resolveCorrectOptionIndex, getChoiceAnswerText, stripAnswerPrefix } from '../utils.js';

export function renderStageExercises(stageKey) {
  const sub   = state.currentSubtopic;
  const catId = state.currentCategory.id;
  const exercises = sub.stages?.[stageKey] || [];

  if (!exercises.length) {
    renderApp(`
      <div class="stage-screen">
        <button class="btn btn-ghost" style="margin-bottom:16px" onclick="renderStageSelect()">← Назад</button>
        <div class="empty-state">
          <p>Для этого раздела заданий пока нет.</p>
          <button class="btn btn-secondary" style="margin-top:16px" onclick="renderStageSelect()">← К этапам</button>
        </div>
      </div>`);
    return;
  }

  state.stageExerciseState = {
    stageKey,
    exercises: [...exercises],
    index: 0,
    correct: [],
    wrong: [],
    skipped: [],
  };
  renderExerciseTask();
}

export function renderExerciseTask() {
  const { exercises, index, stageKey } = state.stageExerciseState;
  const task  = exercises[index];
  const label = STAGE_LABELS[stageKey] || stageKey;
  const total = exercises.length;

  const isChoice = (task.type === 'choice' || task.question_type === 'multiple_choice' || task.type === 'ЗАКРЫТЫЙ') && task.options?.length > 0;
  let inputHtml  = '';
  if (isChoice) {
    const letters = ['A', 'B', 'C', 'D'];
    inputHtml = `
      <div class="options-list" id="options-list">
        ${task.options.map((opt, i) => `
          <label class="option-label" id="opt_${i}">
            <input type="radio" name="ex_opt" value="${i}" />
            <span class="option-letter">${letters[i]}</span>
            <span>${escapeHtml(formatOptionText(opt))}</span>
          </label>`).join('')}
      </div>`;
  } else {
    inputHtml = `
      <div class="answer-input-wrap">
        <input class="answer-input" id="answer-input" type="text"
          placeholder="Введите ответ..."
          autocomplete="off" autocorrect="off" spellcheck="false"/>
      </div>`;
  }

  renderApp(`
    <div class="stage-screen">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
        <button class="btn btn-ghost" onclick="renderStageSelect()">← Назад</button>
        <span class="tag">${label}</span>
        <div class="spacer"></div>
        <span style="font-size:0.78rem;color:var(--text-muted)">${index + 1} / ${total}</span>
      </div>
      <div class="mini-progress-bar">
        <div class="mini-progress-fill" style="width:${(index / total) * 100}%"></div>
      </div>
      <div class="task-instruction">${isChoice ? 'Выберите правильный вариант:' : 'Вставьте правильную форму слова:'}</div>
      <div class="task-context">${escapeHtml(task.context).replace(/\n/g, '<br>')}</div>
      ${inputHtml}
      <div class="feedback-block hidden" id="feedback-block"></div>
      <div class="practice-actions" id="ex-actions">
        <button class="btn btn-primary" onclick="checkExerciseAnswer()">Проверить</button>
        <button class="btn btn-ghost" onclick="skipExercise()" style="font-size:0.8rem;color:var(--text-dim)">Пропустить</button>
        <button class="btn btn-ghost" onclick="stopStage()" style="font-size:0.8rem;color:var(--text-dim);margin-left:auto">Завершить</button>
      </div>
    </div>`);

  document.getElementById('answer-input')?.focus();
}

export function checkExerciseAnswer() {
  const ses      = state.stageExerciseState;
  const task     = ses.exercises[ses.index];
  const feedback = document.getElementById('feedback-block');
  const actions  = document.getElementById('ex-actions');
  let isCorrect  = false;

  const isChoice = (task.type === 'choice' || task.question_type === 'multiple_choice' || task.type === 'ЗАКРЫТЫЙ') && task.options?.length > 0;
  if (isChoice) {
    const sel        = document.querySelector('input[name="ex_opt"]:checked');
    if (!sel) {
      // Prompt user to choose an option instead of silently marking wrong
      const feedback = document.getElementById('feedback-block');
      feedback.classList.remove('hidden');
      feedback.className = 'feedback-block wrong';
      feedback.innerHTML = '⚠️ Пожалуйста, выберите вариант ответа.';
      return;
    }
    const val        = sel ? parseInt(sel.value) : -1;
    const correctIdx = resolveCorrectOptionIndex(task);
    isCorrect        = val === correctIdx;
    task.options.forEach((_, i) => {
      const lbl = document.getElementById(`opt_${i}`);
      if (!lbl) return;
      if (i === correctIdx) lbl.classList.add('correct');
      else if (i === val && !isCorrect) lbl.classList.add('wrong');
      lbl.querySelector('input').disabled = true;
    });
    task._correctText = getChoiceAnswerText(task, correctIdx);
  } else {
    const input = document.getElementById('answer-input');
    const rawValue = input?.value || '';
    if (!rawValue.trim()) {
      feedback.classList.remove('hidden');
      feedback.className = 'feedback-block wrong';
      feedback.innerHTML = '⚠️ Пожалуйста, введите ответ перед проверкой.';
      return;
    }
    const given = normalizeAnswer(rawValue);
    const correct = normalizeAnswer(task.answer || '');
    isCorrect = given === correct;
    if (input) { input.disabled = true; input.classList.add(isCorrect ? 'correct' : 'wrong'); }
  }

  if (isCorrect) ses.correct.push(task.id);
  else ses.wrong.push(task.id);

  feedback.classList.remove('hidden');
  if (isCorrect) {
    feedback.className = 'feedback-block correct';
    feedback.innerHTML = `✅ Верно!${task.explanation ? `<div class="cognitive-hint">💡 ${escapeHtml(task.explanation)}</div>` : ''}`;
  } else {
    feedback.className = 'feedback-block wrong';
    const displayAnswer = task._correctText || stripAnswerPrefix(task.answer);
    feedback.innerHTML = `❌ Неверно. Правильный ответ: <span class="correct-answer">${escapeHtml(displayAnswer)}</span>
      ${task.explanation ? `<div class="cognitive-hint">💡 ${escapeHtml(task.explanation)}</div>` : ''}`;
  }

  actions.innerHTML = `
    <button class="btn btn-${isCorrect ? 'success' : 'warning'}" id="next-btn" onclick="nextExercise()">Следующее →</button>
    <button class="btn btn-ghost" onclick="stopStage()" style="font-size:0.8rem;color:var(--text-dim);margin-left:auto">Завершить</button>`;
}

export function skipExercise() {
  const ses = state.stageExerciseState;
  if (!ses) return;
  const task = ses.exercises[ses.index];
  if (task) ses.skipped.push(task.id);
  nextExercise();
}

export function nextExercise() {
  state.stageExerciseState.index++;
  saveStageProgress();
  if (state.stageExerciseState.index >= state.stageExerciseState.exercises.length) renderStageSummary();
  else renderExerciseTask();
}

export function stopStage() {
  saveStageProgress();
  renderStageSummary();
}

export function saveStageProgress() {
  const { stageKey, correct, wrong, skipped } = state.stageExerciseState;
  const catId = state.currentCategory.id;
  const subId = state.currentSubtopic.id;
  const sp    = getSubtopicProgress(catId, subId);
  if (!sp.stageProgress) sp.stageProgress = {};
  sp.stageProgress[stageKey] = { correctIds: correct, wrongIds: wrong, skippedIds: skipped };
  setSubtopicProgress(catId, subId, sp);
  checkUnlocks(catId, subId);
}

export function renderStageSummary() {
  const { stageKey, exercises, correct, wrong, skipped } = state.stageExerciseState;
  const total        = exercises.length;
  const correctCount = correct.length;
  const pct          = total ? Math.round((correctCount / total) * 100) : 0;
  const label        = STAGE_LABELS[stageKey];
  const nextKey      = STAGE_NEXT[stageKey];
  const nextUnlocked = nextKey && checkUnlocks(state.currentCategory.id, state.currentSubtopic.id).includes(nextKey);

  if (pct === 100) setTimeout(() => launchConfetti(), 150);

  const needRepeat = [...wrong, ...skipped];
  let mistakesHtml = '';
  if (needRepeat.length === 0) {
    mistakesHtml = `<p style="color:var(--sage);text-align:center;padding:12px">🎉 Все задания выполнены верно!</p>`;
  } else {
    const visibleCount = 5;
    const hasMore = needRepeat.length > visibleCount;
    
    // Отображаем первые 5 ошибок
    needRepeat.slice(0, visibleCount).forEach(id => {
      const task = exercises.find(t => t.id === id);
      if (!task) return;
      const mark = wrong.includes(id) ? '❌' : '⏭';
      const answerText = task.type === 'choice' ? getChoiceAnswerText(task) : task.answer;
      mistakesHtml += `<div class="mistake-item" data-task-id="${id}">${mark} <strong>${task.context.slice(0, 80)}${task.context.length > 80 ? '…' : ''}</strong><br><span>Ответ: ${answerText}</span></div>`;
    });
    
    // Добавляем кнопку "Показать все", если есть ещё ошибки
    if (hasMore) {
      const remainingCount = needRepeat.length - visibleCount;
      mistakesHtml += `
        <div class="mistake-item" data-action="show" style="text-align:center;cursor:pointer;background:var(--bg2);color:var(--accent);font-weight:500;border:1px solid var(--border);">
          ▼ Показать все ошибки (ещё ${remainingCount})
        </div>
        <div id="all-mistakes-container" style="display:none">
          ${needRepeat.slice(visibleCount).map(id => {
            const task = exercises.find(t => t.id === id);
            if (!task) return '';
            const mark = wrong.includes(id) ? '❌' : '⏭';
            const answerText = task.type === 'choice' ? getChoiceAnswerText(task) : task.answer;
            return `<div class="mistake-item" data-task-id="${id}">${mark} <strong>${task.context.slice(0, 80)}${task.context.length > 80 ? '…' : ''}</strong><br><span>Ответ: ${answerText}</span></div>`;
          }).join('')}
          <div class="mistake-item" data-action="hide" style="text-align:center;cursor:pointer;background:var(--bg2);color:var(--text-muted);font-weight:500;border:1px solid var(--border);">
            ▲ Скрыть
          </div>
        </div>
      `;
    }
  }

  renderApp(`
    <div class="stage-screen">
      <div class="summary-result">
        <div class="summary-big-score">${correctCount}/${total}</div>
        <div class="summary-label">${label}</div>
        ${pct >= 40
          ? `<div style="color:var(--sage);font-size:0.85rem;margin-top:8px">✅ Следующий этап разблокирован!</div>`
          : pct > 0
            ? `<div style="color:var(--text-muted);font-size:0.85rem;margin-top:8px">Нужно 40% для разблокировки следующего этапа</div>`
            : ''}
      </div>
      ${needRepeat.length > 0 ? '<div class="section-title">ТРЕБУЮТ ПОВТОРЕНИЯ</div>' : ''}
      <div class="mistakes-list" id="mistakes-list">${mistakesHtml}</div>
      <div class="summary-actions">
        <button class="btn btn-secondary" onclick="renderStageSelect()">← К этапам</button>
        ${needRepeat.length > 0
          ? `<button class="btn btn-repeat" onclick="startRepeatErrors()">🔁 Работа над ошибками (${needRepeat.length})</button>`
          : ''}
        <button class="btn btn-primary" onclick="startStage('${stageKey}')">↺ Пройти ещё раз</button>
        ${nextUnlocked ? `<button class="btn btn-success" onclick="startStage('${nextKey}')">Дальше: ${STAGE_LABELS[nextKey]} →</button>` : ''}
      </div>
    </div>
  `);

  // Функция для раскрытия/скрытия всех ошибок
  function setupMistakesToggle() {
    setTimeout(() => {
      const showBtn = document.querySelector('[data-action="show"]');
      const hideBtn = document.querySelector('[data-action="hide"]');
      const container = document.getElementById('all-mistakes-container');
      
      if (showBtn && container) {
        const newShowBtn = showBtn.cloneNode(true);
        showBtn.parentNode.replaceChild(newShowBtn, showBtn);
        
        newShowBtn.addEventListener('click', function() {
          container.style.display = 'block';
          this.style.display = 'none';
        });
      }
      
      if (hideBtn && container) {
        const newHideBtn = hideBtn.cloneNode(true);
        hideBtn.parentNode.replaceChild(newHideBtn, hideBtn);
        
        newHideBtn.addEventListener('click', function() {
          container.style.display = 'none';
          const showTrigger = document.querySelector('[data-action="show"]');
          if (showTrigger) showTrigger.style.display = 'block';
        });
      }
    }, 50);
  }
  
  // Вызываем настройку кнопок после рендера
  setupMistakesToggle();
}

export function startRepeatErrors() {
  const ses = state.stageExerciseState;
  if (!ses) return;
  const toRepeatIds = new Set([...ses.wrong, ...ses.skipped]);
  const tasks       = ses.exercises.filter(t => toRepeatIds.has(t.id));
  if (!tasks.length) return;

  state.navigationHistory.push(() => renderStageSummary());
  state.repeatState = {
    tasks:         [...tasks],
    correctStreak: {},
    removed:       [],
    stageKey:      ses.stageKey,
  };
  renderRepeatTask();
}

export function renderRepeatTask() {
  const tasks = (state.repeatState?.tasks || []).filter(t => !state.repeatState.removed.includes(t.id));

  if (tasks.length === 0) {
    renderApp(`
      <div class="stage-screen" style="text-align:center">
        <div class="summary-result">
          <div class="summary-big-score" style="font-size:3rem">🎉</div>
          <div class="summary-label">Все ошибки исправлены!</div>
        </div>
        <button class="btn btn-success" style="margin-top:20px" onclick="renderStageSelect()">← К этапам</button>
      </div>`);
    return;
  }

  const task      = tasks[0];
  const remaining = tasks.length;
  const isChoice  = (task.type === 'choice' || task.question_type === 'multiple_choice' || task.type === 'ЗАКРЫТЫЙ') && task.options?.length > 0;

  let inputHtml = '';
  if (isChoice) {
    const letters = ['A', 'B', 'C', 'D'];
    inputHtml = `
      <div class="options-list" id="repeat-options">
        ${task.options.map((opt, i) => `
          <label class="option-label" id="ropt_${i}">
            <input type="radio" name="repeat_opt" value="${i}" />
            <span class="option-letter">${letters[i]}</span>
            <span>${escapeHtml(formatOptionText(opt))}</span>
          </label>`).join('')}
      </div>
      <div id="repeat-actions" style="margin-top:12px">
        <button class="btn btn-primary" onclick="checkRepeatAnswer('${task.id}')">Проверить</button>
      </div>`;
  } else {
    inputHtml = `
      <div class="answer-input-wrap">
        <input class="answer-input" id="repeat-input" type="text"
          placeholder="Введите ответ..."
          data-task-id="${task.id}"
          autocomplete="off" spellcheck="false"/>
        <button class="btn btn-primary" onclick="checkRepeatAnswer('${task.id}')">Проверить</button>
      </div>
      <div id="repeat-actions"></div>`;
  }

  renderApp(`
    <div class="stage-screen">
      <button class="btn btn-ghost" style="margin-bottom:16px" onclick="goBack()">← Назад</button>
      <div style="margin-bottom:16px" class="stage-bar">
        <span class="stage-bar-label">🔁 Работа над ошибками</span>
        <div class="spacer"></div>
        <span class="tag">Осталось: ${remaining}</span>
      </div>
      <div class="task-context">${escapeHtml(task.context).replace(/\n/g, '<br>')}</div>
      ${inputHtml}
      <div class="feedback-block hidden" id="repeat-feedback"></div>
    </div>`);

  document.getElementById('repeat-input')?.focus();
}

export function checkRepeatAnswer(taskId) {
  const rs   = state.repeatState;
  const task = rs.tasks.find(t => t.id === taskId);
  if (!task) return;

  const isChoice = (task.type === 'choice' || task.question_type === 'multiple_choice' || task.type === 'ЗАКРЫТЫЙ') && task.options?.length > 0;
  let isCorrect  = false;

  if (isChoice) {
    const sel        = document.querySelector('input[name="repeat_opt"]:checked');
    const val        = sel ? parseInt(sel.value) : -1;
    const correctIdx = resolveCorrectOptionIndex(task);
    isCorrect        = val === correctIdx;
    task.options.forEach((_, i) => {
      const lbl = document.getElementById(`ropt_${i}`);
      if (!lbl) return;
      if (i === correctIdx) lbl.classList.add('correct');
      else if (i === val && !isCorrect) lbl.classList.add('wrong');
      lbl.querySelector('input').disabled = true;
    });
  } else {
    const input   = document.getElementById('repeat-input');
    const given   = normalizeAnswer(input?.value || '');
    const correct = normalizeAnswer(task.answer);
    isCorrect     = given === correct;
    if (input) { input.disabled = true; input.classList.add(isCorrect ? 'correct' : 'wrong'); }
  }

  if (!rs.correctStreak[taskId]) rs.correctStreak[taskId] = 0;

  const feedback = document.getElementById('repeat-feedback');
  const actions  = document.getElementById('repeat-actions');
  feedback.classList.remove('hidden');

  if (isCorrect) {
    rs.removed.push(taskId);
    feedback.className = 'feedback-block correct';
    feedback.innerHTML = '✅ Верно! Задание убрано из повтора.';
    actions.innerHTML = `<button class="btn btn-success" style="margin-top:12px" id="next-btn" onclick="renderRepeatTask()">Следующее →</button>`;
  } else {
    rs.correctStreak[taskId] = 0;
    const displayAnswer = isChoice
      ? getChoiceAnswerText(task)
      : (task.answer || '');
    feedback.className = 'feedback-block wrong';
    feedback.innerHTML = `❌ Неверно. Правильный ответ: <span class="correct-answer">${escapeHtml(displayAnswer)}</span>
      ${task.explanation ? `<div class="cognitive-hint">💡 ${escapeHtml(task.explanation)}</div>` : ''}`;
    actions.innerHTML = `<button class="btn btn-warning" style="margin-top:12px" id="next-btn" onclick="renderRepeatTask()">Понял, далее →</button>`;
  }

  // Функция для раскрытия/скрытия всех ошибок
window.toggleAllMistakes = function() {
  const container = document.getElementById('all-mistakes-container');
  const trigger = document.getElementById('show-more-trigger');
  
  if (!container) return;
  
  const isHidden = container.style.display === 'none';
  
  if (isHidden) {
    container.style.display = 'block';
    if (trigger) trigger.style.display = 'none';
  } else {
    container.style.display = 'none';
    if (trigger) trigger.style.display = 'block';
  }
};

// Добавляем обработчики после рендера (через делегирование)
document.addEventListener('click', function(e) {
  const triggerBtn = e.target.closest('#show-more-trigger');
  const hideBtn = e.target.closest('#hide-mistakes-trigger');
  
  if (triggerBtn) {
    window.toggleAllMistakes();
  }
  if (hideBtn) {
    window.toggleAllMistakes();
  }
});
}

