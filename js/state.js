export const state = {
  currentUser:       null,
  currentProfile:    null,
  categoryIndex:     null,   // from public/data/index.json (fast, metadata only)
  loadedCats:        {},     // catId -> full category object (lazy)
  currentCategory:   null,
  currentSubtopic:   null,
  currentStageKey:   'razberis',
  practiceState:     null,
  miniOgeState:      null,
  repeatState:       null,
  stageExerciseState: null,
  timerInterval:     null,
  navigationHistory: [],
  _syncTimer:        null,
};
