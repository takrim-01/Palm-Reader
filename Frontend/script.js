import {
  db,
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp
} from "/firebase/firebase.js";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = "gemini-3.5-flash-lite";

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

let stream = null;
let capturedImage = null;

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const preview = document.getElementById('preview');
const openCameraBtn = document.getElementById('openCameraBtn');
const captureBtn = document.getElementById('captureBtn');
const generateBtn = document.getElementById('generateBtn');
const spinner = document.getElementById('spinner');
const errorBox = document.getElementById('errorBox');
const resultsDiv = document.getElementById('results');
const fileFallback = document.getElementById('fileFallback');

const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');
const handStatus = document.getElementById('handStatus');
const captureControls = document.getElementById('captureControls');
const takeBtn = document.getElementById('takeBtn');
const retakeBtn = document.getElementById('retakeBtn');
const clearAllBtn = document.getElementById('clearAllBtn');


// ---------- ambient falling-stars layer (purely decorative, isolated, device-friendly) ----------
(function initRain() {
  const rain = document.getElementById('rain');
  if (!rain) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const isSmall = window.innerWidth < 480;
  const isMedium = window.innerWidth < 900;
  const count = isSmall ? 8 : isMedium ? 13 : 18; // sparse on purpose

  const stars = [];
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star-drop';
    star.style.left = Math.random() * 100 + 'vw';

    const size = 5 + Math.random() * 5; // 5–10px, mixes small/big stars
    star.style.width = size + 'px';
    star.style.height = size + 'px';

    star.style.animationDuration = `${2.5 + Math.random() * 2.5}s, ${1.2 + Math.random()}s`;
    star.style.animationDelay = `${Math.random() * 4}s, ${Math.random() * 2}s`;

    rain.appendChild(star);
    stars.push(star);
  }

  document.addEventListener('visibilitychange', () => {
    const state = document.hidden ? 'paused' : 'running';
    stars.forEach(s => { s.style.animationPlayState = state; });
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
      drawConnectors(overlayCtx, landmarks, HAND_CONNECTIONS, { color: '#0e0d0d', lineWidth: 3 });
      window.drawLandmarks
        ? drawLandmarks(overlayCtx, landmarks, { color: '#2fb6a6', lineWidth: 1, radius: 3 })
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
  openCameraBtn.disabled = true;
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
    captureControls.style.display = 'flex';
    handStatus.style.display = 'block';

    trackingActive = true;
    video.onloadeddata = () => trackingLoop();
  } catch (err) {
    showError("Camera access unavailable or denied. Please use the fallback file upload below.");
    fileFallback.style.display = 'block';
  } finally {
    openCameraBtn.disabled = false;
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
  captureControls.style.display = 'none';
  handStatus.style.display = 'none';
  retakeBtn.style.display = 'inline-block';

  stopCamera();
  generateBtn.disabled = false;
}

function retakePalm() {
  preview.classList.remove('active');
  capturedImage = null;
  generateBtn.disabled = true;
  openCamera();
}

function resetAll() {
  // stop camera if it's running
  stopCamera();

  // form fields
  document.getElementById('name').value = '';
  document.getElementById('dob').value = '';

  // image state
  capturedImage = null;
  preview.src = '';
  preview.classList.remove('active');
  fileFallback.value = '';

  // capture UI back to initial state
  document.querySelector('.video-wrap').style.display = 'none';
  captureControls.style.display = 'none';
  retakeBtn.style.display = 'none';
  handStatus.style.display = 'block';
  handStatus.textContent = 'Show your palm to the camera';
  takeBtn.disabled = true;

  // buttons
  generateBtn.disabled = true;
  openCameraBtn.disabled = false;

  // results / share / errors
  resultsDiv.innerHTML = '';
  clearError();
  document.getElementById('shareBox').classList.remove('active');
  document.getElementById('qrcode').innerHTML = '';
  document.getElementById('palmPhotoBlock').classList.remove('active');
  document.getElementById('palmPhotoImg').src = '';
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

openCameraBtn.addEventListener('click', openCamera);
takeBtn.addEventListener('click', capturePalm);
retakeBtn.addEventListener('click', retakePalm);
clearAllBtn.addEventListener('click', resetAll);

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

// Parses the model's markdown-headed response into a lookup object keyed
// by lowercase heading text, e.g. parseReading(text)['zodiac sign'].
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

// Splits a comma or newline separated list (numbers/colors/days) into
// a clean array of individual items, stripping bullet/number prefixes.
function splitList(str) {
  if (!str) return [];
  return str
    .replace(/[*_]/g, '')
    .split(/\n|,/)
    .map(s => s
      .trim()
      .replace(/^[-*]\s*/, '')        // strip leading bullet dash/asterisk
      .replace(/^\d+[.)]\s*/, '')     // strip "1. " or "1) " numbering only
      .trim()
    )
    .filter(Boolean);
}

// Extracts percentage scores from the "Percentage Scores" section, e.g.
// "Health: 82%" -> { health: 82 }. Values are clamped to 0-100.
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

// Renders a single circular percentage stat (label + ring).
// Renders a single horizontal stat bar (label + numeric value + fill).
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

function renderResults(text) {
  const s = parseReading(text);
  const scores = parseScores(text);

  resultsDiv.innerHTML = `
    <div class="reading-card">
      <div class="reading-header">
        <div class="mark">NAM</div>
        <div class="tag">Palm &amp; Astrology Readings</div>
      </div>

      <p class="disclaimer-top">${s['entertainment disclaimer'] || ''}</p>

      <section class="section-block">
        <h3 class="section-title">Overview</h3>
        <div class="bars-list">
          ${renderStat('Health', scores['health'])}
          ${renderStat('Wealth', scores['wealth'])}
          ${renderStat('Love', scores['love'])}
          ${renderStat('Luck', scores['luck'])}
          ${renderStat('Career', scores['career'])}
        </div>
      </section>

      <section class="section-block">
        <h3 class="section-title">Lucky Details</h3>
        <div class="detail-rows">
          <div class="detail-row">
            <span class="detail-key">Numbers</span>
            <span class="detail-val">${splitList(s['lucky numbers']).join(', ')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Color</span>
            <span class="detail-val">${splitList(s['lucky colors']).join(', ')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-key">Day</span>
            <span class="detail-val">${splitList(s['lucky days']).join(', ')}</span>
          </div>
        </div>
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

// Makes a small, heavily compressed square thumbnail so a low-res version
// of the palm photo can fit inside the QR code's strict size limit.
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

// Pulls a closing summary out of the full reading (falls back to the
// spiritual guidance section, then the raw text) since the full reading
// is too long to fit inside a QR code.
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
    + `background:linear-gradient(135deg,#1e0f3c,#6a1b9a);color:#fff;box-sizing:border-box">`
    + `<div style="max-width:340px;margin:0 auto;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);`
    + `border-radius:16px;padding:20px;text-align:center">`
    + `<div style="font-weight:800;letter-spacing:.3em;font-size:20px;color:#e0c3fc">NAM</div>`
    + `<div style="font-size:9px;opacity:.7;letter-spacing:.1em;text-transform:uppercase;margin-bottom:14px">Palm &amp; Astrology Readings</div>`;

  if (thumbDataUrl) {
    body += `<img src="${thumbDataUrl}" style="width:76px;height:76px;border-radius:50%;object-fit:cover;border:2px solid #b967ff;margin-bottom:10px">`;
  }

  body += `<div style="font-size:17px;font-weight:600">${safe(name)}</div>`
    + `<div style="font-size:10px;opacity:.65;margin-bottom:12px">${safe(dob)}</div>`
    + `<div style="height:1px;background:rgba(255,255,255,.25);margin:0 0 12px"></div>`
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
    colorDark: '#1e0f3c',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.L
  });
}

async function renderShareBlock(name, dob, fullText) {
  const shareBox = document.getElementById('shareBox');
  const qrNote = document.getElementById('qrNote');
  shareBox.classList.add('active');
  qrNote.textContent = "Scan for a soft copy on your phone. This carries your name, sign, and closing summary — your palm photo and the full reading stay here on screen.";
}

document.getElementById('printBtn').addEventListener('click', () => window.print());

// Cycles status text + matching constellation, eases a fake progress bar
// toward 92% while the API call is in flight. Returns stop(onDone) — call
// it once with the real result to snap the bar to 100% and swap in
// renderResults() only after the fill-in finishes.
function startLoadingAnimation() {
  const messages = [
    "Reading the lines of your palm…",
    "Charting your zodiac alignment…",
    "Consulting the constellations…",
    "Weaving your fortune together…"
  ];
  let msgIndex = 0;
  let progress = 0;

  const titleEl = () => document.querySelector('.loading-title');
  const fillEl  = () => document.querySelector('.loading-progress-fill');
  const pctEl   = () => document.querySelector('.loading-pct');
  const sets    = () => document.querySelectorAll('.constellation-set');

  function showSet(index) {
    sets().forEach(el => {
      el.classList.toggle('active', Number(el.dataset.set) === index);
    });
  }

  const msgInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % messages.length;
    const el = titleEl();
    if (el) el.textContent = messages[msgIndex];
    showSet(msgIndex);
  }, 2400);

  const progInterval = setInterval(() => {
    // slows as it nears the 92% ceiling; never fake-completes
    progress += (92 - progress) * 0.08 + Math.random() * 1.5;
    progress = Math.min(progress, 92);
    const f = fillEl(), p = pctEl();
    if (f) f.style.width = progress + '%';
    if (p) p.textContent = Math.round(progress) + '%';
  }, 300);

  return function stop(onDone) {
    clearInterval(msgInterval);
    clearInterval(progInterval);
    const f = fillEl(), p = pctEl();
    if (f) f.style.width = '100%';
    if (p) p.textContent = '100%';
    setTimeout(() => { if (onDone) onDone(); }, 300);
  };
}


