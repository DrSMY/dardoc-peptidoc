// The overview's 3D still life: a clay sphere held by two rings above a
// carved pedestal. It is drawn by a small signed-distance ray marcher in
// WebGL, with no library: soft shadows, ambient occlusion and a gentle
// specular so it reads as matte clay rather than plastic. Drag or use the
// arrow keys to turn it. It stops drawing off screen, in a background tab,
// and starts still for anyone who prefers reduced motion. Without WebGL the
// stage shows a flat drawing of the same shapes instead.
"use strict";

const GuideScene = (() => {
  const VERT = "attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}";

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform vec3 uC;
uniform mat3 uMA;
uniform mat3 uMB;
uniform vec3 uS1;
uniform vec3 uS2;

float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }

vec2 map(vec3 p) {
  vec3 q = p - uC;
  vec2 r = vec2(length(q) - 0.40, 1.0);
  float d = sdTorus(uMA * q, vec2(0.64, 0.105)); if (d < r.x) r = vec2(d, 2.0);
  d = sdTorus(uMB * q, vec2(0.80, 0.062)); if (d < r.x) r = vec2(d, 3.0);
  d = length(p - uS1) - 0.115; if (d < r.x) r = vec2(d, 4.0);
  d = length(p - uS2) - 0.05; if (d < r.x) r = vec2(d, 5.0);
  vec3 b = p - vec3(0.0, -1.0, 0.0);
  vec2 w = vec2(length(b.xz) - 1.0, abs(b.y) - 0.04);
  d = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.05;
  d = max(d, -sdTorus(b - vec3(0.0, 0.09, 0.0), vec2(0.62, 0.028)));
  if (d < r.x) r = vec2(d, 6.0);
  return r;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
                   e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 28; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.02, 0.22);
    if (res < 0.004 || t > 3.2) break;
  }
  return clamp(res, 0.0, 1.0);
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.012 + 0.1 * float(i);
    occ += (h - map(p + h * n).x) * sca;
    sca *= 0.88;
  }
  return clamp(1.0 - 2.1 * occ, 0.0, 1.0);
}

