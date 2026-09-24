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
