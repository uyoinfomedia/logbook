/**
 * db.js — UIM Logbook
 * All data operations via IndexedDB. No SQL needed.
 * Every method returns a Promise — callers must await.
 * Stores:
 *   projects  → { id, name, submittedTo, createdAt }
 *   weeks     → { id: "projectId_weekStr", projectId, weekStr, preparedBy, submittedTo, rows[] }
 *   checklist → single record { key: 'default', items: [...] }
 */

const DB = (() => {

  const DB_NAME    = 'gnoke_logbook_db';
  const DB_VERSION = 1;

  // legacy localStorage keys — read once for migration, never written again
  const LEGACY_KEYS = {
    projects  : 'gnoke_logbook_projects',
    weeks     : 'gnoke_logbook_weeks',
    checklist : 'gnoke_logbook_checklist',
  };

  const DEFAULT_CHECKLIST = [
    { id: 'c1', label: 'Task clearly described', on: true },
    { id: 'c2', label: 'Completed by named partner', on: false },
    { id: 'c3', label: 'No blockers outstanding', on: false },
    { id: 'c4', label: 'Ready for next phase', on: false },
  ];

  /* ── low-level IndexedDB helpers ── */
  let _dbPromise = null;

  function _open() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const tx = e.target.transaction;

        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('weeks')) {
          const ws = db.createObjectStore('weeks', { keyPath: 'id' });
          ws.createIndex('projectId', 'projectId', { unique: false });
        }
        if (!db.objectStoreNames.contains('checklist')) db.createObjectStore('checklist', { keyPath: 'key' });

        // one-time silent migration from the old localStorage version
        try {
          const rawP = localStorage.getItem(LEGACY_KEYS.projects);
          const rawW = localStorage.getItem(LEGACY_KEYS.weeks);
          const rawC = localStorage.getItem(LEGACY_KEYS.checklist);
          if (rawP) {
            const projObj = JSON.parse(rawP) || {};
            const pStore = tx.objectStore('projects');
            Object.values(projObj).forEach(p => pStore.put(p));
          }
          if (rawW) {
            const weekObj = JSON.parse(rawW) || {};
            const wStore = tx.objectStore('weeks');
            Object.entries(weekObj).forEach(([id, w]) => wStore.put({ ...w, id }));
          }
          if (rawC) {
            const items = JSON.parse(rawC);
            if (Array.isArray(items) && items.length) tx.objectStore('checklist').put({ key: 'default', items });
          }
        } catch (_) { /* no legacy data, or it was malformed — safe to ignore */ }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    return _dbPromise;
  }

  function _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  async function _getAll(store) {
    const db = await _open();
    return _req(db.transaction(store, 'readonly').objectStore(store).getAll());
  }

  async function _get(store, key) {
    const db = await _open();
    return _req(db.transaction(store, 'readonly').objectStore(store).get(key));
  }

  async function _getByIndex(store, index, value) {
    const db = await _open();
    return _req(db.transaction(store, 'readonly').objectStore(store).index(index).getAll(value));
  }

  async function _put(store, value) {
    const db = await _open();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    return new Promise((res, rej) => { tx.oncomplete = () => res(value); tx.onerror = () => rej(tx.error); });
  }

  async function _delete(store, key) {
    const db = await _open();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }

  async function _clear(stores) {
    const db = await _open();
    const tx = db.transaction(stores, 'readwrite');
    stores.forEach(s => tx.objectStore(s).clear());
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }

  function _uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ── PROJECTS ── */
  async function getProjects() {
    const all = await _getAll('projects');
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async function saveProject(data) {
    const id = data.id || _uid();
    const project = { ...data, id, createdAt: data.createdAt || Date.now() };
    await _put('projects', project);
    return project;
  }

  async function deleteProject(id) {
    await _delete('projects', id);
    const weeks = await _getByIndex('weeks', 'projectId', id);
    const db = await _open();
    const tx = db.transaction('weeks', 'readwrite');
    weeks.forEach(w => tx.objectStore('weeks').delete(w.id));
    return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }

  /* ── WEEKS ── */
  function weekKey(projectId, weekStr) { return projectId + '_' + weekStr; }

  async function getWeek(projectId, weekStr) {
    const key   = weekKey(projectId, weekStr);
    const found = await _get('weeks', key);
    const week  = found || _emptyWeek(weekStr);
    week.rows   = week.rows.map(_migrateRow);
    return week;
  }

  async function saveWeek(projectId, weekStr, data) {
    const key = weekKey(projectId, weekStr);
    await _put('weeks', { ...data, id: key, projectId, weekStr, savedAt: Date.now() });
  }

  async function getWeeksForProject(projectId) {
    const rows = await _getByIndex('weeks', 'projectId', projectId);
    return rows.sort((a, b) => b.weekStr.localeCompare(a.weekStr));
  }

  function _emptyWeek(weekStr) {
    const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return {
      weekStr,
      preparedBy : '',
      submittedTo: '',
      rows: DAYS.map((day, i) => ({
        id          : _uid(),
        sn          : i + 1,
        day,
        task        : '',
        partners    : '',
        remarks     : '',
        status      : 'pending',   // pending | progress | done
        completedAt : null,
      })),
    };
  }

  // addRow/removeRow work on the in-memory week object — no DB access needed
  // until the caller's next saveWeek()
  function addRow(week) {
    const sn = week.rows.length + 1;
    week.rows.push({ id: _uid(), sn, day: '', task: '', partners: '', remarks: '', status: 'pending', completedAt: null });
    return week;
  }

  function removeRow(week, rowId) {
    week.rows = week.rows.filter(r => r.id !== rowId);
    week.rows.forEach((r, i) => r.sn = i + 1);
    return week;
  }

  // Migrate old boolean `done` field to `status`/`completedAt` on read
  function _migrateRow(r) {
    if (r.status === undefined) {
      r.status = r.done ? 'done' : 'pending';
      r.completedAt = r.done ? (r.completedAt || Date.now()) : null;
    }
    return r;
  }

  /* ── CHECKLIST TEMPLATES ── */
  async function getChecklist() {
    const rec = await _get('checklist', 'default');
    return (rec && rec.items && rec.items.length) ? rec.items : DEFAULT_CHECKLIST;
  }

  async function saveChecklist(items) {
    await _put('checklist', { key: 'default', items });
  }

  async function addChecklistItem(label) {
    const items = await getChecklist();
    items.push({ id: _uid(), label, on: false });
    await saveChecklist(items);
    return items;
  }

  async function removeChecklistItem(id) {
    const items = (await getChecklist()).filter(i => i.id !== id);
    await saveChecklist(items);
    return items;
  }

  /* ── WEEK STRING UTILS ── */
  function _toDateStr(d) {
    // Build YYYY-MM-DD from LOCAL date parts — never use toISOString() for dates
    // because it converts to UTC first, which shifts the date in WAT (UTC+1)
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function currentWeekStr() {
    const now  = new Date();
    const day  = now.getDay();           // 0 = Sun, 1 = Mon … 6 = Sat
    const back = day === 0 ? -6 : 1 - day;
    const mon  = new Date(now);
    mon.setDate(now.getDate() + back);
    mon.setHours(0, 0, 0, 0);
    return _toDateStr(mon);
  }

  function weekLabel(weekStr) {
    const mon = new Date(weekStr + 'T00:00:00');
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
    return fmt(mon) + ' – ' + fmt(sun) + ', ' + sun.getFullYear();
  }

  /* ── BACKUP / RESTORE / RESET ── */
  async function backup() {
    const [projects, weeks, checklistRec] = await Promise.all([
      _getAll('projects'),
      _getAll('weeks'),
      _get('checklist', 'default'),
    ]);
    const payload = {
      version   : 2,
      exportedAt: new Date().toISOString(),
      projects,
      weeks,
      checklist : checklistRec ? checklistRec.items : [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'uim-logbook-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function restore(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.projects || !data.weeks) throw new Error('Invalid backup file');
          // support both old (object-keyed) and new (array) backup shapes
          const projects = Array.isArray(data.projects) ? data.projects : Object.values(data.projects);
          const weeksArr  = Array.isArray(data.weeks)    ? data.weeks    : Object.entries(data.weeks).map(([id, w]) => ({ ...w, id }));

          await _clear(['projects', 'weeks', 'checklist']);
          const db = await _open();
          const tx = db.transaction(['projects', 'weeks', 'checklist'], 'readwrite');
          const pStore = tx.objectStore('projects');
          projects.forEach(p => pStore.put(p));
          const wStore = tx.objectStore('weeks');
          weeksArr.forEach(w => wStore.put({ ...w, id: w.id || weekKey(w.projectId, w.weekStr) }));
          if (data.checklist && data.checklist.length) {
            tx.objectStore('checklist').put({ key: 'default', items: data.checklist });
          }
          tx.oncomplete = () => resolve();
          tx.onerror    = () => reject(tx.error);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsText(file);
    });
  }

  async function resetAll() {
    await _clear(['projects', 'weeks', 'checklist']);
  }

  return {
    getProjects, saveProject, deleteProject,
    getWeek, saveWeek, getWeeksForProject,
    addRow, removeRow,
    getChecklist, saveChecklist, addChecklistItem, removeChecklistItem,
    currentWeekStr, weekLabel, dateStr: _toDateStr,
    backup, restore, resetAll,
  };

})();
