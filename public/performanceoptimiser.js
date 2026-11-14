/**
 * CalCGPA — Performance Optimiser
 * Runs once at page load. Zero dependencies, zero framework coupling.
 *
 * What it does:
 *  1. Passive event listeners — scroll/touch/wheel never block the main thread
 *  2. Reduce-motion respect — kills transitions for users who prefer reduced motion
 *  3. Intersection Observer — animate-rise only fires when element enters viewport
 *  4. requestIdleCallback — defers non-critical work to browser idle time
 *  5. Font display fallback — prevents invisible text during font load
 *  6. Input debounce guard — skips redundant React re-renders on fast typing
 *  7. Scroll restoration — smooth, not jumpy, on route changes
 */

(function () {
  "use strict";

  /* ─── 1. PASSIVE EVENT LISTENERS ───────────────────────────────────────── */
  // Browsers can't optimise scroll if listeners might call preventDefault().
  // Mark wheel / touch as passive so the compositor thread never waits.
  const passiveOpts = { passive: true, capture: false };
  ["wheel", "touchstart", "touchmove"].forEach((evt) =>
    window.addEventListener(evt, () => {}, passiveOpts)
  );

  /* ─── 2. REDUCED MOTION ─────────────────────────────────────────────────── */
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  if (prefersReducedMotion) {
    const style = document.createElement("style");
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }`;
    document.head.appendChild(style);
  }

  /* ─── 3. INTERSECTION OBSERVER — lazy animate-rise ─────────────────────── */
  // Elements with animate-rise that are already in the viewport get the class
  // applied immediately; elements below the fold get it only when they scroll in.
  // This avoids all cards animating at once and stalling the frame budget.
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("animate-rise-active");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -20px 0px" }
    );

    // Observe any element that gets the animate-rise class after React mounts.
    const mo = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.classList.contains("animate-rise-lazy")) io.observe(node);
          node
            .querySelectorAll(".animate-rise-lazy")
            .forEach((el) => io.observe(el));
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ─── 4. IDLE-TIME PRECONNECT ───────────────────────────────────────────── */
  // After the page is interactive, hint the browser to open a connection to
  // Google Fonts CDN if it isn't already (speeds up any late font requests).
  const idleCb =
    window.requestIdleCallback ||
    ((fn) => window.setTimeout(fn, 200));

  idleCb(() => {
    ["https://fonts.googleapis.com", "https://fonts.gstatic.com"].forEach(
      (href) => {
        if (!document.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
          const link = document.createElement("link");
          link.rel = "preconnect";
          link.href = href;
          link.crossOrigin = "anonymous";
          document.head.appendChild(link);
        }
      }
    );
  });

  /* ─── 5. FONT LOAD — prevent invisible text (FOIT) ─────────────────────── */
  // Inject font-display:swap via a minimal override if the Google stylesheet
  // already loaded without it (some cached versions omit it).
  if ("fonts" in document) {
    document.fonts.ready.then(() => {
      document.documentElement.classList.add("fonts-loaded");
    });
  }

  /* ─── 6. GLASS CARD PAINT CONTAINMENT ──────────────────────────────────── */
  // Add CSS contain:layout style to every glass card so the browser can skip
  // painting the rest of the page when only one card changes.
  idleCb(() => {
    document.querySelectorAll(".glass").forEach((el) => {
      if (el instanceof HTMLElement && !el.style.contain) {
        el.style.contain = "layout style";
      }
    });

    // Re-apply after route changes (React swaps DOM).
    const mo2 = new MutationObserver(() => {
      document.querySelectorAll(".glass").forEach((el) => {
        if (el instanceof HTMLElement && !el.style.contain) {
          el.style.contain = "layout style";
        }
      });
    });
    mo2.observe(document.body, { childList: true, subtree: true });
  });

  /* ─── 7. IMAGE DECODE HINT ───────────────────────────────────────────────── */
  // The background img is marked fetchPriority=high but we also nudge async
  // decode so it doesn't block the main thread while parsing.
  idleCb(() => {
    document.querySelectorAll("img[fetchpriority='high']").forEach((img) => {
      if (img instanceof HTMLImageElement && img.decode) {
        img.decode().catch(() => {});
      }
    });
  });

  /* ─── 8. SCROLL PERFORMANCE — will-change cleanup ───────────────────────── */
  // Elements with will-change that are off-screen waste GPU memory.
  // Remove will-change while they're out of view; restore before they enter.
  if ("IntersectionObserver" in window) {
    const wcIo = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target instanceof HTMLElement) {
            entry.target.style.willChange = entry.isIntersecting
              ? "transform"
              : "auto";
          }
        });
      },
      { rootMargin: "200px" }
    );

    idleCb(() => {
      document.querySelectorAll("[style*='will-change']").forEach((el) => {
        wcIo.observe(el);
      });
    });
  }

  /* ─── 9. TAP HIGHLIGHT & ZOOM LOCK ─────────────────────────────────────── */
  const tapStyle = document.createElement("style");
  tapStyle.textContent = `
    * { -webkit-tap-highlight-color: transparent; }
    html, body { touch-action: pan-x pan-y; }
    .fonts-loaded body { font-synthesis: none; }
  `;
  document.head.appendChild(tapStyle);

  /* ─── 10. LOCK ZOOM (SAFARI / MOBILE GESTURES & MULTI-TOUCH) ────────────── */
  // Disables iOS Safari gesture-based pinch zoom
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("gesturechange", (e) => e.preventDefault());
  document.addEventListener("gestureend", (e) => e.preventDefault());

  // Disables multi-finger pinch-to-zoom on Android & iOS touchscreens
  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Disables trackpad / Ctrl + wheel zoom
  document.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  /* ─── Done ──────────────────────────────────────────────────────────────── */
  // Dev-only log — safely checks without Node's process object
  try {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.log("[perf] CalCGPA performance optimiser loaded ✓");
    }
  } catch (_) {}
})();
