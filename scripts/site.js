(() => {
  "use strict";

  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const THEME_KEY = "marble-theme";
  const THEME_COLORS = { light: "#faf9f7", dark: "#0a0908" };

  function storedTheme() {
    try {
      const value = localStorage.getItem(THEME_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;

    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute("content", THEME_COLORS[theme]));

    document.querySelectorAll("img[data-light][data-dark]").forEach((img) => {
      const next = theme === "dark" ? img.dataset.dark : img.dataset.light;
      const nextSrcset =
        theme === "dark" ? img.dataset.darkSrcset : img.dataset.lightSrcset;
      if (nextSrcset) {
        img.setAttribute("srcset", nextSrcset);
      } else {
        img.removeAttribute("srcset");
      }
      if (img.getAttribute("src") !== next) img.setAttribute("src", next);
    });

    document.querySelectorAll(".theme-toggle").forEach((button) => {
      button.setAttribute(
        "aria-label",
        theme === "dark" ? "Use light mode" : "Use dark mode"
      );
      button.setAttribute("aria-pressed", String(theme === "dark"));
    });
  }

  applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

  media.addEventListener("change", (event) => {
    if (storedTheme()) return;
    applyTheme(event.matches ? "dark" : "light");
  });

  document.querySelectorAll(".theme-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Private browsing — theme still applies for this page view.
      }
      applyTheme(next);
    });
  });
})();

/* ------------------------------------------------------------------ */
/* Home hero demo: types a note, then reveals the review card.         */
/* The markup already shows the final state, so without JS or with     */
/* reduced motion nothing changes. Animation only runs while the demo  */
/* is on screen and the tab is visible.                                */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const root = document.querySelector("[data-type-demo]");
  if (!root) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const lineNodes = [...root.querySelectorAll(".type-demo-text")];
  const lines = lineNodes.map((node) => node.textContent);
  const reveals = [...root.querySelectorAll(".type-demo-reveal")];
  const caret = document.createElement("span");
  caret.className = "type-demo-caret";

  const HOLD = 3600;
  const steps = [];
  let holdIndex = 0;

  function setPhase(phase) {
    root.dataset.phase = phase;
  }

  function showReveals(count) {
    reveals.forEach((node, index) => node.classList.toggle("is-shown", index < count));
  }

  function fillAll() {
    lineNodes.forEach((node, index) => {
      node.textContent = lines[index];
    });
    caret.remove();
  }

  // Build the loop once: reset → type each line → read → reveal → hold → fade.
  steps.push({ delay: 0, run: () => { fillAll(); lineNodes.forEach((node) => { node.textContent = ""; }); showReveals(0); } });
  steps.push({ delay: 360, run: () => { setPhase("typing"); lineNodes[0].after(caret); } });
  lines.forEach((text, lineIndex) => {
    const node = lineNodes[lineIndex];
    steps.push({ delay: lineIndex === 0 ? 420 : 260, run: () => node.after(caret) });
    for (let i = 1; i <= text.length; i += 1) {
      const pause = text[i - 1] === " " ? 70 : 38 + ((i * 7) % 5) * 6;
      steps.push({ delay: pause, run: () => { node.textContent = text.slice(0, i); } });
    }
  });
  steps.push({ delay: 520, run: () => { caret.remove(); setPhase("parsing"); } });
  steps.push({ delay: 900, run: () => { setPhase("review"); showReveals(1); } });
  for (let count = 2; count <= reveals.length; count += 1) {
    steps.push({ delay: count === reveals.length ? 380 : 260, run: () => showReveals(count) });
  }
  holdIndex = steps.length;
  steps.push({ delay: HOLD, run: () => setPhase("out") });
  // The reset step (index 0) runs 450ms later, while everything is faded out.
  steps[0].delay = 450;

  let index = holdIndex;
  let timer = null;
  let enabled = false;
  let onScreen = false;

  function canRun() {
    return enabled && onScreen && !document.hidden;
  }

  function schedule() {
    if (timer || !canRun()) return;
    const step = steps[index];
    timer = window.setTimeout(() => {
      timer = null;
      step.run();
      index = (index + 1) % steps.length;
      schedule();
    }, step.delay);
  }

  function pause() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = null;
  }

  function enable() {
    enabled = true;
    root.classList.add("is-animated");
    // Start from the finished review, already on screen, so there is no flash.
    fillAll();
    showReveals(reveals.length);
    setPhase("review");
    index = holdIndex;
    schedule();
  }

  function disable() {
    enabled = false;
    pause();
    fillAll();
    showReveals(reveals.length);
    root.classList.remove("is-animated");
    delete root.dataset.phase;
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen) schedule();
        else pause();
      },
      { threshold: 0.15 }
    ).observe(root);
  } else {
    onScreen = true;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else schedule();
  });

  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) disable();
    else enable();
  });

  if (!reducedMotion.matches) enable();
})();

