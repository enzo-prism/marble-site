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
/* Home hero demo: types a note, reads it, and flies each recognised   */
/* part into its row of the review card. The examples (in the page's   */
/* #demo-examples JSON) are real notes with the review the 2.7 app     */
/* shows for them. The demo cycles through them; the "Try" chips jump  */
/* to one and stop the cycling.                                        */
/*                                                                     */
/* The markup already shows the first example's finished review, so   */
/* without JS or with Reduce Motion nothing moves. Animation only runs */
/* while the demo is on screen and the tab is visible.                 */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const root = document.querySelector("[data-type-demo]");
  if (!root) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stage = root.querySelector(".type-demo-stage");
  const lineNodes = [...root.querySelectorAll(".type-demo-text")];
  const head = root.querySelector(".type-demo-head");
  const rowsList = root.querySelector(".type-demo-rows");
  const button = root.querySelector(".type-demo-button");
  const caption = root.querySelector("figcaption");
  const visual = root.closest(".hero-visual");
  const chipB = visual?.querySelector(".float-chip-b");
  const tryBar = visual?.querySelector("[data-try]");
  const tryChips = tryBar ? [...tryBar.querySelectorAll("[data-example]")] : [];
  const announcer = visual?.querySelector("[data-try-status]");

  let examples = [];
  try {
    examples = JSON.parse(document.getElementById("demo-examples")?.textContent || "[]");
  } catch {
    examples = [];
  }
  if (!examples.length) return;

  const caret = document.createElement("span");
  caret.className = "type-demo-caret";

  const HOLD = 4200;
  const escapeHtml = (text) =>
    String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  let current = 0;
  let steps = [];
  let index = 0;
  let timer = null;
  let enabled = false;
  let onScreen = false;
  let cycling = true;
  let flights = [];

  const setPhase = (phase) => {
    root.dataset.phase = phase;
  };

  // --- rendering ------------------------------------------------------

  function renderReview(example) {
    head.innerHTML = `<strong>${escapeHtml(example.title)}</strong> &middot; ${escapeHtml(example.meta)}`;
    rowsList.innerHTML = example.rows
      .map((row) => `<li class="type-demo-row type-demo-reveal">
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.value)}</span>${row.note ? `
          <small>${escapeHtml(row.note)}</small>` : ""}
        </li>`)
      .join("");
    button.textContent = example.button;
    if (chipB && example.chip) {
      chipB.lastChild.textContent = example.chip;
    }
  }

  function reveals() {
    return [head, ...rowsList.querySelectorAll(".type-demo-row"), button];
  }

  function showReveals(count) {
    reveals().forEach((node, i) => node.classList.toggle("is-shown", i < count));
  }

  function fillLines(example) {
    lineNodes.forEach((node, i) => {
      node.textContent = example.lines[i] || "";
    });
    caret.remove();
  }

  // wrap each recognised part of a typed line so it can light up and fly
  function highlightTokens(example) {
    let count = 0;
    lineNodes.forEach((node, i) => {
      const text = example.lines[i] || "";
      const tokens = (example.tokens && example.tokens[i]) || [];
      let html = "";
      let cursor = 0;
      tokens
        .map((token) => ({ token, at: text.indexOf(token) }))
        .filter((t) => t.at >= 0)
        .sort((a, b) => a.at - b.at)
        .forEach(({ token, at }) => {
          if (at < cursor) return;
          count += 1;
          html += escapeHtml(text.slice(cursor, at));
          html += `<span class="tok" data-line="${i}" style="--t:${count}">${escapeHtml(token)}</span>`;
          cursor = at + token.length;
        });
      html += escapeHtml(text.slice(cursor));
      node.innerHTML = html;
    });
  }

  // position of an element inside the (possibly tilted) stage, from
  // layout offsets so the tilt's transform doesn't skew the maths
  function local(el) {
    let x = 0;
    let y = 0;
    let node = el;
    while (node && node !== stage) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent;
    }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  function clearFlights() {
    flights.forEach((f) => f.remove());
    flights = [];
  }

  // the signature moment: a recognised part lifts off the note and lands
  // in the review row it became
  function fly(rowIndex, example) {
    const row = rowsList.querySelectorAll(".type-demo-row")[rowIndex];
    const spec = example.rows[rowIndex];
    if (!row || !spec || !stage.animate) return;
    const target = row.querySelector("span");
    const to = local(target);
    const tokens = [...root.querySelectorAll(`.tok[data-line="${spec.line}"]`)]
      .filter((tok) => !spec.tokens || spec.tokens.includes(tok.textContent));
    tokens.forEach((tok, i) => {
      const from = local(tok);
      const ghost = document.createElement("span");
      ghost.className = "tok-flight";
      ghost.setAttribute("aria-hidden", "true");
      ghost.textContent = tok.textContent;
      ghost.style.left = `${from.x}px`;
      ghost.style.top = `${from.y}px`;
      stage.appendChild(ghost);
      flights.push(ghost);
      const dx = to.x + to.w - from.w - from.x - i * 6;
      const dy = to.y + (to.h - from.h) / 2 - from.y;
      const lift = Math.min(-26, dy * -0.18);
      const animation = ghost.animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 0, offset: 0 },
          { transform: `translate(${dx * 0.12}px, ${lift}px) scale(1.06)`, opacity: 1, offset: 0.22 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.86)`, opacity: 0.9, offset: 0.88 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 0, offset: 1 },
        ],
        { duration: 760, delay: i * 70, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" }
      );
      animation.onfinish = () => ghost.remove();
    });
    target.classList.remove("is-landed");
    window.setTimeout(() => {
      target.classList.add("is-landed");
    }, 620 + Math.max(0, tokens.length - 1) * 70);
  }

  // --- the timeline ---------------------------------------------------

  function build(example) {
    const list = [];
    list.push({ delay: 450, run: () => {
      clearFlights();
      renderReview(example);
      lineNodes.forEach((node) => { node.textContent = ""; });
      showReveals(0);
    } });
    list.push({ delay: 320, run: () => { setPhase("typing"); lineNodes[0].after(caret); } });
    example.lines.forEach((text, lineIndex) => {
      const node = lineNodes[lineIndex];
      if (!node) return;
      list.push({ delay: lineIndex === 0 ? 380 : 240, run: () => node.after(caret) });
      for (let i = 1; i <= text.length; i += 1) {
        const pause = text[i - 1] === " " ? 66 : 34 + ((i * 7) % 5) * 6;
        list.push({ delay: pause, run: () => { node.textContent = text.slice(0, i); } });
      }
    });
    list.push({ delay: 480, run: () => { caret.remove(); highlightTokens(example); setPhase("parsing"); } });
    list.push({ delay: 950, run: () => { setPhase("review"); showReveals(1); } });
    example.rows.forEach((_, rowIndex) => {
      list.push({ delay: rowIndex === 0 ? 240 : 420, run: () => { showReveals(rowIndex + 2); fly(rowIndex, example); } });
    });
    list.push({ delay: 900, run: () => showReveals(example.rows.length + 2) });
    const hold = list.length;
    list.push({ delay: HOLD, run: () => {
      setPhase("out");
      if (cycling) {
        current = (current + 1) % examples.length;
        markChip();
        steps = build(examples[current]);
        index = 0;
      }
    } });
    list.hold = hold;
    return list;
  }

  function canRun() {
    return enabled && onScreen && !document.hidden;
  }

  function schedule() {
    if (timer || !canRun()) return;
    const step = steps[index];
    timer = window.setTimeout(() => {
      timer = null;
      const before = steps;
      step.run();
      // the last step may have swapped in the next example's timeline
      if (steps === before) index = (index + 1) % steps.length;
      schedule();
    }, step.delay);
  }

  function pause() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = null;
  }

  function showFinished(example) {
    clearFlights();
    renderReview(example);
    fillLines(example);
    showReveals(Infinity);
    root.querySelectorAll(".type-demo-row span").forEach((s) => s.classList.add("is-landed"));
  }

  function markChip(ms) {
    tryChips.forEach((chip) => {
      const on = Number(chip.dataset.example) === current;
      chip.setAttribute("aria-pressed", String(on));
    });
    tryBar?.classList.toggle("is-cycling", cycling && enabled);
    if (tryBar) {
      tryBar.style.setProperty("--try-duration", `${ms || duration(examples[current])}ms`);
      // restart the active chip's progress fill
      tryBar.classList.remove("is-ticking");
      void tryBar.offsetWidth;
      if (cycling && enabled) tryBar.classList.add("is-ticking");
    }
  }

  function duration(example) {
    return build(example).reduce((sum, step) => sum + step.delay, 0);
  }

  // the review keeps the tallest example's height, so swapping examples
  // never moves anything below it
  const body = root.querySelector(".type-demo-body");
  function lockHeight() {
    if (!body) return;
    root.style.removeProperty("--review-h");
    let tallest = 0;
    examples.forEach((example) => {
      renderReview(example);
      showReveals(Infinity);
      tallest = Math.max(tallest, body.offsetHeight);
    });
    root.style.setProperty("--review-h", `${tallest}px`);
    renderReview(examples[current]);
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!enabled) return;
      const shown = rowsList.querySelectorAll(".type-demo-row.is-shown").length;
      lockHeight();
      showReveals(shown ? shown + 1 : 0);
      root.querySelectorAll(".type-demo-row span").forEach((s) => s.classList.add("is-landed"));
    }, 200);
  });

  function enable() {
    enabled = true;
    root.classList.add("is-animated");
    tryBar?.removeAttribute("hidden");
    lockHeight();
    // start from the finished review that's already on screen: no flash
    showFinished(examples[current]);
    setPhase("review");
    steps = build(examples[current]);
    index = steps.hold;
    markChip(HOLD);
    schedule();
  }

  function disable() {
    enabled = false;
    pause();
    showFinished(examples[current]);
    root.classList.remove("is-animated");
    delete root.dataset.phase;
    markChip();
  }

  // Try chips: jump to an example and keep it
  tryChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const next = Number(chip.dataset.example);
      cycling = false;
      current = next;
      const example = examples[current];
      if (caption) caption.textContent = example.caption;
      if (announcer) announcer.textContent = `${example.label}: ${example.caption}`;
      if (!enabled) {
        showFinished(example);
        markChip();
        return;
      }
      pause();
      setPhase("out");
      steps = build(example);
      // replaying the chosen note keeps looping just that one
      steps[steps.length - 1].run = () => setPhase("out");
      index = 0;
      markChip();
      schedule();
    });
  });

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

  tryBar?.removeAttribute("hidden");
  if (tryBar && visual && "ResizeObserver" in window) {
    new ResizeObserver(() => {
      const margin = parseFloat(getComputedStyle(tryBar).marginTop) || 0;
      visual.style.setProperty("--try-h", `${tryBar.offsetHeight + margin}px`);
    }).observe(tryBar);
  }
  if (!reducedMotion.matches) enable();
  else markChip();
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
  // a tap anywhere outside the pill and its sheet closes it, the scrim included
  const inner = nav.querySelector(".nav-inner") || nav;
  document.addEventListener("click", (event) => {
    if (nav.classList.contains("is-open") && !inner.contains(event.target)) setOpen(false);
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
    node.addEventListener("marble:add-time", (event) => {
      left = Math.min(total, left + (Number(event.detail) || 0));
      render();
    });
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

/* ------------------------------------------------------------------ */
/* Pointer polish, for a real mouse only and never with Reduce Motion: */
/* - the hero demo tilts toward the pointer, with a soft glare;        */
/* - cards carry a spotlight and a lit edge under the pointer;         */
/* - large App Store buttons lean slightly toward the pointer.         */
/* All of it is styling on top of finished content.                    */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const enabled = () => finePointer.matches && !reducedMotion.matches;

  // Demo tilt
  const demo = document.querySelector("[data-type-demo]");
  const stage = demo && demo.querySelector(".type-demo-stage");
  const host = demo && demo.closest(".hero");
  if (demo && stage && host) {
    const glare = document.createElement("span");
    glare.className = "type-demo-glare";
    glare.setAttribute("aria-hidden", "true");
    stage.appendChild(glare);

    let frame = 0;
    let pending = null;

    const apply = () => {
      frame = 0;
      if (!pending) return;
      const rect = stage.getBoundingClientRect();
      const x = (pending.x - rect.left) / rect.width;
      const y = (pending.y - rect.top) / rect.height;
      const cx = Math.max(-1, Math.min(1, x * 2 - 1));
      const cy = Math.max(-1, Math.min(1, y * 2 - 1));
      demo.style.setProperty("--ry", `${(cx * 7).toFixed(2)}deg`);
      demo.style.setProperty("--rx", `${(-cy * 5).toFixed(2)}deg`);
      demo.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      demo.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    };

    host.addEventListener("pointermove", (event) => {
      if (!enabled()) return;
      pending = { x: event.clientX, y: event.clientY };
      demo.classList.add("is-tilting");
      if (!frame) frame = requestAnimationFrame(apply);
    });

    host.addEventListener("pointerleave", () => {
      pending = null;
      demo.classList.remove("is-tilting");
      demo.style.removeProperty("--rx");
      demo.style.removeProperty("--ry");
    });
  }

  // Card spotlight
  const SPOT_TARGETS = ".bento-tile, .switch-list a, .feature-item, .guide-list a";
  const cards = [...document.querySelectorAll(SPOT_TARGETS)];
  if (cards.length) {
    cards.forEach((card) => {
      card.classList.add("has-spot");
      const glow = document.createElement("span");
      glow.className = "spot-glow";
      glow.setAttribute("aria-hidden", "true");
      card.prepend(glow);
    });

    let lit = null;
    document.addEventListener("pointermove", (event) => {
      if (!enabled()) return;
      const card = event.target instanceof Element ? event.target.closest(".has-spot") : null;
      if (lit && lit !== card) lit.classList.remove("is-lit");
      lit = card;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
      card.classList.add("is-lit");
    }, { passive: true });

    document.addEventListener("pointerleave", () => {
      if (lit) lit.classList.remove("is-lit");
      lit = null;
    });
  }

  // Magnetic App Store buttons
  document.querySelectorAll(".btn-large").forEach((button) => {
    const zone = button.parentElement;
    zone.addEventListener("pointermove", (event) => {
      if (!enabled()) return;
      const rect = button.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const reach = Math.max(rect.width, 160);
      const pull = Math.max(0, 1 - Math.hypot(dx, dy) / reach);
      button.style.setProperty("--mag-x", `${(dx * 0.18 * pull).toFixed(1)}px`);
      button.style.setProperty("--mag-y", `${(dy * 0.28 * pull).toFixed(1)}px`);
    });
    zone.addEventListener("pointerleave", () => {
      button.style.removeProperty("--mag-x");
      button.style.removeProperty("--mag-y");
    });
  });
})();

/* ------------------------------------------------------------------ */
/* Living details. Each one is decoration on finished markup and stops */
/* under Reduce Motion:                                                */
/* - looping widgets rest while off screen (.is-offscreen);            */
/* - the formats ticker speeds up, and turns back, with the scroll;    */
/* - the weekly-goal widget ticks a session off, over and over;        */
/* - the Live Activity taps +30s now and then, like a real rest.       */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const hasIO = "IntersectionObserver" in window;

  // Rest off screen
  const live = document.querySelectorAll(".bento-tile, .privacy-orbit, .cta-icon, .hero-visual, .marquee");
  if (hasIO) {
    const restObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.target.classList.toggle("is-offscreen", !entry.isIntersecting));
    }, { rootMargin: "20% 0px" });
    live.forEach((node) => restObserver.observe(node));
  }

  // Ticker with the scroll
  const marquee = document.querySelector(".marquee");
  const rows = marquee ? [...marquee.querySelectorAll(".marquee-row")] : [];
  if (rows.length) {
    let rate = 1;
    let target = 1;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let frame = 0;
    let visible = false;

    const animations = () => rows.flatMap((row) => row.getAnimations());

    const loop = () => {
      frame = 0;
      target += (1 - target) * 0.04;
      rate += (target - rate) * 0.12;
      animations().forEach((animation) => {
        animation.playbackRate = rate;
      });
      if (Math.abs(rate - 1) > 0.01 || Math.abs(target - 1) > 0.01) frame = requestAnimationFrame(loop);
    };

    window.addEventListener("scroll", () => {
      const now = performance.now();
      const dy = window.scrollY - lastY;
      const dt = Math.max(16, now - lastT);
      lastY = window.scrollY;
      lastT = now;
      if (!visible || reducedMotion.matches) return;
      // px per ms → a few times faster, the other way when scrolling up
      const push = Math.max(-6, Math.min(7, (dy / dt) * 3.2));
      target = Math.abs(push) > Math.abs(target - 1) ? 1 + push : target;
      if (!frame) frame = requestAnimationFrame(loop);
    }, { passive: true });

    if (hasIO) {
      new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
      }).observe(marquee);
    }
  }

  // Weekly goal: 2 of 4 → 3 of 4, again and again while it's in view
  const goal = document.querySelector(".goal-widget");
  if (goal && hasIO) {
    const count = goal.querySelector(".goal-ring strong");
    const label = goal.querySelector(".goal-text span");
    const third = goal.querySelectorAll(".goal-days li")[2];
    const ring = goal.querySelector(".goal-ring");
    let timer = null;
    let done = true;

    const set = (complete) => {
      done = complete;
      goal.classList.toggle("is-behind", !complete);
      count.textContent = complete ? "3/4" : "2/4";
      label.textContent = complete ? "1 session to go" : "2 sessions to go";
      third.classList.toggle("done", complete);
      if (complete) {
        third.classList.remove("is-pop");
        void third.offsetWidth;
        third.classList.add("is-pop");
        ring.classList.remove("is-pop");
        void ring.offsetWidth;
        ring.classList.add("is-pop");
      }
    };

    const cycle = () => {
      set(!done);
      timer = window.setTimeout(cycle, done ? 4200 : 1600);
    };

    new IntersectionObserver((entries) => {
      const inView = entries.some((entry) => entry.isIntersecting);
      if (inView && !timer && !reducedMotion.matches && document.documentElement.classList.contains("motion")) {
        timer = window.setTimeout(cycle, 3200);
      } else if (!inView && timer) {
        window.clearTimeout(timer);
        timer = null;
        set(true);
      }
    }, { threshold: 0.6 }).observe(goal);

    reducedMotion.addEventListener("change", () => {
      if (!reducedMotion.matches) return;
      window.clearTimeout(timer);
      timer = null;
      set(true);
    });
  }

  // Live Activity: a tap on +30s every so often
  const plus = document.querySelector(".island-controls span");
  const clock = document.querySelector("[data-countdown]");
  if (plus && clock && hasIO) {
    let timer = null;
    const press = () => {
      plus.classList.remove("is-pressed");
      void plus.offsetWidth;
      plus.classList.add("is-pressed");
      clock.dispatchEvent(new CustomEvent("marble:add-time", { detail: 30 }));
      timer = window.setTimeout(press, 9000);
    };
    new IntersectionObserver((entries) => {
      const inView = entries.some((entry) => entry.isIntersecting);
      if (inView && !timer && !reducedMotion.matches) timer = window.setTimeout(press, 5200);
      if (!inView && timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    }, { threshold: 0.6 }).observe(plus);
  }
})();

/* ------------------------------------------------------------------ */
/* Product story: the phone stays pinned while the page scrolls, and   */
/* each step of the track plays one moment of the app. Progress is     */
/* scrubbed by the scroll, so it goes as fast or as slow as you do.    */
/* Without JS the story is a plain list beside the first screen.       */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const story = document.querySelector("[data-story]");
  if (!story) return;

  const track = story.querySelector(".story-track");
  const steps = [...story.querySelectorAll(".story-step")];
  const tabs = [...story.querySelectorAll("[data-story-tab]")];
  const tabBar = story.querySelector(".story-tabs");
  const tabsInner = story.querySelector(".story-tabs-inner");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const count = steps.length;
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  story.style.setProperty("--story-steps", String(count));
  story.classList.add("is-pinned");

  let active = -1;
  let frame = 0;

  function placePill() {
    const current = tabs.find((tab) => tab.getAttribute("aria-current") === "true");
    if (!current || !tabsInner) return;
    tabsInner.style.setProperty("--pill-x", `${current.offsetLeft}px`);
    tabsInner.style.setProperty("--pill-w", `${current.offsetWidth}px`);
    tabBar.classList.add("is-ready");
  }

  function activate(index) {
    if (index === active) return;
    active = index;
    story.dataset.step = String(index);
    steps.forEach((step, i) => step.classList.toggle("is-active", i === index));
    const chapter = steps[index].dataset.chapter;
    tabs.forEach((tab) => tab.setAttribute("aria-current", String(tab.dataset.storyTab === chapter)));
    placePill();
  }

  function render() {
    frame = 0;
    const rect = track.getBoundingClientRect();
    const total = Math.max(1, rect.height - window.innerHeight);
    const progress = clamp(-rect.top / total);
    const position = progress * count;
    const index = Math.min(count - 1, Math.floor(position));
    const local = clamp(position - index);
    activate(index);

    story.style.setProperty("--sp", local.toFixed(4));
    // step 0 reads the note; step 1 flies the parts into the review
    const read = index === 0 ? ease(clamp((local - 0.15) / 0.55)) : 1;
    const fly = index === 1 ? ease(clamp((local - 0.05) / 0.6)) : index > 1 ? 1 : 0;
    const ring = index === 1 ? ease(clamp((local - 0.68) / 0.22))
      : index === 2 ? Math.sin(clamp((local - 0.1) / 0.8) * Math.PI) : 0;
    const draw = index === 3 ? ease(clamp((local - 0.05) / 0.55)) : index > 3 ? 1 : 0;
    story.style.setProperty("--read", read.toFixed(4));
    story.style.setProperty("--fly", (index === 1 ? fly : 0).toFixed(4));
    story.style.setProperty("--ring", ring.toFixed(4));
    story.style.setProperty("--draw", draw.toFixed(4));
    // the review screen comes in as the first part lands
    const screen = index === 1 ? (fly > 0.35 ? 1 : 0) : index;
    story.dataset.screen = String(reducedMotion.matches && index === 1 ? 1 : screen);
  }

  const request = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", () => {
    placePill();
    request();
  });
  reducedMotion.addEventListener("change", request);

  // a tab scrolls to the start of its chapter
  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      const first = steps.findIndex((step) => step.dataset.chapter === tab.dataset.storyTab);
      if (first < 0) return;
      event.preventDefault();
      const rect = track.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const top = window.scrollY + rect.top + (total * (first + 0.02)) / count;
      window.scrollTo({ top, behavior: reducedMotion.matches ? "auto" : "smooth" });
    });
  });

  if (document.fonts?.ready) document.fonts.ready.then(placePill);
  render();
})();

/* ------------------------------------------------------------------ */
/* Product film: the hero link opens the film in a dialog instead of   */
/* navigating to the MP4. It plays muted and loops; closing pauses it. */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const dialog = document.querySelector("[data-film]");
  const openers = document.querySelectorAll("[data-film-open]");
  if (!dialog || !openers.length || typeof dialog.showModal !== "function") return;

  const video = dialog.querySelector("video");
  const closeButton = dialog.querySelector("[data-film-close]");
  let opener = null;

  openers.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      // nothing downloads until someone asks for the film
      if (!video.getAttribute("src")) {
        // a portrait screen gets the vertical cut, when there is one
        const portrait = Boolean(video.dataset.srcPortrait) && window.matchMedia("(max-aspect-ratio: 4/5)").matches;
        dialog.classList.toggle("is-portrait", portrait);
        video.poster = portrait ? video.dataset.posterPortrait : video.dataset.poster;
        video.src = portrait ? video.dataset.srcPortrait : video.dataset.src;
      }
      dialog.showModal();
      video.currentTime = 0;
      const playing = video.play();
      if (playing && typeof playing.catch === "function") playing.catch(() => {});
    });
  });

  closeButton?.addEventListener("click", () => dialog.close());

  // a click on the backdrop (outside the frame) closes it too
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    video.pause();
    opener?.focus();
  });
})();

/* ------------------------------------------------------------------ */
/* In-page nav (features): the section on screen is marked current,   */
/* and on phones its chip scrolls into view in the sticky row.         */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const row = document.querySelector(".page-toc-bar .page-toc ul");
  if (!row || !("IntersectionObserver" in window)) return;

  const links = [...row.querySelectorAll('a[href^="#"]')];
  const sections = links.map((link) => document.getElementById(link.hash.slice(1))).filter(Boolean);
  if (!sections.length) return;

  let current = null;
  function mark(id) {
    if (id === current) return;
    current = id;
    links.forEach((link) => {
      const on = link.hash === `#${id}`;
      if (on) {
        link.setAttribute("aria-current", "true");
        const left = link.offsetLeft - (row.clientWidth - link.offsetWidth) / 2;
        row.scrollTo({ left, behavior: "smooth" });
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  // a section counts once its top passes the upper third of the screen
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) mark(entry.target.id);
      });
    },
    { rootMargin: "-30% 0px -65% 0px" }
  );
  sections.forEach((section) => observer.observe(section));

  // the bar is stuck once the hero above it has scrolled under the nav
  const bar = row.closest(".page-toc-bar");
  const hero = bar.previousElementSibling;
  if (hero) {
    new IntersectionObserver(
      ([entry]) => bar.classList.toggle("is-stuck", !entry.isIntersecting && entry.boundingClientRect.top < 0),
      { rootMargin: "-59px 0px 0px 0px" }
    ).observe(hero);
  }
})();

