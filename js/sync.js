/**
 * sync.js — UIM Logbook
 * Best-effort push of a saved week to the shared Google Sheet backend.
 * Local IndexedDB (db.js) remains the source of truth on the device —
 * this only mirrors data out for the boss dashboard. If it's offline or
 * the fetch fails for any reason, it fails silently: the local save
 * already succeeded and nothing is lost.
 */
const Sync = (() => {

  // ---- SET THIS AFTER DEPLOYING Code.gs AS A WEB APP ----
  const SYNC_URL     = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
  const WRITE_SECRET = 'CHANGE_ME_WRITE_SECRET_ABC123'; // must match Code.gs exactly
  // --------------------------------------------------------

  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

  function _rowDate(weekStr, day) {
    const idx = DAYS.indexOf(day);
    if (idx < 0) return '';
    const d = new Date(weekStr + 'T00:00:00');
    d.setDate(d.getDate() + idx);
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  async function pushWeek(project, weekStr, week) {
    if (!SYNC_URL || SYNC_URL.startsWith('PASTE_')) return; // not configured yet — skip quietly

    const payload = {
      secret     : WRITE_SECRET,
      staff      : week.preparedBy || '',
      project    : project.name || '',
      weekStr    : weekStr,
      submittedTo: week.submittedTo || project.submittedTo || '',
      rows: (week.rows || [])
        .filter(r => r.task && r.task.trim()) // don't sync empty placeholder rows
        .map(r => ({
          rowKey  : `${project.id}_${weekStr}_${r.id}`,
          date    : _rowDate(weekStr, r.day),
          day     : r.day,
          task    : r.task,
          partners: r.partners,
          status  : r.status,
          remarks : r.remarks,
        })),
    };

    if (!payload.rows.length) return;

    try {
      // no-cors: Apps Script's response can't be read back, but the POST still
      // goes through and gets processed server-side. We don't need the response.
      await fetch(SYNC_URL, {
        method : 'POST',
        mode   : 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body   : JSON.stringify(payload),
      });
    } catch (_) {
      // offline or blocked — safe to ignore
    }
  }

  return { pushWeek };
})();

window.Sync = Sync;
