/* ------------------------------------------------------------------ */
/* Living marble: a slow field of stone veins. One small WebGL         */
/* fragment shader, no library. Two modes:                             */
/*                                                                     */
/* - field (canvas[data-marble]): veins over a transparent background, */
/*   behind the hero, the final call to action and page titles.       */
/* - text (canvas[data-marble][data-marble-text]): the same stone      */
/*   carved into a word. The canvas sits over a text element (its      */
/*   parent) and the word is drawn into a mask texture in that         */
/*   element's own font.                                               */
/*                                                                     */
/* Colours come from CSS custom properties on the canvas, so they      */
/* follow the theme. Rendered below device resolution, capped near     */
/* 30 fps, and only while on screen with the tab visible. Reduce       */
/* Motion draws one still frame. Without WebGL the canvas stays        */
/* hidden and the CSS underneath is what shows.                        */
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

  // Domain-warped value noise shaped into thin veins.
  // Field mode: u_ink is the vein colour and alpha carries the strength.
  // Text mode: the stone body (u_base) shows through the word mask, veins
  // are mixed in with u_ink, and a soft polish follows the pointer.
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
    uniform vec3 u_base;
    uniform float u_strength;
    uniform float u_seed;
    uniform float u_text;
    uniform float u_zoom;
    uniform sampler2D u_mask;

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
      vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y) * 1.25 * u_zoom;
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

      // a soft light that follows the pointer
      vec2 lp = (u_light * u_res - 0.5 * u_res) / min(u_res.x, u_res.y) * 1.25 * u_zoom;
      float glow = exp(-dot(p - lp, p - lp) * 3.0 / (u_zoom * u_zoom)) * u_lightOn;

      if (u_text > 0.5) {
        float m = texture2D(u_mask, vec2(uv.x, 1.0 - uv.y)).a;
        float veins = clamp((core + halo + hair) * u_strength, 0.0, 1.0);
        vec3 col = mix(u_base, u_ink, veins);
        // the body cloud shades the stone a touch either way
        col = mix(col, u_ink, body * 0.9);
        // polish: a broad, soft highlight under the pointer
        col = mix(col, vec3(1.0), glow * 0.10);
        gl_FragColor = vec4(col * m, m);
        return;
      }

      float a = core + halo + hair + body;
      a *= 1.0 + glow * 1.6;

      // fade at the edges so the field never ends in a hard line
      float edge = smoothstep(0.0, 0.18, uv.x) * smoothstep(1.0, 0.82, uv.x)
                 * smoothstep(0.0, 0.22, uv.y) * smoothstep(1.0, 0.8, uv.y);
      a = clamp(a * u_strength * edge, 0.0, 1.0);
      gl_FragColor = vec4(u_ink * a, a);
    }
  `;

  const probe = document.createElement("span");
  probe.style.display = "none";

  function parseColor(value, fallback) {
    probe.style.color = "";
    probe.style.color = value || fallback;
    if (!probe.isConnected) document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    // color(srgb r g b) / color(display-p3 …) report 0–1 channels
    const unitChannels = computed.startsWith("color(");
    const channels = unitChannels ? computed.replace(/^color\(\s*[\w-]+/, "") : computed;
    const numbers = (channels.match(/[\d.]+/g) || ["0", "0", "0"]).map(Number);
    if (unitChannels) return numbers.slice(0, 3);
    return numbers.slice(0, 3).map((n) => n / 255);
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

  // Draws the host element's text, in its own font, into an alpha mask.
  function drawTextMask(mask, host, width, height, ratio) {
    const ctx = mask.getContext("2d");
    mask.width = width;
    mask.height = height;
    ctx.clearRect(0, 0, width, height);
    const styles = getComputedStyle(host);
    const text = host.dataset.marbleWord || host.textContent.trim();
    const fontSize = parseFloat(styles.fontSize) * ratio;
    const spacingValue = parseFloat(styles.getPropertyValue("--wordmark-tracking")) || 0;
    const spacing = spacingValue * fontSize;
    ctx.font = `${styles.fontStyle} ${styles.fontWeight} ${fontSize}px ${styles.fontFamily}`;
    ctx.textBaseline = "alphabetic";
    // place characters one by one so tracking works in every browser,
    // measuring prefixes so the font's own kerning is kept
    const widths = [];
    for (let i = 0; i <= text.length; i += 1) widths.push(ctx.measureText(text.slice(0, i)).width);
    const total = widths[text.length] + spacing * (text.length - 1);
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.72;
    const descent = metrics.actualBoundingBoxDescent || 0;
    const x0 = (width - total) / 2;
    const y = (height + ascent - descent) / 2;
    // the stone fades toward the bottom of the letters, like the CSS wordmark
    const fade = ctx.createLinearGradient(0, y - ascent, 0, y + descent);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.55, "rgba(0,0,0,0.85)");
    fade.addColorStop(1, "rgba(0,0,0,0.12)");
    ctx.fillStyle = fade;
    for (let i = 0; i < text.length; i += 1) {
      ctx.fillText(text[i], x0 + widths[i] + spacing * i, y);
    }
  }

  function mount(canvas, index) {
    const textMode = canvas.hasAttribute("data-marble-text");
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
    ["u_res", "u_time", "u_light", "u_lightOn", "u_ink", "u_base", "u_strength", "u_seed", "u_text", "u_zoom", "u_mask"]
      .forEach((name) => {
        u[name] = gl.getUniformLocation(program, name);
      });

    const scale = Number(canvas.dataset.marbleScale) || 0.7;
    const seed = Number(canvas.dataset.marbleSeed) || index * 0.37 + 0.11;
    gl.uniform1f(u.u_seed, seed);
    gl.uniform1f(u.u_text, textMode ? 1 : 0);
    gl.uniform1f(u.u_zoom, Number(canvas.dataset.marbleZoom) || 1);

    // text mode: a 2D canvas holds the word, uploaded as a texture
    const textHost = textMode ? canvas.parentElement : null;
    const mask = textMode ? document.createElement("canvas") : null;
    let texture = null;
    if (textMode) {
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(u.u_mask, 0);
    }

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
      gl.uniform3fv(u.u_ink, parseColor(styles.getPropertyValue("--marble-ink").trim(), "#000"));
      gl.uniform3fv(u.u_base, parseColor(styles.getPropertyValue("--marble-base").trim(), "#fff"));
      gl.uniform1f(u.u_strength, Number(styles.getPropertyValue("--marble-strength")) || 0.2);
    }

    function uploadMask() {
      if (!textMode) return;
      drawTextMask(mask, textHost, width, height, width / Math.max(1, canvas.getBoundingClientRect().width));
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      // the word needs crisp edges, so text renders at full resolution
      const ratio = Math.min(window.devicePixelRatio || 1, 2) * (textMode ? 1 : scale);
      const nextW = Math.max(1, Math.round(rect.width * ratio));
      const nextH = Math.max(1, Math.round(rect.height * ratio));
      if (nextW === width && nextH === height) return false;
      width = nextW;
      height = nextH;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(u.u_res, width, height);
      uploadMask();
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
      textHost?.classList.remove("is-carved");
    });

    applyTheme();
    resize();
    draw();
    canvas.classList.add("is-ready");
    textHost?.classList.add("is-carved");

    new MutationObserver(() => {
      applyTheme();
      if (!running) draw();
    }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    if ("ResizeObserver" in window) {
      new ResizeObserver(() => {
        if (resize() && !running) draw();
      }).observe(canvas);
    }

    // web fonts or a late font swap change the word's shape
    if (textMode && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        uploadMask();
        if (!running) draw();
      });
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

  // The field is decoration: start it once the page has loaded and the main
  // thread is idle, so it never competes with the words and the button.
  const start = () => canvases.forEach(mount);
  const idle = () =>
    "requestIdleCallback" in window ? window.requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200);
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
})();
