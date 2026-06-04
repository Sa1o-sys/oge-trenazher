import { state }              from './state.js';
import { getProgress, getMiniOgeHistory, saveProgress, ensureAllProgressEntries, getCategoryPercent } from './progress.js';
import { db }                from '../firebase.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export function scheduleSync() {
  clearTimeout(state._syncTimer);
  state._syncTimer = setTimeout(() => syncAllProgressToFirebase(), 1500);
}

export async function syncAllProgressToFirebase() {
  if (!state.currentUser) return;
  try {
    const progress       = getProgress();
    const miniOgeHistory = getMiniOgeHistory();
    const docRef         = doc(db, "users", state.currentUser.uid + "_student");
    const categoryPercents = {};
    const cats = state.categoryIndex?.categories || [];
    cats.forEach(cat => { categoryPercents[cat.id] = getCategoryPercent(cat); });

    await updateDoc(docRef, { progress, categoryPercents, miniOgeHistory, lastSeenAt: Date.now() });
  } catch (e) {
    if (e.code === "not-found") {
      try {
        const { setDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await setDoc(doc(db, "users", state.currentUser.uid + "_student"),
          { progress: getProgress(), miniOgeHistory: getMiniOgeHistory(), lastSeenAt: Date.now() },
          { merge: true });
      } catch {}
    }
    console.warn("Firebase sync error:", e.message);
  }
}

export async function loadProgressFromFirebase() {
  if (!state.currentUser) return;
  try {
    const snap = await getDoc(doc(db, "users", state.currentUser.uid + "_student"));
    if (!snap.exists()) return;
    const data = snap.data();

    if (Array.isArray(data.miniOgeHistory)) {
      const { saveMiniOgeHistory } = await import('./progress.js');
      saveMiniOgeHistory(data.miniOgeHistory);
    }

    const cloud = data.progress;
    if (cloud && typeof cloud === 'object' && !Array.isArray(cloud) && Object.keys(cloud).length > 0) {
      const validated = {};
      Object.entries(cloud).forEach(([k, v]) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) validated[k] = v;
      });
      saveProgress(validated);
      ensureAllProgressEntries();
      console.log("✅ Прогресс загружен из облака");
    }
  } catch (e) {
    console.warn("Firebase load error:", e.message);
  }
}
