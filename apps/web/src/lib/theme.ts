export type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'synapse-glass-theme';
const CLEAR_KEY = 'synapse-glass-clear';

export function getCurrentTheme(): ThemeMode {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: ThemeMode, persist = true): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0a0f14' : '#eef2f5');
  }
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }
}

export function toggleThemeWithTransition(
  anchorEl: HTMLElement | null,
  onAfterApply?: (next: ThemeMode) => void
): ThemeMode {
  const next: ThemeMode = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => {
      ready: Promise<void>;
      finished: Promise<void>;
    };
  };

  const commit = () => {
    applyTheme(next, true);
    onAfterApply?.(next);
  };

  if (!doc.startViewTransition || reduceMotion || !anchorEl) {
    commit();
    return next;
  }

  const rect = anchorEl.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const end = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  const root = document.documentElement;
  root.classList.add('vt-theme');
  const transition = doc.startViewTransition(commit);

  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        {
          duration: 700,
          easing: 'cubic-bezier(.4,0,.2,1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    })
    .catch(() => {
      // fallback silently if view transition fails
    });

  transition.finished.finally(() => {
    root.classList.remove('vt-theme');
  });

  return next;
}

export function getCurrentClearPercent(): number {
  try {
    const saved = localStorage.getItem(CLEAR_KEY);
    if (saved !== null && !Number.isNaN(Number(saved))) {
      return Math.max(0, Math.min(100, Math.round(Number(saved))));
    }
  } catch {
    // ignore storage errors
  }
  const raw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--clear'));
  if (!Number.isNaN(raw)) {
    return Math.max(0, Math.min(100, Math.round(raw * 100)));
  }
  return 45;
}

export function applyClearPercent(percent: number, persist = true): number {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  document.documentElement.style.setProperty('--clear', (clamped / 100).toFixed(2));
  if (persist) {
    try {
      localStorage.setItem(CLEAR_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
  }
  return clamped;
}

export function installGlassPointerGlow(): () => void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let rafId = 0;
  let lastEvent: PointerEvent | null = null;

  const onPointerMove = (e: PointerEvent) => {
    lastEvent = e;
    if (rafId || reduceMotion.matches || e.pointerType === 'touch') return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!lastEvent || !(lastEvent.target instanceof Element)) return;
      const glassEl = lastEvent.target.closest('.glass');
      if (!(glassEl instanceof HTMLElement)) return;
      const rect = glassEl.getBoundingClientRect();
      glassEl.style.setProperty('--mx', `${lastEvent.clientX - rect.left}px`);
      glassEl.style.setProperty('--my', `${lastEvent.clientY - rect.top}px`);
    });
  };

  document.addEventListener('pointermove', onPointerMove, { passive: true });
  return () => {
    document.removeEventListener('pointermove', onPointerMove);
    if (rafId) cancelAnimationFrame(rafId);
  };
}
