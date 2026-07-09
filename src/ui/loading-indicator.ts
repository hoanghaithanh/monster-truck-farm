// Kid-friendly loading overlay (ADR 0010 §5): shown only during the bounded
// truck-asset gate (§4.3) while DRIVING is about to start -- a rare, brief
// safety net, not the common path (most everything else upgrades in place
// silently). Plain DOM overlay per ADR 0001 §3, matching hud.ts/builder.ts.
// Driven directly by main.ts's show()/hide() calls rather than GameStore,
// since "is the truck-asset gate pending" is a render-layer/main.ts concern,
// not run state core/ or other modules need to know about.
export function createLoadingIndicator(container: HTMLElement): { show(): void; hide(): void; dispose(): void } {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'none';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(20, 30, 20, 0.55)';
  overlay.style.pointerEvents = 'none';

  const panel = document.createElement('div');
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.alignItems = 'center';
  panel.style.gap = '10px';

  const glyph = document.createElement('div');
  glyph.textContent = '\u{1F69C}';
  glyph.style.font = '48px sans-serif';
  glyph.style.animation = 'monster-truck-farm-loading-bounce 0.6s ease-in-out infinite';
  panel.appendChild(glyph);

  const caption = document.createElement('div');
  caption.textContent = 'Getting your truck ready…';
  caption.style.font = 'bold 18px sans-serif';
  caption.style.color = '#fff';
  caption.style.textShadow = '0 1px 3px rgba(0,0,0,0.6)';
  panel.appendChild(caption);

  overlay.appendChild(panel);
  container.appendChild(overlay);

  // Keyframes injected once per overlay instance -- simplest way to get a
  // bouncing glyph without a build-time CSS pipeline in this project.
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    @keyframes monster-truck-farm-loading-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
  `;
  document.head.appendChild(styleTag);

  return {
    show() {
      overlay.style.display = 'flex';
    },
    hide() {
      overlay.style.display = 'none';
    },
    dispose() {
      styleTag.remove();
      container.removeChild(overlay);
    },
  };
}
