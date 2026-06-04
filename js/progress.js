import { state }      from './state.js';
import { STAGE_ORDER } from './constants.js';

export function getProgress() {
  try {
    const raw = localStorage.getItem('ogeProgress');
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (typeof p !== 'object' || Array.isArray(p) || p === null) {
      localStorage.removeItem('ogeProgress');
      return {};
    }
    return p;
  } catch {
    localStorage.removeItem('ogeProgress');
    return {};
  }
}

export function saveProgress(p) {
  localStorage.setItem('ogeProgress', JSON.stringify(p));
}

export function getMiniOgeHistory() {
  try {
    const p = JSON.parse(localStorage.getItem('ogeMiniOgeHistory') || '[]');
    return Array.isArray(p) ? p : [];
  } catch {
    localStorage.removeItem('ogeMiniOgeHistory');
    return [];
  }
}

export function saveMiniOgeHistory(h) {
  localStorage.setItem('ogeMiniOgeHistory', JSON.stringify(Array.isArray(h) ? h : []));
}

export function rememberMiniOgeAttempt(score, total, variantId) {
  const h = getMiniOgeHistory();
  h.push({ id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, variantId, score, total, createdAt: Date.now() });
  saveMiniOgeHistory(h.slice(-100));
}

function createEmptyStageProgress() {
  return {
    razberis: { correctIds: [], wrongIds: [], skippedIds: [] },
    rule:     { correctIds: [], wrongIds: [], skippedIds: [] },
    practice: { correctIds: [], wrongIds: [], skippedIds: [] },
    test:     { correctIds: [], wrongIds: [], skippedIds: [] },
  };
}

function normalizeIds(v) {
  return Array.isArray(v) ? [...new Set(v.filter(id => typeof id === 'string' && id.trim()))] : [];
}

function normalizeSubtopicProgress(raw) {
  const safe = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out  = { unlockedStages: ['razberis'], stageProgress: createEmptyStageProgress() };

  STAGE_ORDER.forEach(sk => {
    const sd = safe.stageProgress?.[sk];
    if (sd && typeof sd === 'object' && !Array.isArray(sd)) {
      out.stageProgress[sk] = {
        correctIds: normalizeIds(sd.correctIds),
        wrongIds:   normalizeIds(sd.wrongIds),
        skippedIds: normalizeIds(sd.skippedIds),
      };
    }
  });

  const ul = Array.isArray(safe.unlockedStages)
    ? safe.unlockedStages.filter(k => STAGE_ORDER.includes(k))
    : [];
  out.unlockedStages = ul.includes('razberis') ? [...new Set(ul)] : ['razberis', ...new Set(ul)];
  return out;
}

export function getSubtopicProgress(catId, subId) {
  const p = getProgress();
  if (typeof p[catId] !== 'object' || p[catId] === null || Array.isArray(p[catId])) p[catId] = {};
  const normalized = normalizeSubtopicProgress(p[catId]?.[subId]);
  if (JSON.stringify(p[catId]?.[subId]) !== JSON.stringify(normalized)) {
    p[catId][subId] = normalized;
    saveProgress(p);
  }
  return normalized;
}

export function setSubtopicProgress(catId, subId, data) {
  const p = getProgress();
  if (typeof p[catId] !== 'object' || p[catId] === null || Array.isArray(p[catId])) p[catId] = {};
  p[catId][subId] = data;
  saveProgress(p);
  scheduleSync();
}

export function getStagePercent(catId, subId, stageKey) {
  const sp  = getSubtopicProgress(catId, subId);
  const cat = state.loadedCats[catId] || (state.categoryIndex?.categories || []).find(c => c.id === catId);
  if (!cat) return 0;
  const sub = (cat.subtopics || []).find(s => s.id === subId);
  if (!sub) return 0;
  const total = sub.stages
    ? (sub.stages?.[stageKey] || []).length
    : (sub.stageCounts?.[stageKey] || 0);
  if (!total) return 0;
  return Math.round(((sp.stageProgress?.[stageKey]?.correctIds || []).length / total) * 100);
}

export function checkUnlocks(catId, subId) {
  const STAGE_NEXT = { razberis: 'rule', rule: 'practice', practice: 'test' };
  const sp      = getSubtopicProgress(catId, subId);
  const unlocked = [...(sp.unlockedStages || ['razberis'])];
  let changed    = false;

  STAGE_ORDER.forEach(sk => {
    const next = STAGE_NEXT[sk];
    if (!next || unlocked.includes(next)) return;
    if (getStagePercent(catId, subId, sk) >= 40) { unlocked.push(next); changed = true; }
  });

  if (changed) {
    sp.unlockedStages = unlocked;
    setSubtopicProgress(catId, subId, sp);
  }
  return unlocked;
}

export function getCategoryPercent(cat) {
  let total = 0, done = 0;
  (cat.subtopics || []).forEach(sub => {
    STAGE_ORDER.forEach(sk => {
      total += sub.stages ? (sub.stages?.[sk] || []).length : (sub.stageCounts?.[sk] || 0);
      const sp = getSubtopicProgress(cat.id, sub.id);
      done  += (sp.stageProgress?.[sk]?.correctIds || []).length;
    });
  });
  return total ? Math.round((done / total) * 100) : 0;
}

export function resetAllProgress() {
  localStorage.removeItem('ogeProgress');
  ensureAllProgressEntries();
  if (state.currentUser) {
    import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js").then(({ doc, updateDoc }) => {
      import('../firebase.js').then(({ db }) => {
        updateDoc(doc(db, "users", state.currentUser.uid + "_student"), { progress: getProgress(), categoryPercents: {} })
          .catch(() => {});
      });
    });
  }
}

export function ensureAllProgressEntries() {
  const cats = state.categoryIndex?.categories || [];
  if (!cats.length) return;
  const p = getProgress();
  let changed = false;
  cats.forEach(cat => {
    if (!p[cat.id] || typeof p[cat.id] !== 'object' || Array.isArray(p[cat.id])) {
      p[cat.id] = {};
      changed = true;
    }
    (cat.subtopics || []).forEach(sub => {
      const normalized = normalizeSubtopicProgress(p[cat.id][sub.id]);
      if (JSON.stringify(p[cat.id]?.[sub.id]) !== JSON.stringify(normalized)) {
        p[cat.id][sub.id] = normalized;
        changed = true;
      }
    });
  });
  if (changed) saveProgress(p);
}

function scheduleSync() {
  import('./sync.js').then(m => m.scheduleSync());
}
