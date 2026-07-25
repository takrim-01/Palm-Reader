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
    video.srcObject = stream;
    video.classList.add('active');
    captureBtn.style.display = 'block';
    preview.classList.remove('active');
    capturedImage = null;
    generateBtn.disabled = true;
  } catch (err) {
    showError("Camera access unavailable or denied. Please use the fallback file upload below.");
    fileFallback.style.display = 'block';
  } finally {
    openCameraBtn.disabled = false;
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  video.classList.remove('active');
}

function capturePalm() {
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedImage = canvas.toDataURL('image/jpeg', 0.5);
  preview.src = capturedImage;
  preview.classList.add('active');
  captureBtn.style.display = 'none';
  stopCamera();
  generateBtn.disabled = false;
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
captureBtn.addEventListener('click', capturePalm);

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
function renderStat(label, value) {
  const pct = value || 0;
  return `
    <div class="stat-item">
      <div class="stat-circle" style="--pct:${pct}">
        <span class="stat-value">${pct}%</span>
      </div>
      <span class="stat-label">${label}</span>
    </div>
  `;
}

// ---------- Reading render ----------

function renderResults(text) {
  const s = parseReading(text);
  const scores = parseScores(text);
  console.log('Parsed sections:', s, scores);

  resultsDiv.innerHTML = `
    <div class="reading-card">
      <div class="reading-header">
        <div class="mark">NAM</div>
        <div class="tag">Palm &amp; Astrology Readings</div>
      </div>

      <p class="disclaimer-top">${s['entertainment disclaimer'] || ''}</p>

      <div class="stats-row">
        ${renderStat('Health', scores['health'])}
        ${renderStat('Wealth', scores['wealth'])}
        ${renderStat('Love', scores['love'])}
        ${renderStat('Luck', scores['luck'])}
        ${renderStat('Career', scores['career'])}
      </div>

      <div class="reading-grid">
        ${['intuition', 'inner peace'].map(key => `
          <div class="reading-tile">
            <h4>${key.charAt(0).toUpperCase() + key.slice(1)}</h4>
            <p>${mdToHtml(s[key] || '')}</p>
          </div>
        `).join('')}
      </div>

      <div class="lucky-strip">
        <div class="lucky-group">
          <span class="lucky-label">Lucky Numbers</span>
          <div class="chips">${splitList(s['lucky numbers']).map(n => `<span class="chip">${n}</span>`).join('')}</div>
        </div>
        <div class="lucky-group">
          <span class="lucky-label">Lucky Colors</span>
          <div class="chips">${splitList(s['lucky colors']).map(c => `<span class="chip">${c}</span>`).join('')}</div>
        </div>
        <div class="lucky-group">
          <span class="lucky-label">Lucky Days</span>
          <div class="chips">${splitList(s['lucky days']).map(d => `<span class="chip">${d}</span>`).join('')}</div>
        </div>
      </div>

      <div class="spiritual">
        <h4>Spiritual Guidance</h4>
        <p>${mdToHtml(s['spiritual guidance'] || '')}</p>
      </div>

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

// ---------- Main generate flow ----------

async function generateReading() {
  clearError();
  const dob = document.getElementById('dob').value;
  const name = document.getElementById('name').value || 'Seeker';
  if (!dob) { showError('Please enter your date of birth.'); return; }
  if (!capturedImage) { showError('Please capture or upload a palm image first.'); return; }

  generateBtn.disabled = true;
  openCameraBtn.disabled = true;
  spinner.classList.add('active');
  // Show loading message immediately
resultsDiv.innerHTML = `
  <div class="reading-card">
    <div style="text-align: center; padding: 40px 20px;">
      <h3 style="margin: 0 0 10px 0;">✨ Analyzing your palm...</h3>
      <p style="opacity: 0.7; font-size: 14px; margin: 0;">This usually takes 3-5 seconds</p>
    </div>
  </div>
`;
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

# Intuition

# Inner Peace

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
* **Intuition, Inner Peace:** Each in 1 sentence only, using simple, everyday language (no jargon or flowery wording).
  - Intuition: one trait about their gut-instinct in decisions make it only one line only.
  - Inner Peace: one habit or mindset that brings them calm.
* **Percentage Scores:** Provide a percentage between 40 and 95 for each of Health, Wealth, Love, Luck, and Career, reflecting the overall tone of the reading. Format each on its own line exactly as "Label: NN%" with no extra commentary or explanation.
* **Spiritual Guidance:** One practical suggestion inspired by traditional palmistry or astrology(1-2 line sentence, simple language).

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
    spinner.classList.remove('active');
    generateBtn.disabled = false;
    openCameraBtn.disabled = false;
  }
}

generateBtn.addEventListener('click', generateReading);