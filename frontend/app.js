'use strict';

const API = 'http://localhost:8000';

// ── PDF state ─────────────────────────────────────────────────────────────────
const pdfTexts = {};  // { 'al': '...', 'cp-old': '...', 'cp-new': '...' }
const pdfFiles = {};  // { 'al': File, ... }

// ── Topics ────────────────────────────────────────────────────────────────────
const TOPICS = [
  { id: 'agriculture',  label: '🌾 Agriculture' },
  { id: 'health',       label: '🏥 Health' },
  { id: 'taxation',     label: '💰 Taxation' },
  { id: 'education',    label: '📚 Education' },
  { id: 'data_privacy', label: '🔐 Data Privacy' },
  { id: 'labour',       label: '👷 Labour Rights' },
  { id: 'women',        label: '👩 Women & Gender' },
  { id: 'environment',  label: '🌱 Environment' },
  { id: 'housing',      label: '🏠 Housing' },
  { id: 'digital',      label: '💻 Digital Rights' },
  { id: 'banking',      label: '🏦 Banking' },
  { id: 'consumer',     label: '🛒 Consumer Rights' },
];
let selectedTopics = new Set(['data_privacy', 'health', 'agriculture']);

function initTopics() {
  const grid = document.getElementById('topics-grid');
  grid.innerHTML = TOPICS.map(t => `
    <div class="topic-chip ${selectedTopics.has(t.id) ? 'selected' : ''}"
         id="chip-${t.id}" onclick="toggleTopic('${t.id}')">
      ${t.label}
    </div>`).join('');
}

function toggleTopic(id) {
  selectedTopics.has(id) ? selectedTopics.delete(id) : selectedTopics.add(id);
  document.getElementById('chip-' + id).classList.toggle('selected', selectedTopics.has(id));
}

// ── PDF Upload helpers ────────────────────────────────────────────────────────
function handleDragOver(e, zoneId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.add('dragover');
}

function handleDragLeave(zoneId) {
  document.getElementById(zoneId).classList.remove('dragover');
}

function handleDrop(e, prefix) {
  e.preventDefault();
  const zoneId = prefix + (prefix.includes('cp') ? '-dropzone' : '-dropzone');
  const zone = document.getElementById(
    prefix === 'al' ? 'al-dropzone' :
    prefix === 'cp-old' ? 'cp-old-dropzone' : 'cp-new-dropzone'
  );
  if (zone) zone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') {
    processFile(file, prefix);
  } else {
    toast('Please upload a PDF file.', 'err');
  }
}

function handleFileSelect(e, prefix) {
  const file = e.target.files[0];
  if (file) processFile(file, prefix);
}

async function processFile(file, prefix) {
  pdfFiles[prefix] = file;

  // Show file info immediately
  const infoEl   = document.getElementById(prefix + '-file-info');
  const nameEl   = document.getElementById(prefix + '-file-name');
  const metaEl   = document.getElementById(prefix + '-file-meta');
  const zoneEl   = document.getElementById(
    prefix === 'al' ? 'al-dropzone' :
    prefix === 'cp-old' ? 'cp-old-dropzone' : 'cp-new-dropzone'
  );

  nameEl.textContent = file.name;
  metaEl.textContent = 'Extracting text…';
  infoEl.classList.add('show');
  if (zoneEl) zoneEl.classList.add('loaded');

  // Upload to backend for text extraction
  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(API + '/extract-pdf', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('PDF extraction failed');
    const data = await res.json();

    pdfTexts[prefix] = data.text;
    metaEl.textContent = `${data.pages} pages · ${(data.char_count/1000).toFixed(1)}k chars`;
    toast(`PDF loaded: ${data.pages} pages extracted`, 'ok');
  } catch (e) {
    metaEl.textContent = 'Extraction failed';
    toast('Could not extract PDF text: ' + e.message, 'err');
    delete pdfTexts[prefix];
  }
}

