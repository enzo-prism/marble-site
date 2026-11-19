/* ------------------------------------------------------------------ */
/* Living marble: a slow field of stone veins behind the hero and the  */
/* final call to action. One small WebGL fragment shader, no library.  */
/*                                                                     */
/* - Monochrome. Vein colour follows the page theme (data-theme).      */
/* - Rendered below device resolution and softened by CSS, so it is    */
/*   cheap; capped near 30 fps.                                        */
/* - Runs only while on screen and the tab is visible.                 */
/* - Reduce Motion: draws one still frame and never animates.          */
/* - No WebGL, or a lost context: the canvas stays hidden and the CSS  */
/*   backdrop underneath is what shows.                                */
/* ------------------------------------------------------------------ */
(() => {
  "use strict";

  const canvases = [...document.querySelectorAll("canvas[data-marble]")];
  if (!canvases.length) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const root = document.documentElement;

  const VERTEX = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  // Domain-warped value noise shaped into thin veins. u_ink is the vein
  // colour; alpha carries the strength so the page background shows through.
  const FRAGMENT = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform vec2 u_res;
    uniform float u_time;
    uniform vec2 u_light;
    uniform float u_lightOn;
    uniform vec3 u_ink;
    uniform float u_strength;
    uniform float u_seed;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21) + u_seed);
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = r * p * 2.02 + 3.1;
        a *= 0.5;
      }
      return v;
    }

    float fbm3(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
      for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p = r * p * 2.03 + 1.7;
        a *= 0.5;
      }
      return v / 0.875;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_res;
      vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y) * 1.25;
      float t = u_time * 0.02;

      // domain warping gives the long, folded flow of stone; the vein
      // paths use a smoother noise than the body so their edges stay clean
      vec2 q = vec2(fbm3(p * 0.9 + vec2(0.0, t)), fbm3(p * 0.9 + vec2(5.2, -t * 0.8)));
      vec2 r = vec2(fbm3(p + 1.5 * q + vec2(1.7, 9.2) + t * 0.5),
                    fbm3(p + 1.5 * q + vec2(8.3, 2.8) - t * 0.35));
      float path = fbm3(p + 1.4 * r);
      float f = fbm(p + 1.4 * r);

      // main veins: a fine core inside a wide, soft halo
      float s1 = 1.0 - abs(sin((p.x * 0.7 + p.y * 1.1) * 1.8 + path * 5.0));
      float core = smoothstep(0.985, 0.999, s1) * 0.55;
      float halo = pow(s1, 16.0) * 0.55 + pow(s1, 4.0) * 0.06;

      // hairline veins at another angle, only in part of the stone
      float s2 = 1.0 - abs(sin((p.x * -1.1 + p.y * 0.5) * 2.6 + path * 7.0 + r.y * 2.0));
      float hair = smoothstep(0.99, 0.9995, s2) * smoothstep(0.45, 0.8, f) * 0.4
                 + pow(s2, 30.0) * smoothstep(0.45, 0.8, f) * 0.18;

      // a faint tonal cloud, like the body of the stone
      float body = smoothstep(0.4, 0.9, f) * 0.09;

      float a = core + halo + hair + body;

      // a soft light that follows the pointer and lifts the veins near it
      vec2 lp = (u_light * u_res - 0.5 * u_res) / min(u_res.x, u_res.y) * 1.25;
      float glow = exp(-dot(p - lp, p - lp) * 3.0) * u_lightOn;
      a *= 1.0 + glow * 1.6;

      // fade at the edges so the field never ends in a hard line
      float edge = smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.82, uv.x)
                 * smoothstep(0.0, 0.22, uv.y) * smoothstep(1.0, 0.8, uv.y);
      a = clamp(a * u_strength * edge, 0.0, 1.0);
      gl_FragColor = vec4(u_ink * a, a);
    }
  `;

  function parseColor(value) {
    const probe = document.createElement("span");
    probe.style.color = value;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color.match(/[\d.]+/g) || ["0", "0", "0"];
    probe.remove();
    return rgb.slice(0, 3).map((n) => Number(n) / 255);
  }

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function mount(canvas, index) {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ["u_res", "u_time", "u_light", "u_lightOn", "u_ink", "u_strength", "u_seed"].forEach((name) => {
      u[name] = gl.getUniformLocation(program, name);
    });

    const scale = Number(canvas.dataset.marbleScale) || 0.7;
    const seed = Number(canvas.dataset.marbleSeed) || index * 0.37 + 0.11;
    gl.uniform1f(u.u_seed, seed);

    let width = 0;
    let height = 0;
    let time = 40 + index * 23;
    let last = 0;
    let frame = 0;
    let running = false;
    let onScreen = false;
    // the light eases toward the pointer instead of snapping to it
    const light = { x: 0.7, y: 0.6, tx: 0.7, ty: 0.6, on: 0, ton: 0 };

    function applyTheme() {
      const styles = getComputedStyle(canvas);
      gl.uniform3fv(u.u_ink, parseColor(styles.getPropertyValue("--marble-ink").trim() || "#000"));
      gl.uniform1f(u.u_strength, Number(styles.getPropertyValue("--marble-strength")) || 0.2);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2) * scale;
      const nextW = Math.max(1, Math.round(rect.width * ratio));
      const nextH = Math.max(1, Math.round(rect.height * ratio));
      if (nextW === width && nextH === height) return false;
      width = nextW;
      height = nextH;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(u.u_res, width, height);
      return true;
    }

    function draw() {
      gl.uniform1f(u.u_time, time);
      gl.uniform2f(u.u_light, light.x, light.y);
      gl.uniform1f(u.u_lightOn, light.on);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function tick(now) {
      frame = 0;
      if (!running) return;
      frame = requestAnimationFrame(tick);
      const delta = last ? Math.min(now - last, 100) : 16;
      if (delta < 30) return; // ~30 fps is plenty for drifting stone
      last = now;
      time += delta / 1000;
      light.x += (light.tx - light.x) * 0.08;
      light.y += (light.ty - light.y) * 0.08;
      light.on += (light.ton - light.on) * 0.06;
      draw();
    }

    function update() {
      const shouldRun = onScreen && !document.hidden && !reducedMotion.matches;
      if (shouldRun && !running) {
        running = true;
        last = 0;
        frame = requestAnimationFrame(tick);
      } else if (!shouldRun && running) {
        running = false;
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      }
      if (!running) draw(); // a still frame for Reduce Motion and paused states
    }

    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      running = false;
      canvas.classList.remove("is-ready");
    });

    applyTheme();
    resize();
    draw();
    canvas.classList.add("is-ready");

    new MutationObserver(() => {
      applyTheme();
      if (!running) draw();
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        if (resize() && !running) draw();
      }).observe(canvas);
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        update();
      }).observe(canvas);
    } else {
      onScreen = true;
    }

    document.addEventListener("visibilitychange", update);
    reducedMotion.addEventListener("change", update);

    // The light only follows a real mouse; on touch the field just drifts.
    const host = canvas.closest("[data-marble-host]") || canvas.parentElement;
    host.addEventListener("pointermove", (event) => {
      if (!finePointer.matches) return;
      const rect = canvas.getBoundingClientRect();
      light.tx = (event.clientX - rect.left) / rect.width;
      light.ty = 1 - (event.clientY - rect.top) / rect.height;
      light.ton = 1;
    });
    host.addEventListener("pointerleave", () => {
      light.ton = 0;
    });

    update();
  }

  canvases.forEach(mount);
})();
