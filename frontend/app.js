'use strict';

const API = 'http://localhost:8000';

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

// ── Init ──────────────────────────────────────────────────────────────────────
function initTopics() {
  const grid = document.getElementById('topics-grid');
  grid.innerHTML = TOPICS.map(t => `
    <div class="topic-chip ${selectedTopics.has(t.id) ? 'selected' : ''}"
         id="chip-${t.id}"
         onclick="toggleTopic('${t.id}')">
      ${t.label}
    </div>`).join('');
}

function toggleTopic(id) {
  selectedTopics.has(id) ? selectedTopics.delete(id) : selectedTopics.add(id);
  document.getElementById('chip-' + id)
    .classList.toggle('selected', selectedTopics.has(id));
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
  el.className = 'show ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

function toggleClauses() {
  const box   = document.getElementById('clauses-box');
  const arrow = document.getElementById('clauses-arrow');
  const open  = box.style.display === 'block';
  box.style.display = open ? 'none' : 'block';
  arrow.textContent  = open ? '▶' : '▼';
}

function renderCompression(c, barId, numsId, savingsId) {
  setTimeout(() => {
    document.getElementById(barId).style.width = c.savings_percent + '%';
  }, 120);
  document.getElementById(numsId).textContent =
    `${c.original_tokens.toLocaleString()} → ${c.compressed_tokens.toLocaleString()} tokens`;
  document.getElementById(savingsId).textContent =
    `${c.tokens_saved.toLocaleString()} tokens eliminated · ${c.savings_percent}% compression · ` +
    `ratio ${c.compression_ratio}x`;
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

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || res.statusText);
    }

    const d = await res.json();
    const c = d.compression;

    // Populate answer
    document.getElementById('qa-answer').textContent     = d.answer;
    document.getElementById('qa-acts-label').textContent =
      'Acts found: ' + (d.acts_found || []).join(' · ');
    document.getElementById('clauses-box').textContent   =
      d.compressed_clauses || '(compressed clauses not returned)';

    // Stats row
    document.getElementById('s-saved').textContent = c.tokens_saved.toLocaleString();
    document.getElementById('s-ratio').textContent = c.compression_ratio + 'x';
    document.getElementById('s-acts').textContent  = (d.acts_found || []).length;
    document.getElementById('qa-stats').style.display = 'flex';

    // Compression bar
    renderCompression(c, 'c-bar', 'c-nums', 'c-savings');

    document.getElementById('qa-result').style.display = 'block';
    toast('Answer ready', 'ok');

  } catch (e) {
    toast('Error: ' + e.message, 'err');
    document.getElementById('qa-empty').style.display = 'block';
  } finally {
    setLoading('qa-btn', false);
  }
}

// ── TAB 2 — Alerts ────────────────────────────────────────────────────────────
async function runAlerts() {
  const bill_text  = document.getElementById('al-bill').value.trim();
  const bill_title = document.getElementById('al-title').value.trim() || 'New Bill';
  const topics     = Array.from(selectedTopics);

  if (!bill_text)    { toast('Please paste the bill text.', 'err'); return; }
  if (!topics.length){ toast('Please select at least one topic.', 'err'); return; }

  setLoading('al-btn', true);
  document.getElementById('al-result').style.display = 'none';
  document.getElementById('al-empty').style.display  = 'none';

  try {
    const res = await fetch(API + '/alerts/match', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bill_text, bill_title, topics }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || res.statusText);
    }

    const d = await res.json();

    // Update chips
    d.all_results.forEach(r => {
      const chip = document.getElementById('chip-' + r.topic);
      if (!chip) return;
      chip.classList.remove('selected');
      chip.classList.add(r.present ? 'matched' : 'not-matched');
    });

    // Render result
    const el = document.getElementById('al-result');
    el.innerHTML = `
      <div class="result-card" style="border-left-color:var(--green)">
        <div class="result-header">
          <div class="result-dot" style="background:var(--green)"></div>
          <span class="result-acts">${bill_title} · ${d.topics_matched} of ${d.topics_checked} topics matched · ${d.total_tokens_saved.toLocaleString()} tokens saved total</span>
        </div>
        <div class="section-divider">Results</div>
        ${d.all_results.map(r => `
          <div class="alert-card">
            <div class="alert-icon ${r.present ? 'yes' : 'no'}">${r.present ? '✓' : '✗'}</div>
            <div>
              <div class="alert-topic">${TOPICS.find(t => t.id === r.topic)?.label || r.topic}</div>
              <div class="alert-summary">${r.present ? (r.summary || 'Relevant clauses found in this bill.') : 'Not covered in this bill.'}</div>
              ${r.present ? `<div class="alert-meta">Saved ${r.tokens_saved.toLocaleString()} tokens · ${r.savings_percent}% compression</div>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
    el.style.display = 'block';
    toast(`${d.topics_matched} topics matched`, 'ok');

  } catch (e) {
    toast('Error: ' + e.message, 'err');
    document.getElementById('al-empty').style.display = 'block';
  } finally {
    setLoading('al-btn', false);
  }
}

// ── TAB 3 — Compare ───────────────────────────────────────────────────────────
async function runCompare() {
  const question      = document.getElementById('cp-question').value.trim();
  const old_bill_text = document.getElementById('cp-old').value.trim();
  const new_bill_text = document.getElementById('cp-new').value.trim();
  const old_title     = document.getElementById('cp-old-title').value.trim() || 'Previous Act';
  const new_title     = document.getElementById('cp-new-title').value.trim() || 'New Bill';

  if (!question)      { toast('Please enter your question.', 'err'); return; }
  if (!old_bill_text) { toast('Please paste the old act text.', 'err'); return; }
  if (!new_bill_text) { toast('Please paste the new bill text.', 'err'); return; }

  setLoading('cp-btn', true);
  document.getElementById('cp-result').style.display = 'none';
  document.getElementById('cp-empty').style.display  = 'none';

  try {
    const res = await fetch(API + '/compare', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, old_bill_text, new_bill_text, old_title, new_title }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || res.statusText);
    }

    const d = await res.json();
    const c = d.compression;

    const el = document.getElementById('cp-result');
    el.innerHTML = `
      <div class="result-card" style="border-left-color:var(--indigo)">
        <div class="result-header">
          <div class="result-dot" style="background:var(--indigo)"></div>
          <span class="result-acts">${old_title} → ${new_title} · ${c.total_tokens_saved.toLocaleString()} tokens saved total</span>
        </div>
        <div class="result-answer">${d.comparison}</div>
        <div class="diff-grid">
          <div class="diff-old">
            <div class="diff-tag old">OLD — ${old_title}</div>
            <div class="diff-content">${d.old_relevant_clauses || '—'}</div>
          </div>
          <div class="diff-new">
            <div class="diff-tag new">NEW — ${new_title}</div>
            <div class="diff-content">${d.new_relevant_clauses || '—'}</div>
          </div>
        </div>
      </div>`;
    el.style.display = 'block';
    toast('Comparison ready', 'ok');

  } catch (e) {
    toast('Error: ' + e.message, 'err');
    document.getElementById('cp-empty').style.display = 'block';
  } finally {
    setLoading('cp-btn', false);
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
initTopics();