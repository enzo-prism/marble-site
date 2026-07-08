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
      if (img.getAttribute("src") !== next) img.setAttribute("src", next);
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

  const quotes = Array.from(document.querySelectorAll(".quote-stack .quote"));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  for (let i = quotes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [quotes[i], quotes[j]] = [quotes[j], quotes[i]];
  }

  if (quotes.length > 0) {
    quotes.forEach((quote) => quote.classList.remove("is-active"));
    quotes[0].classList.add("is-active");
  }

  if (quotes.length > 1 && !reducedMotion.matches) {
    let index = 0;

    setInterval(() => {
      quotes[index].classList.remove("is-active");
      index = (index + 1) % quotes.length;
      quotes[index].classList.add("is-active");
    }, 8000);
  }
})();
