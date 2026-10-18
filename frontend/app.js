/**
 * IRIS (Intelligent Resolution Incident System)
 * Frontend Controller with Operator Identity, Gemini Official SDK, and Closed-Loop SQL Ingestion
 */

const API_BASE = window.location.origin;

// State
let currentActiveProblemId = null;
let currentAIAnalysis = null;
let registeredUsers = [];
let activeUser = {
  id: 1,
  username: 'akshay',
  full_name: 'Akshay Kumar',
  role: 'Lead SRE'
};
let cachedAIStatus = null;

// Quick Presets Data
const PRESETS = {
  slow_api: {
    title: 'Slow API Response on User Profile Page',
    category: 'Performance',
    severity: 'High',
    keywords: 'api, latency, slow query, missing index, performance',
    description: 'User profile API takes over 5 seconds to load when fetching customer details.'
  },
  auth_fail: {
    title: 'User Login Failing with 401 Unauthorized',
    category: 'Authentication',
    severity: 'High',
    keywords: 'login, auth, 401, jwt, password, token',
    description: 'Users are unable to log in and receive 401 Unauthorized errors after password reset.'
  },
  db_pool: {
    title: 'Database Connection Timeout Under Heavy Load',
    category: 'Database',
    severity: 'Critical',
    keywords: 'database, timeout, connection pool, postgres, max connections',
    description: 'Database rejects new incoming connections with timeout error when traffic surges.'
  },
  payment_timeout: {
    title: 'Payment Gateway Network Timeout',
    category: 'Network',
    severity: 'Critical',
    keywords: 'payment, network, timeout, gateway, checkout',
    description: 'Checkout page times out while waiting for response from payment provider during checkout.'
  },
  deadlock: {
    title: 'Deadlock Detected on Money Transfer Transaction',
    category: 'Database',
    severity: 'High',
    keywords: 'deadlock, transfer, transaction, sql, lock',
    description: 'Simultaneous fund transfers between user accounts failed with database deadlock error.'
  }
};

// Initialize Dashboard on Load
document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  setupModals(); // Set up modals and global event delegation FIRST
  setupPresets();
  setupAutoClassifier();
  setupFormHandler();
  setupEditToggle();
  setupAcceptSolutionHandler();
  setupDatabaseExplorer();
  setupKnowledgeBase();
  setupResetButton();

  // Async data loading
  await loadUsers();
  await checkAIStatus();
  await refreshStats();
});

// Helper: retrieve client-side stored API key
function getStoredApiKey() {
  return (localStorage.getItem('iris_gemini_key') || '').trim();
}

// 1. Operator Identity & User Management
async function loadUsers() {
  try {
    const res = await fetch(`${API_BASE}/api/users`);
    registeredUsers = await res.json();
    
    // Check localStorage for saved operator
    const saved = localStorage.getItem('iris_active_user');
    if (saved) {
      try {
        activeUser = JSON.parse(saved);
      } catch (e) {
        if (registeredUsers.length > 0) activeUser = registeredUsers[0];
      }
    } else if (registeredUsers.length > 0) {
      activeUser = registeredUsers[0];
    }
    updateOperatorUI();
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function updateOperatorUI() {
  const nameEl = document.getElementById('header-user-name');
  const roleEl = document.getElementById('header-user-role');
  const initialsEl = document.getElementById('user-avatar-initials');
  const formOpEl = document.getElementById('form-operator-display');
  const resOpEl = document.getElementById('resolve-operator-display');

  if (nameEl) nameEl.textContent = activeUser.full_name;
  if (roleEl) roleEl.textContent = activeUser.role;
  if (formOpEl) formOpEl.textContent = `${activeUser.full_name} (${activeUser.role})`;
  if (resOpEl) resOpEl.textContent = `${activeUser.full_name} (${activeUser.role})`;

  if (initialsEl) {
    const initials = activeUser.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    initialsEl.textContent = initials || 'OP';
  }

  localStorage.setItem('iris_active_user', JSON.stringify(activeUser));
}

function renderUserSelectionList() {
  const container = document.getElementById('user-selection-list');
  if (!container) return;

  container.innerHTML = registeredUsers.map(u => {
    const isActive = u.id === activeUser.id || u.full_name === activeUser.full_name;
    return `
      <div class="user-select-item p-2.5 rounded-lg border ${isActive ? 'bg-blue-950/40 border-blue-600' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'} flex items-center justify-between cursor-pointer transition" data-user-id="${u.id}">
        <div class="flex items-center space-x-2.5">
          <div class="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-300">
            ${u.full_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div class="text-xs font-semibold text-white">${u.full_name}</div>
            <div class="text-[10px] text-zinc-400">${u.role}</div>
          </div>
        </div>
        ${isActive ? '<i class="fa-solid fa-check text-blue-400 text-xs mr-1"></i>' : ''}
      </div>
    `;
  }).join('');

  container.querySelectorAll('.user-select-item').forEach(item => {
    item.addEventListener('click', () => {
      const uId = parseInt(item.dataset.userId);
      const chosen = registeredUsers.find(u => u.id === uId);
      if (chosen) {
        activeUser = chosen;
        updateOperatorUI();
        closeModals();
      }
    });
  });
}

// 2. AI Engine Status & Diagnostics
async function checkAIStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/system/status`);
    const data = await res.json();
    const ai = data.ai_engine;
    cachedAIStatus = ai;

    const modelEl = document.getElementById('header-ai-model');
    const provEl = document.getElementById('header-ai-provider');
    const dotEl = document.getElementById('ai-status-dot');

    const status = ai.status || (ai.configured ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED');

    if (status === 'VERIFIED_LIVE') {
      if (modelEl) modelEl.textContent = `Gemini (${ai.model || 'Live'})`;
      if (provEl) provEl.textContent = 'Live LLM Verified';
      if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50';
    } else if (status === 'CONFIGURED_UNVERIFIED') {
      if (modelEl) modelEl.textContent = `Gemini (${ai.model || 'Configured'})`;
      if (provEl) provEl.textContent = `Key Configured (${ai.masked_key || 'Active'})`;
      if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-blue-400 shadow-sm shadow-blue-500/50';
    } else if (status === 'PROVIDER_ERROR') {
      if (modelEl) modelEl.textContent = 'AI Provider Error';
      if (provEl) provEl.textContent = 'Click to inspect error';
      if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-red-400 shadow-sm shadow-red-500/50';
    } else {
      if (modelEl) modelEl.textContent = 'AI Engine: Offline';
      if (provEl) provEl.textContent = 'Click to configure Gemini API Key';
      if (dotEl) dotEl.className = 'w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-500/50';
    }
    return ai;
  } catch (err) {
    console.error('Failed to check AI status:', err);
    return null;
  }
}

// 3. Navigation Tabs
function initTabs() {
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

      panes.forEach(p => p.classList.add('hidden'));
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.remove('hidden');

      if (tab.dataset.tab === 'tab-explorer') loadDatabaseTables();
      if (tab.dataset.tab === 'tab-history') loadKnowledgeBase();
    });
  });
}

// 4. Quick Demo Presets
function setupPresets() {
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.preset];
      if (!p) return;
      document.getElementById('input-title').value = p.title;
      document.getElementById('input-category').value = p.category;
      document.getElementById('input-severity').value = p.severity;
      document.getElementById('input-keywords').value = p.keywords;
      document.getElementById('input-description').value = p.description;

      const badge = document.getElementById('auto-inferred-badge');
      if (badge) badge.classList.add('hidden');
    });
  });
}

// 5. Real-Time AI Auto-Classifier on Problem Title
let autoClassifyTimer = null;
function setupAutoClassifier() {
  const titleInput = document.getElementById('input-title');
  titleInput?.addEventListener('input', () => {
    clearTimeout(autoClassifyTimer);
    const titleVal = titleInput.value.trim();
    if (titleVal.length < 4) {
      document.getElementById('auto-inferred-badge')?.classList.add('hidden');
      return;
    }

    autoClassifyTimer = setTimeout(async () => {
      try {
        const storedKey = getStoredApiKey();
        const payload = { title: titleVal };
        if (storedKey) payload.api_key = storedKey;

        const res = await fetch(`${API_BASE}/api/auto-classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const inferred = await res.json();
        
        const catSelect = document.getElementById('input-category');
        const sevSelect = document.getElementById('input-severity');
        const keyInput = document.getElementById('input-keywords');
        const descInput = document.getElementById('input-description');
        const badge = document.getElementById('auto-inferred-badge');

        if (inferred.ai_available) {
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
        } else {
          badge?.classList.add('hidden');
        }
      } catch (err) {
        console.error('Auto-classify error:', err);
      }
    }, 300);
  });

  document.getElementById('input-keywords')?.addEventListener('input', (e) => {
    e.target.dataset.auto = 'false';
  });
  document.getElementById('input-description')?.addEventListener('input', (e) => {
    e.target.dataset.auto = 'false';
  });
}

