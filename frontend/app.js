/**
 * IRIS (Intelligent Resolution Incident System)
 * Simple, Clean Frontend Controller
 */

const API_BASE = '';
let currentProblemId = null;
let currentAnalysis = null;

document.addEventListener('DOMContentLoaded', () => {
  setupTabNavigation();
  setupPresets();
  setupFormHandler();
  setupAutoClassifier();
  setupDecisionActions();
  setupDatabaseExplorer();
  setupKnowledgeBase();
  setupResetSeed();
  refreshStatsAndData();
});

// TAB NAVIGATION
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active', 'border-white', 'text-white');
        t.classList.add('border-transparent', 'text-zinc-400');
      });
      tab.classList.add('active', 'border-white', 'text-white');
      tab.classList.remove('border-transparent', 'text-zinc-400');

      const targetId = tab.getAttribute('data-tab');
      panes.forEach(p => {
        if (p.id === targetId) {
          p.classList.remove('hidden');
          p.classList.add('block');
        } else {
          p.classList.add('hidden');
          p.classList.remove('block');
        }
      });

      if (targetId === 'tab-explorer') {
        loadExplorerTables('problems');
      } else if (targetId === 'tab-history') {
        renderKnowledgeBase();
      }
    });
  });
}

// PRESETS
function setupPresets() {
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('input-title').value = btn.getAttribute('data-title');
      document.getElementById('input-category').value = btn.getAttribute('data-category');
      document.getElementById('input-severity').value = btn.getAttribute('data-severity');
      document.getElementById('input-keywords').value = btn.getAttribute('data-keywords');
      document.getElementById('input-description').value = btn.getAttribute('data-desc');
    });
  });
}

