(function () {
  'use strict';

  var KEYS = ['fund_os_records_v1', 'fund_os_group_name_v1', 'fund_os_reimbursements_v1'];
  var endpoint = '/api/state';
  var version = 0;
  var applying = false;
  var ready = false;
  var timer = null;
  var dirty = false;

  window.FundOSServerManaged = true;

  function parse(value, fallback) {
    try { return JSON.parse(value); } catch (error) { return fallback; }
  }
  function snapshot() {
    return {
      groupName: localStorage.getItem('fund_os_group_name_v1') || '课题组经费',
      records: parse(localStorage.getItem('fund_os_records_v1'), []),
      reimbursements: parse(localStorage.getItem('fund_os_reimbursements_v1'), { claims: [], batches: [] })
    };
  }
  function apply(data) {
    applying = true;
    localStorage.setItem('fund_os_records_v1', JSON.stringify(data.records || []));
    localStorage.setItem('fund_os_group_name_v1', data.groupName || '课题组经费');
    localStorage.setItem('fund_os_reimbursements_v1', JSON.stringify(data.reimbursements || { claims: [], batches: [] }));
    applying = false;
  }
  async function loadServerState() {
    var response = await fetch(endpoint, { cache: 'no-store' });
    if (!response.ok) throw new Error('Server unavailable');
    return response.json();
  }
  async function saveServerState() {
    if (!ready || applying) return;
    dirty = false;
    var response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: snapshot(), version: version || null })
    });
    if (response.status === 409) {
      alert('其他成员刚刚更新了共享账本。为避免覆盖对方数据，页面将刷新；请重新进行刚才的操作。');
      window.location.reload();
      return;
    }
    if (!response.ok) throw new Error('Save failed');
    var saved = await response.json();
    version = saved.version;
  }
  function scheduleSave() {
    if (!ready || applying) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(function () {
      saveServerState().catch(function () {
        console.warn('Fund OS is temporarily using local data because the server cannot be reached.');
      });
    }, 500);
  }
  function modalOpen() {
    return Array.prototype.some.call(document.querySelectorAll('.modal-mask'), function (node) { return !node.hidden; });
  }
  async function start() {
    try {
      var state = await loadServerState();
      if (state.initialized) {
        apply(state.data);
        version = state.version;
      }
    } catch (error) {
      console.warn('Fund OS server is unavailable; local browser storage remains active.', error);
    } finally {
      ready = true;
    }
  }
  var nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, key, value);
    if (this === window.localStorage && KEYS.indexOf(key) !== -1 && !applying) scheduleSave();
  };
  window.FundOSReady = start();
  setInterval(function () {
    if (!ready || dirty || modalOpen()) return;
    loadServerState().then(function (state) {
      if (state.initialized && state.version > version) {
        apply(state.data);
        version = state.version;
        window.location.reload();
      }
    }).catch(function () { });
  }, 15000);
})();