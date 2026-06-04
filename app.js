import { initAuth, logout }       from "./auth.js";
import { renderTeacherDashboard } from "./teacher.js";
import { db }                     from "./firebase.js";
import { doc, updateDoc }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state }                  from "./js/state.js";
import { ensureAllProgressEntries, getProgress, saveProgress } from "./js/progress.js";
import { loadProgressFromFirebase, syncAllProgressToFirebase } from "./js/sync.js";
import { initKeyboard }           from "./js/keyboard.js";
import { fetchAsset }             from "./js/fetch-utils.js";
import { goBack }                  from "./js/components.js";

import { renderDashboard }        from "./js/screens/dashboard.js";
import { openCategory, renderCategoryScreen, openSubtopic, renderStageSelect, startStage, goToStage } from "./js/screens/category.js";
import { renderStageExercises, checkExerciseAnswer, skipExercise, nextExercise, stopStage,
         renderStageSummary, startRepeatErrors, renderRepeatTask, checkRepeatAnswer } from "./js/screens/study.js";
import { renderProfileScreen, confirmReset }  from "./js/screens/profile.js";
import { startMiniOge, renderMiniOge, checkMiniOge, submitMiniAnswer, startCategoryTest } from "./js/screens/mini-oge.js";

// ─── WINDOW EXPORTS ────────────────────────────────────────────────────────────
window.renderDashboard      = renderDashboard;
window.openCategory         = openCategory;
window.renderCategoryScreen = renderCategoryScreen;
window.openSubtopic         = openSubtopic;
window.goBack               = goBack;
window.renderStageSelect    = renderStageSelect;
window.startStage           = startStage;
window.goToStage            = goToStage;
window.renderStageExercises = renderStageExercises;
window.checkExerciseAnswer  = checkExerciseAnswer;
window.skipExercise         = skipExercise;
window.nextExercise         = nextExercise;
window.stopStage            = stopStage;
window.renderStageSummary   = renderStageSummary;
window.startRepeatErrors    = startRepeatErrors;
window.renderRepeatTask     = renderRepeatTask;
window.checkRepeatAnswer    = checkRepeatAnswer;

// Legacy stubs (some HTML may still call these)
window.checkPracticeAnswer  = checkExerciseAnswer;
window.skipTask             = skipExercise;
window.nextPracticeTask     = nextExercise;
window.stopPractice         = stopStage;
window.startRepeatMode      = startRepeatErrors;

window.renderProfileScreen  = renderProfileScreen;
window.confirmReset         = confirmReset;
window.startMiniOge         = startMiniOge;
window.renderMiniOge        = renderMiniOge;
window.checkMiniOge         = checkMiniOge;
window.submitMiniAnswer     = submitMiniAnswer;
window.startCategoryTest    = startCategoryTest;

window._navTab = tab => {
  if (tab === 'home') { state.navigationHistory = []; renderDashboard(); }
  else if (tab === 'profile') { renderProfileScreen(); }
};

window._appLogout = () => logout(onAuthed);
window._syncBeforeLogout = async () => { clearTimeout(state._syncTimer); await syncAllProgressToFirebase(); };

// ─── WELCOME OVERLAYS ──────────────────────────────────────────────────────────
function showWelcome(profile) {
  const firstName = profile.name?.split(' ')[1] || profile.name?.split(' ')[0] || 'друг';
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const overlay = document.createElement('div');
  overlay.id = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-box">
      <div class="welcome-emoji">👋</div>
      <h2 class="welcome-title">${greeting}, ${firstName}!</h2>
      <p class="welcome-text">Рады видеть тебя в тренажёре ОГЭ.<br>Изучай грамматику, отслеживай прогресс и готовься к экзамену шаг за шагом.</p>
      <div class="welcome-steps">
        <div class="welcome-step"><span class="welcome-step-icon">📚</span><span>Выбери тему и изучи правило</span></div>
        <div class="welcome-step"><span class="welcome-step-icon">✏️</span><span>Выполни практические задания</span></div>
        <div class="welcome-step"><span class="welcome-step-icon">📈</span><span>Следи за прогрессом в профиле</span></div>
      </div>
      <button class="btn btn-primary welcome-btn" onclick="document.getElementById('welcome-overlay').remove()">Начать обучение →</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
window.showWelcome = showWelcome;

function showTeacherWelcome(profile) {
  const firstName = profile.name?.split(' ')[1] || profile.name?.split(' ')[0] || 'коллега';
  const hour = new Date().getHours();
  const greeting = hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const overlay = document.createElement('div');
  overlay.id = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-box">
      <div class="welcome-emoji">👩‍🏫</div>
      <h2 class="welcome-title">${greeting}, ${firstName}!</h2>
      <p class="welcome-text">Добро пожаловать в кабинет учителя.<br>Добавляйте учеников по уникальному коду и отслеживайте их прогресс.</p>
      <div class="welcome-steps">
        <div class="welcome-step"><span class="welcome-step-icon">🔑</span><span>Попросите ученика сообщить вам его код</span></div>
        <div class="welcome-step"><span class="welcome-step-icon">📊</span><span>Отслеживайте прогресс по каждой теме</span></div>
        <div class="welcome-step"><span class="welcome-step-icon">🎯</span><span>Видите детальную статистику по заданиям</span></div>
      </div>
      <button class="btn btn-primary welcome-btn" onclick="document.getElementById('welcome-overlay').remove()">Перейти в кабинет →</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
window.showTeacherWelcome = showTeacherWelcome;

// ─── AUTH HANDLER ──────────────────────────────────────────────────────────────
async function onAuthed(user, profile) {
  const newSessionKey  = user.uid + '_' + profile.role;
  const lastSessionKey = localStorage.getItem('ogeLastUid');

  if (lastSessionKey !== newSessionKey) {
    localStorage.removeItem('ogeProgress');
    state.categoryIndex      = null;
    state.loadedCats         = {};
    state.currentCategory    = null;
    state.currentSubtopic    = null;
    state.navigationHistory  = [];
    state.practiceState      = null;
    state.miniOgeState       = null;
    state.repeatState        = null;
    state.stageExerciseState = null;
    clearInterval(state.timerInterval);
  }
  localStorage.setItem('ogeLastUid', newSessionKey);

  state.currentUser    = user;
  state.currentProfile = profile;

  document.getElementById('welcome-overlay')?.remove();

  if (profile.role === 'teacher') {
    showTeacherWelcome(profile);
    renderTeacherDashboard(user, profile, onAuthed);
    return;
  }

  try {
    const res = await fetchAsset('data/index.json');
    state.categoryIndex = await res.json();

    await loadProgressFromFirebase();
    ensureAllProgressEntries();
    showWelcome(profile);

    // Sanity-check progress
    const p = getProgress();
    const hasNumericValues = Object.values(p).some(v => typeof v !== 'object' || Array.isArray(v));
    if (hasNumericValues || Object.keys(p).length === 0) {
      const cleaned = {};
      Object.entries(p).forEach(([k, v]) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) cleaned[k] = v;
      });
      saveProgress(cleaned);
      try { await updateDoc(doc(db, 'users', user.uid + '_student'), { progress: cleaned, categoryPercents: {} }); } catch {}
    }

    renderDashboard();
  } catch (e) {
    document.getElementById('app').innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--danger)">
        <h2>Ошибка загрузки данных</h2>
        <p style="color:var(--text-muted);margin-top:12px">Убедитесь, что файл <strong>data/index.json</strong> доступен.</p>
      </div>`;
  }
}

// ─── START ─────────────────────────────────────────────────────────────────────
initKeyboard();
initAuth(onAuthed);
