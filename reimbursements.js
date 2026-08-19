(function () {
  'use strict';

  var RECORDS_KEY = 'fund_os_records_v1';
  var NAME_KEY = 'fund_os_group_name_v1';
  var REIMBURSEMENTS_KEY = 'fund_os_reimbursements_v1';
  var claimEditingId = null;
  var activeClaimId = null;

  function $(id) { return document.getElementById(id); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function monthKey(value) { return String(value || '').slice(0, 7); }
  function fmt(value) { return '¥ ' + Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function readRecords() {
    try {
      var records = JSON.parse(localStorage.getItem(RECORDS_KEY));
      return Array.isArray(records) ? records : [];
    } catch (error) { return []; }
  }
  function normalize(value) {
    var source = value && typeof value === 'object' ? value : {};
    return {
      claims: Array.isArray(source.claims) ? source.claims.filter(function (claim) {
        return claim && claim.id && claim.title && Number(claim.totalAmount) > 0;
      }).map(function (claim) {
        return {
          id: String(claim.id), title: String(claim.title), totalAmount: Number(claim.totalAmount),
          purchaseDate: claim.purchaseDate || today(), purchaser: claim.purchaser || '', note: claim.note || '',
          createdAt: claim.createdAt || new Date().toISOString()
        };
      }) : [],
      batches: Array.isArray(source.batches) ? source.batches.filter(function (batch) {
        return batch && batch.id && batch.claimId && batch.person && Number(batch.amount) > 0 && batch.date;
      }).map(function (batch) {
        return {
          id: String(batch.id), claimId: String(batch.claimId), person: String(batch.person), amount: Number(batch.amount),
          date: batch.date, note: batch.note || '', recordId: batch.recordId || null
        };
      }) : []
    };
  }
  function read() {
    try { return normalize(JSON.parse(localStorage.getItem(REIMBURSEMENTS_KEY))); }
    catch (error) { return { claims: [], batches: [] }; }
  }
  function save(data) { localStorage.setItem(REIMBURSEMENTS_KEY, JSON.stringify(data)); }
  function batchesFor(data, claimId) { return data.batches.filter(function (batch) { return batch.claimId === claimId; }); }
  function paidFor(data, claimId) { return batchesFor(data, claimId).reduce(function (sum, batch) { return sum + batch.amount; }, 0); }
  function remainingFor(data, claim) { return Math.max(0, claim.totalAmount - paidFor(data, claim.id)); }
  function toast(message) {
    var el = $('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { el.hidden = true; }, 2400);
  }
  function render() {
    var data = read();
    var currentMonth = monthKey(today());
    var totalPaid = data.batches.reduce(function (sum, batch) { return sum + batch.amount; }, 0);
    var outstanding = data.claims.reduce(function (sum, claim) { return sum + remainingFor(data, claim); }, 0);
    var monthPaid = data.batches.reduce(function (sum, batch) { return sum + (monthKey(batch.date) === currentMonth ? batch.amount : 0); }, 0);
    $('claimOutstanding').textContent = fmt(outstanding);
    $('claimReimbursed').textContent = fmt(totalPaid);
    $('claimMonthReimbursed').textContent = fmt(monthPaid);
    var box = $('claimList');
    if (!data.claims.length) {
      box.innerHTML = '<p class="claim-empty">暂无报销事项</p>';
      return;
    }
    box.innerHTML = data.claims.slice().sort(function (a, b) {
      return String(b.purchaseDate).localeCompare(String(a.purchaseDate));
    }).map(function (claim) {
      var paid = paidFor(data, claim.id);
      var remaining = remainingFor(data, claim);
      var percent = Math.min(100, Math.round(paid / claim.totalAmount * 100));
      var batches = batchesFor(data, claim.id).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      var batchList = batches.length ? '<div class="batch-list">' + batches.map(function (batch) {
        return '<div class="batch-row"><div class="batch-main"><span class="batch-person">' + esc(batch.person) + '</span><span class="batch-meta">' + esc(batch.date) + (batch.note ? ' · ' + esc(batch.note) : '') + '</span></div><span class="batch-amount">' + fmt(batch.amount) + '</span><button class="text-action danger-action" type="button" data-delete-batch="' + esc(batch.id) + '">删除</button></div>';
      }).join('') + '</div>' : '<p class="batch-empty">尚未登记报销批次</p>';
      return '<article class="claim-card"><div class="claim-head"><div class="claim-main"><h3>' + esc(claim.title) + '</h3><p>' + esc(claim.purchaseDate) + (claim.purchaser ? ' · ' + esc(claim.purchaser) : '') + (claim.note ? ' · ' + esc(claim.note) : '') + '</p></div><div class="claim-money"><strong>' + fmt(remaining) + '</strong><span>' + (remaining > 0 ? '待报销' : '已完成') + '</span></div></div><div class="claim-progress"><div class="claim-progress-track"><div class="claim-progress-fill" style="width:' + percent + '%"></div></div><span>已报 ' + fmt(paid) + ' / ' + fmt(claim.totalAmount) + '</span></div><div class="claim-actions"><button class="btn btn-primary btn-small" type="button" data-add-batch="' + esc(claim.id) + '"' + (remaining <= 0 ? ' disabled' : '') + '>＋ 登记批次</button><button class="text-action" type="button" data-edit-claim="' + esc(claim.id) + '">编辑</button><button class="text-action danger-action" type="button" data-delete-claim="' + esc(claim.id) + '">删除</button></div>' + batchList + '</article>';
    }).join('');
  }
  function openClaim(claim) {
    claimEditingId = claim ? claim.id : null;
    $('claimModalTitle').textContent = claim ? '编辑报销事项' : '新增报销事项';
    $('btnClaimSubmit').textContent = claim ? '保存修改' : '保存事项';
    $('claimTitle').value = claim ? claim.title : '';
    $('claimTotal').value = claim ? claim.totalAmount : '';
    $('claimPurchaseDate').value = claim ? claim.purchaseDate : today();
    $('claimPurchaser').value = claim ? claim.purchaser : '';
    $('claimNote').value = claim ? claim.note : '';
    $('claimMask').hidden = false;
    setTimeout(function () { $('claimTitle').focus(); }, 40);
  }
  function closeClaim() { $('claimMask').hidden = true; claimEditingId = null; }
  function openBatch(claim) {
    activeClaimId = claim.id;
    $('reimbursementClaimName').textContent = claim.title + ' · 待报 ' + fmt(remainingFor(read(), claim));
    $('reimbursementPerson').value = '';
    $('reimbursementAmount').value = '';
    $('reimbursementDate').value = today();
    $('reimbursementNote').value = '';
    $('reimbursementSync').checked = true;
    $('reimbursementMask').hidden = false;
    setTimeout(function () { $('reimbursementPerson').focus(); }, 40);
  }
  function closeBatch() { $('reimbursementMask').hidden = true; activeClaimId = null; }
  function exportBackup(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    var data = {
      app: 'Fund-OS', version: 2, exportedAt: new Date().toISOString(),
      groupName: $('groupName').textContent, records: readRecords(), reimbursements: read()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'fund-os-backup-' + today() + '.json';
    link.click();
    URL.revokeObjectURL(link.href);
    toast('已导出包含报销进度的备份文件');
  }
  function importBackup(event) {
    event.stopImmediatePropagation();
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = JSON.parse(reader.result);
        var records = Array.isArray(imported) ? imported : imported.records;
        if (!Array.isArray(records)) throw new Error('Invalid backup');
        var clean = records.filter(function (record) {
          return record && (record.type === 'income' || record.type === 'expense') && Number(record.amount) > 0 && record.item && record.date;
        }).map(function (record) {
          return { id: record.id || uid(), type: record.type, amount: Number(record.amount), item: String(record.item), category: record.category || (record.type === 'income' ? '其他收入' : '其他支出'), date: record.date, handler: record.handler || '', note: record.note || '' };
        });
        if (!clean.length) throw new Error('No records');
        localStorage.setItem(RECORDS_KEY, JSON.stringify(clean));
        if (imported && imported.reimbursements) save(normalize(imported.reimbursements));
        if (imported && imported.groupName) localStorage.setItem(NAME_KEY, imported.groupName);
        window.location.reload();
      } catch (error) {
        toast('导入失败：文件格式不正确');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }
  function bind() {
    $('btnAddClaim').addEventListener('click', function () { openClaim(null); });
    $('btnAddClaimInline').addEventListener('click', function () { openClaim(null); });
    $('btnCloseClaim').addEventListener('click', closeClaim);
    $('claimMask').addEventListener('click', function (event) { if (event.target === $('claimMask')) closeClaim(); });
    $('btnCloseReimbursement').addEventListener('click', closeBatch);
    $('reimbursementMask').addEventListener('click', function (event) { if (event.target === $('reimbursementMask')) closeBatch(); });
    $('claimForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var data = read();
      var total = Number($('claimTotal').value);
      var title = $('claimTitle').value.trim();
      if (!(total > 0) || !title || !$('claimPurchaseDate').value) { toast('请填写采购事项、总额和日期。'); return; }
      var old = claimEditingId && data.claims.filter(function (claim) { return claim.id === claimEditingId; })[0];
      if (old && total + 0.00001 < paidFor(data, old.id)) { toast('应报总额不能低于已报销金额。'); return; }
      var claim = { id: claimEditingId || uid(), title: title, totalAmount: Math.round(total * 100) / 100, purchaseDate: $('claimPurchaseDate').value, purchaser: $('claimPurchaser').value.trim(), note: $('claimNote').value.trim(), createdAt: old ? old.createdAt : new Date().toISOString() };
      if (old) data.claims = data.claims.map(function (item) { return item.id === claim.id ? claim : item; });
      else data.claims.push(claim);
      save(data);
      closeClaim();
      render();
      toast(old ? '报销事项已更新' : '已新增报销事项');
    });
    $('reimbursementForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var data = read();
      var claim = data.claims.filter(function (item) { return item.id === activeClaimId; })[0];
      var amount = Number($('reimbursementAmount').value);
      var person = $('reimbursementPerson').value.trim();
      if (!claim || !(amount > 0) || !person || !$('reimbursementDate').value) { toast('请填写人员、金额和日期。'); return; }
      if (amount > remainingFor(data, claim) + 0.00001) { toast('本次金额超过该事项的待报销余额。'); return; }
      var recordId = null;
      if ($('reimbursementSync').checked) {
        var records = readRecords();
        recordId = uid();
        records.push({ id: recordId, type: 'expense', amount: Math.round(amount * 100) / 100, item: '报销：' + claim.title, category: '劳务费用', date: $('reimbursementDate').value, handler: person, note: $('reimbursementNote').value.trim() || '报销批次' });
        localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      }
      data.batches.push({ id: uid(), claimId: claim.id, person: person, amount: Math.round(amount * 100) / 100, date: $('reimbursementDate').value, note: $('reimbursementNote').value.trim(), recordId: recordId });
      save(data);
      window.location.reload();
    });
    $('claimList').addEventListener('click', function (event) {
      var button = event.target.closest('button');
      if (!button) return;
      var data = read();
      if (button.hasAttribute('data-add-batch')) {
        var claim = data.claims.filter(function (item) { return item.id === button.getAttribute('data-add-batch'); })[0];
        if (claim) openBatch(claim);
      } else if (button.hasAttribute('data-edit-claim')) {
        var edit = data.claims.filter(function (item) { return item.id === button.getAttribute('data-edit-claim'); })[0];
        if (edit) openClaim(edit);
      } else if (button.hasAttribute('data-delete-claim')) {
        var claimId = button.getAttribute('data-delete-claim');
        if (batchesFor(data, claimId).length) { toast('请先删除该事项下的全部报销批次。'); return; }
        if (window.confirm('删除这个报销事项？')) {
          data.claims = data.claims.filter(function (claim) { return claim.id !== claimId; });
          save(data);
          render();
          toast('报销事项已删除');
        }
      } else if (button.hasAttribute('data-delete-batch')) {
        var batchId = button.getAttribute('data-delete-batch');
        var batch = data.batches.filter(function (item) { return item.id === batchId; })[0];
        if (!batch || !window.confirm('删除这笔报销批次？同步生成的流水也会删除。')) return;
        data.batches = data.batches.filter(function (item) { return item.id !== batchId; });
        if (batch.recordId) {
          localStorage.setItem(RECORDS_KEY, JSON.stringify(readRecords().filter(function (record) { return record.id !== batch.recordId; })));
        }
        save(data);
        window.location.reload();
      }
    });
    $('btnExport').addEventListener('click', exportBackup, true);
    $('importFile').addEventListener('change', importBackup, true);
  }
  function init() {
    bind();
    render();
  }
  init();
})();