// FORM SUBMIT & ANALYSIS
function setupFormHandler() {
  const form = document.getElementById('problem-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      title: document.getElementById('input-title').value.trim(),
      category: document.getElementById('input-category').value,
      severity: document.getElementById('input-severity').value,
      keywords: document.getElementById('input-keywords').value.trim(),
      description: document.getElementById('input-description').value.trim()
    };

    document.getElementById('ai-empty-state').classList.add('hidden');
    document.getElementById('ai-active-card').classList.add('hidden');
    document.getElementById('ai-loading-state').classList.remove('hidden');
    document.getElementById('ingestion-success-banner').classList.add('hidden');

    try {
      const createRes = await fetch(`${API_BASE}/api/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const createdProb = await createRes.json();
      currentProblemId = createdProb.id;

      const analyzeRes = await fetch(`${API_BASE}/api/problems/${currentProblemId}/analyze`, {
        method: 'POST'
      });
      const analysis = await analyzeRes.json();
      currentAnalysis = analysis;

      renderAnalysisCard(analysis);
      refreshStatsAndData();
    } catch (err) {
      alert('Error during problem logging: ' + err.message);
    } finally {
      document.getElementById('ai-loading-state').classList.add('hidden');
    }
  });
}

function renderAnalysisCard(data) {
  const ai = data.ai_recommendation;
  const sql = data.sql_context;

  document.getElementById('sql-query-display').textContent = sql.query_executed;
  document.getElementById('retrieval-time-badge').textContent = `${sql.retrieval_time_ms}ms`;
  document.getElementById('precedent-count').textContent = sql.historical_records_retrieved;

  document.getElementById('card-problem-title').textContent = data.title;
  document.getElementById('card-category-badge').textContent = `${data.category} • ${data.severity}`;
  document.getElementById('confidence-text').textContent = ai.confidence_percentage;
  document.getElementById('card-root-cause').textContent = ai.root_cause;
  document.getElementById('card-primary-solution').textContent = ai.primary_solution;

  const stepsContainer = document.getElementById('card-action-steps');
  stepsContainer.innerHTML = '';
  const rawSteps = ai.action_steps ? ai.action_steps.split('\n') : [];
  rawSteps.forEach(step => {
    if (step.trim()) {
      const div = document.createElement('div');
      div.className = 'flex items-start space-x-1.5 text-zinc-300';
      div.innerHTML = `<i class="fa-solid fa-angle-right text-zinc-500 text-[10px] mt-1"></i> <span>${step.trim()}</span>`;
      stepsContainer.appendChild(div);
    }
  });

  document.getElementById('ai-active-card').classList.remove('hidden');
  document.getElementById('btn-accept-ai').disabled = false;
  document.getElementById('custom-solution-box').classList.add('hidden');
}

// DECISION ACTIONS
function setupDecisionActions() {
  document.getElementById('btn-accept-ai').addEventListener('click', async () => {
    if (!currentProblemId || !currentAnalysis) return;
    const ai = currentAnalysis.ai_recommendation;

    const payload = {
      solution_text: ai.primary_solution,
      source: 'AI',
      confidence_score: ai.confidence_score,
      root_cause: ai.root_cause,
      action_steps: ai.action_steps
    };

    try {
      const res = await fetch(`${API_BASE}/api/problems/${currentProblemId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      document.getElementById('ingestion-success-banner').classList.remove('hidden');
      document.getElementById('btn-accept-ai').disabled = true;
      refreshStatsAndData();
    } catch (err) {
      alert('Error updating solution: ' + err.message);
    }
  });

  document.getElementById('btn-custom-solution').addEventListener('click', () => {
    document.getElementById('custom-solution-box').classList.toggle('hidden');
  });

  document.getElementById('btn-cancel-custom').addEventListener('click', () => {
    document.getElementById('custom-solution-box').classList.add('hidden');
  });

  document.getElementById('btn-save-custom').addEventListener('click', async () => {
    if (!currentProblemId) return;
    const customText = document.getElementById('input-custom-solution').value.trim();
    if (!customText) {
      alert('Please enter solution details.');
      return;
    }

    const payload = {
      solution_text: customText,
      source: 'Human',
      confidence_score: 1.0,
      root_cause: 'Human validated solution.',
      action_steps: 'Custom verified remediation.'
    };

    try {
      await fetch(`${API_BASE}/api/problems/${currentProblemId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      document.getElementById('custom-solution-box').classList.add('hidden');
      document.getElementById('ingestion-success-banner').classList.remove('hidden');
      document.getElementById('btn-accept-ai').disabled = true;
      refreshStatsAndData();
    } catch (err) {
      alert('Error saving custom solution: ' + err.message);
    }
  });
}

// DATABASE EXPLORER
function setupDatabaseExplorer() {
  const switchBtns = document.querySelectorAll('.table-switch-btn');
  switchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchBtns.forEach(b => {
        b.classList.remove('active', 'bg-white', 'text-black', 'font-semibold');
        b.classList.add('bg-zinc-900', 'text-zinc-400');
      });
      btn.classList.add('active', 'bg-white', 'text-black', 'font-semibold');
      btn.classList.remove('bg-zinc-900', 'text-zinc-400');
      loadExplorerTables(btn.getAttribute('data-table'));
    });
  });

  const sqlPresets = document.querySelectorAll('.sql-preset');
  sqlPresets.forEach(preset => {
    preset.addEventListener('click', () => {
      document.getElementById('sql-console-input').value = preset.getAttribute('data-query');
      executeConsoleSql();
    });
  });

  document.getElementById('btn-run-sql').addEventListener('click', executeConsoleSql);
}

async function executeConsoleSql() {
  const query = document.getElementById('sql-console-input').value.trim();
  if (!query) return;

  try {
    const res = await fetch(`${API_BASE}/api/explorer/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql_query: query })
    });
    const result = await res.json();

    const thead = document.getElementById('sql-thead');
    const tbody = document.getElementById('sql-tbody');
    const container = document.getElementById('sql-query-results');

    if (result.error) {
      alert('SQL Error: ' + result.error);
      return;
    }

    container.classList.remove('hidden');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const trHead = document.createElement('tr');
    result.columns.forEach(col => {
      const th = document.createElement('th');
      th.className = 'px-3 py-2 text-[11px] font-mono text-zinc-400';
      th.textContent = col;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    result.rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-zinc-900/60';
      result.columns.forEach(col => {
        const td = document.createElement('td');
        td.className = 'px-3 py-1.5 text-zinc-300 border-t border-zinc-900 text-[11px] font-mono';
        td.textContent = row[col] !== null ? row[col] : 'NULL';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    alert('Query failed: ' + err.message);
  }
}

async function loadExplorerTables(tableName) {
  try {
    const res = await fetch(`${API_BASE}/api/explorer/tables`);
    const data = await res.json();

    const thead = document.getElementById('raw-thead');
    const tbody = document.getElementById('raw-tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const rows = data[tableName] || [];
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td class="p-4 text-center text-zinc-500" colspan="8">No rows in table ${tableName}.</td></tr>`;
      return;
    }

    const columns = Object.keys(rows[0]);
    const trHead = document.createElement('tr');
    columns.forEach(col => {
      const th = document.createElement('th');
      th.className = 'px-3 py-2 text-[11px] font-mono text-zinc-400';
      th.textContent = col;
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);

    rows.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-zinc-900/60';
      columns.forEach(col => {
        const td = document.createElement('td');
        td.className = 'px-3 py-1.5 text-zinc-300 border-t border-zinc-900 font-mono text-[11px]';
        let val = row[col];
        if (col === 'status') {
          td.innerHTML = val === 'RESOLVED' ? `<span class="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">RESOLVED</span>` : `<span class="px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 text-[10px]">OPEN</span>`;
        } else if (col === 'source') {
          td.innerHTML = `<span class="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800 text-[10px]">${val}</span>`;
        } else if (col === 'problem_id') {
          td.innerHTML = `<span class="text-blue-400 font-bold">#${val}</span>`;
        } else {
          td.textContent = (typeof val === 'string' && val.length > 70) ? val.slice(0, 70) + '...' : val;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Table load error:', err);
  }
}

// KNOWLEDGE BASE
function setupKnowledgeBase() {
  document.getElementById('kb-search-input').addEventListener('input', renderKnowledgeBase);
  document.getElementById('kb-category-filter').addEventListener('change', renderKnowledgeBase);
}

async function renderKnowledgeBase() {
  const container = document.getElementById('kb-cards-grid');
  const search = document.getElementById('kb-search-input').value.toLowerCase();
  const categoryFilter = document.getElementById('kb-category-filter').value;

  try {
    const res = await fetch(`${API_BASE}/api/problems`);
    const problems = await res.json();

    container.innerHTML = '';
    const filtered = problems.filter(p => {
      const matchSearch = p.title.toLowerCase().includes(search) || p.description.toLowerCase().includes(search);
      const matchCat = !categoryFilter || p.category === categoryFilter;
      return matchSearch && matchCat;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="col-span-2 p-6 text-center text-zinc-500 bg-zinc-950 rounded-lg border border-zinc-800">No matching records.</div>';
      return;
    }

    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = 'bg-zinc-950 border border-zinc-800 rounded-lg p-3 space-y-2';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">${p.category}</span>
            <h4 class="text-xs font-bold text-white mt-1">#${p.id} - ${p.title}</h4>
          </div>
          <span class="text-[10px] px-1.5 py-0.5 rounded ${p.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">
            ${p.status}
          </span>
        </div>
        <p class="text-xs text-zinc-300 line-clamp-2">${p.description}</p>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('KB load error:', err);
  }
}

// STATS
async function refreshStatsAndData() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const stats = await res.json();

    document.getElementById('stat-total').textContent = stats.total_problems;
    document.getElementById('stat-resolved').textContent = stats.resolved_problems;
    document.getElementById('stat-rate').textContent = `${stats.resolution_rate}%`;
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// RESET SEED
function setupResetSeed() {
  document.getElementById('btn-reset-seed').addEventListener('click', async () => {
    if (confirm('Reset database to clean demo data?')) {
      try {
        const res = await fetch(`${API_BASE}/api/reset-seed`, { method: 'POST' });
        const result = await res.json();
        alert(result.message);
        refreshStatsAndData();
        loadExplorerTables('problems');
        renderKnowledgeBase();
      } catch (err) {
        alert('Reset failed: ' + err.message);
      }
    }
  });
}


// Real-time Debounced AI Auto-Classifier on Problem Title
let autoClassifyTimer = null;
function setupAutoClassifier() {
  const titleInput = document.getElementById('input-title');
  titleInput.addEventListener('input', () => {
    clearTimeout(autoClassifyTimer);
    const titleVal = titleInput.value.trim();
    if (titleVal.length < 4) {
      document.getElementById('auto-inferred-badge')?.classList.add('hidden');
      return;
    }

    autoClassifyTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auto-classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: titleVal })
        });
        const inferred = await res.json();
        
        // Auto-fill fields
        const catSelect = document.getElementById('input-category');
        const sevSelect = document.getElementById('input-severity');
        const keyInput = document.getElementById('input-keywords');
        const descInput = document.getElementById('input-description');
        const badge = document.getElementById('auto-inferred-badge');

        if (inferred.category) catSelect.value = inferred.category;
        if (inferred.severity) sevSelect.value = inferred.severity;
        if (inferred.keywords && (!keyInput.value || keyInput.dataset.auto === 'true')) {
          keyInput.value = inferred.keywords;
          keyInput.dataset.auto = 'true';
        }
        if (inferred.suggested_description && (!descInput.value || descInput.dataset.auto === 'true')) {
          descInput.value = inferred.suggested_description;
          descInput.dataset.auto = 'true';
        }

        badge?.classList.remove('hidden');
      } catch (err) {
        console.error('Auto-classify error:', err);
      }
    }, 200);
  });

  // Track if user manually edits keywords or description
  document.getElementById('input-keywords').addEventListener('input', (e) => {
    e.target.dataset.auto = 'false';
  });
  document.getElementById('input-description').addEventListener('input', (e) => {
    e.target.dataset.auto = 'false';
  });
}
