import {
  db,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp
} from "../firebase/firebase.js";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = "gemini-3.5-flash-lite";

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

let stream = null;
let capturedImage = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const preview = document.getElementById('preview');
const captureControls = document.getElementById('captureControls');
const generateBtn = document.getElementById('generateBtn');
const spinner = document.getElementById('spinner');
const errorBox = document.getElementById('errorBox');
const resultsDiv = document.getElementById('results');
const fileFallback = document.getElementById('fileFallback');

const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');
const handStatus = document.getElementById('handStatus');
const takeBtn = document.getElementById('takeBtn');
const retakeBtn = document.getElementById('retakeBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const toScreen2Btn = document.getElementById('toScreen2Btn');
const screen1Error = document.getElementById('screen1Error');

const getEventId = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('event') || 'default_event';
};

// ---------- Screen navigation ----------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateStepsTrack(id);
}

// ---------- left-rail flow tracker (purely decorative, mirrors current screen) ----------

function updateStepsTrack(activeId) {
  const order = ['screen1', 'screen2', 'screen3', 'printArea'];
  const items = document.querySelectorAll('#stepsTrack .step-item');
  if (!items.length) return;
  const activeIndex = order.indexOf(activeId);
  items.forEach(item => {
    const forId = item.dataset.for;
    const idx = order.indexOf(forId);
    item.classList.remove('current', 'done');
    if (idx === activeIndex) item.classList.add('current');
    else if (idx < activeIndex) item.classList.add('done');
  });
}

// ---------- top-right local clock & bottom-right session uptime ----------

(function initClocks() {
  const localClockEl = document.getElementById('localClock');
  const uptimeEl = document.getElementById('uptimeClock');
  const startedAt = Date.now();

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    if (localClockEl) {
      const now = new Date();
      localClockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
    if (uptimeEl) {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      uptimeEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    }
  }

  tick();
  setInterval(tick, 1000);
})();

// ---------- ambient floating circuits (decorative, isolated, device-friendly) ----------

(function initFloatingChips() {
  const rain = document.getElementById('rain');
  if (!rain) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const glyphs = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="7" y="7" width="10" height="10" rx="1.4"/><path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M6 8v4h12V8M12 12v4"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 12h4M16 12h4M12 4v4M12 16v4"/><circle cx="12" cy="12" r="4"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 4v16M18 4v16M6 8h4M14 8h4M6 16h4M14 16h4"/></svg>'
  ];

  const isSmall = window.innerWidth < 480;
  const isMedium = window.innerWidth < 900;
  const count = isSmall ? 7 : isMedium ? 11 : 16;

  const chips = [];
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('div');
    chip.className = 'float-chip' + (i % 3 === 0 ? ' alt' : '');
    chip.innerHTML = glyphs[i % glyphs.length];
    chip.style.left = Math.random() * 96 + 'vw';

    const size = 16 + Math.random() * 20;
    chip.style.width = size + 'px';
    chip.style.height = size + 'px';

    chip.style.setProperty('--drift-x', (Math.random() * 80 - 40) + 'px');
    chip.style.setProperty('--drift-r', (Math.random() * 140 - 70) + 'deg');
    chip.style.setProperty('--chip-opacity', (0.25 + Math.random() * 0.35).toFixed(2));

    const driftDur = 14 + Math.random() * 12;
    const fadeDur = 5 + Math.random() * 3;
    chip.style.animationDuration = `${driftDur}s, ${fadeDur}s`;
    chip.style.animationDelay = `${Math.random() * driftDur}s, ${Math.random() * fadeDur}s`;

    rain.appendChild(chip);
    chips.push(chip);
  }

  document.addEventListener('visibilitychange', () => {
    const state = document.hidden ? 'paused' : 'running';
    chips.forEach(c => { c.style.animationPlayState = state; });
  });
})();

let handDetected = false;
let trackingActive = false;

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.6,
  minTrackingConfidence: 0.6
});
hands.onResults(onHandResults);

function onHandResults(results) {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

  const found = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
  handDetected = found;

  if (found) {
    for (const landmarks of results.multiHandLandmarks) {
      drawConnectors(overlayCtx, landmarks, HAND_CONNECTIONS, { color: '#5ee7ff', lineWidth: 3 });
      window.drawLandmarks
        ? drawLandmarks(overlayCtx, landmarks, { color: '#7c8fff', lineWidth: 1, radius: 3 })
        : null;
    }
    handStatus.textContent = 'Palm detected — hold steady and tap Take Photo';
  } else {
    handStatus.textContent = 'Show your palm to the camera';
  }
  takeBtn.disabled = !found;
}