// 6. Problem Submission & Asynchronous Background AI Analysis
function setupFormHandler() {
  const form = document.getElementById('problem-form');
  const btn = document.getElementById('btn-submit-problem');
  if (!form || !btn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Saving to SQLite...</span>';

    const reportedByStr = `${activeUser.full_name} (${activeUser.role})`;

    const problemPayload = {
      title: document.getElementById('input-title').value.trim(),
      category: document.getElementById('input-category').value,
      severity: document.getElementById('input-severity').value,
      keywords: document.getElementById('input-keywords').value.trim(),
      description: document.getElementById('input-description').value.trim(),
      reported_by: reportedByStr
    };

    const placeholder = document.getElementById('ai-placeholder');
    const progressCard = document.getElementById('ai-progress-card');
    const outputContainer = document.getElementById('ai-output-container');

    const t0 = performance.now();

    try {
      // Step A: Immediately insert into problems table
      const storedKey = getStoredApiKey();
      const headers = { 'Content-Type': 'application/json' };
      if (storedKey) headers['X-Gemini-API-Key'] = storedKey;

      const createRes = await fetch(`${API_BASE}/api/problems`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(problemPayload)
      });

      if (!createRes.ok) {
        const errData = await createRes.json();
        throw new Error(errData.detail || 'Failed to save incident to database.');
      }

      const createdProb = await createRes.json();
      const persistenceTimeMs = Math.round(performance.now() - t0);
      currentActiveProblemId = createdProb.id;

      // Immediately show confirmation of persistence in UI
      if (placeholder) placeholder.classList.add('hidden');
      if (outputContainer) outputContainer.classList.add('hidden');
      if (progressCard) {
        progressCard.classList.remove('hidden');
        const headerEl = document.getElementById('progress-incident-header');
        const timeEl = document.getElementById('progress-persistence-time');
        const titleEl = document.getElementById('progress-incident-title');
        if (headerEl) headerEl.textContent = `Incident #${createdProb.id} Saved`;
        if (timeEl) timeEl.textContent = `Persisted in ${persistenceTimeMs}ms`;
        if (titleEl) titleEl.textContent = `"${createdProb.title}"`;
      }

      btn.innerHTML = '<i class="fa-solid fa-brain fa-fade text-blue-400"></i><span>AI Reasoning in Background...</span>';

      // Step B: Poll for background AI analysis completion
      await pollBackgroundAnalysis(createdProb.id, persistenceTimeMs);

      await checkAIStatus();
      await refreshStats();
    } catch (err) {
      alert(`Error logging incident: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-bolt"></i><span>Log to Database & Analyze</span>';
    }
  });
}

// Polling Helper for Background AI Analysis
async function pollBackgroundAnalysis(problemId, persistenceTimeMs) {
  const progressCard = document.getElementById('ai-progress-card');
  const outputContainer = document.getElementById('ai-output-container');
  const stepFtsIcon = document.getElementById('step-fts-icon');
  const stepFtsDesc = document.getElementById('step-fts-desc');
  const stepAiIcon = document.getElementById('step-ai-icon');
  const stepAiDesc = document.getElementById('step-ai-desc');
  const progressBar = document.getElementById('analysis-progress-bar');

  const maxPolls = 30; // 30 * 500ms = 15s max
  let pollCount = 0;

  while (pollCount < maxPolls) {
    pollCount++;
    try {
      const res = await fetch(`${API_BASE}/api/problems/${problemId}/analysis`);
      if (res.ok) {
        const data = await res.json();

        // Update visual progress state
        if (pollCount > 1 && stepFtsIcon && stepFtsDesc) {
          stepFtsIcon.className = 'w-5 h-5 rounded-full bg-emerald-900/60 border border-emerald-600 flex items-center justify-center text-emerald-400 text-[10px] shrink-0 mt-0.5';
          stepFtsIcon.innerHTML = '<i class="fa-solid fa-check"></i>';
          stepFtsDesc.textContent = 'Historical precedents retrieved via FTS5 BM25.';
        }
        if (pollCount > 2 && stepAiIcon && stepAiDesc) {
          stepAiIcon.className = 'w-5 h-5 rounded-full bg-blue-900/60 border border-blue-600 flex items-center justify-center text-blue-300 text-[10px] shrink-0 mt-0.5';
          stepAiIcon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          stepAiDesc.textContent = 'Synthesizing technical root cause and action checklist via Google Gemini...';
          if (progressBar) progressBar.style.width = '85%';
        }

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          if (progressBar) progressBar.style.width = '100%';
          await new Promise(r => setTimeout(r, 200));

          if (progressCard) progressCard.classList.add('hidden');
          if (outputContainer) outputContainer.classList.remove('hidden');

          if (data.analysis) {
            currentAIAnalysis = data.analysis;
            renderAIAnalysis(data.analysis, {
              persistenceTimeMs: persistenceTimeMs,
              aiDurationMs: data.duration_ms
            });
          } else {
            // Render manual / error state
            renderAIAnalysis({
              ai_available: false,
              problem_id: problemId,
              title: document.getElementById('input-title')?.value || '',
              status: 'PROVIDER_ERROR',
              error: data.error || 'AI synthesis encountered a provider error.',
              sql_context: {
                query_executed: 'SELECT p.*, s.* FROM problems p LEFT JOIN solutions s ON p.id = s.problem_id',
                historical_records_retrieved: 0,
                retrieval_time_ms: 1.0,
                total_engine_time_ms: data.duration_ms || 0
              },
              historical_matches: []
            }, {
              persistenceTimeMs: persistenceTimeMs,
              aiDurationMs: data.duration_ms
            });
          }
          return;
        }
      }
    } catch (pollErr) {
      console.warn('Poll status error:', pollErr);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Timeout fallback: reveal output container
  if (progressCard) progressCard.classList.add('hidden');
  if (outputContainer) outputContainer.classList.remove('hidden');
}

// 7. Render AI Analysis Card & SQL Context
let isEditMode = false;

function setEditMode(enable) {
  isEditMode = enable;
  const pRoot = document.getElementById('ai-root-cause');
  const tRoot = document.getElementById('edit-root-cause');
  const pSol = document.getElementById('ai-primary-solution');
  const tSol = document.getElementById('edit-primary-solution');
  const pAct = document.getElementById('ai-action-steps');
  const tAct = document.getElementById('edit-action-steps');
  const editBtn = document.getElementById('btn-edit-resolution');

  if (enable) {
    pRoot?.classList.add('hidden');
    tRoot?.classList.remove('hidden');
    pSol?.classList.add('hidden');
    tSol?.classList.remove('hidden');
    pAct?.classList.add('hidden');
    tAct?.classList.remove('hidden');
    if (editBtn) editBtn.innerHTML = '<i class="fa-solid fa-eye mr-1"></i><span>Preview</span>';
  } else {
    if (pRoot && tRoot) pRoot.textContent = tRoot.value;
    if (pSol && tSol) pSol.textContent = tSol.value;
    if (pAct && tAct) pAct.textContent = tAct.value;

    pRoot?.classList.remove('hidden');
    tRoot?.classList.add('hidden');
    pSol?.classList.remove('hidden');
    tSol?.classList.add('hidden');
    pAct?.classList.remove('hidden');
    tAct?.classList.add('hidden');
    if (editBtn) editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square mr-1"></i><span>Edit</span>';
  }
}

function setupEditToggle() {
  const btn = document.getElementById('btn-edit-resolution');
  btn?.addEventListener('click', () => {
    setEditMode(!isEditMode);
  });
}

function renderAIAnalysis(data, timings = {}) {
  document.getElementById('ai-placeholder')?.classList.add('hidden');
  document.getElementById('ai-progress-card')?.classList.add('hidden');
  const container = document.getElementById('ai-output-container');
  container?.classList.remove('hidden');

  // SQL Context Box
  const sqlBox = document.getElementById('sql-query-display');
  const sqlExecTime = document.getElementById('sql-exec-time');
  const sqlMatchCount = document.getElementById('sql-match-count');

  if (sqlBox) sqlBox.textContent = data.sql_context?.query_executed || 'SELECT * FROM problems JOIN solutions ...';
  if (sqlExecTime) sqlExecTime.textContent = `${data.sql_context?.retrieval_time_ms || 0} ms`;
  if (sqlMatchCount) sqlMatchCount.textContent = `${data.sql_context?.historical_records_retrieved || 0} precedents matched`;

  const titleEl = document.getElementById('ai-output-title');
  const modelBadgeEl = document.getElementById('ai-model-badge');
  const engineLatencyEl = document.getElementById('ai-engine-latency');
  const confEl = document.getElementById('ai-confidence-score');
  const confLabelEl = document.getElementById('ai-confidence-label');
  const rootCauseEl = document.getElementById('ai-root-cause');
  const editRootCauseEl = document.getElementById('edit-root-cause');
  const primarySolEl = document.getElementById('ai-primary-solution');
  const editPrimarySolEl = document.getElementById('edit-primary-solution');
  const actionStepsEl = document.getElementById('ai-action-steps');
  const editActionStepsEl = document.getElementById('edit-action-steps');
  const precedentsContainer = document.getElementById('ai-precedents-list');
  const altList = document.getElementById('ai-alternatives-list');
  const offlineBanner = document.getElementById('ai-offline-banner');
  const offlineTitle = document.getElementById('ai-offline-title');
  const offlineMsg = document.getElementById('ai-offline-message');
  const acceptBtnText = document.getElementById('accept-btn-text');

  if (titleEl) titleEl.textContent = `Incident #${data.problem_id}: ${data.title}`;
  if (engineLatencyEl) {
    if (timings && timings.persistenceTimeMs) {
      engineLatencyEl.textContent = `DB: ${timings.persistenceTimeMs}ms • AI: ${timings.aiDurationMs || data.sql_context?.total_engine_time_ms || 0}ms`;
    } else {
      engineLatencyEl.textContent = `Total Engine: ${data.sql_context?.total_engine_time_ms || 0}ms`;
    }
  }

  // Precedents
  const historical = data.historical_matches || [];
  if (precedentsContainer) {
    if (historical.length > 0) {
      precedentsContainer.innerHTML = historical.map(p => `
        <span class="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-[11px] font-mono flex items-center gap-1">
          <i class="fa-solid fa-link text-blue-400 text-[9px]"></i>
          Incident #${p.problem_id}: ${p.title || 'Historical Incident'}
        </span>
      `).join('');
    } else {
      precedentsContainer.innerHTML = '<span class="text-zinc-500 text-[11px]">Novel incident: No direct prior match found in database. First-principles reasoning engaged.</span>';
    }
  }

  // Handle AI Available vs Offline
  if (data.ai_available && data.ai_recommendation) {
    const rec = data.ai_recommendation;
    offlineBanner?.classList.add('hidden');

    if (modelBadgeEl) modelBadgeEl.textContent = rec.model_used || 'Google Gemini (gemini-3.8-flash)';
    if (confEl) confEl.textContent = rec.confidence_percentage || `${Math.round((rec.confidence_score || 0.9) * 100)}%`;
    if (confLabelEl) confLabelEl.textContent = rec.is_novel ? 'First-Principles Confidence' : 'Evidence-Grounded Confidence';

    if (rootCauseEl) rootCauseEl.textContent = rec.root_cause || '';
    if (editRootCauseEl) editRootCauseEl.value = rec.root_cause || '';

    if (primarySolEl) primarySolEl.textContent = rec.primary_solution || '';
    if (editPrimarySolEl) editPrimarySolEl.value = rec.primary_solution || '';

    if (actionStepsEl) actionStepsEl.textContent = rec.action_steps || '';
    if (editActionStepsEl) editActionStepsEl.value = rec.action_steps || '';

    if (altList) {
      if (rec.alternative_solutions && rec.alternative_solutions.length > 0) {
        altList.innerHTML = rec.alternative_solutions.map(a => `
          <li class="flex items-start gap-1.5"><i class="fa-solid fa-chevron-right text-[9px] text-zinc-600 mt-1"></i><span>${a}</span></li>
        `).join('');
      } else {
        altList.innerHTML = '<li class="text-zinc-500">Standard single-track remediation.</li>';
      }
    }

    if (acceptBtnText) acceptBtnText.textContent = 'Accept Solution & Update Database (SQL)';
    setEditMode(false);
  } else {
    // AI is offline / unconfigured / provider error
    offlineBanner?.classList.remove('hidden');

    if (data.status === 'PROVIDER_ERROR') {
      if (offlineTitle) offlineTitle.textContent = 'AI Provider Error / Quota Exceeded';
      if (modelBadgeEl) modelBadgeEl.textContent = 'Provider Error';
    } else {
      if (offlineTitle) offlineTitle.textContent = 'AI Engine Unavailable / Key Not Configured';
      if (modelBadgeEl) modelBadgeEl.textContent = 'AI Offline';
    }

    if (offlineMsg) {
      offlineMsg.textContent = data.error || 'Gemini API key is not configured. Historical SQL database retrieval succeeded above. You can formulate and ingest a manual resolution below to update organizational knowledge.';
    }

    if (confEl) confEl.textContent = '--';
    if (confLabelEl) confLabelEl.textContent = 'Manual Resolution Mode';

    const defaultRoot = historical.length > 0 ? (historical[0].root_cause || '') : 'Underlying root cause to be investigated by on-call engineer.';
    const defaultSol = historical.length > 0 ? (historical[0].solution_text || '') : '';
    const defaultSteps = historical.length > 0 ? (historical[0].action_steps || '') : '1. Inspect system logs and recent changes.\n2. Formulate and verify remediation.\n3. Verify operational recovery.';

    if (rootCauseEl) rootCauseEl.textContent = defaultRoot;
    if (editRootCauseEl) editRootCauseEl.value = defaultRoot;

    if (primarySolEl) primarySolEl.textContent = defaultSol || 'Enter manual solution...';
    if (editPrimarySolEl) editPrimarySolEl.value = defaultSol;

    if (actionStepsEl) actionStepsEl.textContent = defaultSteps;
    if (editActionStepsEl) editActionStepsEl.value = defaultSteps;

    if (altList) {
      altList.innerHTML = '<li class="text-zinc-500">Manual resolution path active.</li>';
    }

    if (acceptBtnText) acceptBtnText.textContent = 'Ingest Manual Resolution into Database (SQL)';
    setEditMode(true);
  }

  // Update Operator resolving display
  const resOpEl = document.getElementById('resolve-operator-display');
  if (resOpEl) resOpEl.textContent = `${activeUser.full_name} (${activeUser.role})`;
}

// 8. Accept Solution & Close the Loop in SQL
function setupAcceptSolutionHandler() {
  const btn = document.getElementById('btn-accept-solution');
  btn?.addEventListener('click', async () => {
    if (!currentActiveProblemId || !currentAIAnalysis) return;

    const tRoot = document.getElementById('edit-root-cause');
    const tSol = document.getElementById('edit-primary-solution');
    const tAct = document.getElementById('edit-action-steps');

    const pRoot = document.getElementById('ai-root-cause');
    const pSol = document.getElementById('ai-primary-solution');
    const pAct = document.getElementById('ai-action-steps');

    const solutionText = (isEditMode ? tSol?.value : (pSol?.textContent || tSol?.value)) || '';
    const rootCauseText = (isEditMode ? tRoot?.value : (pRoot?.textContent || tRoot?.value)) || '';
    const actionStepsText = (isEditMode ? tAct?.value : (pAct?.textContent || tAct?.value)) || '';

    if (!solutionText.trim()) {
      alert('Please provide a solution description before ingesting into the database.');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Ingesting into Database...</span>';

    const resolvedByStr = `${activeUser.full_name} (${activeUser.role})`;
    const isAi = currentAIAnalysis.ai_available && currentAIAnalysis.ai_recommendation;
    const confScore = isAi ? (currentAIAnalysis.ai_recommendation.confidence_score || 0.92) : 1.0;

    const solutionPayload = {
      solution_text: solutionText.trim(),
      source: isAi ? 'AI (Gemini)' : 'Human',
      resolved_by: resolvedByStr,
      confidence_score: confScore,
      root_cause: rootCauseText.trim(),
      action_steps: actionStepsText.trim()
    };

    try {
      const res = await fetch(`${API_BASE}/api/problems/${currentActiveProblemId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(solutionPayload)
      });
      const result = await res.json();

      btn.className = 'w-full sm:w-auto bg-zinc-800 text-emerald-400 font-bold px-5 py-2.5 rounded-lg text-xs flex items-center justify-center space-x-2 border border-emerald-500/50';
      btn.innerHTML = '<i class="fa-solid fa-check-double"></i><span>Resolved & Stored in SQL Database!</span>';

      await refreshStats();
      
      setTimeout(() => {
        alert(`Success! Incident #${currentActiveProblemId} has been resolved by ${resolvedByStr} and inserted into the solutions table.`);
      }, 300);
    } catch (err) {
      alert(`Failed to accept solution: ${err.message}`);
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-circle-check"></i><span id="accept-btn-text">Accept Solution & Update Database (SQL)</span>';
    }
  });
}

// 9. Database Explorer & SQL Console
function setupDatabaseExplorer() {
  const subtabs = document.querySelectorAll('.table-subtab');
  const panes = document.querySelectorAll('.table-pane');

  subtabs.forEach(tab => {
    tab.addEventListener('click', () => {
      subtabs.forEach(t => {
        t.className = 'table-subtab px-2.5 py-1 rounded font-medium text-zinc-400 hover:text-white transition cursor-pointer';
      });
      tab.className = 'table-subtab px-2.5 py-1 rounded font-medium bg-white text-black transition cursor-pointer';

      panes.forEach(p => p.classList.add('hidden'));
      const target = document.getElementById(tab.dataset.subtab);
      if (target) target.classList.remove('hidden');
    });
  });

  // Presets in Explorer
  document.querySelectorAll('.sql-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('sql-console-input').value = btn.dataset.sql;
      executeSQLConsole();
    });
  });

  // Execute Button
  document.getElementById('btn-execute-sql')?.addEventListener('click', executeSQLConsole);
}

