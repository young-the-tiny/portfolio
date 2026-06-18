/* ============================================================
   INTERACTIVE PORTFOLIO — Ta Tran Tuyen
   WebGL Medusae Breathing Particles + Shape Morphing
   ============================================================ */

(function () {
  'use strict';

  // ========================== WEBGL MEDUSAE PARTICLES ==========================
  const canvas = document.getElementById('particles-canvas');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: true });

  if (!gl) {
    console.warn('WebGL not supported');
  }

  let mouse = { x: 0, y: 0, smoothX: 0, smoothY: 0, velX: 0, velY: 0, active: 0, smoothActive: 0 };
  let prevMouse = { x: 0, y: 0 };
  let startTime = performance.now();
  let morphAmount = 0;
  let morphTarget = 0;

  // --- Shader sources ---
  const vertexShaderSrc = `
    attribute vec2 aGridPos;
    attribute float aIndex;
    attribute vec2 aTargetPos;

    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec2 uMouseVel;
    uniform float uMouseActive;
    uniform vec2 uResolution;
    uniform float uMorphAmount;

    varying float vAlpha;
    varying vec3 vColor;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      float seed = hash(aGridPos * 100.0);
      float aspect = uResolution.x / uResolution.y;
      vec2 pos = aGridPos;

      // Chaotic but ordered ambient drift — layered oscillations (VERY SLOW)
      float breathPhase = seed * 6.2831;
      float morphDrift = 1.0 - uMorphAmount * 0.8;

      // Layer 1: slow large drift
      float dx1 = sin(uTime * 0.15 + breathPhase) * 0.010;
      float dy1 = cos(uTime * 0.12 + breathPhase * 1.3) * 0.010;

      // Layer 2: medium wobble
      float dx2 = sin(uTime * 0.4 + seed * 12.0) * 0.006;
      float dy2 = cos(uTime * 0.3 + seed * 8.5) * 0.006;

      // Layer 3: fast jitter (reduced)
      float dx3 = sin(uTime * 0.9 + seed * 25.0) * 0.003;
      float dy3 = cos(uTime * 0.7 + seed * 19.0) * 0.003;

      pos += vec2(dx1 + dx2 + dx3, dy1 + dy2 + dy3) * morphDrift;

      // Mouse distance in aspect-corrected space
      vec2 mouseAspect = vec2(uMouse.x, uMouse.y);
      vec2 diff = pos - mouseAspect;
      float mouseDist = length(diff);

      // --- Slow Orbit: particles lazily rotate around the cursor ---
      float orbitFalloff = exp(-mouseDist * 3.0);
      // Bounded swing: slow, organic swirling that prevents infinite speed/spiraling over time
      float rotAngle = sin(uTime * 0.3) * 0.8 * orbitFalloff * morphDrift;
      float c_rot = cos(rotAngle);
      float s_rot = sin(rotAngle);
      diff = vec2(
        diff.x * c_rot - diff.y * s_rot,
        diff.x * s_rot + diff.y * c_rot
      );
      pos = mouseAspect + diff;

      // Direction vectors
      vec2 radialDir = mouseDist > 0.001 ? diff / mouseDist : vec2(0.0, 1.0);
      vec2 tangentDir = vec2(-radialDir.y, radialDir.x);

      // --- Water Physics: Parting & Wake Trail ---
      float velMag = length(uMouseVel);
      vec2 velDir = velMag > 0.0001 ? uMouseVel / velMag : vec2(0.0, 1.0);
      
      // 1. Parting the water: Push particles aside based on velocity
      float partFalloff = exp(-mouseDist * mouseDist * 4.0);
      float partStrength = min(velMag * 2.5, 0.12) * partFalloff * morphDrift;
      pos += radialDir * partStrength * (0.5 + seed * 0.5);

      // 2. Wake Trail: Disturbed turbulence strictly behind the cursor
      float forward = dot(radialDir, velDir); // 1 = in front, -1 = directly behind
      float behindMask = smoothstep(0.0, -0.7, forward); // 1.0 behind, 0.0 front/sides
      
      float wakeTurbulence = sin(mouseDist * 25.0 - uTime * 2.0 + seed * 5.0) * 0.015;
      float wakeFalloff = exp(-mouseDist * 2.5);
      pos += tangentDir * wakeTurbulence * behindMask * wakeFalloff * min(velMag * 5.0, 1.0) * morphDrift;

      // --- Dropped Stone Ripple (Slow Concentric Waves) ---
      float rippleFreq = 16.0;  
      float rippleSpeed = 0.8;  // very slow propagation
      float stoneRipple = sin(mouseDist * rippleFreq - uTime * rippleSpeed);
      
      float rippleFalloff = exp(-mouseDist * 3.5);
      float ripple = stoneRipple * rippleFalloff * morphDrift;

      // Displace particles UP and DOWN (Y-axis) for 3D surface wave
      pos.y += ripple * 0.03;
      
      // Small radial push to give the ripple physical volume
      pos += radialDir * ripple * 0.01;

      // --- Soft push away from cursor center ---
      float pushStrength = smoothstep(0.25, 0.0, mouseDist) * 0.04 * morphDrift;
      pos += radialDir * pushStrength;

      // MORPH: blend toward target with organic micro-motion
      vec2 targetAlive = aTargetPos + vec2(
        sin(uTime * 0.6 + seed * 4.0) * 0.004,
        cos(uTime * 0.5 + seed * 6.0) * 0.004
      );
      
      // Part-morph: 60% of particles morph to form the outline, 40% stay in background
      float shouldMorph = step(0.40, seed);
      float myMorph = uMorphAmount * shouldMorph;
      pos = mix(pos, targetAlive, myMorph);

      // Projection (grid already in clip space with aspect)
      vec2 scaledPos = pos;
      scaledPos.x /= aspect;
      gl_Position = vec4(scaledPos * 2.0, 0.0, 1.0);

      // Point size — bigger near cursor and at wave peaks
      float baseSize = 2.0 + seed * 1.5;
      float mouseGlow = smoothstep(0.35, 0.0, mouseDist) * 3.0;
      float sizeBreath = 1.0 + sin(uTime * (0.3 + seed * 0.25) + breathPhase) * 0.1;
      
      // Make particles visually larger when they are at the top of the wave
      float waveGlow = max(0.0, ripple) * 3.0; 
      
      float morphSize = mix(baseSize + mouseGlow + waveGlow, baseSize + 3.0, myMorph);
      gl_PointSize = morphSize * sizeBreath * (uResolution.y / 900.0);

      // Colors (Google Palette) — cycle through in real time
      vec3 gBlue   = vec3(0.259, 0.522, 0.957);
      vec3 gRed    = vec3(0.918, 0.263, 0.208);
      vec3 gYellow = vec3(0.984, 0.737, 0.020);
      vec3 gGreen  = vec3(0.204, 0.659, 0.325);

      // Each particle continuously cycles through all 4 colors at its own pace
      float colorPhase = seed * 6.28;
      float cIdx = fract(uTime * (0.12 + seed * 0.08) + seed);

      vec3 color;
      if (cIdx < 0.25) {
        color = mix(gBlue, gRed, cIdx / 0.25);
      } else if (cIdx < 0.5) {
        color = mix(gRed, gYellow, (cIdx - 0.25) / 0.25);
      } else if (cIdx < 0.75) {
        color = mix(gYellow, gGreen, (cIdx - 0.5) / 0.25);
      } else {
        color = mix(gGreen, gBlue, (cIdx - 0.75) / 0.25);
      }

      // Brighten near cursor
      color += smoothstep(0.3, 0.0, mouseDist) * 0.12;

      // Morph accent
      vec3 morphAccent = vec3(0.259, 0.522, 0.957);
      color = mix(color, morphAccent, myMorph * 0.35);
      vColor = color;

      // Alpha — only visible near cursor, fully visible during morph
      float cursorGlow = exp(-mouseDist * mouseDist * 4.0);
      float baseAlpha = 0.06 + seed * 0.06;
      float nearAlpha = baseAlpha + cursorGlow * (0.55 + seed * 0.2);

      // When mouse is off-screen, fade everything to zero (unless morphing)
      nearAlpha *= uMouseActive;

      // During morph, morphing particles become fully visible
      vAlpha = mix(nearAlpha, 0.30 + seed * 0.20, myMorph);
      vAlpha = clamp(vAlpha, 0.0, 0.85);
    }
  `;

  const fragmentShaderSrc = `
    precision mediump float;
    varying float vAlpha;
    varying vec3 vColor;

    void main() {
      vec2 coord = gl_PointCoord - 0.5;
      float dist = length(coord);
      float circle = smoothstep(0.5, 0.2, dist);
      float glow = exp(-dist * 3.0) * 0.5;
      // Multiply by circle to ensure alpha is exactly 0.0 at and beyond dist = 0.5,
      // preventing the square bounding box of the gl_Point quad from showing as a faint outline.
      float alpha = circle * (1.0 + glow) * vAlpha;
      gl_FragColor = vec4(vColor, alpha);
    }
  `;

  // --- Compile helpers ---
  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(gl, vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program error:', gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  let program, uTimeLoc, uMouseLoc, uMouseVelLoc, uMouseActiveLoc, uResolutionLoc, uMorphAmountLoc;
  let particleCount = 0;
  let targetPosBuf;

  // ========================== SHAPE GENERATORS ==========================

  // Sample points along a polyline
  function samplePolyline(points, numSamples, jitter) {
    const j = jitter || 0;
    const result = [];
    // Compute segment lengths
    const segLens = [];
    let totalLen = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1][0] - points[i][0];
      const dy = points[i + 1][1] - points[i][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      segLens.push(len);
      totalLen += len;
    }
    for (let s = 0; s < numSamples; s++) {
      const t = s / (numSamples - 1);
      let dist = t * totalLen;
      let segIdx = 0;
      while (segIdx < segLens.length - 1 && dist > segLens[segIdx]) {
        dist -= segLens[segIdx];
        segIdx++;
      }
      const segT = segLens[segIdx] > 0 ? dist / segLens[segIdx] : 0;
      const x = points[segIdx][0] + segT * (points[segIdx + 1][0] - points[segIdx][0]);
      const y = points[segIdx][1] + segT * (points[segIdx + 1][1] - points[segIdx][1]);
      result.push([x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j]);
    }
    return result;
  }

  // Sample points around a circle
  function sampleCircle(cx, cy, r, numSamples, jitter) {
    const j = jitter || 0;
    const result = [];
    for (let i = 0; i < numSamples; i++) {
      const angle = (i / numSamples) * Math.PI * 2;
      result.push([
        cx + Math.cos(angle) * r + (Math.random() - 0.5) * j,
        cy + Math.sin(angle) * r + (Math.random() - 0.5) * j
      ]);
    }
    return result;
  }

  // Scatter points near a reference set with gaussian-like distribution
  function scatterNear(refPoints, numScatter, spread) {
    const result = [];
    for (let i = 0; i < numScatter; i++) {
      const ref = refPoints[Math.floor(Math.random() * refPoints.length)];
      const angle = Math.random() * Math.PI * 2;
      const radius = (Math.random() + Math.random()) * 0.5 * spread; // triangle distribution
      result.push([
        ref[0] + Math.cos(angle) * radius,
        ref[1] + Math.sin(angle) * radius
      ]);
    }
    return result;
  }

  // Convert point array to Float32Array
  function pointsToBuffer(allPoints, count) {
    const buf = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const p = allPoints[i % allPoints.length];
      buf[i * 2] = p[0];
      buf[i * 2 + 1] = p[1];
    }
    return buf;
  }

  // --- Shape: Geometric Triangle (Thesis) ---
  function generateChartShape(count) {
    const scale = 1.0;
    
    // Outer triangle vertices
    const p1 = [0.0 * scale, 0.38 * scale];
    const p2 = [-0.38 * scale, -0.32 * scale];
    const p3 = [0.38 * scale, -0.32 * scale];
    
    // Inner triangle vertices
    const ip1 = [0.0 * scale, 0.20 * scale];
    const ip2 = [-0.20 * scale, -0.16 * scale];
    const ip3 = [0.20 * scale, -0.16 * scale];

    const outlineCount = Math.floor(count * 0.35);
    let outline = [];
    const JITTER = 0.008;

    // Outer edges
    const outerSeg1 = Math.floor(outlineCount * 0.18);
    const outerSeg2 = Math.floor(outlineCount * 0.18);
    const outerSeg3 = Math.floor(outlineCount * 0.18);
    outline = outline.concat(samplePolyline([p1, p2], outerSeg1, JITTER));
    outline = outline.concat(samplePolyline([p2, p3], outerSeg2, JITTER));
    outline = outline.concat(samplePolyline([p3, p1], outerSeg3, JITTER));

    // Inner edges
    const innerSeg1 = Math.floor(outlineCount * 0.08);
    const innerSeg2 = Math.floor(outlineCount * 0.08);
    const innerSeg3 = Math.floor(outlineCount * 0.08);
    outline = outline.concat(samplePolyline([ip1, ip2], innerSeg1, JITTER));
    outline = outline.concat(samplePolyline([ip2, ip3], innerSeg2, JITTER));
    outline = outline.concat(samplePolyline([ip3, ip1], innerSeg3, JITTER));

    // Center dot/ring
    outline = outline.concat(sampleCircle(0, -0.06, 0.04, Math.floor(outlineCount * 0.02), JITTER));

    // Scatter remaining
    const scattered = scatterNear(outline, count - outline.length, 0.08);
    const all = outline.concat(scattered);

    return pointsToBuffer(all, count);
  }

  // --- Shape: Concentric Rings & Crosshair (Fraud Detection) ---
  function generateShieldShape(count) {
    const outlineCount = Math.floor(count * 0.35);
    let outline = [];

    const outerR = 0.38;
    const innerR = 0.22;
    const JITTER = 0.008;

    // Outer ring
    outline = outline.concat(sampleCircle(0, 0, outerR, Math.floor(outlineCount * 0.45), JITTER));
    
    // Inner ring
    outline = outline.concat(sampleCircle(0, 0, innerR, Math.floor(outlineCount * 0.25), JITTER));

    // 4 radial spokes (top, bottom, left, right connecting inner and outer rings)
    const spokeLen = Math.floor(outlineCount * 0.075);
    outline = outline.concat(samplePolyline([[0, innerR], [0, outerR]], spokeLen, JITTER));
    outline = outline.concat(samplePolyline([[0, -innerR], [0, -outerR]], spokeLen, JITTER));
    outline = outline.concat(samplePolyline([[innerR, 0], [outerR, 0]], spokeLen, JITTER));
    outline = outline.concat(samplePolyline([[-innerR, 0], [-outerR, 0]], spokeLen, JITTER));

    // Scatter remaining
    const scattered = scatterNear(outline, count - outline.length, 0.08);
    const all = outline.concat(scattered);

    return pointsToBuffer(all, count);
  }

  // --- Shape: Hexagonal Web (IoT Backend) ---
  function generateNetworkShape(count) {
    const outlineCount = Math.floor(count * 0.35);
    let outline = [];

    const outerR = 0.38;
    const innerR = 0.22;
    const JITTER = 0.008;

    // Hexagon vertices
    const outerVertices = [];
    const innerVertices = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI / 3) + (Math.PI / 6); // Rotated 30 degrees for aesthetic pointiness
      outerVertices.push([Math.cos(angle) * outerR, Math.sin(angle) * outerR]);
      innerVertices.push([Math.cos(angle) * innerR, Math.sin(angle) * innerR]);
    }

    // Outer Hexagon edges (6 edges)
    const outerEdgeLen = Math.floor(outlineCount * 0.06);
    for (let i = 0; i < 6; i++) {
      outline = outline.concat(samplePolyline([outerVertices[i], outerVertices[(i + 1) % 6]], outerEdgeLen, JITTER));
    }

    // Inner Hexagon edges (6 edges)
    const innerEdgeLen = Math.floor(outlineCount * 0.04);
    for (let i = 0; i < 6; i++) {
      outline = outline.concat(samplePolyline([innerVertices[i], innerVertices[(i + 1) % 6]], innerEdgeLen, JITTER));
    }

    // Spokes from center [0,0] to outer vertices (6 spokes)
    const spokeLen = Math.floor(outlineCount * 0.066);
    for (let i = 0; i < 6; i++) {
      outline = outline.concat(samplePolyline([[0, 0], outerVertices[i]], spokeLen, JITTER));
    }

    // Scatter remaining
    const scattered = scatterNear(outline, count - outline.length, 0.08);
    const all = outline.concat(scattered);

    return pointsToBuffer(all, count);
  }

  // Pre-computed shape buffers (filled after initWebGL knows particleCount)
  let shapeBuffers = {};


  // ========================== WEBGL INIT ==========================

  function initWebGL() {
    if (!gl) return;

    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
    program = createProgram(gl, vs, fs);

    const aGridPosLoc = gl.getAttribLocation(program, 'aGridPos');
    const aIndexLoc = gl.getAttribLocation(program, 'aIndex');
    const aTargetPosLoc = gl.getAttribLocation(program, 'aTargetPos');
    uTimeLoc = gl.getUniformLocation(program, 'uTime');
    uMouseLoc = gl.getUniformLocation(program, 'uMouse');
    uMouseVelLoc = gl.getUniformLocation(program, 'uMouseVel');
    uMouseActiveLoc = gl.getUniformLocation(program, 'uMouseActive');
    uResolutionLoc = gl.getUniformLocation(program, 'uResolution');
    uMorphAmountLoc = gl.getUniformLocation(program, 'uMorphAmount');

    // Particle grid — spans the full screen (aspect-aware), sparse for elegance
    const countX = 60;
    const countY = 35;
    particleCount = countX * countY;
    const aspect = window.innerWidth / window.innerHeight;

    const gridPositions = new Float32Array(particleCount * 2);
    const indices = new Float32Array(particleCount);

    for (let iy = 0; iy < countY; iy++) {
      for (let ix = 0; ix < countX; ix++) {
        const i = iy * countX + ix;
        // Spread from -0.5 to 0.5 in Y, and from -0.5*aspect to 0.5*aspect in X
        const nx = ((ix / (countX - 1)) - 0.5) * aspect;
        const ny = (iy / (countY - 1)) - 0.5;
        gridPositions[i * 2] = nx;
        gridPositions[i * 2 + 1] = ny;
        indices[i] = i;
      }
    }
    // Grid buffer
    const gridBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, gridBuf);
    gl.bufferData(gl.ARRAY_BUFFER, gridPositions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aGridPosLoc);
    gl.vertexAttribPointer(aGridPosLoc, 2, gl.FLOAT, false, 0, 0);

    // Target positions buffer (dynamic — updated on hover)
    const initialTargets = new Float32Array(particleCount * 2); // zeros
    targetPosBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, targetPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, initialTargets, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(aTargetPosLoc);
    gl.vertexAttribPointer(aTargetPosLoc, 2, gl.FLOAT, false, 0, 0);

    // Index buffer
    const indexBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aIndexLoc);
    gl.vertexAttribPointer(aIndexLoc, 1, gl.FLOAT, false, 0, 0);

    // GL state
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    // Pre-compute shapes
    shapeBuffers = {
      thesis:  generateChartShape(particleCount),
      fraud:   generateShieldShape(particleCount),
      iot:     generateNetworkShape(particleCount)
    };
  }

  function setMorphShape(projectKey) {
    if (!gl || !targetPosBuf || !shapeBuffers[projectKey]) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, targetPosBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, shapeBuffers[projectKey]);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
  }

  function renderParticles() {
    if (!gl || !program) return;

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    const time = (performance.now() - startTime) / 1000;

    // Smooth mouse
    mouse.smoothX += (mouse.x - mouse.smoothX) * 0.06;
    mouse.smoothY += (mouse.y - mouse.smoothY) * 0.06;

    // Smooth mouse active state
    mouse.smoothActive += (mouse.active - mouse.smoothActive) * 0.08;

    // Mouse velocity (smoothed, decays slowly to leave a lingering wake)
    const rawVelX = mouse.smoothX - prevMouse.x;
    const rawVelY = mouse.smoothY - prevMouse.y;
    mouse.velX += (rawVelX - mouse.velX) * 0.05;
    mouse.velY += (rawVelY - mouse.velY) * 0.05;
    prevMouse.x = mouse.smoothX;
    prevMouse.y = mouse.smoothY;

    // Smooth morph transition (dual-rate: slow, elegant morph in and quick, clean dissipate out)
    const rate = morphTarget > morphAmount ? 0.015 : 0.045;
    morphAmount += (morphTarget - morphAmount) * rate;
    if (Math.abs(morphAmount - morphTarget) < 0.001) morphAmount = morphTarget;

    gl.uniform1f(uTimeLoc, time);
    gl.uniform2f(uMouseLoc, mouse.smoothX, mouse.smoothY);
    gl.uniform2f(uMouseVelLoc, mouse.velX, mouse.velY);
    gl.uniform1f(uMouseActiveLoc, mouse.smoothActive);
    gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
    gl.uniform1f(uMorphAmountLoc, morphAmount);

    gl.drawArrays(gl.POINTS, 0, particleCount);
  }

  function animateWebGL() {
    renderParticles();
    requestAnimationFrame(animateWebGL);
  }

  // Mouse tracking
  document.addEventListener('mousemove', (e) => {
    const aspect = window.innerWidth / window.innerHeight;
    mouse.x = ((e.clientX / window.innerWidth) - 0.5) * aspect;
    mouse.y = -((e.clientY / window.innerHeight) - 0.5);
    mouse.active = 1;
  });
  document.addEventListener('mouseleave', () => { mouse.active = 0; });

  // Touch support
  document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const aspect = window.innerWidth / window.innerHeight;
    mouse.x = ((touch.clientX / window.innerWidth) - 0.5) * aspect;
    mouse.y = -((touch.clientY / window.innerHeight) - 0.5);
    mouse.active = 1;
  }, { passive: true });
  document.addEventListener('touchend', () => { mouse.active = 0; });

  window.addEventListener('resize', resizeCanvas);

  resizeCanvas();
  initWebGL();
  animateWebGL();

  // --- Scroll-based WebGL Dimming for Text Readability ---
  const canvasEl = document.getElementById('particles-canvas');
  let heroInView = true;
  let projectsInView = false;

  const observerOptions = {
    threshold: 0.05
  };

  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      heroInView = entry.isIntersecting;
      updateCanvasDimming();
    });
  }, observerOptions);

  const projectsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      projectsInView = entry.isIntersecting;
      updateCanvasDimming();
    });
  }, observerOptions);

  const heroSec = document.getElementById('hero');
  const projectsSec = document.getElementById('projects');
  if (heroSec) heroObserver.observe(heroSec);
  if (projectsSec) projectsObserver.observe(projectsSec);

  function updateCanvasDimming() {
    if (heroInView || projectsInView) {
      canvasEl.style.opacity = '1';
    } else {
      canvasEl.style.opacity = '0'; // went back to 0 (completely fade out) to protect text readability
    }
  }


  // ========================== PROJECT CARD HOVER → SHAPE MORPH ==========================
  const projectCards = document.querySelectorAll('.project-card[data-project]');
  let morphTimeout = null;

  projectCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      const key = card.dataset.project;
      if (shapeBuffers[key]) {
        if (morphTimeout) clearTimeout(morphTimeout);
        
        // If we are currently morphed or mid-transition, dissipate first (go back to 0 morph) before forming new shape
        if (morphTarget === 1.0 || morphAmount > 0.1) {
          morphTarget = 0.0;
          morphTimeout = setTimeout(() => {
            setMorphShape(key);
            morphTarget = 1.0;
          }, 220); // brief delay to allow responsive dissipation back into breathing cloud
        } else {
          setMorphShape(key);
          morphTarget = 1.0;
        }
      }
    });

    card.addEventListener('mouseleave', () => {
      if (morphTimeout) clearTimeout(morphTimeout);
      morphTarget = 0.0;
    });
  });


  // ========================== TYPED TEXT ==========================
  const typedEl = document.getElementById('typed-text');
  const titles = [
    'ML Engineer & Researcher',
    'Deep Reinforcement Learning',
    'Data Analyst',
    'Full-Stack Developer',
    'Quantitative Finance'
  ];
  let titleIndex = 0;
  let charIndex = 0;
  let isDeleting = false;
  const TYPING_SPEED = 70;
  const DELETING_SPEED = 40;
  const PAUSE_END = 2000;
  const PAUSE_START = 500;

  function typeEffect() {
    const current = titles[titleIndex];
    if (isDeleting) {
      typedEl.textContent = current.substring(0, charIndex - 1);
      charIndex--;
    } else {
      typedEl.textContent = current.substring(0, charIndex + 1);
      charIndex++;
    }
    let delay = isDeleting ? DELETING_SPEED : TYPING_SPEED;
    if (!isDeleting && charIndex === current.length) {
      delay = PAUSE_END;
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      titleIndex = (titleIndex + 1) % titles.length;
      delay = PAUSE_START;
    }
    setTimeout(typeEffect, delay);
  }
  setTimeout(typeEffect, 1200);


  // ========================== SCROLL PROGRESS ==========================
  const scrollProgress = document.getElementById('scrollProgress');
  function updateScrollProgress() {
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (scrollTop / docHeight) * 100;
    scrollProgress.style.width = progress + '%';
  }


  // ========================== NAVBAR ==========================
  const navbar = document.getElementById('navbar');
  const navLinks = document.querySelectorAll('.nav__link');
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navLinks');
  const sections = document.querySelectorAll('section[id]');

  function updateNavbar() {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  }

  function updateActiveLink() {
    const scrollPos = window.scrollY + 200;
    sections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      const id = section.getAttribute('id');
      if (scrollPos >= top && scrollPos < top + height) {
        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('data-section') === id) {
            link.classList.add('active');
          }
        });
      }
    });
  }

  navToggle.addEventListener('click', () => { navMenu.classList.toggle('open'); });
  navLinks.forEach(link => {
    link.addEventListener('click', () => { navMenu.classList.remove('open'); });
  });


  // ========================== BACK TO TOP ==========================
  const backToTop = document.getElementById('backToTop');
  function updateBackToTop() {
    backToTop.classList.toggle('visible', window.scrollY > 600);
  }
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });


  // ========================== SCROLL REVEAL ==========================
  const revealElements = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  revealElements.forEach(el => revealObserver.observe(el));


  // ========================== STAT COUNTERS ==========================
  const statValues = document.querySelectorAll('.stat__value[data-count]');
  let statsCounted = false;

  function animateCounters() {
    statValues.forEach(el => {
      const target = parseFloat(el.dataset.count);
      const isDecimal = el.dataset.decimal === 'true';
      const duration = 2000;
      const start = performance.now();
      function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        el.textContent = isDecimal ? (target * ease).toFixed(1) : Math.floor(target * ease);
        if (progress < 1) requestAnimationFrame(step);
        else el.textContent = isDecimal ? target.toFixed(1) : target;
      }
      requestAnimationFrame(step);
    });
  }

  const statsSection = document.querySelector('.stats');
  const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !statsCounted) {
        statsCounted = true;
        animateCounters();
      }
    });
  }, { threshold: 0.3 });
  if (statsSection) statsObserver.observe(statsSection);


  // ========================== SCROLL HANDLER ==========================
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateScrollProgress();
        updateNavbar();
        updateActiveLink();
        updateBackToTop();
        ticking = false;
      });
      ticking = true;
    }
  });


  // ========================== PROJECT MODALS ==========================
  const projectData = {
    thesis: {
      badge: '<span class="project-card__badge project-card__badge--thesis" style="position:static;">Thesis - 9.5/10</span>',
      title: 'Optimization of Stock Trading Strategies via Reinforcement Learning',
      content: `
        <p>This graduation thesis explored the application of <strong>Group-Agent Reinforcement Learning (GARL)</strong> to optimize stock trading strategies on the Vietnamese stock market (HOSE). The research addressed three key problems: evaluating RL effectiveness vs. traditional methods, exploring multi-agent architectures, and proposing a simplified GARL method.</p>
        <p><strong>Key contributions:</strong></p>
        <ul>
          <li>Designed a custom Gymnasium-compliant trading environment with multi-dimensional state space, continuous action space, and turbulence-based risk control</li>
          <li>Developed and compared 4 strategies: ARIMA baseline, Single-Agent RL (5 algorithms with Optuna hyperparameter tuning), Multi-Agent Ensemble RL, and Group-Agent RL (GDQN)</li>
          <li>Multi-Agent RL achieved the highest cumulative return of 28.47%, outperforming market benchmarks</li>
          <li>GDQN demonstrated superior stability with lowest maximum drawdown through gradient-sharing mechanism</li>
          <li>Trained on 7 years of data (2017-2024) and backtested on 2024-2025 real historical data</li>
        </ul>
        <p>Technical indicators used: MACD, RSI, CCI, DX, SMA, Bollinger Bands, and a turbulence index for market anomaly detection.</p>
        <h4 style="margin-top: 20px; color: var(--text-primary); font-size: 0.9rem;">Tech Stack</h4>
        <div class="modal__tech-stack">
          <span class="modal__tech-tag">Python</span>
          <span class="modal__tech-tag">PyTorch</span>
          <span class="modal__tech-tag">Stable-Baselines3</span>
          <span class="modal__tech-tag">Optuna</span>
          <span class="modal__tech-tag">ARIMA</span>
          <span class="modal__tech-tag">FinRL</span>
          <span class="modal__tech-tag">Gymnasium</span>
          <span class="modal__tech-tag">Pandas</span>
          <span class="modal__tech-tag">NumPy</span>
        </div>
      `
    },
    fraud: {
      badge: '<span class="project-card__badge project-card__badge--research" style="position:static;">Research - Springer</span>',
      title: 'Explainable TabNet-Based Approach for Credit Card Fraud Detection',
      content: `
        <p>A research paper published by Springer in the proceedings of <strong>EIDT 2025</strong>. This work proposes a novel fraud detection framework that combines <strong>TabNet</strong> (a deep learning architecture for tabular data) with <strong>Explainable AI (XAI)</strong> techniques to provide both high accuracy and interpretability.</p>
        <p><strong>Key achievements:</strong></p>
        <ul>
          <li>Achieved an F1-Score of <strong>0.98</strong> on the Sparkov dataset, surpassing traditional models like XGBoost, Random Forest, and Logistic Regression</li>
          <li>Addressed class imbalance using SMOTE (Synthetic Minority Oversampling Technique)</li>
          <li>Applied SHAP for global feature importance and LIME for local instance explanations</li>
          <li>Used DICE for counterfactual explanations showing what changes would flip a fraud prediction</li>
          <li>Demonstrated that explainability does not sacrifice performance</li>
        </ul>
        <p><strong>Authors:</strong> Nhu-Tai Do, <em>Tuyen Ta Tran</em>, Huy Q Nguyen</p>
        <h4 style="margin-top: 20px; color: var(--text-primary); font-size: 0.9rem;">Tech Stack</h4>
        <div class="modal__tech-stack">
          <span class="modal__tech-tag">Python</span>
          <span class="modal__tech-tag">TabNet</span>
          <span class="modal__tech-tag">SMOTE</span>
          <span class="modal__tech-tag">SHAP</span>
          <span class="modal__tech-tag">LIME</span>
          <span class="modal__tech-tag">DICE</span>
          <span class="modal__tech-tag">Scikit-Learn</span>
        </div>
      `
    },
    iot: {
      badge: '<span class="project-card__badge project-card__badge--project" style="position:static;">Portfolio Project</span>',
      title: 'IoT AI Cluster Backend',
      content: `
        <p>A comprehensive backend system demonstrating full-stack engineering skills across multiple languages and paradigms. Built to showcase <strong>Python REST APIs, SQL databases, cluster failover/DR thinking, and AI integration</strong>.</p>
        <p><strong>Architecture highlights:</strong></p>
        <ul>
          <li><strong>Python/FastAPI</strong> backend with RESTful endpoints and OpenAPI documentation</li>
          <li><strong>SQLite</strong> database managing clusters, nodes, devices, telemetry, and incidents</li>
          <li>Cluster <strong>failover/DR flow</strong> via dedicated API endpoint</li>
          <li><strong>AI incident reporting</strong> integrated with OpenAI API (with offline fallback for demos)</li>
          <li><strong>ES6/DOM dashboard</strong> served from the API root</li>
          <li><strong>Node.js sample client</strong> for data ingestion testing</li>
          <li><strong>C++ telemetry simulator</strong> generating JSON payloads for device-side telemetry</li>
          <li>Full <strong>pytest</strong> test suite</li>
        </ul>
        <h4 style="margin-top: 20px; color: var(--text-primary); font-size: 0.9rem;">Tech Stack</h4>
        <div class="modal__tech-stack">
          <span class="modal__tech-tag">FastAPI</span>
          <span class="modal__tech-tag">Python</span>
          <span class="modal__tech-tag">SQLite</span>
          <span class="modal__tech-tag">Node.js</span>
          <span class="modal__tech-tag">C++</span>
          <span class="modal__tech-tag">OpenAI API</span>
          <span class="modal__tech-tag">pytest</span>
          <span class="modal__tech-tag">ES6</span>
        </div>
      `
    }
  };

  const modalOverlay = document.getElementById('projectModal');
  const modalBody = document.getElementById('modalBody');
  const modalBadge = document.getElementById('modalBadge');
  const modalClose = document.getElementById('modalClose');

  projectCards.forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.project;
      const data = projectData[key];
      if (!data) return;
      modalBadge.innerHTML = data.badge;
      modalBody.innerHTML = `<h3>${data.title}</h3>${data.content}`;
      modalOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }


  // ========================== CONTACT FORM ==========================
  const contactForm = document.getElementById('contactForm');
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const message = document.getElementById('contact-message').value;
    const mailtoLink = `mailto:tatrantuyen@gmail.com?subject=Portfolio Contact from ${encodeURIComponent(name)}&body=${encodeURIComponent(`From: ${name}\nEmail: ${email}\n\n${message}`)}`;
    window.location.href = mailtoLink;
    const btn = contactForm.querySelector('.btn--primary');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = 'Message Sent!';
    btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = '';
      contactForm.reset();
    }, 3000);
  });


  // ========================== MICRO-INTERACTIONS ==========================
  // Skill tag hover
  document.querySelectorAll('.skill-tag').forEach(tag => {
    tag.addEventListener('mouseenter', () => { tag.style.transform = 'scale(1.08)'; });
    tag.addEventListener('mouseleave', () => { tag.style.transform = ''; });
  });

  // Magnetic buttons
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
    });
    btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
  });

  // Smooth anchor scrolling
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Project card tilt
  projectCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });

  // ========================== DARK MODE / THEME TOGGLER ==========================
  const themeToggleBtn = document.getElementById('themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', targetTheme);
      localStorage.setItem('theme', targetTheme);
    });
  }

})();