// Frame loop: feeds the live video into MediaPipe while tracking is active
async function trackingLoop() {
  if (!trackingActive) return;
  if (video.readyState >= 2) {
    await hands.send({ image: video });
  }
  requestAnimationFrame(trackingLoop);
}

// ---------- UI helpers ----------

function showError(msg) {
  errorBox.innerHTML = `<div class="error">${msg}</div>`;
}
function clearError() {
  errorBox.innerHTML = '';
}

// ---------- Camera handling ----------

async function openCamera() {
  clearError();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    document.querySelector('.video-wrap').style.display = 'inline-block';
    video.srcObject = stream;
    video.classList.add('active');
    preview.classList.remove('active');
    capturedImage = null;
    generateBtn.disabled = true;

    retakeBtn.style.display = 'none';
    takeBtn.style.display = 'flex';
    captureControls.style.display = 'flex';
    handStatus.style.display = 'block';

    trackingActive = true;
    video.onloadeddata = () => trackingLoop();
  } catch (err) {
    showError("Camera access unavailable or denied. Please use the fallback file upload below.");
    fileFallback.style.display = 'block';
  }
}

function stopCamera() {
  trackingActive = false;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.classList.remove('active');
  overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
}

function capturePalm() {
  if (!handDetected) return;
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedImage = canvas.toDataURL('image/jpeg', 0.5);
  preview.src = capturedImage;
  preview.classList.add('active');

  document.querySelector('.video-wrap').style.display = 'none';
  handStatus.style.display = 'none';
  
  // Hide Take button, show only Retake button
  captureControls.style.display = 'none';
  takeBtn.style.display = 'none';
  retakeBtn.style.display = 'flex';

  stopCamera();
  generateBtn.disabled = false;
}

function retakePalm() {
  preview.classList.remove('active');
  capturedImage = null;
  generateBtn.disabled = true;
  captureControls.style.display = 'flex';
  takeBtn.style.display = 'flex';
  retakeBtn.style.display = 'none';
  handStatus.style.display = 'block';
  openCamera();
}

function resetAll() {
  stopCamera();

  document.getElementById('name').value = '';
  document.getElementById('contact').value = '';
  document.getElementById('dob').value = '';
  screen1Error.innerHTML = '';

  capturedImage = null;
  preview.src = '';
  preview.classList.remove('active');
  fileFallback.value = '';

  document.querySelector('.video-wrap').style.display = 'none';
  captureControls.style.display = 'flex';
  retakeBtn.style.display = 'none';
  takeBtn.style.display = 'flex';
  handStatus.style.display = 'block';
  handStatus.textContent = 'Show your palm to the camera';
  takeBtn.disabled = true;

  generateBtn.disabled = true;

  resultsDiv.innerHTML = '';
  clearError();
  document.getElementById('shareBox').classList.remove('active');
  document.getElementById('qrcode').innerHTML = '';
}

fileFallback.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    capturedImage = reader.result;
    preview.src = capturedImage;
    preview.classList.add('active');
    generateBtn.disabled = false;
  };
  reader.readAsDataURL(file);
});

takeBtn.addEventListener('click', capturePalm);
retakeBtn.addEventListener('click', retakePalm);
clearAllBtn.addEventListener('click', () => {
  if (window.NxtGenIntro && window.NxtGenIntro.start) {
    window.NxtGenIntro.start(() => {
      resetAll();
      showScreen('screen1');
    });
  } else {
    // fallback in case intro script didn't load
    resetAll();
    showScreen('screen1');
  }
});

toScreen2Btn.addEventListener('click', () => {
  screen1Error.innerHTML = '';
  const name = document.getElementById('name').value;
  const contact = document.getElementById('contact').value;
  const dob = document.getElementById('dob').value;
  
  if (!name) {
    screen1Error.innerHTML = '<div class="error">Please enter your name.</div>';
    return;
  }
  if (!contact) {
    screen1Error.innerHTML = '<div class="error">Please enter your email or phone number.</div>';
    return;
  }
  if (!dob) {
    screen1Error.innerHTML = '<div class="error">Please enter your date of birth.</div>';
    return;
  }
  
  showScreen('screen2');
  // Auto-open camera on screen2
  setTimeout(() => openCamera(), 300);
});

