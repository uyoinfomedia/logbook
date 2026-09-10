const State = (() => {
  const DEFAULTS = { activePage: 'projects-page' };
  let _s = { ...DEFAULTS };
  const _l = {};
  function get(k) { return _s[k]; }
  function set(k, v) { _s[k] = v; (_l[k]||[]).forEach(fn=>fn(v)); }
  function on(k, cb) { if(!_l[k]) _l[k]=[]; _l[k].push(cb); }
  function reset() { _s = {...DEFAULTS}; }
  return { get, set, on, reset };
})();
