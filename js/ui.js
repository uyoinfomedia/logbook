const UI = (() => {
  let _t = null, _s = null;
  function toast(msg, type='info') {
    const el = document.getElementById('toast');
    if (!el) return;
    clearTimeout(_t);
    el.textContent = msg;
    el.className = 'show' + (type==='ok' ? ' ok' : type==='err' ? ' err' : '');
    _t = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function status(msg) {
    const el = document.getElementById('status-chip');
    if (!el) return;
    clearTimeout(_s);
    el.textContent = msg; el.classList.add('show');
    _s = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function openModal(id)  { const el = document.getElementById(id); if(el) el.classList.add('show'); }
  function closeModal(id) { const el = document.getElementById(id); if(el) el.classList.remove('show'); }
  function init() {
    document.querySelectorAll('.modal-overlay').forEach(o => {
      o.addEventListener('click', e => { if(e.target===o) o.classList.remove('show'); });
    });
  }
  return { toast, status, openModal, closeModal, init };
})();