// ---------- Text/markdown helpers ----------

function mdToHtml(text) {
  if (!text) return '';
  return text
    .replace(/^### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^## (.*$)/gim, '<h3>$1</h3>')
    .replace(/^# (.*$)/gim, '<h2>$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function parseReading(text) {
  const sections = {};
  const regex = /#{1,3}\s*([^\n]+)\n([\s\S]*?)(?=\n#{1,3}\s|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const key = m[1].replace(/[:*_]/g, '').trim().toLowerCase();
    sections[key] = m[2].trim();
  }
  return sections;
}

function splitList(str) {
  if (!str) return [];
  return str
    .replace(/[*_]/g, '')
    .split(/\n|,/)
    .map(s => s
      .trim()
      .replace(/^[-*]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim()
    )
    .filter(Boolean);
}

function parseScores(text) {
  const block = text.match(/#{1,3}\s*Percentage Scores\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i);
  const scores = {};
  if (block) {
    block[1].split('\n').forEach(line => {
      const m = line.match(/([A-Za-z]+)\s*[:\-]\s*(\d{1,3})/);
      if (m) scores[m[1].toLowerCase()] = Math.min(100, parseInt(m[2], 10));
    });
  }
  return scores;
}

function renderStat(label, value) {
  const pct = value || 0;
  return `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="bar-value">${pct}%</span>
    </div>
  `;
}

// ---------- Reading render ----------

function renderResults(text, name, dob) {
  const s = parseReading(text);
  const scores = parseScores(text);

  const numbers = splitList(s['lucky numbers']).join(' and ');
  const colors = splitList(s['lucky colors']).join(', ');
  const days = splitList(s['lucky days']).join(', ');
  const luckyParagraph = `Your lucky numbers are ${numbers}, with ${colors} as your lucky color. ${days} is your luckiest day to lean into new opportunities.`;

  resultsDiv.innerHTML = `
    <div class="reading-card">
      <div class="reading-header">
        <div class="mark">NAM</div>
        <div class="tag">Palm &amp; Astrology Readings</div>
      </div>

      <p class="disclaimer-top">${s['entertainment disclaimer'] || ''}</p>

      <div class="top-grid">
        <div class="top-left">
          <div class="person-info">
            <div class="person-name">${name}</div>
            <div class="person-dob">${dob}</div>
          </div>
          <div class="bars-list">
            ${renderStat('Health', scores['health'])}
            ${renderStat('Wealth', scores['wealth'])}
            ${renderStat('Love', scores['love'])}
            ${renderStat('Luck', scores['luck'])}
            ${renderStat('Career', scores['career'])}
          </div>
        </div>
        <div class="top-right">
          <img id="palmPhotoImg" class="palm-photo-img" src="${capturedImage || ''}" alt="Captured palm photo">
        </div>
      </div>

      <section class="section-block">
        <h3 class="section-title">Lucky Details</h3>
        <p class="lucky-paragraph">${luckyParagraph}</p>
      </section>

      <section class="section-block">
        <h3 class="section-title">Spiritual Guidance</h3>
        <p class="guidance-text">${mdToHtml(s['spiritual guidance'] || '')}</p>
      </section>

      <p class="disclaimer-bottom">${s['closing disclaimer'] || ''}</p>
    </div>
  `;
}

// ---------- QR / soft copy sharing ----------

function makeThumbnail(srcDataUrl, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(c.toDataURL('image/jpeg', 0.4));
    };
    img.onerror = () => reject(new Error('thumbnail failed'));
    img.src = srcDataUrl;
  });
}

function toAscii(s) {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');
}