/* ------------------------------------------------------------------ */
/* Motion flag: CSS only prepares one-shot widgets (ring fills, dots)  */
/* in their start state once this script is here to finish them.       */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;

  function sync() {
    root.classList.toggle("motion", !reducedMotion.matches && "IntersectionObserver" in window);
  }

  sync();
  reducedMotion.addEventListener("change", sync);

  const targets = document.querySelectorAll("[data-animate]");
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach((node) => node.classList.add("is-in"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.4 }
  );
  targets.forEach((node) => observer.observe(node));
})();

/* ------------------------------------------------------------------ */
/* Nav: on narrow screens the links live in a sheet under the pill.    */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const nav = document.querySelector(".nav");
  const button = nav && nav.querySelector(".nav-menu");
  const links = nav && nav.querySelector(".nav-links");
  if (!button || !links) return;

  const icon = button.querySelector("use");

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (icon) icon.setAttribute("href", open ? "/icons.svg#i-close" : "/icons.svg#i-menu");
  }

  button.addEventListener("click", () => setOpen(!nav.classList.contains("is-open")));
  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (nav.classList.contains("is-open") && !nav.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      button.focus();
    }
  });
  window.matchMedia("(min-width: 721px)").addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });
})();

/* ------------------------------------------------------------------ */
/* Tour: Add / Log / Progress. The track is a native scroll-snap       */
/* carousel, so it swipes without JS; this adds the tabs, keeps them   */
/* in sync, and autoplays while the tour is on screen until someone    */
/* touches it.                                                         */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const tour = document.querySelector("[data-tour]");
  if (!tour) return;

  const track = tour.querySelector("[data-tour-track]");
  const slides = [...track.children];
  const tabs = [...tour.querySelectorAll("[data-tour-tab]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DURATION = 6000;

  let active = 0;
  let timer = null;
  let onScreen = false;
  let autoplay = !reducedMotion.matches;
  let programmatic = false;

  tour.style.setProperty("--tour-duration", `${DURATION}ms`);

  function mark(index) {
    active = index;
    tabs.forEach((tab, i) => tab.setAttribute("aria-current", String(i === index)));
    slides.forEach((slide, i) => slide.toggleAttribute("inert", i !== index));
  }

  function restartProgress() {
    tour.classList.remove("is-playing");
    if (!autoplay || !onScreen || document.hidden) return;
    void tour.offsetWidth; // restart the CSS fill on the new tab
    tour.classList.add("is-playing");
  }

  function schedule() {
    window.clearTimeout(timer);
    timer = null;
    restartProgress();
    if (!autoplay || !onScreen || document.hidden) return;
    timer = window.setTimeout(() => goTo((active + 1) % slides.length), DURATION);
  }

  function goTo(index) {
    programmatic = true;
    track.scrollTo({
      left: slides[index].offsetLeft,
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
    mark(index);
    schedule();
    window.setTimeout(() => {
      programmatic = false;
    }, 700);
  }

  function stopAutoplay() {
    if (!autoplay) return;
    autoplay = false;
    window.clearTimeout(timer);
    tour.classList.remove("is-playing");
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      stopAutoplay();
      goTo(index);
    });
  });

  // A swipe or a drag on the track is the visitor taking over.
  ["pointerdown", "wheel", "touchstart"].forEach((type) =>
    track.addEventListener(type, () => {
      if (!programmatic) stopAutoplay();
    }, { passive: true })
  );

  // Keep the tabs in step with manual swipes.
  if ("IntersectionObserver" in window) {
    const slideObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || programmatic) return;
          const index = slides.indexOf(entry.target);
          if (index !== active) {
            mark(index);
            schedule();
          }
        });
      },
      { root: track, threshold: 0.6 }
    );
    slides.forEach((slide) => slideObserver.observe(slide));

    new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        schedule();
      },
      { threshold: 0.35 }
    ).observe(tour);
  }

  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) stopAutoplay();
  });

  mark(0);
})();

/* ------------------------------------------------------------------ */
/* Live Activity tile: a rest timer that counts down while on screen.  */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll("[data-countdown]").forEach((node) => {
    const total = Number(node.dataset.countdown) || 90;
    const ring = node.closest(".island")?.querySelector(".island-ring");
    let left = total;
    let timer = null;
    let onScreen = false;

    function render() {
      const minutes = Math.floor(left / 60);
      const seconds = String(left % 60).padStart(2, "0");
      node.textContent = `${minutes}:${seconds}`;
      ring?.style.setProperty("--remaining", String((left / total) * 100));
    }

    function tick() {
      left = left <= 0 ? total : left - 1;
      render();
    }

    function update() {
      const run = onScreen && !document.hidden && !reducedMotion.matches;
      if (run && !timer) timer = window.setInterval(tick, 1000);
      if (!run && timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    render();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        update();
      }).observe(node);
    }
    document.addEventListener("visibilitychange", update);
    reducedMotion.addEventListener("change", update);
  });
})();
