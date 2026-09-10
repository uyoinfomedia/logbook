/**
 * app.js — UIM Logbook
 * Bootstrap. Page routing, event wiring.
 * All data: db.js (IndexedDB, async) | All export: export.js
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ── State ── */
  let activeProject   = null;
  let activeWeekStr   = DB.currentWeekStr();
  let activeWeek      = null;
  let cachedProjects  = []; // last list rendered on the projects page, used by editProject/delete

  /* ══════════════════════════════════════════════
     PAGE ROUTING
  ══════════════════════════════════════════════ */
  function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
  }
  window.showPage = showPage;

  /* ══════════════════════════════════════════════
     DRAWER
  ══════════════════════════════════════════════ */
  const Drawer = (() => {
    const panel   = () => document.getElementById('drawer');
    const overlay = () => document.getElementById('drawer-overlay');
    function open()  { panel()?.classList.add('open'); overlay()?.classList.add('open'); }
    function close() { panel()?.classList.remove('open'); overlay()?.classList.remove('open'); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.getElementById('hamburger')?.addEventListener('click', open);
    document.getElementById('drawer-close')?.addEventListener('click', close);
    document.getElementById('drawer-overlay')?.addEventListener('click', close);
    return { open, close };
  })();
  window.Drawer = Drawer;

  /* ══════════════════════════════════════════════
     PROJECTS LIST PAGE
  ══════════════════════════════════════════════ */
  async function renderProjects() {
    showPage('projects-page');
    const list = document.getElementById('project-list');
    const projects = await DB.getProjects();
    cachedProjects = projects;

    if (!projects.length) {
      list.innerHTML = `<div class="empty-state">No projects yet. Create one to get started.</div>`;
      return;
    }

    const weeksByProject = await Promise.all(projects.map(p => DB.getWeeksForProject(p.id)));

    list.innerHTML = projects.map((p, i) => {
      const weeks = weeksByProject[i];
      return `
        <div class="project-card" onclick="openProject('${p.id}')">
          <div class="project-card-main">
            <div class="project-name">${p.name}</div>
            <div class="project-meta">${weeks.length} week${weeks.length !== 1 ? 's' : ''} logged${p.submittedTo ? ' · ' + p.submittedTo : ''}</div>
          </div>
          <button class="card-edit-btn" title="Edit project" onclick="event.stopPropagation(); editProject('${p.id}')">✎</button>
          <span class="chevron">›</span>
        </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════
     NEW / EDIT PROJECT MODAL
  ══════════════════════════════════════════════ */
  document.getElementById('btn-new-project')?.addEventListener('click', () => {
    document.getElementById('modal-project-title').textContent = 'New project';
    document.getElementById('inp-project-name').value = '';
    document.getElementById('inp-submitted-to').value = '';
    document.getElementById('inp-project-id').value   = '';
    document.getElementById('btn-delete-project').style.display = 'none';
    UI.openModal('project-modal');
  });

  // Opens the same modal pre-filled, in edit mode — reachable via the ✎ button on a project card.
  window.editProject = function(projectId) {
    const project = cachedProjects.find(p => p.id === projectId);
    if (!project) return;
    document.getElementById('modal-project-title').textContent = 'Edit project';
    document.getElementById('inp-project-name').value = project.name || '';
    document.getElementById('inp-submitted-to').value = project.submittedTo || '';
    document.getElementById('inp-project-id').value   = project.id;
    document.getElementById('btn-delete-project').style.display = '';
    UI.openModal('project-modal');
  };

  document.getElementById('btn-save-project')?.addEventListener('click', async () => {
    const name = document.getElementById('inp-project-name').value.trim();
    if (!name) { UI.toast('Project name is required', 'err'); return; }
    const id   = document.getElementById('inp-project-id').value || undefined;
    await DB.saveProject({
      id,
      name,
      submittedTo: document.getElementById('inp-submitted-to').value.trim(),
    });
    UI.closeModal('project-modal');
    await renderProjects();
    UI.toast('Project saved', 'ok');
  });

  // Deletes the project currently loaded in the modal (edit mode only — hidden for new projects).
  document.getElementById('btn-delete-project')?.addEventListener('click', async () => {
    const id = document.getElementById('inp-project-id').value;
    if (!id) return;
    const project = cachedProjects.find(p => p.id === id);
    const label   = project ? `"${project.name}"` : 'this project';
    if (!confirm(`Delete ${label}? This permanently removes it and all its logged weeks. This cannot be undone.`)) return;
    await DB.deleteProject(id);
    UI.closeModal('project-modal');
    await renderProjects();
    UI.toast('Project deleted', 'ok');
  });

  document.getElementById('btn-cancel-project')?.addEventListener('click', () => UI.closeModal('project-modal'));

  /* ══════════════════════════════════════════════
     OPEN PROJECT → WEEK VIEW
  ══════════════════════════════════════════════ */
  window.openProject = async function(projectId) {
    const projects = await DB.getProjects();
    activeProject = projects.find(p => p.id === projectId);
    if (!activeProject) return;
    activeWeekStr = DB.currentWeekStr();
    await openWeek();
  };

  async function openWeek() {
    activeWeek = await DB.getWeek(activeProject.id, activeWeekStr);
    await renderWeekPage();
    showPage('week-page');
  }

  /* ══════════════════════════════════════════════
     WEEK PAGE
  ══════════════════════════════════════════════ */
  async function renderWeekPage() {
    // Header
    document.getElementById('week-project-name').textContent = activeProject.name;
    document.getElementById('week-label').textContent = DB.weekLabel(activeWeekStr);
    document.getElementById('inp-prepared-by').value   = activeWeek.preparedBy || '';
    document.getElementById('inp-submitted-to-w').value = activeWeek.submittedTo || activeProject.submittedTo || '';

    await renderWeekNav();
    renderRows();
  }

  async function renderWeekNav() {
    const weeks = await DB.getWeeksForProject(activeProject.id);
    const wkeys = weeks.map(w => w.weekStr);
    if (!wkeys.includes(activeWeekStr)) wkeys.unshift(activeWeekStr);
    wkeys.sort((a, b) => b.localeCompare(a));

    const sel = document.getElementById('week-select');
    sel.innerHTML = wkeys.map(wk =>
      `<option value="${wk}" ${wk === activeWeekStr ? 'selected' : ''}>${DB.weekLabel(wk)}</option>`
    ).join('');
  }

  /* ── ROWS (operate on in-memory activeWeek; persisted via autoSave) ── */
  function renderRows() {
    const tbody = document.getElementById('log-tbody');
    tbody.innerHTML = activeWeek.rows.map(r => `
      <tr data-row="${r.id}">
        <td class="td-sn">${r.sn}</td>
        <td class="td-day" style="font-size:0.78rem;font-family:var(--font-mono);color:var(--muted);padding-top:10px;white-space:nowrap;">${r.day}</td>
        <td class="td-task">
          <textarea class="cell-input cell-ta" data-field="task" placeholder="Describe the task or activity…" rows="2" maxlength="250">${r.task}</textarea>
        </td>
        <td class="td-partners">
          <input class="cell-input" data-field="partners" value="${r.partners}" placeholder="Names…" maxlength="100" />
        </td>
        <td class="td-status">
          <select class="status-select" data-status="${r.status}">
            <option value="pending"  ${r.status === 'pending'  ? 'selected' : ''}>Pending</option>
            <option value="progress" ${r.status === 'progress' ? 'selected' : ''}>In Progress</option>
            <option value="done"     ${r.status === 'done'     ? 'selected' : ''}>Done</option>
          </select>
          ${r.status === 'done' && r.completedAt
            ? `<span class="status-done-at">${new Date(r.completedAt).toLocaleDateString('en-NG',{day:'numeric',month:'short'})} ${new Date(r.completedAt).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})}</span>`
            : ''}
        </td>
        <td class="td-remarks">
          <textarea class="cell-input cell-ta" data-field="remarks" placeholder="Remarks / continuity notes…" rows="2" maxlength="200">${r.remarks}</textarea>
        </td>
      </tr>`).join('');

    // Wire events
    tbody.querySelectorAll('.cell-input').forEach(el => {
      el.addEventListener('input', e => {
        const tr    = e.target.closest('tr');
        const rowId = tr.dataset.row;
        const field = e.target.dataset.field;
        const row   = activeWeek.rows.find(r => r.id === rowId);
        if (row) { row[field] = e.target.value; autoSave(); }
      });
    });

    tbody.querySelectorAll('.status-select').forEach(el => {
      el.addEventListener('change', e => {
        const rowId = e.target.closest('tr').dataset.row;
        const row   = activeWeek.rows.find(r => r.id === rowId);
        if (!row) return;
        row.status = e.target.value;
        row.completedAt = row.status === 'done' ? (row.completedAt || Date.now()) : null;
        autoSave();
        renderRows(); // refresh to show/hide completed timestamp
      });
    });
  }

  /* ── AUTOSAVE ── */
  let _saveTimer = null;
  function autoSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      activeWeek.preparedBy  = document.getElementById('inp-prepared-by')?.value || '';
      activeWeek.submittedTo = document.getElementById('inp-submitted-to-w')?.value || '';
      await DB.saveWeek(activeProject.id, activeWeekStr, activeWeek);
      UI.status('saved');
      Sync.pushWeek(activeProject, activeWeekStr, activeWeek); // fire-and-forget, offline-safe
    }, 600);
  }

  // Header field changes also trigger save
  ['inp-prepared-by','inp-submitted-to-w'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', autoSave);
  });

  /* ── WEEK NAVIGATION ── */
  document.getElementById('week-select')?.addEventListener('change', async e => {
    activeWeekStr = e.target.value;
    activeWeek    = await DB.getWeek(activeProject.id, activeWeekStr);
    renderRows();
    document.getElementById('week-label').textContent = DB.weekLabel(activeWeekStr);
  });

  document.getElementById('btn-prev-week')?.addEventListener('click', async () => {
    const d = new Date(activeWeekStr + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    activeWeekStr = DB.dateStr(d);
    activeWeek    = await DB.getWeek(activeProject.id, activeWeekStr);
    await renderWeekPage();
  });

  document.getElementById('btn-next-week')?.addEventListener('click', async () => {
    const d = new Date(activeWeekStr + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    activeWeekStr = DB.dateStr(d);
    activeWeek    = await DB.getWeek(activeProject.id, activeWeekStr);
    await renderWeekPage();
  });

  /* ── EXPORT ── */
  document.getElementById('btn-print')?.addEventListener('click', () => {
    activeWeek.preparedBy  = document.getElementById('inp-prepared-by')?.value || '';
    activeWeek.submittedTo = document.getElementById('inp-submitted-to-w')?.value || '';
    Exporter.printWeek(activeProject, activeWeek);
  });


  /* ══════════════════════════════════════════════
     SETTINGS PAGE
  ══════════════════════════════════════════════ */
  async function renderSettings() {
    showPage('settings-page');
  }

  document.getElementById('btn-settings')?.addEventListener('click', () => { renderSettings(); Drawer.close(); });
  document.getElementById('btn-settings-back')?.addEventListener('click', renderProjects);
  document.getElementById('drawer-settings')?.addEventListener('click', () => { renderSettings(); Drawer.close(); });
  document.getElementById('drawer-projects')?.addEventListener('click', () => { renderProjects(); Drawer.close(); });

  /* ── About ── */
  function showAbout() { showPage('about-page'); }
  document.getElementById('btn-about-back')?.addEventListener('click', renderProjects);
  document.getElementById('drawer-about')?.addEventListener('click', () => { showAbout(); Drawer.close(); });

  /* ── Backup ── */
  document.getElementById('btn-backup')?.addEventListener('click', async () => {
    await DB.backup();
    UI.toast('Backup downloaded', 'ok');
  });

  /* ── Restore ── */
  document.getElementById('inp-restore')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await DB.restore(file);
      UI.toast('Restore successful', 'ok');
      await renderProjects();
    } catch (err) {
      UI.toast('Restore failed — invalid file', 'err');
    }
    e.target.value = '';
  });

  /* ── Reset all ── */
  document.getElementById('btn-reset-all')?.addEventListener('click', async () => {
    if (confirm('This will permanently delete ALL projects, logs and settings. Are you sure?')) {
      await DB.resetAll();
      UI.toast('All data cleared', 'ok');
      await renderProjects();
      await renderSettings();
    }
  });

  /* ── Update checker — offline-first: forces a fresh cache pull.
     The app always runs from cache first; this button is the only
     thing that ever touches the network for updates. Never treat
     "offline" as an error — that's the normal, expected state. ── */
  document.getElementById('btn-check-update')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-check-update');
    const res = document.getElementById('update-result');
    if (!btn || !res) return;
    btn.disabled = true; btn.textContent = 'Refreshing…';

    // keep this list and CACHE_NAME in sync with sw.js
    const CACHE_NAME = 'uim-logbook-v5';
    const ASSET_PATHS = [
      '', 'index.html', 'admin/',
      'js/state.js', 'js/ui.js', 'js/db.js', 'js/export.js', 'js/sync.js', 'js/app.js',
      'manifest.json', 'logo.png', 'icon-192.png', 'icon-512.png',
    ];

    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const scope = reg?.scope || (location.href.replace(/[^/]*$/, ''));
      const cache = await caches.open(CACHE_NAME);

      await Promise.all(ASSET_PATHS.map(async p => {
        const url = new URL(p, scope).href;
        const fresh = await fetch(url, { cache: 'reload' });
        if (fresh && fresh.ok) await cache.put(url, fresh.clone());
      }));

      if (reg) await reg.update();

      res.innerHTML = `<span style="font-size:0.75rem;color:var(--accent);font-family:var(--font-mono);">✓ Refreshed — latest files cached for offline use</span>`;
    } catch (_) {
      // no network right now — not an error, just stay on the cached copy
      res.innerHTML = `<span style="font-size:0.75rem;color:var(--muted);font-family:var(--font-mono);">Offline — running on the last saved version</span>`;
    } finally {
      btn.disabled = false; btn.textContent = '🔄 Check for updates';
    }
  });

  /* ── Boot ── */
  renderProjects();

});
