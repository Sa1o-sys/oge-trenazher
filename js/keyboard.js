export function initKeyboard() {
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;

    if (e.key === 'Enter') {
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        const inputId = document.activeElement?.id;

        if (inputId === 'answer-input') {
          e.preventDefault();
          window.checkExerciseAnswer?.();
          return;
        }
        if (inputId === 'repeat-input') {
          e.preventDefault();
          const taskId = document.activeElement?.dataset?.taskId;
          if (taskId) window.checkRepeatAnswer?.(taskId);
          return;
        }
        return;
      }

      const nextBtn = _findNextBtn();
      if (nextBtn) { e.preventDefault(); nextBtn.click(); }
      return;
    }

    if (e.key === 'ArrowRight') {
      const nextBtn = _findNextBtn();
      if (nextBtn) { e.preventDefault(); nextBtn.click(); }
    }
  });
}

function _findNextBtn() {
  return (
    document.querySelector('#ex-actions .btn-success') ||
    document.querySelector('#ex-actions .btn-warning') ||
    document.querySelector('#repeat-actions .btn-success') ||
    document.querySelector('#repeat-actions .btn-warning')
  );
}