vec3 shade(vec3 p, vec3 rd, float m) {
  vec3 n = calcNormal(p);
  vec3 alb = vec3(0.925, 0.915, 0.875); float ks = 0.14; float sp = 20.0;
  if (m > 1.5 && m < 2.5) { alb = vec3(0.075, 0.40, 0.31); ks = 0.5; sp = 56.0; }
  else if (m > 2.5 && m < 3.5) { alb = vec3(0.945, 0.937, 0.905); ks = 0.2; sp = 32.0; }
  else if (m > 3.5 && m < 4.5) { alb = vec3(0.70, 0.79, 0.62); ks = 0.2; sp = 28.0; }
  else if (m > 4.5 && m < 5.5) { alb = vec3(0.85, 0.70, 0.45); ks = 0.6; sp = 44.0; }
  else if (m > 5.5) { alb = vec3(0.915, 0.91, 0.87); ks = 0.05; sp = 10.0; }
  alb = pow(alb, vec3(2.2));
  vec3 lig = normalize(vec3(-0.5, 0.86, 0.45));
  float sha = softShadow(p + n * 0.003, lig);
  float occ = calcAO(p, n);
  float dif = clamp((dot(n, lig) + 0.2) / 1.2, 0.0, 1.0) * sha;
  float sky = 0.55 + 0.45 * n.y;
  float bou = clamp(-n.y, 0.0, 1.0);
  vec3 hv = normalize(lig - rd);
  float spe = pow(clamp(dot(n, hv), 0.0, 1.0), sp) * sha;
  float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
  vec3 lin = 0.56 * dif * vec3(1.0, 0.965, 0.9)
           + 0.55 * sky * occ * vec3(0.86, 0.93, 0.85)
           + 0.34 * bou * occ * vec3(0.95, 0.93, 0.85)
           + 0.10 * fre * occ * vec3(0.9, 1.0, 0.92);
  vec3 c = alb * lin + ks * spe * vec3(1.0, 0.98, 0.93);
  return pow(clamp(c, 0.0, 1.0), vec3(0.4545));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec3 ro = vec3(0.0, 0.62, 3.8);
  vec3 ta = vec3(0.0, -0.1, 0.0);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.45 * ww);

  vec2 g = uv - vec2(0.0, 0.06);
  vec3 col = mix(vec3(0.898, 0.925, 0.867), vec3(0.945, 0.961, 0.925), exp(-2.4 * dot(g, g)));
  if (rd.y < 0.0) {
    float tf = (-1.09 - ro.y) / rd.y;
    vec2 f = (ro + rd * tf).xz;
    col *= 1.0 - 0.12 * smoothstep(1.9, 0.9, length(f));
  }

  vec3 oc = ro - vec3(0.0, -0.2, 0.0);
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + 1.42 * 1.42;
  if (h > 0.0) {
    h = sqrt(h);
    float t = max(-b - h, 0.0);
    float tmax = -b + h;
    float m = -1.0;
    for (int i = 0; i < 100; i++) {
      vec2 res = map(ro + rd * t);
      if (res.x < 0.0006 * t) { m = res.y; break; }
      t += res.x;
      if (t > tmax) break;
    }
    if (m > 0.0) col = shade(ro + rd * t, rd, m);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

  // 3×3 matrices, column-major, as WebGL expects them.
  const M = {
    rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; },
    ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; },
    rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, -s, c, 0, 0, 0, 1]; },
    mul(a, b) {
      const r = new Array(9);
      for (let c = 0; c < 3; c++) for (let i = 0; i < 3; i++) {
        r[c * 3 + i] = a[i] * b[c * 3] + a[3 + i] * b[c * 3 + 1] + a[6 + i] * b[c * 3 + 2];
      }
      return r;
    },
    t(a) { return [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]; },
    apply(m, v) {
      return [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
    },
  };
  // Each ring's resting tilt, relative to the group.
  const TILT_A = M.mul(M.rz(0.55), M.rx(1.15));
  const TILT_B = M.mul(M.rx(0.35), M.rz(-1.0));
  const HOME = { yaw: 0.5, pitch: 0.06 };

  // Shown when WebGL isn't available: the same shapes, flat and still.
  function fallbackArt() {
    const wrap = document.createElement("div");
    wrap.className = "gp-stage-art";
    wrap.innerHTML = `<svg viewBox="0 0 400 360" aria-hidden="true">
      <defs>
        <radialGradient id="gpFbS" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#FBFAF4"/><stop offset=".7" stop-color="#E4E2D6"/><stop offset="1" stop-color="#CFCFC1"/></radialGradient>
        <linearGradient id="gpFbR" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E7A5E"/><stop offset="1" stop-color="#0E4A3A"/></linearGradient>
      </defs>
      <ellipse cx="200" cy="300" rx="150" ry="34" fill="#E6E5DA"/>
      <ellipse cx="200" cy="292" rx="150" ry="34" fill="#F1F0E8"/>
      <ellipse cx="200" cy="292" rx="96" ry="21" fill="none" stroke="#DAD8CB" stroke-width="5"/>
      <ellipse cx="200" cy="150" rx="128" ry="52" transform="rotate(-28 200 150)" fill="none" stroke="#F4F3EC" stroke-width="12"/>
      <circle cx="200" cy="150" r="62" fill="url(#gpFbS)"/>
      <ellipse cx="200" cy="150" rx="104" ry="40" transform="rotate(52 200 150)" fill="none" stroke="url(#gpFbR)" stroke-width="22"/>
      <circle cx="104" cy="96" r="17" fill="#B4C6A6"/>
      <circle cx="292" cy="196" r="7" fill="#D7B274"/>
    </svg>`;
    return wrap;
  }

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }

  function program(gl) {
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
  }

  function mount(stage) {
    const canvas = stage.querySelector("canvas");
    const pauseBtn = stage.querySelector('[data-scene="pause"]');
    const resetBtn = stage.querySelector('[data-scene="reset"]');
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const still = () => {
      stage.classList.add("gp-stage-still");
      if (canvas.isConnected) canvas.replaceWith(fallbackArt());
    };

    let gl = null;
    try {
      gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "low-power" });
    } catch { gl = null; }
    const prog = gl && program(gl);
    if (!prog) { still(); return { destroy() {} }; }

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    ["uRes", "uC", "uMA", "uMB", "uS1", "uS2"].forEach((n) => { u[n] = gl.getUniformLocation(prog, n); });

    let yaw = HOME.yaw, pitch = HOME.pitch, vel = 0, t = 0;
    let auto = !reduced, dragging = false, tween = null;
    let onscreen = false, visible = !document.hidden, raf = 0, last = 0, drawn = false;
    let scale = Math.min(window.devicePixelRatio || 1, 2) * 0.85;
    let frames = 0, slow = 0, px = 0, moveAt = 0;

    function draw() {
      const R = M.mul(M.ry(yaw), M.rx(pitch));
      const C = [0, 0.04 + Math.sin(t * 0.9) * 0.025, 0];
      const RA = M.mul(R, TILT_A), RB = M.mul(R, TILT_B);
      gl.uniform3f(u.uC, C[0], C[1], C[2]);
      gl.uniformMatrix3fv(u.uMA, false, M.t(RA));
      gl.uniformMatrix3fv(u.uMB, false, M.t(RB));
      const a1 = t * 0.55 + 2.2, a2 = -t * 0.8 + 5.2;
      const s1 = M.apply(RB, [0.8 * Math.cos(a1), 0, 0.8 * Math.sin(a1)]);
      const s2 = M.apply(RA, [0.795 * Math.cos(a2), 0, 0.795 * Math.sin(a2)]);
      gl.uniform3f(u.uS1, C[0] + s1[0], C[1] + s1[1], C[2] + s1[2]);
      gl.uniform3f(u.uS2, C[0] + s2[0], C[1] + s2[1], C[2] + s2[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!drawn) { drawn = true; stage.classList.add("gp-stage-ready"); }
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u.uRes, w, h);
      }
      kick();
    }

    const moving = () => auto || dragging || tween || Math.abs(vel) > 0.002;
    function frame(now) {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      if (tween) {
        const k = Math.min(1, (now - tween.start) / 900);
        const e = 1 - Math.pow(1 - k, 3);
        yaw = tween.yaw + (HOME.yaw - tween.yaw) * e;
        pitch = tween.pitch + (HOME.pitch - tween.pitch) * e;
        if (k >= 1) tween = null;
      } else if (!dragging) {
        if (Math.abs(vel) > 0.002) { yaw += vel * dt; vel *= Math.pow(0.05, dt); } else vel = 0;
        if (auto) yaw += 0.2 * dt;
      }
      if (auto) t += dt;
      draw();
      // Drop the resolution on a device that can't keep up.
      frames++;
      if (dt > 0.03) slow++;
      if (frames >= 45) {
        if (slow > 22 && scale > 0.6) { scale = Math.max(0.6, scale * 0.8); resize(); }
        frames = 0; slow = 0;
      }
      if (onscreen && visible && moving()) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    function kick() { if (!raf && onscreen && visible) raf = requestAnimationFrame(frame); }

    function paintPause() {
      if (pauseBtn) pauseBtn.textContent = auto ? "Pause motion" : "Play motion";
    }
    paintPause();

    const onDown = (e) => {
      if (e.button !== 0) return;
      dragging = true; tween = null; vel = 0;
      px = e.clientX; moveAt = performance.now();
      stage.classList.add("gp-grabbing");
      try { canvas.setPointerCapture(e.pointerId); } catch { /* capture is optional */ }
      kick();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const now = performance.now();
      const dx = e.clientX - px;
      px = e.clientX;
      yaw += dx * 0.009;
      if (e.pointerType === "mouse") pitch = Math.max(-0.5, Math.min(0.6, pitch + (e.movementY || 0) * 0.006));
      vel = Math.max(-6, Math.min(6, (dx * 0.009) / Math.max(0.008, (now - moveAt) / 1000)));
      moveAt = now;
      kick();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (performance.now() - moveAt > 90) vel = 0;
      stage.classList.remove("gp-grabbing");
      kick();
    };
    const onKey = (e) => {
      const step = { ArrowLeft: [-0.26, 0], ArrowRight: [0.26, 0], ArrowUp: [0, -0.14], ArrowDown: [0, 0.14] }[e.key];
      if (!step) return;
      e.preventDefault();
      tween = null;
      yaw += step[0];
      pitch = Math.max(-0.5, Math.min(0.6, pitch + step[1]));
      kick();
    };
    const onPause = () => { auto = !auto; paintPause(); kick(); };
    const onReset = () => {
      // Come home the short way round, however far it has been spun.
      const turn = Math.PI * 2;
      const from = HOME.yaw + ((((yaw - HOME.yaw) % turn) + turn * 1.5) % turn) - turn / 2;
      tween = { start: performance.now(), yaw: from, pitch };
      vel = 0;
      kick();
    };
    const onVis = () => { visible = !document.hidden; kick(); };
    const onLost = (e) => { e.preventDefault(); destroy(); still(); };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("lostpointercapture", onUp);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("webglcontextlost", onLost);
    if (pauseBtn) pauseBtn.addEventListener("click", onPause);
    if (resetBtn) resetBtn.addEventListener("click", onReset);
    document.addEventListener("visibilitychange", onVis);

    const io = new IntersectionObserver((entries) => {
      onscreen = entries.some((en) => en.isIntersecting);
      kick();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      if (pauseBtn) pauseBtn.removeEventListener("click", onPause);
      if (resetBtn) resetBtn.removeEventListener("click", onReset);
    }
    return { destroy };
  }

  return { mount };
})();
