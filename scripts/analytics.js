(() => {
  "use strict";

  const page = document.body?.dataset.page || window.location.pathname || "unknown";
  const eventDataKeys = ["location", "target"];

  function track(name, data = {}) {
    if (typeof name !== "string" || !name.trim() || typeof window.va !== "function") return;

    const eventData = {};

    for (const key of eventDataKeys) {
      const value = data?.[key];
      if (!["string", "number", "boolean"].includes(typeof value)) continue;
      if (typeof value === "string" && !value.trim()) continue;
      eventData[key] = value;
    }

    window.va("event", { name, data: eventData });
  }

  function getTrackingData(node) {
    if (!(node instanceof HTMLElement)) return {};

    return {
      location: node.dataset.analyticsLocation,
      target: node.dataset.analyticsTarget,
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