function extractSummary(fullText) {
  const s = parseReading(fullText);
  let summary = s['spiritual guidance'] || fullText;
  summary = summary.replace(/[#*]/g, '').trim();
  if (summary.length > 350) summary = summary.slice(0, 350).trim() + '…';
  return summary;
}

function buildSoftCopyUrl(name, dob, fullText, thumbDataUrl) {
  const maxSummary = thumbDataUrl ? 130 : 220;
  const summary = extractSummary(fullText).slice(0, maxSummary).trim();
  const safe = s => toAscii(String(s || '')).replace(/[<>]/g, '');

  let body = `<body style="margin:0;padding:22px 18px;min-height:100vh;font-family:Segoe UI,Roboto,sans-serif;`
    + `background:linear-gradient(135deg,#05070a,#101826);color:#e9edf3;box-sizing:border-box">`
    + `<div style="max-width:340px;margin:0 auto;background:rgba(233,237,243,.06);border:1px solid rgba(94,231,255,.35);`
    + `border-radius:16px;padding:20px;text-align:center">`
    + `<div style="font-weight:800;letter-spacing:.3em;font-size:20px;color:#a6f4ff">NxtGen</div>`
    + `<div style="font-size:9px;opacity:.7;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px">AI Palm Insight</div>`;

  if (thumbDataUrl) {
    body += `<img src="${thumbDataUrl}" style="width:76px;height:76px;border-radius:50%;object-fit:cover;border:2px solid #5ee7ff;margin-bottom:10px">`;
  }

  body += `<div style="font-size:17px;font-weight:600">${safe(name)}</div>`
    + `<div style="font-size:10px;opacity:.65;margin-bottom:12px">${safe(dob)}</div>`
    + `<div style="height:1px;background:rgba(233,237,243,.18);margin:0 0 12px"></div>`
    + `<p style="font-size:12.5px;line-height:1.5;margin:0;text-align:left">${safe(summary)}</p>`
    + `<div style="font-size:8px;opacity:.55;margin-top:14px">For entertainment purposes only · full reading shown on screen</div>`
    + `</div></body>`;

  return 'data:text/html;charset=utf-8,' + encodeURIComponent(body);
}

function drawQrOrThrow(qrEl, url) {
  qrEl.innerHTML = '';
  new QRCode(qrEl, {
    text: url,
    width: 220,
    height: 220,
    colorDark: '#0b1220',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.L
  });
}

document.getElementById('printBtn').addEventListener('click', () => {
  window.print();
});

// ---------- 3D network sphere (three.js) ----------

let threeRenderer = null;
let threeScene = null;
let threeCamera = null;
let threeModel = null;
let threeRAF = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function createNetworkSphere() {
  const group = new THREE.Group();
  const radius = 1;

  // Fibonacci sphere distribution — even, natural node spacing
  const pointCount = 70;
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < pointCount; i++) {
    const y = 1 - (i / (pointCount - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(radius));
  }

  // Nodes
  const nodeGeo = new THREE.SphereGeometry(0.022, 8, 8);
  points.forEach((p, idx) => {
    const node = new THREE.Mesh(
      nodeGeo,
      new THREE.MeshPhongMaterial({
        color: idx % 3 === 0 ? 0x7c8fff : 0x5ee7ff,
        emissive: 0x1a4d5c,
        shininess: 70
      })
    );
    node.position.copy(p);
    group.add(node);
  });

  // Connect nearby nodes — this is what reads as a "network"
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x5ee7ff, transparent: true, opacity: 0.32 });
  const maxDist = 0.5;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[i].distanceTo(points[j]) < maxDist) {
        const geo = new THREE.BufferGeometry().setFromPoints([points[i], points[j]]);
        group.add(new THREE.Line(geo, lineMaterial));
      }
    }
  }

  // Soft inner core so the sphere reads as solid, not just a point cloud
  const coreGeo = new THREE.SphereGeometry(radius * 0.68, 24, 24);
  const coreMat = new THREE.MeshPhongMaterial({ color: 0x0a1420, transparent: true, opacity: 0.4, shininess: 20 });
  group.add(new THREE.Mesh(coreGeo, coreMat));

  // Faint outer wireframe shell for structure
  const wireGeo = new THREE.IcosahedronGeometry(radius * 1.03, 1);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x2a4a55, wireframe: true, transparent: true, opacity: 0.16 });
  group.add(new THREE.Mesh(wireGeo, wireMat));

  return group;
}

function init3DModel() {
  if (threeRenderer || typeof THREE === 'undefined') return;
  const modelCanvas = document.getElementById('model3dCanvas');
  if (!modelCanvas) return;

  try {
    threeRenderer = new THREE.WebGLRenderer({
      canvas: modelCanvas,
      alpha: true,
      antialias: true,
      precision: 'lowp',
      powerPreference: 'low-power'
    });
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    threeRenderer.setClearColor(0x000000, 0);

    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    threeCamera.position.z = 3.2;

    const light1 = new THREE.DirectionalLight(0x5ee7ff, 1.0);
    light1.position.set(3, 2, 3);
    threeScene.add(light1);

    const light2 = new THREE.DirectionalLight(0x7c8fff, 0.6);
    light2.position.set(-2, 1, 2);
    threeScene.add(light2);

    threeScene.add(new THREE.AmbientLight(0xffffff, 0.25));

    threeModel = createNetworkSphere();
    threeScene.add(threeModel);

    resize3DHandler();
  } catch (e) {
    console.error('3D initialization failed:', e);
    threeRenderer = null;
  }
}

