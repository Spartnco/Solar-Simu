// Stellar Life Simulator
// Simplified educational model with adjustable mass, time scaling, and optional binary mass transfer.

(() => {
  // Units and constants
  const YEAR = 1; // abstract year unit
  const MYR = 1e6 * YEAR; // million years
  const GYR = 1e9 * YEAR; // billion years

  // Fate thresholds (rough educational values)
  const WD_MAX = 8; // M_sun upper bound to end as white dwarf
  const NS_MAX = 20; // 8-20 neutron star
  // >= 20 black hole

  // UI elements
  const els = {
    massPrimary: document.getElementById('massPrimary'),
    massPrimaryInput: document.getElementById('massPrimaryInput'),
    massSecondary: document.getElementById('massSecondary'),
    massSecondaryInput: document.getElementById('massSecondaryInput'),
    separation: document.getElementById('separation'),
    separationInput: document.getElementById('separationInput'),
    transferRate: document.getElementById('transferRate'),
    transferRateInput: document.getElementById('transferRateInput'),
    binaryToggle: document.getElementById('binaryToggle'),
    binaryControls: document.getElementById('binaryControls'),
    playPause: document.getElementById('playPause'),
    reset: document.getElementById('reset'),
    speed: document.getElementById('speed'),
    speedLabel: document.getElementById('speedLabel'),
    autoScale: document.getElementById('autoScale'),
    ageLabel: document.getElementById('ageLabel'),
    lifetimeLabel: document.getElementById('lifetimeLabel'),
    progressBar: document.getElementById('progressBar'),
    starCanvas: document.getElementById('starCanvas'),
    stagePrimary: document.getElementById('stagePrimary'),
    massPrimaryOut: document.getElementById('massPrimaryOut'),
    luminosityPrimary: document.getElementById('luminosityPrimary'),
    radiusPrimary: document.getElementById('radiusPrimary'),
    tempPrimary: document.getElementById('tempPrimary'),
    fatePrimary: document.getElementById('fatePrimary'),
    stageSecondary: document.getElementById('stageSecondary'),
    massSecondaryOut: document.getElementById('massSecondaryOut'),
    luminositySecondary: document.getElementById('luminositySecondary'),
    radiusSecondary: document.getElementById('radiusSecondary'),
    tempSecondary: document.getElementById('tempSecondary'),
    fateSecondary: document.getElementById('fateSecondary'),
    secondaryCard: document.getElementById('secondaryCard'),
    timelinePrimary: document.getElementById('timelinePrimary'),
    timelineSecondary: document.getElementById('timelineSecondary'),
    massScale: document.getElementById('massScale'),
  };

  // State
  const state = {
    running: false,
    t: 0, // age in years
    speed: 10, // arbitrary time multiplier (when autoScale disabled)
    star1: makeStar(1.0),
    star2: makeStar(0.8),
    binary: false,
    separationAU: 0.5,
    transferRatePerYear: 0.01 / MYR, // convert from M_sun per Myr to per year
    presetsBound: false,
    // Camera and rendering state
    camera: {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      isPanning: false,
      panStartX: 0,
      panStartY: 0,
      didDrag: false,
    },
    bgStars: [],
    explosions: [], // active supernova explosions in world space
  };

  // Utility: clamp and format (use function declarations so they are hoisted)
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  function fmt(v, digits = 2) {
    return Number.isFinite(v) ? v.toFixed(digits) : '—';
  }

  // Easing utilities for smooth visual transitions
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => 0.5 * (1 - Math.cos(Math.PI * clamp(t, 0, 1)));
  const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  // Stellar relations (simplified)
  function msLifetimeYears(mass) {
    // t_MS ≈ 10 Gyr × M^(-2.5)
    return 10 * GYR * Math.pow(mass, -2.5);
  }

  function luminosityLsun(mass) {
    // L ~ M^3.5, clamp extremes for educational visuals
    return clamp(Math.pow(mass, 3.5), 0.001, 1e6);
  }

  function radiusRsun(mass) {
    // R ~ M^0.8 (rough)
    return clamp(Math.pow(mass, 0.8), 0.05, 2000);
  }

  function temperatureK(l, r) {
    // T/Tsun ≈ (L/R^2)^(1/4), Tsun ≈ 5772K
    const ratio = Math.pow(l / Math.pow(r, 2), 0.25);
    return clamp(5772 * ratio, 2000, 60000);
  }

  function fateForMass(mass) {
    if (mass < WD_MAX) return 'White Dwarf';
    if (mass < NS_MAX) return 'Neutron Star';
    return 'Black Hole';
  }

  function makeStar(initialMass) {
    const mass = clamp(initialMass, 0.1, 50);
    const tMS = msLifetimeYears(mass);
    const tProtostar = tMS * 0.01; // 1% of MS lifetime
    const tGiant = tMS * 0.1; // post-MS phases compressed
    const total = tProtostar + tMS + tGiant;
    return {
      massInitial: mass,
      massCurrent: mass,
      age: 0,
      tProtostar,
      tMS,
      tGiant,
      tTotal: total,
      ended: false,
      fate: fateForMass(mass),
      // Visual end-state animation
      collapseAnimating: false,
      collapseProgress: 0,
      // Supernova
      justEnded: false,
      hadSupernova: false,
    };
  }

  function updateStarParams(star) {
    const L = luminosityLsun(star.massCurrent);
    const R = radiusRsun(star.massCurrent);
    const T = temperatureK(L, R);
    const stage = stageForStar(star);
    return { L, R, T, stage };
  }

  function stageForStar(star) {
    if (star.ended) return star.fate;
    if (star.age < star.tProtostar) return 'Protostar';
    if (star.age < star.tProtostar + star.tMS) return 'Main Sequence';
    if (star.age < star.tTotal) return star.massInitial >= 8 ? 'Supergiant' : 'Giant';
    return star.fate;
  }

  // Binary helpers
  function rocheLobeRadiusAU(mDonor, mAccretor, separationAU) {
    // Eggleton approximation: RL/a = 0.49 q^(2/3) / [0.6 q^(2/3) + ln(1+q^(1/3))], q = mDonor/mAccretor
    const q = clamp(mDonor / mAccretor, 1e-3, 1e3);
    const q13 = Math.cbrt(q);
    const q23 = q13 * q13;
    const rlOverA = 0.49 * q23 / (0.6 * q23 + Math.log(1 + q13));
    return rlOverA * separationAU;
  }

  function stellarRadiusAU(Rsun) {
    // 1 AU ≈ 215 R_sun
    return Rsun / 215;
  }

  function doMassTransfer(dtYears) {
    if (!state.binary) return;

    const s1 = state.star1;
    const s2 = state.star2;
    const R1AU = stellarRadiusAU(radiusRsun(s1.massCurrent));
    const R2AU = stellarRadiusAU(radiusRsun(s2.massCurrent));

    const RL1 = rocheLobeRadiusAU(s1.massCurrent, s2.massCurrent, state.separationAU);
    const RL2 = rocheLobeRadiusAU(s2.massCurrent, s1.massCurrent, state.separationAU);

    const overfill1 = R1AU > RL1;
    const overfill2 = R2AU > RL2;

    const rate = state.transferRatePerYear; // M_sun per year when active

    if (!s1.ended && !s2.ended) {
      if (overfill1 && !overfill2) {
        const dm = rate * dtYears;
        transferMass(s1, s2, dm);
      } else if (overfill2 && !overfill1) {
        const dm = rate * dtYears;
        transferMass(s2, s1, dm);
      } else if (overfill1 && overfill2) {
        // If both overfill, no net transfer (symmetric) — keep simple
      }
    }
  }

  function transferMass(donor, accretor, dm) {
    const maxTransfer = Math.min(dm, donor.massCurrent - 0.1); // never go below 0.1 M☉
    if (maxTransfer <= 0) return;
    donor.massCurrent -= maxTransfer;
    accretor.massCurrent += maxTransfer;

    // Update fates on-the-fly
    donor.fate = fateForMass(donor.massCurrent);
    accretor.fate = fateForMass(accretor.massCurrent);

    // Update lifetimes proportional to mass change (recompute total clocks but keep absolute ages)
    const resetStarTimes = (star) => {
      const tMS = msLifetimeYears(star.massCurrent);
      star.tProtostar = tMS * 0.01;
      star.tMS = tMS;
      star.tGiant = tMS * 0.1;
      star.tTotal = star.tProtostar + star.tMS + star.tGiant;
    };
    resetStarTimes(donor);
    resetStarTimes(accretor);
  }

  // Rendering: canvas star(s)
  const ctx = els.starCanvas.getContext('2d');

  // Camera helpers (world<->screen). World units are pixels at zoom=1.
  function worldToScreen(x, y) {
    const { width, height } = els.starCanvas;
    const { zoom, offsetX, offsetY } = state.camera;
    return [x * zoom + width / 2 + offsetX, y * zoom + height / 2 + offsetY];
  }
  function screenToWorld(x, y) {
    const { width, height } = els.starCanvas;
    const { zoom, offsetX, offsetY } = state.camera;
    return [(x - width / 2 - offsetX) / zoom, (y - height / 2 - offsetY) / zoom];
  }

  // Background stars (persistent)
  function initBackgroundStars() {
    const count = 300;
    const spread = 4000; // world units
    state.bgStars = Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * spread,
      y: (Math.random() - 0.5) * spread,
      r: Math.random() * 1.2 + 0.2,
      a: 0.6 + Math.random() * 0.4,
    }));
  }

  function drawStarfield() {
    const { width, height } = els.starCanvas;
    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, width, height);
    for (const s of state.bgStars) {
      const [sx, sy] = worldToScreen(s.x, s.y);
      const r = Math.max(0.2, s.r);
      // twinkle
      const a = Math.max(0, Math.min(1, s.a + (Math.random() - 0.5) * 0.05));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStars() {
    const { width, height } = els.starCanvas;
    ctx.clearRect(0, 0, width, height);

    // Background
    drawStarfield();

    if (!state.binary) {
      // Single star centered at world origin
      drawStarAtWorld(state.star1, 0, 0, Math.min(width, height) * 0.35);
      // Explosions on top
      drawExplosions();
    } else {
      // Two-body layout, size scaled for visibility; positions based on separation
      const rScale = Math.min(width, height) * 0.3;
      const sepWorld = clamp(state.separationAU, 0.05, 10) / 10 * (width * 0.7); // world units
      const x1 = -sepWorld / 2;
      const x2 = +sepWorld / 2;

      drawStarAtWorld(state.star1, x1, 0, rScale);
      drawStarAtWorld(state.star2, x2, 0, rScale);

      // Roche lobes
      drawRocheLobeWorld(state.star1, state.star2, x1, 0, state.separationAU, sepWorld);
      drawRocheLobeWorld(state.star2, state.star1, x2, 0, state.separationAU, sepWorld);

      // Explosions on top
      drawExplosions();
    }
  }

  function colorForTemp(T) {
    // Approximate blackbody to RGB (improved mapping)
    // Source adapted from Tanner Helland's approximation
    let temp = clamp(T / 100, 10, 400);
    let r, g, b;
    // Red
    if (temp <= 66) r = 255; else r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    // Green
    if (temp <= 66) g = 99.4708025861 * Math.log(temp) - 161.1195681661; else g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    // Blue
    if (temp >= 66) b = 255; else if (temp <= 19) b = 0; else b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    r = clamp(Math.round(r), 0, 255);
    g = clamp(Math.round(g), 0, 255);
    b = clamp(Math.round(b), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  // Compute dynamic visual radius in pixels at zoom=1 for the current stage/age
  function dynamicRadiusPx(star, baseScalePx) {
    const { R, stage } = updateStarParams(star);

    // Fractions within each phase
    const fProtostar = clamp(star.age / star.tProtostar, 0, 1);
    const fMS = clamp((star.age - star.tProtostar) / star.tMS, 0, 1);
    const fGiant = clamp((star.age - star.tProtostar - star.tMS) / star.tGiant, 0, 1);

    // Base mapping from physical radius to visual scale
    const baseVisual = Math.pow(R, 0.4) * (baseScalePx * 0.15);

    let multiplier = 1;
    if (stage === 'Protostar') {
      // Large then contracting to ZAMS
      multiplier = lerp(3.0, 1.0, easeOutCubic(fProtostar));
    } else if (stage === 'Main Sequence') {
      // Slowly swells over life
      const swell = star.massInitial >= 1 ? 1.5 : 1.2;
      multiplier = lerp(1.0, swell, fMS);
    } else if (stage === 'Giant' || stage === 'Supergiant') {
      // Dramatic expansion
      const maxExp = star.massInitial >= 8 ? 800 : 150; // Rsun scale implicit in R^0.4 mapping
      const expFactor = lerp(2.0, (Math.pow(maxExp, 0.4)), easeInOut(fGiant));
      multiplier = expFactor;
    } else if (star.ended) {
      // Collapsed object size
      const finalRsun = finalCompactRadiusRsun(star);
      const finalVisual = Math.pow(finalRsun, 0.4) * (baseScalePx * 0.15);
      if (star.collapseAnimating && star.collapseProgress < 1) {
        // Interpolate from pre-collapse giant to compact size
        const preCollapse = Math.pow(Math.max(R, 1), 0.4) * (baseScalePx * 0.15) * 2.0;
        const t = easeInOut(star.collapseProgress);
        return lerp(preCollapse, Math.max(finalVisual, 2), t);
      }
      return Math.max(finalVisual, 2);
    }

    return clamp(baseVisual * multiplier, 2, baseScalePx);
  }

  function finalCompactRadiusRsun(star) {
    // Very rough physical scales
    if (star.fate === 'White Dwarf') {
      return 0.012; // ~Earth-sized
    }
    if (star.fate === 'Neutron Star') {
      return 1.5e-5; // ~10-15 km
    }
    // Black hole (Schwarzschild radius): 2.95 km per M☉
    const rs_km = 2.95 * star.massCurrent;
    const rsun_km = 696000;
    return Math.max(rs_km / rsun_km, 5e-6);
  }

  function drawStarAtWorld(star, wx, wy, baseScalePx) {
    const { L, R, T, stage } = updateStarParams(star);
    const sizePx = dynamicRadiusPx(star, baseScalePx);
    const color = colorForTemp(T);
    const [cx, cy] = worldToScreen(wx, wy);

    if (star.ended) {
      drawCompactObject(star, cx, cy, sizePx);
    } else {
      // multi-stop glow for nicer visuals
      drawMultiGlow(cx, cy, sizePx, color);
      drawPhotosphere(cx, cy, sizePx * 0.6, color);
      drawStageRing(cx, cy, sizePx * 0.7, stage);
    }

    // Trigger supernova on first frame after end for massive stars
    if (star.justEnded) {
      // For stars >= 8 M☉ only
      if (star.massInitial >= 8 && !star.hadSupernova) {
        startSupernova(wx, wy, color);
        star.hadSupernova = true;
      }
      star.justEnded = false;
    }
  }

  function drawMultiGlow(cx, cy, radius, color) {
    const gradient = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, `${color.replace('rgb', 'rgba').replace(')', ',0.8)')}`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // subtle corona spikes
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = Math.max(1, radius * 0.02);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.75, Math.sin(a) * radius * 0.75);
      ctx.lineTo(Math.cos(a) * radius * 1.1, Math.sin(a) * radius * 1.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPhotosphere(cx, cy, radius, color) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.4, color);
    g.addColorStop(1, 'rgba(0,0,0,0.2)'); // limb darkening
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDisk(cx, cy, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStageRing(cx, cy, radius, stage) {
    const colorMap = {
      'Protostar': getComputedStyle(document.documentElement).getPropertyValue('--protostar') || '#ffb703',
      'Main Sequence': getComputedStyle(document.documentElement).getPropertyValue('--ms') || '#5b9dff',
      'Giant': getComputedStyle(document.documentElement).getPropertyValue('--giant') || '#ef476f',
      'Supergiant': getComputedStyle(document.documentElement).getPropertyValue('--giant') || '#ef476f',
      'White Dwarf': getComputedStyle(document.documentElement).getPropertyValue('--wd') || '#8bd3e6',
      'Neutron Star': getComputedStyle(document.documentElement).getPropertyValue('--ns') || '#c77dff',
      'Black Hole': getComputedStyle(document.documentElement).getPropertyValue('--bh') || '#ff8fa3',
    };
    const color = colorMap[stage] || '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawRocheLobeWorld(donor, accretor, wx, wy, separationAU, sepWorld) {
    const RL = rocheLobeRadiusAU(donor.massCurrent, accretor.massCurrent, separationAU);
    const RLpx = RL / separationAU * sepWorld;
    const [cx, cy] = worldToScreen(wx, wy);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, RLpx * state.camera.zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawCompactObject(star, cx, cy, sizePx) {
    if (star.fate === 'White Dwarf') {
      const color = 'rgba(200,230,255,1)';
      drawMultiGlow(cx, cy, sizePx * 1.4, 'rgba(180,210,255,0.7)');
      drawDisk(cx, cy, Math.max(2, sizePx * 0.6), color);
      ctx.strokeStyle = 'rgba(200,230,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, sizePx * 0.9, 0, Math.PI * 2); ctx.stroke();
    } else if (star.fate === 'Neutron Star') {
      drawMultiGlow(cx, cy, sizePx * 1.2, 'rgba(199,125,255,0.8)');
      drawDisk(cx, cy, Math.max(2, sizePx * 0.5), '#c77dff');
      ctx.strokeStyle = 'rgba(199,125,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - sizePx * 1.6); ctx.lineTo(cx, cy - sizePx * 0.8);
      ctx.moveTo(cx, cy + sizePx * 0.8); ctx.lineTo(cx, cy + sizePx * 1.6);
      ctx.stroke();
    } else {
      drawDisk(cx, cy, Math.max(3, sizePx * 0.6), '#000');
      const ringR = Math.max(8, sizePx * 1.5);
      const g = ctx.createRadialGradient(cx, cy, ringR * 0.7, cx, cy, ringR);
      g.addColorStop(0, 'rgba(255,180,120,0.0)');
      g.addColorStop(0.8, 'rgba(255,120,80,0.8)');
      g.addColorStop(1, 'rgba(255,220,160,0.0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(2, ringR * 0.15);
      ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Supernova system
  function startSupernova(wx, wy, color) {
    state.explosions.push({
      wx, wy,
      ageMs: 0,
      durationMs: 2500,
      color,
      alive: true,
    });
  }

  function updateExplosions(dtMs) {
    for (const ex of state.explosions) {
      ex.ageMs += dtMs;
      if (ex.ageMs >= ex.durationMs) ex.alive = false;
    }
    state.explosions = state.explosions.filter(e => e.alive);
  }

  function drawExplosions() {
    for (const ex of state.explosions) {
      const t = clamp(ex.ageMs / ex.durationMs, 0, 1);
      const [cx, cy] = worldToScreen(ex.wx, ex.wy);
      const maxR = Math.min(els.starCanvas.width, els.starCanvas.height) * 0.6 * state.camera.zoom;
      const r = lerp(10, maxR, easeOutCubic(t));
      const alpha = 1 - t;

      // Flash core
      ctx.fillStyle = `rgba(255,255,255,${0.8 * alpha})`;
      ctx.beginPath(); ctx.arc(cx, cy, 6 + 20 * (1 - alpha), 0, Math.PI * 2); ctx.fill();

      // Shockwave ring
      ctx.strokeStyle = `rgba(255,180,120,${0.9 * alpha})`;
      ctx.lineWidth = 5 * (1 - t) + 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

      // Ejecta cloud
      const g = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r * 1.1);
      g.addColorStop(0, `rgba(255,120,80,${0.3 * alpha})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Timeline rendering
  function renderTimeline(el, star) {
    el.innerHTML = '';

    const w = el.clientWidth;
    const total = star.tTotal;
    const addSeg = (widthFrac, cls) => {
      const seg = document.createElement('div');
      seg.className = `segment ${cls}`;
      seg.style.left = `${pctSoFar}%`;
      seg.style.width = `${widthFrac * 100}%`;
      el.appendChild(seg);
      pctSoFar += widthFrac * 100;
    };

    let pctSoFar = 0;
    const p1 = star.tProtostar / total;
    const p2 = star.tMS / total;
    const p3 = star.tGiant / total;
    addSeg(p1, 'protostar');
    addSeg(p2, 'ms');

    const endCls = star.massInitial < WD_MAX ? 'end-wd' : (star.massInitial < NS_MAX ? 'end-ns' : 'end-bh');
    addSeg(p3, 'giant');

    // Cursor for current age
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    const frac = clamp(star.age / total, 0, 1);
    cursor.style.left = `${frac * 100}%`;
    el.appendChild(cursor);

    // Make timeline interactive (click/drag scrubbing)
    wireTimelineInteractivity(el);
  }

  // Fate scale rendering
  function renderMassScale(currentMass) {
    const el = els.massScale;
    const minM = 0.1, maxM = 50;
    const scaleWidth = el.clientWidth || 300;
    el.innerHTML = '';

    function placeZone(m0, m1, cls) {
      const left = ((m0 - minM) / (maxM - minM)) * 100;
      const width = ((m1 - m0) / (maxM - minM)) * 100;
      const div = document.createElement('div');
      div.className = `zone ${cls}`;
      div.style.left = `${left}%`;
      div.style.width = `${width}%`;
      el.appendChild(div);
    }

    placeZone(minM, WD_MAX, 'wd');
    placeZone(WD_MAX, NS_MAX, 'ns');
    placeZone(NS_MAX, maxM, 'bh');

    const marker = document.createElement('div');
    marker.className = 'marker';
    const left = ((currentMass - minM) / (maxM - minM)) * 100;
    marker.style.left = `${clamp(left, 0, 100)}%`;
    el.appendChild(marker);
  }

  // UI syncing helpers
  function syncMassInputs(which) {
    if (which === 'primary') {
      const v = parseFloat(els.massPrimary.value);
      els.massPrimaryInput.value = fmt(v, 2);
    } else {
      const v = parseFloat(els.massSecondary.value);
      els.massSecondaryInput.value = fmt(v, 2);
    }
  }

  function setBinaryEnabled(enabled) {
    state.binary = enabled;
    els.binaryControls.classList.toggle('hidden', !enabled);
    els.secondaryCard.style.display = enabled ? 'block' : 'none';
    els.timelineSecondary.style.display = enabled ? 'block' : 'none';
  }

  // Simulation loop
  let lastTs = 0;
  function tick(ts) {
    if (!state.running) return;
    if (!lastTs) lastTs = ts;
    const dtMs = ts - lastTs;
    lastTs = ts;

    // Determine dtYears according to scaling
    const s1 = state.star1;
    const lifetime = s1.tTotal; // use primary lifetime for autoscale
    let dtYears;
    if (els.autoScale.checked) {
      // about 60 seconds total for the star's lifetime
      const secondsForLifetime = 60;
      const yearsPerSecond = lifetime / secondsForLifetime;
      dtYears = (dtMs / 1000) * yearsPerSecond;
    } else {
      dtYears = (dtMs / 1000) * state.speed * 1e7; // adjustable arbitrary scale
    }

    // Advance ages (both stars age together for simplicity)
    advanceTime(dtYears, dtMs);
    requestAnimationFrame(tick);
  }

  function advanceTime(dtYears, dtMs = 0) {
    state.t += dtYears;

    const stars = [state.star1, ...(state.binary ? [state.star2] : [])];
    for (const star of stars) {
      if (!star.ended) {
        star.age += dtYears;
        if (star.age >= star.tTotal) {
          star.age = star.tTotal;
          star.ended = true;
          star.collapseAnimating = true;
          star.collapseProgress = 0;
          star.justEnded = true; // used to spawn supernova with world position in draw pass
        }
      } else if (star.collapseAnimating) {
        star.collapseProgress += dtMs / 2000; // 2s collapse animation
        if (star.collapseProgress >= 1) {
          star.collapseProgress = 1;
          star.collapseAnimating = false;
        }
      }
    }

    // Mass transfer occurs after stage growth updates (radii change with mass)
    doMassTransfer(dtYears);

    // Update supernova explosions
    updateExplosions(dtMs);

    updateUI();
  }

  // UI update
  function updateUI() {
    // Readouts primary
    const p = state.star1;
    const pp = updateStarParams(p);
    els.stagePrimary.textContent = pp.stage;
    els.massPrimaryOut.textContent = `${fmt(p.massCurrent, 2)} M☉`;
    els.luminosityPrimary.textContent = `${fmt(pp.L, 2)} L☉`;
    els.radiusPrimary.textContent = `${fmt(pp.R, 2)} R☉`;
    els.tempPrimary.textContent = `${Math.round(pp.T)} K`;
    els.fatePrimary.textContent = p.fate;

    // Secondary
    if (state.binary) {
      const s = state.star2;
      const sp = updateStarParams(s);
      els.stageSecondary.textContent = sp.stage;
      els.massSecondaryOut.textContent = `${fmt(s.massCurrent, 2)} M☉`;
      els.luminositySecondary.textContent = `${fmt(sp.L, 2)} L☉`;
      els.radiusSecondary.textContent = `${fmt(sp.R, 2)} R☉`;
      els.tempSecondary.textContent = `${Math.round(sp.T)} K`;
      els.fateSecondary.textContent = s.fate;
    }

    // Age and lifetime
    els.ageLabel.textContent = prettyYears(state.star1.age);
    els.lifetimeLabel.textContent = prettyYears(state.star1.tTotal);

    const progress = clamp(state.star1.age / state.star1.tTotal, 0, 1) * 100;
    els.progressBar.style.width = `${progress}%`;

    // Canvas
    drawStars();

    // Timelines
    renderTimeline(els.timelinePrimary, state.star1);
    if (state.binary) renderTimeline(els.timelineSecondary, state.star2);

    // Fate scale
    renderMassScale(state.star1.massCurrent);

    // Speed label
    els.speedLabel.textContent = `${fmt(state.speed, 1)}×`;
  }

  function prettyYears(years) {
    if (years < 1e6) return `${fmt(years / 1e3, 1)} kyr`;
    if (years < 1e9) return `${fmt(years / 1e6, 1)} Myr`;
    return `${fmt(years / 1e9, 2)} Gyr`;
  }

  // Event wiring
  function wireEvents() {
    // Mass primary
    els.massPrimary.addEventListener('input', () => {
      syncMassInputs('primary');
      const m = parseFloat(els.massPrimary.value);
      state.star1 = makeStar(m);
      if (!state.binary) state.star2 = makeStar(state.star2.massCurrent);
      updateUI();
    });
    els.massPrimaryInput.addEventListener('change', () => {
      const v = clamp(parseFloat(els.massPrimaryInput.value), 0.1, 50);
      els.massPrimary.value = String(v);
      state.star1 = makeStar(v);
      updateUI();
    });

    // Binary toggle
    els.binaryToggle.addEventListener('change', () => {
      setBinaryEnabled(els.binaryToggle.checked);
      updateUI();
    });

    // Secondary mass
    els.massSecondary.addEventListener('input', () => {
      syncMassInputs('secondary');
      const m = parseFloat(els.massSecondary.value);
      state.star2 = makeStar(m);
      updateUI();
    });
    els.massSecondaryInput.addEventListener('change', () => {
      const v = clamp(parseFloat(els.massSecondaryInput.value), 0.1, 50);
      els.massSecondary.value = String(v);
      state.star2 = makeStar(v);
      updateUI();
    });

    // Separation
    const applySep = () => {
      const v = clamp(parseFloat(els.separation.value), 0.01, 10);
      els.separationInput.value = fmt(v, 2);
      state.separationAU = v;
      updateUI();
    };
    els.separation.addEventListener('input', applySep);
    els.separationInput.addEventListener('change', () => {
      const v = clamp(parseFloat(els.separationInput.value), 0.01, 10);
      els.separation.value = String(v);
      state.separationAU = v;
      updateUI();
    });

    // Transfer rate
    const applyRate = () => {
      const v = clamp(parseFloat(els.transferRate.value), 0, 0.2);
      els.transferRateInput.value = fmt(v, 3);
      state.transferRatePerYear = v / MYR;
    };
    els.transferRate.addEventListener('input', applyRate);
    els.transferRateInput.addEventListener('change', () => {
      const v = clamp(parseFloat(els.transferRateInput.value), 0, 0.2);
      els.transferRate.value = String(v);
      state.transferRatePerYear = v / MYR;
    });

    // Speed
    els.speed.addEventListener('input', () => {
      const v = parseFloat(els.speed.value);
      state.speed = v;
      els.speedLabel.textContent = `${fmt(v, 1)}×`;
    });

    // Play/pause
    els.playPause.addEventListener('click', () => {
      state.running = !state.running;
      els.playPause.textContent = state.running ? 'Pause' : 'Play';
      if (state.running) {
        lastTs = 0;
        requestAnimationFrame(tick);
      }
    });

    // Reset
    els.reset.addEventListener('click', () => {
      const m1 = parseFloat(els.massPrimary.value);
      const m2 = parseFloat(els.massSecondary.value);
      state.star1 = makeStar(m1);
      state.star2 = makeStar(m2);
      state.t = 0;
      state.running = false;
      els.playPause.textContent = 'Play';
      // Reset camera
      state.camera.zoom = 1; state.camera.offsetX = 0; state.camera.offsetY = 0;
      updateUI();
    });

    // Presets
    if (!state.presetsBound) {
      document.querySelectorAll('.presets [data-preset]').forEach(btn => {
        btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
      });
      state.presetsBound = true;
    }

    // Resize redraw
    window.addEventListener('resize', () => updateUI());

    // Camera controls on canvas
    const canvas = els.starCanvas;
    canvas.addEventListener('mousedown', (e) => {
      state.camera.isPanning = true;
      state.camera.panStartX = e.clientX;
      state.camera.panStartY = e.clientY;
      state.camera.didDrag = false;
      canvas.classList.add('grabbing');
    });
    window.addEventListener('mousemove', (e) => {
      if (!state.camera.isPanning) return;
      const dx = e.clientX - state.camera.panStartX;
      const dy = e.clientY - state.camera.panStartY;
      state.camera.panStartX = e.clientX;
      state.camera.panStartY = e.clientY;
      state.camera.offsetX += dx;
      state.camera.offsetY += dy;
      if (Math.hypot(dx, dy) > 3) state.camera.didDrag = true;
      updateUI();
    });
    window.addEventListener('mouseup', (e) => {
      const wasDragging = state.camera.isPanning;
      state.camera.isPanning = false;
      canvas.classList.remove('grabbing');
      // If it was a click (no drag), focus on nearest star
      if (wasDragging && !state.camera.didDrag) {
        focusOnNearestStar(e);
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { zoom } = state.camera;
      const delta = -e.deltaY;
      const zoomFactor = Math.exp(delta * 0.0012);
      const newZoom = clamp(zoom * zoomFactor, 0.1, 12);
      // Anchor zoom on mouse position
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [wx, wy] = screenToWorld(mx, my);
      state.camera.zoom = newZoom;
      const [sx, sy] = worldToScreen(wx, wy);
      // Adjust offset so that the point under cursor stays fixed
      state.camera.offsetX += (mx - sx);
      state.camera.offsetY += (my - sy);
      updateUI();
    }, { passive: false });
    canvas.addEventListener('dblclick', (e) => {
      // Smart double-click: focus and zoom to object
      focusOnNearestStar(e, true);
    });

    // Keyboard zoom shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === '+') { adjustZoom(1.2); }
      if (e.key === '-' || e.key === '_') { adjustZoom(1/1.2); }
      if (e.key === '0') { state.camera.zoom = 1; state.camera.offsetX = 0; state.camera.offsetY = 0; updateUI(); }
      if (e.key.toLowerCase() === 'f') { framePrimary(); }
    });
  }

  function adjustZoom(factor) {
    const canvas = els.starCanvas;
    const rect = canvas.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;
    const [wx, wy] = screenToWorld(mx, my);
    state.camera.zoom = clamp(state.camera.zoom * factor, 0.1, 12);
    const [sx, sy] = worldToScreen(wx, wy);
    state.camera.offsetX += (mx - sx);
    state.camera.offsetY += (my - sy);
    updateUI();
  }

  function focusOnNearestStar(e, zoomIn = false) {
    const rect = els.starCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Compute screen positions of stars
    let positions = [];
    if (!state.binary) {
      positions.push({ wx: 0, wy: 0 });
    } else {
      const sepWorld = clamp(state.separationAU, 0.05, 10) / 10 * (els.starCanvas.width * 0.7);
      positions.push({ wx: -sepWorld / 2, wy: 0 });
      positions.push({ wx: +sepWorld / 2, wy: 0 });
    }
    let best = null, bestD = Infinity;
    for (const p of positions) {
      const [sx, sy] = worldToScreen(p.wx, p.wy);
      const d = Math.hypot(mx - sx, my - sy);
      if (d < bestD) { bestD = d; best = { ...p, sx, sy }; }
    }
    if (!best) return;

    // Center camera on star
    state.camera.offsetX += (rect.width / 2 - best.sx);
    state.camera.offsetY += (rect.height / 2 - best.sy);

    if (zoomIn) {
      state.camera.zoom = clamp(state.camera.zoom * 1.8, 0.1, 12);
    }
    updateUI();
  }

  function framePrimary() {
    // Zoom to frame the primary star nicely
    const targetZoom = 3;
    state.camera.zoom = clamp(targetZoom, 0.1, 12);
    // center origin
    const rect = els.starCanvas.getBoundingClientRect();
    const [sx, sy] = worldToScreen(0, 0);
    state.camera.offsetX += (rect.width / 2 - sx);
    state.camera.offsetY += (rect.height / 2 - sy);
    updateUI();
  }

  function setSimulationAge(ageYears) {
    state.star1.age = clamp(ageYears, 0, state.star1.tTotal);
    if (state.binary) {
      state.star2.age = clamp(ageYears, 0, state.star2.tTotal);
    }
    // Do not auto-run
    updateUI();
  }

  function wireTimelineInteractivity(el) {
    // Click to jump, drag to scrub
    let isDown = false;
    const onFromEvent = (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const frac = clamp(x, 0, 1);
      const age = frac * state.star1.tTotal; // global simulation age
      setSimulationAge(age);
    };
    el.addEventListener('mousedown', (e) => { isDown = true; onFromEvent(e); });
    window.addEventListener('mousemove', (e) => { if (isDown) onFromEvent(e); });
    window.addEventListener('mouseup', () => { isDown = false; });
    el.addEventListener('click', onFromEvent);
  }

  function applyPreset(name) {
    switch (name) {
      case 'red-dwarf':
        els.massPrimary.value = '0.2'; syncMassInputs('primary'); state.star1 = makeStar(0.2);
        els.binaryToggle.checked = false; setBinaryEnabled(false);
        break;
      case 'sun':
        els.massPrimary.value = '1.0'; syncMassInputs('primary'); state.star1 = makeStar(1.0);
        els.binaryToggle.checked = false; setBinaryEnabled(false);
        break;
      case 'massive':
        els.massPrimary.value = '20'; syncMassInputs('primary'); state.star1 = makeStar(20);
        els.binaryToggle.checked = false; setBinaryEnabled(false);
        break;
      case 'binary-rlof':
        els.massPrimary.value = '1.2'; syncMassInputs('primary'); state.star1 = makeStar(1.2);
        els.binaryToggle.checked = true; setBinaryEnabled(true);
        els.massSecondary.value = '0.8'; syncMassInputs('secondary'); state.star2 = makeStar(0.8);
        els.separation.value = '0.2'; els.separationInput.value = '0.20'; state.separationAU = 0.2;
        els.transferRate.value = '0.02'; els.transferRateInput.value = '0.020'; state.transferRatePerYear = 0.02 / MYR;
        break;
    }
    state.t = 0; state.running = false; els.playPause.textContent = 'Play';
    // Reset camera
    state.camera.zoom = 1; state.camera.offsetX = 0; state.camera.offsetY = 0;
    updateUI();
  }

  // Initialize UI
  function init() {
    setBinaryEnabled(false);
    syncMassInputs('primary');
    syncMassInputs('secondary');
    initBackgroundStars();
    wireEvents();
    updateUI();
  }

  init();
})();