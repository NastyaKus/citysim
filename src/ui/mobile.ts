// Телефон: полный экран, альбомная ориентация, подсказка «поверни телефон».
export const isTouch = (() => {
  try {
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  } catch {
    return false;
  }
})();

export function canFullscreen(): boolean {
  const d = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  return !!(d.requestFullscreen || d.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
}

export function isStandalone(): boolean {
  try {
    return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/** включить/выключить полный экран и попробовать зафиксировать альбом */
export async function toggleFullscreen(): Promise<boolean> {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement || d.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else d.webkitExitFullscreen?.();
      return false;
    }
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else el.webkitRequestFullscreen?.();
    await lockLandscape();
    return true;
  } catch {
    return false;
  }
}

export async function lockLandscape() {
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (o?.lock) await o.lock('landscape');
  } catch {
    /* браузер не разрешил — ничего страшного */
  }
}

/** подсказка повернуть телефон в портретной ориентации */
export function setupRotateHint() {
  if (!isTouch) return;
  const hint = document.createElement('div');
  hint.id = 'rotate-hint';
  hint.innerHTML = `<div class="rh-phone">📱</div><div class="rh-text">Поверни телефон горизонтально — так городок помещается целиком</div><button class="btn ghost" id="rh-skip">Всё равно смотреть вертикально</button>`;
  document.getElementById('app')!.append(hint);
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('rotate-dismissed') === '1'; } catch { /* нет хранилища */ }
  const check = () => {
    const portrait = window.innerHeight > window.innerWidth;
    hint.hidden = !portrait || dismissed;
  };
  hint.querySelector<HTMLButtonElement>('#rh-skip')!.onclick = () => {
    dismissed = true;
    try { sessionStorage.setItem('rotate-dismissed', '1'); } catch { /* нет хранилища */ }
    check();
  };
  window.addEventListener('resize', check);
  check();
}
