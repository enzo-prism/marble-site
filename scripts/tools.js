// Calculators on /tools/. Each form is marked data-calc and its outputs
// data-out. The HTML already shows a worked example, so without JavaScript the
// page still answers the question; this only recalculates as you type.
//
// The formulas match the marble app:
//   one-rep max  Epley, weight × (1 + reps / 30), sets of 1–12 reps
//                (LifterAnalytics.estimatedOneRepMaxKilograms)
//   DOTS         total × 500 / (A·bw⁴ + B·bw³ + C·bw² + D·bw + E), bodyweight
//                clamped to 40–210 kg (men) or 40–150 kg (women); the
//                coefficients are OpenPowerlifting's published values.

(() => {
  "use strict";

  const LB_PER_KG = 2.20462;
  const REP_CAP = 12;

  const DOTS = {
    m: { a: -0.000001093, b: 0.0007391293, c: -0.1918759221, d: 24.0900756, e: -307.75076, min: 40, max: 210, label: "Men’s" },
    f: { a: -0.0000010706, b: 0.0005158568, c: -0.1126655495, d: 13.6175032, e: -57.96288, min: 40, max: 150, label: "Women’s" },
  };

  const number = (value) => {
    const parsed = Number.parseFloat(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const round = (value, places = 1) => {
    const factor = 10 ** places;
    return (Math.round(value * factor) / factor).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: places,
    });
  };

  const setText = (form, key, text) => {
    const node = form.parentElement.querySelector(`[data-out="${key}"]`) || form.querySelector(`[data-out="${key}"]`);
    if (node) node.textContent = text;
  };

  const setRows = (scope, key, rows) => {
    const body = scope.querySelector(`[data-out="${key}"]`);
    if (!body) return;
    body.replaceChildren(
      ...rows.map((cells) => {
        const row = document.createElement("tr");
        for (const cell of cells) {
          const td = document.createElement("td");
          td.textContent = cell;
          row.appendChild(td);
        }
        return row;
      }),
    );
  };

  function oneRepMax(form) {
    const scope = form.closest("section") || document;
    const weight = number(form.elements.weight.value);
    const reps = Math.round(number(form.elements.reps.value));
    const unit = form.elements.unit.value;

    if (!(weight > 0) || !(reps >= 1) || reps > REP_CAP) {
      setText(form, "value", "—");
      setText(
        form,
        "note",
        reps > REP_CAP
          ? `Use a set of ${REP_CAP} reps or fewer; estimates past that are unreliable.`
          : "Enter a weight and 1 to 12 reps.",
      );
      setRows(scope, "percent", []);
      setRows(scope, "reps", []);
      return;
    }

    const estimate = weight * (1 + reps / 30);
    setText(form, "value", `${round(estimate)} ${unit}`);
    setText(form, "note", `Epley: ${round(weight, 2)} × (1 + ${reps} ÷ 30)`);
    setRows(
      scope,
      "percent",
      [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50].map((percent) => [`${percent}%`, `${round((estimate * percent) / 100)} ${unit}`]),
    );
    setRows(
      scope,
      "reps",
      Array.from({ length: REP_CAP }, (_, index) => index + 1).map((count) => [String(count), `${round(estimate / (1 + count / 30))} ${unit}`]),
    );
  }

  function dots(form) {
    const coefficients = DOTS[form.elements.sex.value] || DOTS.m;
    const unit = form.elements.unit.value;
    const toKg = unit === "lb" ? 1 / LB_PER_KG : 1;
    const bodyweight = number(form.elements.bodyweight.value) * toKg;
    const total = number(form.elements.total.value) * toKg;

    if (!(bodyweight > 0) || !(total > 0)) {
      setText(form, "value", "—");
      setText(form, "note", "Enter your bodyweight and total.");
      return;
    }

    const x = Math.min(Math.max(bodyweight, coefficients.min), coefficients.max);
    const { a, b, c, d, e } = coefficients;
    const denominator = a * x ** 4 + b * x ** 3 + c * x ** 2 + d * x + e;
    const score = denominator > 0 ? (total * 500) / denominator : 0;
    const clamped = x !== bodyweight ? ` (scored at ${round(x)} kg, the nearest limit)` : "";

    setText(form, "value", round(score, 2));
    setText(
      form,
      "note",
      `${coefficients.label} coefficients · ${round(total)} kg at ${round(bodyweight)} kg bodyweight${clamped}`,
    );
  }

  const calculators = { "one-rep-max": oneRepMax, dots };

  for (const form of document.querySelectorAll("form[data-calc]")) {
    const run = calculators[form.dataset.calc];
    if (!run) continue;
    form.addEventListener("input", () => run(form));
    form.addEventListener("change", () => run(form));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run(form);
    });
    run(form);
  }
})();