function resize3DHandler() {
  const wrap = document.getElementById('model3dWrap');
  if (!wrap || !threeRenderer || !threeCamera) return;
  const size = wrap.clientWidth || 210;
  threeRenderer.setSize(size, size, false);
  threeCamera.aspect = 1;
  threeCamera.updateProjectionMatrix();
}

function start3DModelScan() {
  init3DModel();
  if (!threeRenderer) return;
  resize3DHandler();
  if (threeRAF) return;

  const spinSpeed = prefersReducedMotion ? 0.05 : 0.5; // radians/sec — constant, frame-rate independent
  let lastTime = performance.now();

  const animate = (now) => {
    threeRAF = requestAnimationFrame(animate);
    // clamp delta so returning from a backgrounded tab never causes a jump/spin-out
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (threeModel) {
      threeModel.rotation.y += spinSpeed * delta;
      threeModel.rotation.x = Math.sin(now / 4000) * 0.1;
    }
    threeRenderer.render(threeScene, threeCamera);
  };
  threeRAF = requestAnimationFrame(animate);
}

function stop3DModelScan() {
  if (threeRAF) {
    cancelAnimationFrame(threeRAF);
    threeRAF = null;
  }
}

window.addEventListener('resize', () => {
  if (threeRAF) resize3DHandler();
});
function startLoadingAnimation() {
  const startTime = Date.now();
  const MIN_DISPLAY_MS = 8000; // 8 seconds for hand scanning

  const messages = [
    "Reading the lines of your palm…",
    "Scanning palm patterns…",
    "Analyzing your fortune…",
    "Consulting the cosmic alignment…",
    "Weaving your reading together…"
  ];
  let msgIndex = 0;
  let progress = 0;

  const titleEl = () => document.querySelector('.loading-title');
  const fillEl  = () => document.querySelector('.loading-progress-fill');
  const pctEl   = () => document.querySelector('.loading-pct');

  const msgInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % messages.length;
    const el = titleEl();
    if (el) el.textContent = messages[msgIndex];
  }, 1800);

  const progInterval = setInterval(() => {
    progress += (92 - progress) * 0.06 + Math.random() * 1.2;
    progress = Math.min(progress, 92);
    const f = fillEl(), p = pctEl();
    if (f) f.style.width = progress + '%';
    if (p) p.textContent = Math.round(progress) + '%';
  }, 250);

  return function stop(onDone) {
    clearInterval(msgInterval);
    clearInterval(progInterval);
    const f = fillEl(), p = pctEl();
    if (f) f.style.width = '100%';
    if (p) p.textContent = '100%';

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(MIN_DISPLAY_MS - elapsed, 300);
    setTimeout(() => { if (onDone) onDone(); }, remaining);
  };
}

// ---------- Main generate flow ----------

