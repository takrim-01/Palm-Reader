import { db, doc, getDoc } from "../../firebase/firebase.js";

const params = new URLSearchParams(window.location.search);
const id = params.get("id");

const errorBox = document.getElementById('errorBox');
const resultsDiv = document.getElementById('results');
const shareBox = document.getElementById('shareBox');
const printBtn = document.getElementById('printBtn');
const downloadBtn = document.getElementById('downloadBtn');

function showError(msg) {
  errorBox.innerHTML = `<div class="error">${msg}</div>`;
}

// ---------- same parsing helpers as script.js, kept in sync ----------

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

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---------- render the same card layout as script.js ----------

// AFTER
function renderResults(name, dob, text, image) {
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
            <div class="person-name">${escapeHtml(name)}</div>
            <div class="person-dob">${escapeHtml(dob)}</div>
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
          <img id="palmPhotoImg" class="palm-photo-img" src="${image || ''}" alt="Captured palm photo">
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
// ---------- load + wire up ----------

if (!id) {
  showError('No reading found — this link is missing an id.');
} else {
  loadReading();
}

async function loadReading() {
  try {
    const docRef = doc(db, "readings", id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      showError('This reading could not be found. The link may be invalid or expired.');
      return;
    }

    const data = snap.data();
renderResults(data.name, data.dob, data.reading, data.image);

    shareBox.classList.add('active');
  } catch (err) {
    showError('Something went wrong loading this reading. Please try again.');
    console.error(err);
  }
}

printBtn.addEventListener('click', () => window.print());

downloadBtn.addEventListener('click', async () => {
  downloadBtn.disabled = true;
  const original = downloadBtn.textContent;
  downloadBtn.textContent = 'Preparing…';
  try {
    const canvas = await html2canvas(document.getElementById('printArea'), {
      backgroundColor: '#0b0f1e',
      scale: 2,
      useCORS: true
    });
    const link = document.createElement('a');
    link.download = 'palm-reading.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    showError('Could not generate the download. Please try the print button instead.');
    console.error(err);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = original;
  }
});