function removeFile(prefix) {
  delete pdfTexts[prefix];
  delete pdfFiles[prefix];

  const infoEl = document.getElementById(prefix + '-file-info');
  const inputEl = document.getElementById(
    prefix === 'al' ? 'al-pdf-input' :
    prefix === 'cp-old' ? 'cp-old-input' : 'cp-new-input'
  );
  const zoneEl = document.getElementById(
    prefix === 'al' ? 'al-dropzone' :
    prefix === 'cp-old' ? 'cp-old-dropzone' : 'cp-new-dropzone'
  );

  infoEl.classList.remove('show');
  if (zoneEl) zoneEl.classList.remove('loaded');
  if (inputEl) inputEl.value = '';
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setQ(q) {
  document.getElementById('qa-question').value = q;
  document.getElementById('qa-question').focus();
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (loading) {
    btn._orig = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>&nbsp; Processing…';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._orig;
    btn.disabled = false;
  }
}

function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type === 'err' ? ' err' : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

function toggleClauses(prefix) {
  const box   = document.getElementById(prefix + '-clauses');
  const arrow = document.getElementById(prefix + '-arrow');
  const open  = box.style.display === 'block';
  box.style.display = open ? 'none' : 'block';
  arrow.textContent  = open ? '▶' : '▼';
}

// ── TAB 1 — Core Q&A ─────────────────────────────────────────────────────────
async function runAnalysis() {
  const question = document.getElementById('qa-question').value.trim();
  if (!question) { toast('Please enter your question.', 'err'); return; }

  setLoading('qa-btn', true);
  document.getElementById('qa-result').style.display  = 'none';
  document.getElementById('qa-empty').style.display   = 'none';

  try {
    const res = await fetch(API + '/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
    const d = await res.json();
    const c = d.compression;

    document.getElementById('qa-answer').textContent    = d.answer;
    document.getElementById('qa-acts-label').textContent = 'Acts found: ' + (d.acts_found || []).join(' · ');
    document.getElementById('qa-clauses').textContent   = d.compressed_clauses || '—';
    document.getElementById('s-saved').textContent      = c.tokens_saved.toLocaleString();
    document.getElementById('s-ratio').textContent      = c.compression_ratio + 'x';
    document.getElementById('s-acts').textContent       = (d.acts_found || []).length;
    document.getElementById('qa-stats').style.display   = 'flex';
    document.getElementById('c-nums').textContent       = `${c.original_tokens.toLocaleString()} → ${c.compressed_tokens.toLocaleString()} tokens`;
    document.getElementById('c-savings').textContent    = `${c.tokens_saved.toLocaleString()} tokens eliminated · ${c.savings_percent}% compression · ratio ${c.compression_ratio}x`;
    setTimeout(() => { document.getElementById('c-bar').style.width = c.savings_percent + '%'; }, 120);

    document.getElementById('qa-result').style.display = 'block';
    toast('Answer ready');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
    document.getElementById('qa-empty').style.display = 'block';
  } finally {
    setLoading('qa-btn', false);
  }
}

// ── TAB 2 — Alerts ────────────────────────────────────────────────────────────
async function runAlerts() {
  const bill_text = pdfTexts['al'];
  const topics    = Array.from(selectedTopics);

  if (!bill_text) { toast('Please upload a bill PDF first.', 'err'); return; }
  if (!topics.length) { toast('Please select at least one topic.', 'err'); return; }

  const bill_title = pdfFiles['al']?.name?.replace('.pdf', '') || 'Uploaded Bill';

  setLoading('al-btn', true);
  document.getElementById('al-result').style.display = 'none';
  document.getElementById('al-empty').style.display  = 'none';

  try {
    const res = await fetch(API + '/alerts/match', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bill_text, bill_title, topics }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
    const d = await res.json();

    d.all_results.forEach(r => {
      const chip = document.getElementById('chip-' + r.topic);
      if (!chip) return;
      chip.classList.remove('selected');
      chip.classList.add(r.present ? 'matched' : 'not-matched');
    });

    const el = document.getElementById('al-result');
    el.innerHTML = `
      <div class="result-card" style="border-left-color:var(--gold)">
        <div class="result-header">
          <div class="result-dot"></div>
          <span class="result-acts">${d.bill_title} · ${d.topics_matched} of ${d.topics_checked} topics matched · ${d.total_tokens_saved.toLocaleString()} tokens saved</span>
        </div>
        <div class="section-divider">Results</div>
        ${d.all_results.map(r => `
          <div class="alert-card">
            <div class="alert-icon ${r.present ? 'yes' : 'no'}">${r.present ? '✓' : '✗'}</div>
            <div>
              <div class="alert-topic">${TOPICS.find(t => t.id === r.topic)?.label || r.topic}</div>
              <div class="alert-summary">${r.present ? (r.summary || 'Relevant clauses found.') : 'Not covered in this bill.'}</div>
              ${r.present ? `<div class="alert-meta">Saved ${r.tokens_saved.toLocaleString()} tokens · ${r.savings_percent}% compression</div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
    el.style.display = 'block';
    toast(`${d.topics_matched} topics matched`);
  } catch (e) {
    toast('Error: ' + e.message, 'err');
    document.getElementById('al-empty').style.display = 'block';
  } finally {
    setLoading('al-btn', false);
  }
}

// ── TAB 3 — Compare ───────────────────────────────────────────────────────────
async function runCompare() {
  const old_bill_text = pdfTexts['cp-old'];
  const new_bill_text = pdfTexts['cp-new'];
  const question      = document.getElementById('cp-question').value.trim();

  if (!old_bill_text) { toast('Please upload the old act PDF.', 'err'); return; }
  if (!new_bill_text) { toast('Please upload the new bill PDF.', 'err'); return; }
  if (!question)      { toast('Please enter your comparison question.', 'err'); return; }

  const old_title = pdfFiles['cp-old']?.name?.replace('.pdf','') || 'Previous Act';
  const new_title = pdfFiles['cp-new']?.name?.replace('.pdf','') || 'New Bill';

  setLoading('cp-btn', true);
  document.getElementById('cp-result').style.display = 'none';
  document.getElementById('cp-empty').style.display  = 'none';

  try {
    const res = await fetch(API + '/compare', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, old_bill_text, new_bill_text, old_title, new_title }),
    });
    if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
    const d = await res.json();
    const c = d.compression;

    const el = document.getElementById('cp-result');
    el.innerHTML = `
      <div class="result-card" style="border-left-color:var(--accent)">
        <div class="result-header">
          <div class="result-dot"></div>
          <span class="result-acts">${d.old_title} → ${d.new_title} · ${c.total_tokens_saved.toLocaleString()} tokens saved</span>
        </div>
        <div class="result-answer">${d.comparison}</div>
        <div class="diff-grid">
          <div class="diff-old">
            <div class="diff-tag old">OLD — ${d.old_title}</div>
            <div class="diff-content">${d.old_relevant_clauses || '—'}</div>
          </div>
          <div class="diff-new">
            <div class="diff-tag new">NEW — ${d.new_title}</div>
            <div class="diff-content">${d.new_relevant_clauses || '—'}</div>
          </div>
        </div>
      </div>`;
    el.style.display = 'block';
    toast('Comparison ready');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
    document.getElementById('cp-empty').style.display = 'block';
  } finally {
    setLoading('cp-btn', false);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initTopics();