async function executeSQLConsole() {
  const sql = document.getElementById('sql-console-input')?.value.trim();
  const resContainer = document.getElementById('sql-custom-result');
  const thead = document.getElementById('custom-table-head');
  const tbody = document.getElementById('custom-table-body');
  if (!sql) return;

  try {
    const res = await fetch(`${API_BASE}/api/explorer/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql_query: sql })
    });
    const data = await res.json();

    if (data.error) {
      alert(`SQL Error: ${data.error}`);
      return;
    }

    resContainer.classList.remove('hidden');
    thead.innerHTML = `<tr>${data.columns.map(c => `<th class="p-2 border-b border-zinc-800">${c}</th>`).join('')}</tr>`;
    tbody.innerHTML = data.rows.map(r => `
      <tr>${data.columns.map(c => `<td class="p-2 border-b border-zinc-900">${r[c] !== null ? r[c] : '<span class="text-zinc-600">NULL</span>'}</td>`).join('')}</tr>
    `).join('');
  } catch (err) {
    alert(`Execution failed: ${err.message}`);
  }
}

async function loadDatabaseTables() {
  try {
    const res = await fetch(`${API_BASE}/api/explorer/tables`);
    const data = await res.json();

    // 1. Problems Table
    const tbodyProb = document.getElementById('tbody-problems');
    if (tbodyProb) {
      tbodyProb.innerHTML = data.problems.map(p => `
        <tr class="hover:bg-zinc-900/50 transition">
          <td class="p-2.5 font-bold text-white">${p.id}</td>
          <td class="p-2.5 font-sans max-w-xs truncate">${p.title}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 text-[10px]">${p.category}</span></td>
          <td class="p-2.5"><span class="text-[10px] ${p.severity === 'Critical' ? 'text-red-400 font-bold' : p.severity === 'High' ? 'text-amber-400' : 'text-zinc-400'}">${p.severity}</span></td>
          <td class="p-2.5 text-zinc-300 text-[10px] font-sans">${p.reported_by || 'Akshay Kumar'}</td>
          <td class="p-2.5"><span class="px-1.5 py-0.5 rounded text-[10px] ${p.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">${p.status}</span></td>
          <td class="p-2.5 text-zinc-400 text-[10px]">${p.created_at || '-'}</td>
          <td class="p-2.5 text-zinc-400 text-[10px]">${p.resolved_at || '-'}</td>
        </tr>
      `).join('');
    }

    // 2. Solutions Table
    const tbodySol = document.getElementById('tbody-solutions');
    if (tbodySol) {
      tbodySol.innerHTML = data.solutions.map(s => `
        <tr class="hover:bg-zinc-900/50 transition">
          <td class="p-2.5 font-bold text-white">${s.id}</td>
          <td class="p-2.5 text-blue-400 font-bold">#${s.problem_id}</td>
          <td class="p-2.5 font-sans max-w-sm truncate">${s.solution_text}</td>
          <td class="p-2.5 text-zinc-300 text-[10px] font-sans">${s.resolved_by || 'Akshay Kumar'}</td>
          <td class="p-2.5"><span class="px-1.5 py-0.5 rounded text-[10px] ${s.source.includes('AI') ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-blue-950 text-blue-300 border border-blue-800'}">${s.source}</span></td>
          <td class="p-2.5 font-bold text-emerald-400">${Math.round(s.confidence_score * 100)}%</td>
          <td class="p-2.5 text-zinc-400 text-[10px]">${s.created_at || '-'}</td>
        </tr>
      `).join('');
    }

    // 3. Users Table
    const tbodyUsers = document.getElementById('tbody-users');
    if (tbodyUsers) {
      tbodyUsers.innerHTML = (data.users || []).map(u => `
        <tr class="hover:bg-zinc-900/50 transition">
          <td class="p-2.5 font-bold text-white">${u.id}</td>
          <td class="p-2.5 font-mono text-zinc-400">@${u.username}</td>
          <td class="p-2.5 font-sans font-medium text-white">${u.full_name}</td>
          <td class="p-2.5"><span class="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-blue-300 text-[10px]">${u.role}</span></td>
          <td class="p-2.5 text-zinc-400 text-[10px]">${u.created_at || '-'}</td>
        </tr>
      `).join('');
    }

    // 4. Logs Table
    const tbodyLogs = document.getElementById('tbody-logs');
    if (tbodyLogs) {
      tbodyLogs.innerHTML = data.logs.map(l => `
        <tr class="hover:bg-zinc-900/50 transition font-mono text-[10px]">
          <td class="p-2.5 text-zinc-400">${l.id}</td>
          <td class="p-2.5 font-bold ${l.query_type === 'RETRIEVAL' ? 'text-blue-400' : l.query_type === 'INSERT' ? 'text-emerald-400' : 'text-zinc-300'}">${l.query_type}</td>
          <td class="p-2.5 text-zinc-300 max-w-md truncate">${l.query_text}</td>
          <td class="p-2.5 text-zinc-400">${l.rows_affected}</td>
          <td class="p-2.5 text-emerald-400 font-bold">${l.execution_time_ms} ms</td>
          <td class="p-2.5 text-zinc-400">${l.timestamp}</td>
        </tr>
      `).join('');
    }

  } catch (err) {
    console.error('Failed to load explorer tables:', err);
  }
}

// 10. Knowledge Base Tab
async function loadKnowledgeBase() {
  try {
    const res = await fetch(`${API_BASE}/api/problems?status=RESOLVED`);
    const problems = await res.json();
    renderKBCards(problems);
  } catch (err) {
    console.error('Failed to load knowledge base:', err);
  }
}

function renderKBCards(problems) {
  const container = document.getElementById('kb-cards-container');
  if (!container) return;

  if (problems.length === 0) {
    container.innerHTML = '<div class="col-span-2 text-center text-zinc-500 py-10">No resolved incidents found.</div>';
    return;
  }

  container.innerHTML = problems.map(p => `
    <div class="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2.5 hover:border-zinc-700 transition">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">${p.category}</span>
        <span class="text-[10px] font-mono text-zinc-400">Resolved at ${p.resolved_at || p.created_at}</span>
      </div>
      <h4 class="text-sm font-bold text-white">${p.title}</h4>
      <p class="text-xs text-zinc-400 leading-relaxed">${p.description}</p>
      
      <div class="pt-2 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
        <span>Reported by: <strong class="text-zinc-300">${p.reported_by || 'Engineer'}</strong></span>
        <span class="text-emerald-400"><i class="fa-solid fa-circle-check mr-1"></i>Verified</span>
      </div>
    </div>
  `).join('');
}

function setupKnowledgeBase() {
  const search = document.getElementById('kb-search-input');
  search?.addEventListener('input', async (e) => {
    const q = e.target.value.toLowerCase().trim();
    const res = await fetch(`${API_BASE}/api/problems?status=RESOLVED`);
    const problems = await res.json();
    const filtered = problems.filter(p => 
      p.title.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.keywords && p.keywords.toLowerCase().includes(q)) ||
      (p.reported_by && p.reported_by.toLowerCase().includes(q))
    );
    renderKBCards(filtered);
  });
}

// 11. Modals & Settings Management (Exposed Globally + Event Delegated)

function renderModalStatus(ai) {
  if (!ai) return;
  const titleEl = document.getElementById('modal-ai-title');
  const descEl = document.getElementById('modal-ai-desc');
  const dotEl = document.getElementById('modal-ai-dot');
  const badgeEl = document.getElementById('modal-ai-badge');
  const maskedKeyEl = document.getElementById('modal-masked-key');
  const detailsEl = document.getElementById('modal-ai-details');
  const modelNameEl = document.getElementById('modal-ai-model-name');

  if (modelNameEl) modelNameEl.textContent = ai.model || 'gemini-3.8-flash';
  if (maskedKeyEl) maskedKeyEl.textContent = ai.masked_key || 'None';

  const status = ai.status || (ai.configured ? 'CONFIGURED_UNVERIFIED' : 'NOT_CONFIGURED');
  if (titleEl) titleEl.textContent = status;

  if (status === 'VERIFIED_LIVE') {
    if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400';
    if (badgeEl) {
      badgeEl.className = 'px-2 py-0.5 rounded font-mono text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800';
      badgeEl.textContent = 'Verified Live';
    }
    if (descEl) descEl.textContent = ai.description || 'Connected and verified live with Gemini. Database-Augmented Generation active.';
    if (detailsEl) {
      detailsEl.textContent = `Last verified at: ${ai.last_verified_at || 'Just now'}`;
      detailsEl.classList.remove('hidden');
    }
  } else if (status === 'CONFIGURED_UNVERIFIED') {
    if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-blue-400';
    if (badgeEl) {
      badgeEl.className = 'px-2 py-0.5 rounded font-mono text-[10px] bg-blue-950 text-blue-300 border border-blue-800';
      badgeEl.textContent = 'Configured (Unverified)';
    }
    if (descEl) descEl.textContent = ai.description || 'API key is configured. Click "Test Connection" to perform a live probe.';
    if (detailsEl) detailsEl.classList.add('hidden');
  } else if (status === 'PROVIDER_ERROR') {
    if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-red-400';
    if (badgeEl) {
      badgeEl.className = 'px-2 py-0.5 rounded font-mono text-[10px] bg-red-950 text-red-300 border border-red-800';
      badgeEl.textContent = 'Provider Error';
    }
    if (descEl) descEl.textContent = ai.last_error || 'Encountered error communicating with Gemini provider.';
    if (detailsEl) detailsEl.classList.add('hidden');
  } else {
    if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
    if (badgeEl) {
      badgeEl.className = 'px-2 py-0.5 rounded font-mono text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700';
      badgeEl.textContent = 'Offline';
    }
    if (descEl) descEl.textContent = 'Configure a Gemini API Key to enable generative reasoning. Manual resolution and SQL retrieval remain active.';
    if (detailsEl) detailsEl.classList.add('hidden');
  }
}

// Global openAIModal: opens instantly, zero latency or blocked click
async function openAIModal() {
  const modalAI = document.getElementById('modal-ai');
  if (!modalAI) return;

  // 1. Immediately display modal without waiting for network
  modalAI.classList.remove('hidden');

  // 2. Pre-fill key from localStorage if input is empty
  const keyInput = document.getElementById('input-gemini-key');
  const savedLocal = getStoredApiKey();
  if (keyInput && savedLocal && !keyInput.value) {
    keyInput.value = savedLocal;
  }

  // 3. Clear transient test banner
  const testBanner = document.getElementById('modal-test-banner');
  if (testBanner) testBanner.classList.add('hidden');

  // 4. Render cached or default status immediately
  renderModalStatus(cachedAIStatus || {
    status: 'NOT_CONFIGURED',
    configured: false,
    model: 'gemini-3.8-flash',
    masked_key: null,
    description: 'Gemini API key is not configured. Historical SQL retrieval is active; AI synthesis requires GEMINI_API_KEY.'
  });

  // 5. In background, refresh live status from backend
  try {
    const ai = await checkAIStatus();
    if (ai) renderModalStatus(ai);
  } catch (err) {
    console.error('Failed to background refresh status in modal:', err);
  }
}

function openUserModal() {
  const errBanner = document.getElementById('user-error-banner');
  if (errBanner) {
    errBanner.textContent = '';
    errBanner.classList.add('hidden');
  }
  renderUserSelectionList();
  document.getElementById('modal-user')?.classList.remove('hidden');
}

function closeModals() {
  document.getElementById('modal-user')?.classList.add('hidden');
  document.getElementById('modal-ai')?.classList.add('hidden');
}

// Attach globally for inline handlers / console access
window.openAIModal = openAIModal;
window.openUserModal = openUserModal;
window.closeModals = closeModals;

function setupModals() {
  // Global Event Delegation for reliable click interception (works across dynamic re-renders)
  document.addEventListener('click', (e) => {
    // 1. AI Settings Triggers
    const aiTrigger = e.target.closest('#btn-ai-modal, #btn-banner-configure-ai, .btn-configure-ai, [data-action="open-ai-settings"]');
    if (aiTrigger) {
      e.preventDefault();
      e.stopPropagation();
      openAIModal();
      return;
    }

    // 2. User Directory Triggers
    const userTrigger = e.target.closest('#btn-user-modal, #btn-switch-operator-inline, [data-action="open-user-settings"]');
    if (userTrigger) {
      e.preventDefault();
      e.stopPropagation();
      openUserModal();
      return;
    }

    // 3. Modal Close Buttons
    if (e.target.closest('#btn-close-ai-modal, #btn-close-user-modal')) {
      e.preventDefault();
      closeModals();
      return;
    }

    // 4. Modal Backdrop Clicks
    const modalAI = document.getElementById('modal-ai');
    const modalUser = document.getElementById('modal-user');
    if (e.target === modalAI || e.target === modalUser) {
      closeModals();
    }
  });

  // Keyboard accessibility: Escape key closes active modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      closeModals();
    }
  });

  // Add new user form submission
  document.getElementById('btn-add-user')?.addEventListener('click', async () => {
    const errBanner = document.getElementById('user-error-banner');
    if (errBanner) {
      errBanner.textContent = '';
      errBanner.classList.add('hidden');
    }

    const name = (document.getElementById('new-user-fullname')?.value || '').trim();
    const unameInput = (document.getElementById('new-user-username')?.value || '').trim();
    const role = (document.getElementById('new-user-role')?.value || '').trim();

    if (!name || !role) {
      const msg = 'Please enter both Full Name and Role.';
      if (errBanner) {
        errBanner.textContent = msg;
        errBanner.classList.remove('hidden');
      } else {
        alert(msg);
      }
      return;
    }

    const payload = { full_name: name, role: role };
    if (unameInput) {
      payload.username = unameInput;
    }

    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to add user.');
      }

      registeredUsers.push(data);
      activeUser = data;
      updateOperatorUI();
      renderUserSelectionList();
      closeModals();

      document.getElementById('new-user-fullname').value = '';
      const uEl = document.getElementById('new-user-username');
      if (uEl) uEl.value = '';
      document.getElementById('new-user-role').value = '';

      if (document.getElementById('tab-explorer')?.classList.contains('hidden') === false) {
        loadDatabaseTables();
      }
    } catch (err) {
      if (errBanner) {
        errBanner.textContent = err.message;
        errBanner.classList.remove('hidden');
      } else {
        alert('Failed to add user: ' + err.message);
      }
    }
  });

  // Toggle key visibility in modal
  const btnToggle = document.getElementById('btn-toggle-key-visibility');
  const keyInput = document.getElementById('input-gemini-key');
  btnToggle?.addEventListener('click', () => {
    if (keyInput.type === 'password') {
      keyInput.type = 'text';
      btnToggle.textContent = 'Hide';
    } else {
      keyInput.type = 'password';
      btnToggle.textContent = 'Show';
    }
  });

  // Test Connection Button
  const btnTest = document.getElementById('btn-test-connection');
  btnTest?.addEventListener('click', async () => {
    const testBanner = document.getElementById('modal-test-banner');
    const inputKey = (document.getElementById('input-gemini-key')?.value || '').trim();
    const probeKey = inputKey || getStoredApiKey() || undefined;

    if (!probeKey) {
      if (testBanner) {
        testBanner.classList.remove('hidden');
        testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-amber-950/80 border border-amber-800 text-amber-300';
        testBanner.innerHTML = `
          <div class="font-bold flex items-center gap-1.5 text-amber-400">
            <i class="fa-solid fa-circle-info"></i>
            <span>No API Key Entered</span>
          </div>
          <div>Please enter a key above or configure GEMINI_API_KEY in .env before running test connection.</div>
        `;
      }
      return;
    }

    btnTest.disabled = true;
    btnTest.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Probing...</span>';

    try {
      const res = await fetch(`${API_BASE}/api/system/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: probeKey })
      });
      const data = await res.json();

      if (testBanner) {
        testBanner.classList.remove('hidden');
        if (data.success) {
          testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-emerald-950/80 border border-emerald-800 text-emerald-300';
          testBanner.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 text-emerald-400">
              <i class="fa-solid fa-circle-check"></i>
              <span>Connection Verified Live!</span>
            </div>
            <div>Target Model: <strong class="text-white font-mono">${data.model}</strong> &bull; Latency: <strong class="text-white">${data.latency_ms} ms</strong></div>
            <div class="text-[10px] text-emerald-400/80">Probe reply: "${data.probe_response || 'PONG'}" &bull; Key: ${data.masked_key || '***'}</div>
          `;
        } else {
          testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-red-950/80 border border-red-800 text-red-300';
          testBanner.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 text-red-400">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>Connection Failed</span>
            </div>
            <div class="font-mono text-[10px] text-red-200 mt-1">${data.error || data.message || 'Unknown provider error'}</div>
          `;
        }
      }
      const ai = await checkAIStatus();
      if (ai) renderModalStatus(ai);
    } catch (err) {
      if (testBanner) {
        testBanner.classList.remove('hidden');
        testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-red-950/80 border border-red-800 text-red-300';
        testBanner.innerHTML = `
          <div class="font-bold text-red-400"><i class="fa-solid fa-circle-xmark mr-1"></i>Request Error</div>
          <div>${err.message}</div>
        `;
      }
    } finally {
      btnTest.disabled = false;
      btnTest.innerHTML = '<i class="fa-solid fa-satellite-dish text-blue-400"></i><span>Test Connection</span>';
    }
  });

  // Save Gemini Key
  const btnSave = document.getElementById('btn-save-gemini-key');
  btnSave?.addEventListener('click', async () => {
    const key = (document.getElementById('input-gemini-key')?.value || '').trim();
    const testBanner = document.getElementById('modal-test-banner');

    if (!key) {
      if (testBanner) {
        testBanner.classList.remove('hidden');
        testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-amber-950/80 border border-amber-800 text-amber-300';
        testBanner.innerHTML = '<div class="font-bold"><i class="fa-solid fa-circle-exclamation mr-1"></i>Please enter a valid Google Gemini API Key.</div>';
      } else {
        alert('Please enter a valid Google Gemini API Key.');
      }
      return;
    }

    btnSave.disabled = true;
    btnSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>Saving & Testing...</span>';

    try {
      // 1. Save to backend runtime & .env
      const res = await fetch(`${API_BASE}/api/system/api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key })
      });
      const data = await res.json();

      // 2. Persist to localStorage for frontend requests
      localStorage.setItem('iris_gemini_key', key);

      // 3. Proactively test connection
      const testRes = await fetch(`${API_BASE}/api/system/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key })
      });
      const testData = await testRes.json();

      const ai = await checkAIStatus();
      if (ai) renderModalStatus(ai);

      if (testBanner) {
        testBanner.classList.remove('hidden');
        if (testData.success) {
          testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-emerald-950/80 border border-emerald-800 text-emerald-300';
          testBanner.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 text-emerald-400">
              <i class="fa-solid fa-circle-check"></i>
              <span>Key Saved & Verified Live!</span>
            </div>
            <div>Target Model: <strong class="text-white font-mono">${testData.model}</strong> &bull; Latency: <strong class="text-white">${testData.latency_ms} ms</strong></div>
          `;
        } else {
          testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-amber-950/80 border border-amber-800 text-amber-300';
          testBanner.innerHTML = `
            <div class="font-bold flex items-center gap-1.5 text-amber-400">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>Key Saved, but Connection Test Failed</span>
            </div>
            <div class="font-mono text-[10px] text-amber-200 mt-1">${testData.error || testData.message || 'Unknown error'}</div>
          `;
        }
      }
    } catch (err) {
      if (testBanner) {
        testBanner.classList.remove('hidden');
        testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-red-950/80 border border-red-800 text-red-300';
        testBanner.innerHTML = `<div class="font-bold text-red-400"><i class="fa-solid fa-circle-xmark mr-1"></i>Save Error</div><div>${err.message}</div>`;
      }
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span>Save & Activate</span>';
    }
  });

  // Clear / Disconnect Key
  document.getElementById('btn-clear-gemini-key')?.addEventListener('click', async () => {
    if (!confirm('Clear the configured Gemini API key and switch to Manual Resolution mode?')) return;
    try {
      localStorage.removeItem('iris_gemini_key');
      const keyInput = document.getElementById('input-gemini-key');
      if (keyInput) keyInput.value = '';

      await fetch(`${API_BASE}/api/system/api-key`, { method: 'DELETE' });
      const ai = await checkAIStatus();
      if (ai) renderModalStatus(ai);

      const testBanner = document.getElementById('modal-test-banner');
      if (testBanner) {
        testBanner.classList.remove('hidden');
        testBanner.className = 'p-2.5 rounded-lg text-[11px] leading-relaxed bg-zinc-900 border border-zinc-700 text-zinc-300';
        testBanner.innerHTML = '<div class="flex items-center gap-1.5"><i class="fa-solid fa-circle-check text-blue-400"></i><span>Gemini API key cleared. System is now in Manual Resolution Mode.</span></div>';
      }
    } catch (err) {
      alert('Failed to clear API key: ' + err.message);
    }
  });
}

// 12. Refresh Top Header Stats (Safe against missing elements)
async function refreshStats() {
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const data = await res.json();
    const totalEl = document.getElementById('stat-total');
    const resolvedEl = document.getElementById('stat-resolved');
    const rateEl = document.getElementById('stat-rate');
    if (totalEl) totalEl.textContent = data.total_problems;
    if (resolvedEl) resolvedEl.textContent = data.resolved_problems;
    if (rateEl) rateEl.textContent = `${data.resolution_rate}%`;
  } catch (err) {
    console.error('Failed to refresh stats:', err);
  }
}

// 13. Reset Database Button
function setupResetButton() {
  const btn = document.getElementById('btn-reset-seed');
  btn?.addEventListener('click', async () => {
    if (!confirm('Reset database to clean benchmark seed records?')) return;
    try {
      await fetch(`${API_BASE}/api/reset-seed`, { method: 'POST' });
      await loadUsers();
      await refreshStats();
      document.getElementById('ai-output-container')?.classList.add('hidden');
      document.getElementById('ai-placeholder')?.classList.remove('hidden');
      alert('Database successfully reset to initial benchmark state.');
    } catch (err) {
      alert('Reset failed: ' + err.message);
    }
  });
}