async function generateReading() {
  clearError();
  const dob = document.getElementById('dob').value;
  const nameInput = document.getElementById('name');
  const contactInput = document.getElementById('contact');
  
  if (!nameInput || !contactInput) {
    showError('Form elements not found. Please refresh the page.');
    return;
  }
  
  const name = nameInput.value || 'Seeker';
  const contact = contactInput.value || 'N/A';
  
  if (!dob) { 
    showError('Please enter your date of birth.'); 
    return; 
  }
  if (!capturedImage) { 
    showError('Please capture or upload a palm image first.'); 
    return; 
  }

  generateBtn.disabled = true;

  // Reset screen3's loading UI back to its starting state, then show it
  const loadingTitleEl = document.querySelector('.loading-title');
  const loadingFillEl = document.querySelector('.loading-progress-fill');
  const loadingPctEl = document.querySelector('.loading-pct');
  if (loadingTitleEl) loadingTitleEl.textContent = 'Reading the lines of your palm…';
  if (loadingFillEl) loadingFillEl.style.width = '0%';
  if (loadingPctEl) loadingPctEl.textContent = '0%';

  showScreen('screen3');

  const stopLoadingAnim = startLoadingAnimation();
  document.getElementById('shareBox').classList.remove('active');
  document.getElementById('qrcode').innerHTML = '';

  const prompt = `
You are an expert traditional palmist and astrologer.

Analyze the uploaded palm image carefully.

User Information:
Name: ${name}
Date of Birth: ${dob}

Provide a detailed traditional palm reading.

Use the following structure exactly. Do not add, remove, or rename any headings.

At the very beginning, include this disclaimer:

"This reading is based on traditional palmistry and astrology practices and is provided for entertainment purposes only. It is not a scientific prediction and should not be used as a substitute for professional advice or important life decisions."

Use these headings only:

# Entertainment Disclaimer

# Finance

# Lucky Numbers

# Lucky Colors

# Lucky Days

# Percentage Scores

# Spiritual Guidance

**Requirements**

* Use only the specified headings. Do not add any extra headings or sections.
* Write in a professional, positive, natural, and easy-to-read tone.
* Keep every section concise (1–2 sentences). Lucky sections should contain only the requested values.
* Make every reading feel unique and personalized. Avoid generic horoscope clichés, repeated phrases, and vague predictions.
* Before the Entertainment Disclaimer, write one short personalized sentence.

Mention the person's name and date of birth naturally, and state that the reading has been prepared using their palm image and birth details according to traditional palmistry and astrology.

Do not mention image quality, visibility, confidence, limitations, AI, or how the analysis was performed.

Example style:
"{name}, this traditional reading has been prepared using your palm image and your birth date ({dob}), combining palmistry and astrology to provide personalized insights."

Keep it to one simple sentence.
* Never claim certainty or guarantee future events.
* Do not provide medical, legal, financial, or psychological advice, or analyze specific palm lines such as the Head Line or Life Line.
* **Lucky Numbers:** Exactly 2 unique numbers.
* **Lucky Colors:** Exactly 1 specific colors (e.g., Forest Green, Sapphire Blue, Burnt Orange).
* **Lucky Days:** Exactly 1 weekdays.
* **Percentage Scores:** Provide a percentage between 40 and 95 for each of Health, Wealth, Love, Luck, and Career, reflecting the overall tone of the reading. Format each on its own line exactly as "Label: NN%" with no extra commentary or explanation.
* **Spiritual Guidance:** One practical suggestion inspired by traditional palmistry or astrology(2-3 line sentence, simple language).

At the very end, include this disclaimer:

"This reading follows traditional palmistry and astrology interpretations and is intended for entertainment purposes only. Your choices, actions, and circumstances play a much greater role in shaping your future than any reading."
`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const base64Image = capturedImage.split(",")[1];

    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
          maxOutputTokens: 2500
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    const data = await response.json();

    const text = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text)
      .join("\n");

    if (!text) throw new Error("No response received from Gemini.");

    stopLoadingAnim(() => {

      renderResults(text, name, dob);
      showScreen('printArea');
    });

    console.log("Saving to Firestore...");

    const userId = `${name.replace(/\s+/g, '_')}_${Date.now()}`;
    const eventId = getEventId();

    const docRef = await addDoc(
      collection(db, "readings"),
      {
        name,
        contact,
        dob,
        reading: text,
        image: capturedImage,
        eventId,
        userId,
        createdAt: serverTimestamp()
      }
    );
    console.log("✅ Saved!");
    console.log("Document ID:", docRef.id);

    const BASE_URL =
      window.location.hostname === "localhost"
        ? "http://localhost:5173"
        : "https://qr-palm.web.app";

    const qrURL = `${BASE_URL}/Frontend/pages/reading.html?id=${docRef.id}`;
    console.log("QR URL:", qrURL);

    drawQrOrThrow(document.getElementById("qrcode"), qrURL);

    const shareBox = document.getElementById("shareBox");
    if (shareBox) {
      shareBox.classList.add("active");
    }
    
    const qrNote = document.getElementById("qrNote");
    if (qrNote) {
      qrNote.textContent = "Scan this QR code to view the full palm reading on any device.";
    }

  } catch (err) {
    clearTimeout(timeoutId);
    stopLoadingAnim();
    showScreen('screen2');

    if (err.name === 'AbortError') {
      showError('Request took too long (over 30 seconds). Please check your internet and try again.');
    } else {
      showError(`Error: ${err.message}`);
    }
  } finally {
    generateBtn.disabled = false;
  }
}

generateBtn.addEventListener('click', generateReading);