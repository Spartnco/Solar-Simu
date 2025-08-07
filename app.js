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
  };

  // Utility: clamp and format
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const fmt = (v, digits = 2) => Number.isFinite(v) ? v.toFixed(digits) : '—';

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

  function drawStars() {
    const { width, height } = els.starCanvas;
    ctx.clearRect(0, 0, width, height);

    // Background stars
    drawBackground(width, height);

    if (!state.binary) {
      drawSingleStar(state.star1, width / 2, height / 2, Math.min(width, height) * 0.35);
    } else {
      // Two-body layout, size scaled by mass^0.4 for visibility
      const total = state.star1.massCurrent + state.star2.massCurrent;
      const rScale = Math.min(width, height) * 0.3;
      const sepPx = clamp(state.separationAU, 0.05, 10) / 10 * (width * 0.7);
      const cx = width / 2;
      const cy = height / 2;

      drawStarBubble(state.star1, cx - sepPx / 2, cy, rScale);
      drawStarBubble(state.star2, cx + sepPx / 2, cy, rScale);

      // Show Roche lobes (educational)
      drawRocheLobe(state.star1, state.star2, cx - sepPx / 2, cy, state.separationAU, rScale, sepPx);
      drawRocheLobe(state.star2, state.star1, cx + sepPx / 2, cy, state.separationAU, rScale, sepPx);
    }
  }

  function drawBackground(w, h) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function colorForTemp(T) {
    // Map temperature to color roughly (blue-hot to red-cool)
    const t = clamp((T - 2500) / (40000 - 2500), 0, 1);
    const r = Math.round(255 * (1 - t) + 100 * t);
    const g = Math.round(160 * (1 - t) + 180 * t);
    const b = Math.round(120 * (1 - t) + 255 * t);
    return `rgb(${r},${g},${b})`;
  }

  function drawSingleStar(star, cx, cy, maxR) {
    const { L, R, T, stage } = updateStarParams(star);
    const size = Math.pow(R, 0.4) / Math.pow(1.0, 0.4) * (maxR * 0.6);
    const color = colorForTemp(T);

    drawGlow(cx, cy, size, color);
    drawDisk(cx, cy, size * 0.6, color);

    // Stage overlay
    drawStageRing(cx, cy, size * 0.7, stage);
  }

  function drawStarBubble(star, cx, cy, rScale) {
    const { L, R, T, stage } = updateStarParams(star);
    const size = Math.pow(R, 0.4) * rScale * 0.15;
    const color = colorForTemp(T);
    drawGlow(cx, cy, size, color);
    drawDisk(cx, cy, size * 0.6, color);
    drawStageRing(cx, cy, size * 0.7, stage);
  }

  function drawGlow(cx, cy, radius, color) {
    const g = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,255,255,0)');
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

  function drawRocheLobe(donor, accretor, cx, cy, separationAU, rScale, sepPx) {
    const RL = rocheLobeRadiusAU(donor.massCurrent, accretor.massCurrent, separationAU);
    const RLpx = RL / separationAU * sepPx;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, RLpx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
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
    advanceTime(dtYears);
    requestAnimationFrame(tick);
  }

  function advanceTime(dtYears) {
    state.t += dtYears;

    const stars = [state.star1, ...(state.binary ? [state.star2] : [])];
    for (const star of stars) {
      if (!star.ended) {
        star.age += dtYears;
        if (star.age >= star.tTotal) {
          star.age = star.tTotal;
          star.ended = true;
        }
      }
    }

    // Mass transfer occurs after stage growth updates (radii change with mass)
    doMassTransfer(dtYears);

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
    updateUI();
  }

  // Initialize UI
  function init() {
    setBinaryEnabled(false);
    syncMassInputs('primary');
    syncMassInputs('secondary');
    wireEvents();
    updateUI();
  }

  init();
})();