// ---------- Main generate flow ----------

async function generateReading() {
  clearError();
  const dob = document.getElementById('dob').value;
  const name = document.getElementById('name').value || 'Seeker';
  if (!dob) { showError('Please enter your date of birth.'); return; }
  if (!capturedImage) { showError('Please capture or upload a palm image first.'); return; }

  generateBtn.disabled = true;
  openCameraBtn.disabled = true;
  // Show loading message immediately
resultsDiv.innerHTML = `
  <div class="reading-card">
    <div class="loading-screen">
      <svg class="loading-globe" viewBox="0 0 200 200" aria-hidden="true">
        <!-- background twinkle field -->
        <circle cx="20" cy="30" r="1.1" class="bg-star" style="animation-delay:.2s"/>
        <circle cx="175" cy="25" r="1.4" class="bg-star" style="animation-delay:.8s"/>
        <circle cx="15" cy="160" r="1.2" class="bg-star" style="animation-delay:1.4s"/>
        <circle cx="185" cy="150" r="1" class="bg-star" style="animation-delay:.5s"/>
        <circle cx="30" cy="100" r="1" class="bg-star" style="animation-delay:1.8s"/>
        <circle cx="170" cy="95" r="1.3" class="bg-star" style="animation-delay:1s"/>

        <!-- shooting stars -->
        <line x1="-10" y1="-10" x2="8" y2="-10" class="shooting-star ss-1"/>
        <line x1="-10" y1="-10" x2="8" y2="-10" class="shooting-star ss-2"/>

        <circle cx="100" cy="100" r="90" class="globe-glow"/>
        <circle cx="100" cy="100" r="90" class="globe-outline"/>

        <!-- rotating degree tick ring, echoes the page's astrolabe -->
        <g class="tick-ring">
          ${Array.from({length: 24}).map((_, i) =>
            `<line x1="100" y1="4" x2="100" y2="12" transform="rotate(${i * 15} 100 100)"/>`
          ).join('')}
        </g>

        <!-- orbit ring + moon -->
        <g class="orbit-rotate">
          <ellipse cx="100" cy="100" rx="108" ry="40" class="orbit-ring"/>
          <circle cx="208" cy="100" r="3.2" class="orbit-moon"/>
        </g>

        <g class="globe-rotate">
          <ellipse cx="100" cy="100" rx="90" ry="30" class="globe-line"/>
          <ellipse cx="100" cy="100" rx="90" ry="55" class="globe-line"/>
          <ellipse cx="100" cy="100" rx="45" ry="90" class="globe-line"/>
          <ellipse cx="100" cy="100" rx="70" ry="90" class="globe-line"/>
          <line x1="100" y1="10" x2="100" y2="190" class="globe-line"/>

          <!-- four cycling constellations, one active at a time -->
          <g class="constellation-set active" data-set="0">
            <polyline points="60,70 90,50 130,60 150,100 120,140 75,130 60,70" class="constellation-line"/>
            <circle cx="60" cy="70" r="2.2" class="star"/>
            <circle cx="90" cy="50" r="1.6" class="star"/>
            <circle cx="130" cy="60" r="2" class="star"/>
            <circle cx="150" cy="100" r="1.8" class="star"/>
            <circle cx="120" cy="140" r="2.4" class="star"/>
            <circle cx="75" cy="130" r="1.6" class="star"/>
          </g>

          <g class="constellation-set" data-set="1">
            <polyline points="70,60 100,45 130,60 115,90 85,90 70,60" class="constellation-line"/>
            <circle cx="70" cy="60" r="1.8" class="star"/>
            <circle cx="100" cy="45" r="2.2" class="star"/>
            <circle cx="130" cy="60" r="1.6" class="star"/>
            <circle cx="115" cy="90" r="2" class="star"/>
            <circle cx="85" cy="90" r="1.8" class="star"/>
          </g>

          <g class="constellation-set" data-set="2">
            <polyline points="55,110 80,75 100,95 120,60 145,95" class="constellation-line"/>
            <circle cx="55" cy="110" r="1.8" class="star"/>
            <circle cx="80" cy="75" r="2" class="star"/>
            <circle cx="100" cy="95" r="1.6" class="star"/>
            <circle cx="120" cy="60" r="2.4" class="star"/>
            <circle cx="145" cy="95" r="1.8" class="star"/>
          </g>

          <g class="constellation-set" data-set="3">
            <polyline points="100,50 130,90 115,135 85,135 70,90 100,50" class="constellation-line"/>
            <circle cx="100" cy="50" r="2.2" class="star"/>
            <circle cx="130" cy="90" r="1.7" class="star"/>
            <circle cx="115" cy="135" r="1.9" class="star"/>
            <circle cx="85" cy="135" r="1.9" class="star"/>
            <circle cx="70" cy="90" r="1.7" class="star"/>
          </g>
        </g>
      </svg>

      <h3 class="loading-title">Reading the lines of your palm…</h3>

      <div class="loading-progress">
        <div class="loading-progress-fill"></div>
      </div>
      <span class="loading-pct">0%</span>

      <p class="loading-sub">This usually takes 3–5 seconds</p>
    </div>
  </div>
`;

const stopLoadingAnim = startLoadingAnimation();
  document.getElementById('shareBox').classList.remove('active');
  document.getElementById('qrcode').innerHTML = '';
  document.getElementById('palmPhotoBlock').classList.remove('active');

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
* Base all interpretations on traditional palmistry and astrology. If palm or birth details are unavailable, clearly state that the reading is based only on the information provided.
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

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    // Remove "data:image/jpeg;base64," prefix
    const base64Image = capturedImage.split(",")[1];

    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,  // Add timeout support
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

    clearTimeout(timeoutId);  // Clear timeout if successful

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err);
    }

    const data = await response.json();

    const text = data.candidates?.[0]?.content?.parts
      ?.map(p => p.text)
      .join("\n");

    if (!text) throw new Error("No response received from Gemini.");

    renderResults(text);

    const docRef = await addDoc(
      collection(db, "palm-reading"),
      {
        name,
        dob,
        reading: text,
        image: capturedImage,
        createdAt: serverTimestamp()
      }
    );

    console.log("Saved to Firestore:", docRef.id);

    document.getElementById('palmPhotoImg').src = capturedImage;
    document.getElementById('palmPhotoBlock').classList.add('active');

    const BASE_URL =
      window.location.hostname === "localhost"
        ? "http://localhost:5173"
        : "https://qr-palm.web.app";

    const qrURL = `${BASE_URL}/Frontend/pages/reading.html?id=${docRef.id}`;
    console.log("QR URL:", qrURL);

    drawQrOrThrow(document.getElementById("qrcode"), qrURL);

    document.getElementById("shareBox").classList.add("active");
    document.getElementById("qrNote").textContent =
      "Scan this QR code to view the full palm reading on any device.";

  } catch (err) {
    clearTimeout(timeoutId);  // Clear timeout on error

    if (err.name === 'AbortError') {
      showError('Request took too long (over 30 seconds). Please check your internet and try again.');
    } else {
      showError(`Error: ${err.message}`);
    }
  } finally {
    generateBtn.disabled = false;
    openCameraBtn.disabled = false;
  }
}

generateBtn.addEventListener('click', generateReading);
