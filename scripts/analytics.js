(() => {
  "use strict";

  const page = document.body?.dataset.page || window.location.pathname || "unknown";

  function track(name, data = {}) {
    if (!name || typeof window.va !== "function") return;

    const payload = { name, page };

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null || value === "") continue;
      payload[key] = value;
    }

    window.va("event", payload);
  }

  function getTrackingData(node) {
    if (!(node instanceof HTMLElement)) return {};

    return {
      location: node.dataset.analyticsLocation,
      target: node.dataset.analyticsTarget,
      label: node.dataset.analyticsLabel,
    };
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const trigger = event.target.closest("[data-analytics-event]");
    if (!trigger) return;

    track(trigger.getAttribute("data-analytics-event"), getTrackingData(trigger));
  });

  document.querySelectorAll("details.nav-menu").forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;

      track("Mobile Menu Opened", {
        location: menu.dataset.analyticsLocation || "header",
        target: "navigation",
      });
    });
  });

  window.marbleAnalytics = { page, track };
})();
