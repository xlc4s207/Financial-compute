/* ============================================================
   Fund OS · 课题组经费管理
   浏览器本地缓存；部署后由服务器同步共享数据
   ============================================================ */

(function () {
  'use strict';

  /* ---------- 常量 ---------- */
  var STORE_KEY = 'fund_os_records_v1';
  var NAME_KEY = 'fund_os_group_name_v1';

  var EXPENSE_CATEGORIES = ['实验耗材', '设备仪器', '差旅交通', '劳务费用', '办公用品', '会议培训', '资料出版', '其他支出'];
  var INCOME_CATEGORIES = ['项目拨款', '经费转账', '报销退回', '其他收入'];

  /* ---------- 种子示例数据（首次打开时写入） ---------- */
  function seedData() {
    var today = new Date();
    function d(offset) {
      var t = new Date(today);
      t.setDate(t.getDate() - offset);
      return t.toISOString().slice(0, 10);
    }
    return [
      { id: uid(), type: 'income',  amount: 50000, item: '国家自然科学基金项目拨款', category: '项目拨款', date: d(58), handler: '课题组', note: '2026 年度第一期' },
      { id: uid(), type: 'expense', amount: 3680,  item: '实验耗材采购',             category: '实验耗材', date: d(45), handler: '张三',   note: '试剂与移液枪头' },
      { id: uid(), type: 'expense', amount: 12500, item: '便携式水质分析仪',         category: '设备仪器', date: d(32), handler: '李四',   note: '含两年质保' },
      { id: uid(), type: 'expense', amount: 2140,  item: '广州采样差旅',             category: '差旅交通', date: d(21), handler: '王五',   note: '高铁 + 住宿 2 晚' },
      { id: uid(), type: 'income',  amount: 8000,  item: '横向课题经费到账',         category: '经费转账', date: d(15), handler: '课题组', note: '' },
      { id: uid(), type: 'expense', amount: 960,   item: '研究生劳务补贴',           category: '劳务费用', date: d(10), handler: '课题组', note: '3 月' },
      { id: uid(), type: 'expense', amount: 328,   item: '办公用品',                 category: '办公用品', date: d(6),  handler: '赵六',   note: '打印纸、硒鼓' },
      { id: uid(), type: 'expense', amount: 1500,  item: '学术会议注册费',           category: '会议培训', date: d(2),  handler: '张三',   note: '全国水环境年会' }
    ];
  }

  /* ---------- 工具 ---------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmt(n) {
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    return sign + '¥ ' + abs.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtSigned(n, type) {
    return (type === 'income' ? '+' : '-') + fmt(n).replace('-', '');
  }

  function monthKey(dateStr) {
    return dateStr.slice(0, 7); // YYYY-MM
  }

  function monthLabel(key) {
    var parts = key.split('-');
    return parts[0] + ' 年 ' + parseInt(parts[1], 10) + ' 月';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 状态 ---------- */
  var records = [];
  var filter = 'all';
  var keyword = '';
  var editingId = null;
  var deletingId = null;
  var currentType = 'expense';

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 数据损坏时回落到种子数据 */ }
    if (window.FundOSServerManaged) return [];
    var seed = seedData();
    localStorage.setItem(STORE_KEY, JSON.stringify(seed));
    return seed;
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  }

  /* ---------- 计算 ---------- */
  function sortedRecords() {
    return records.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  }

  function totals() {
    var income = 0, expense = 0;
    records.forEach(function (r) {
      if (r.type === 'income') income += r.amount;
      else expense += r.amount;
    });
    return { income: income, expense: expense, balance: income - expense };
  }

  function balanceAfter(target, sorted) {
    var bal = 0;
    for (var i = 0; i < sorted.length; i++) {
      var r = sorted[i];
      bal += r.type === 'income' ? r.amount : -r.amount;
      if (r.id === target.id) return bal;
    }
    return bal;
  }

  /* ---------- 渲染 ---------- */
  var $ = function (id) { return document.getElementById(id); };

  function renderAll() {
    renderSummary();
    renderCategories();
    renderList();
  }

  function renderSummary() {
    var t = totals();
    var balEl = $('balance');
    balEl.textContent = fmt(t.balance);
    balEl.classList.toggle('negative', t.balance < 0);
    $('totalIncome').textContent = fmt(t.income);
    $('totalExpense').textContent = fmt(t.expense);
    $('recordCount').textContent = '共 ' + records.length + ' 笔记录';

    var nowKey = monthKey(new Date().toISOString().slice(0, 10));
    var monthExp = 0;
    records.forEach(function (r) {
      if (r.type === 'expense' && monthKey(r.date) === nowKey) monthExp += r.amount;
    });
    $('monthExpense').textContent = fmt(monthExp);
  }

  function renderCategories() {
    var box = $('categoryBars');
    var byCat = {};
    var max = 0;
    records.forEach(function (r) {
      if (r.type !== 'expense') return;
      byCat[r.category] = (byCat[r.category] || 0) + r.amount;
      if (byCat[r.category] > max) max = byCat[r.category];
    });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });

    if (!cats.length) {
      box.innerHTML = '<p class="cat-empty">暂无支出记录</p>';
      return;
    }
    box.innerHTML = cats.map(function (c) {
      var pct = Math.max(2, Math.round((byCat[c] / max) * 100));
      return '<div class="cat-row">' +
        '<span class="cat-name">' + esc(c) + '</span>' +
        '<div class="cat-track"><div class="cat-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="cat-amount">' + fmt(byCat[c]) + '</span>' +
      '</div>';
    }).join('');
  }

  function renderList() {
    var listEl = $('recordList');
    var emptyEl = $('emptyState');
    var sorted = sortedRecords();

    // 计算每笔交易后的余额
    var balMap = {};
    var bal = 0;
    sorted.forEach(function (r) {
      bal += r.type === 'income' ? r.amount : -r.amount;
      balMap[r.id] = bal;
    });

    // 筛选 + 搜索（展示用倒序）
    var kw = keyword.trim().toLowerCase();
    var shown = sorted.filter(function (r) {
      if (filter !== 'all' && r.type !== filter) return false;
      if (kw) {
        var hay = (r.item + ' ' + (r.note || '') + ' ' + (r.handler || '') + ' ' + r.category).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    }).reverse();

    if (!shown.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.textContent = records.length ? '没有匹配的记录。' : '暂无记录，点击右上角「＋ 记一笔」开始记账。';
      return;
    }
    emptyEl.hidden = true;

    // 按月分组
    var groups = {};
    var order = [];
    shown.forEach(function (r) {
      var k = monthKey(r.date);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(r);
    });

    var html = order.map(function (k) {
      var g = groups[k];
      var gExp = 0, gInc = 0;
      g.forEach(function (r) {
        if (r.type === 'income') gInc += r.amount; else gExp += r.amount;
      });
      var rows = g.map(function (r) {
        var isExp = r.type === 'expense';
        var meta = [esc(r.date)];
        meta.push('<span class="record-cat">' + esc(r.category) + '</span>');
        if (r.handler) meta.push(esc(r.handler));
        if (r.note) meta.push(esc(r.note));
        return '<div class="record" data-id="' + r.id + '">' +
          '<div class="record-icon ' + r.type + '">' + (isExp ? '↗' : '↙') + '</div>' +
          '<div class="record-main">' +
            '<p class="record-item">' + esc(r.item) + '</p>' +
            '<p class="record-meta">' + meta.join('') + '</p>' +
          '</div>' +
          '<div class="record-right">' +
            '<p class="record-amount ' + r.type + '">' + fmtSigned(r.amount, r.type) + '</p>' +
            '<p class="record-balance">结余 ' + fmt(balMap[r.id]) + '</p>' +
          '</div>' +
          '<button class="record-delete" data-del="' + r.id + '">删除</button>' +
        '</div>';
      }).join('');

      return '<div class="month-group">' +
        '<div class="month-head">' +
          '<span class="month-title">' + monthLabel(k) + '</span>' +
          '<span class="month-sum">收入 ' + fmt(gInc) + ' · 支出 ' + fmt(gExp) + '</span>' +
        '</div>' + rows +
      '</div>';
    }).join('');

    listEl.innerHTML = html;
  }

  /* ---------- 弹窗 ---------- */
  function fillCategories(type, selected) {
    var sel = $('fCategory');
    var cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    sel.innerHTML = cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function setType(type) {
    currentType = type;
    document.querySelectorAll('.type-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-type') === type);
    });
    fillCategories(type);
  }

  function openModal(record) {
    editingId = record ? record.id : null;
    $('modalTitle').textContent = record ? '编辑记录' : '记一笔';
    $('btnSubmit').textContent = record ? '保存修改' : '保存记录';
    setType(record ? record.type : 'expense');
    $('fAmount').value = record ? record.amount : '';
    $('fItem').value = record ? record.item : '';
    fillCategories(record ? record.type : 'expense', record ? record.category : undefined);
    $('fDate').value = record ? record.date : new Date().toISOString().slice(0, 10);
    $('fHandler').value = record ? (record.handler || '') : '';
    $('fNote').value = record ? (record.note || '') : '';
    $('modalMask').hidden = false;
    setTimeout(function () { $('fAmount').focus(); }, 60);
  }

  function closeModal() {
    $('modalMask').hidden = true;
    editingId = null;
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    $('btnAdd').addEventListener('click', function () { openModal(null); });
    $('btnCloseModal').addEventListener('click', closeModal);
    $('modalMask').addEventListener('click', function (e) {
      if (e.target === $('modalMask')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); closeConfirm(); }
    });

    document.querySelectorAll('.type-btn').forEach(function (b) {
      b.addEventListener('click', function () { setType(b.getAttribute('data-type')); });
    });

    $('recordForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var amount = parseFloat($('fAmount').value);
      var item = $('fItem').value.trim();
      var date = $('fDate').value;
      if (!amount || amount <= 0) { toast('请输入有效金额'); return; }
      if (!item) { toast('请填写项目 / 用途'); return; }
      if (!date) { toast('请选择日期'); return; }

      var payload = {
        type: currentType,
        amount: Math.round(amount * 100) / 100,
        item: item,
        category: $('fCategory').value,
        date: date,
        handler: $('fHandler').value.trim(),
        note: $('fNote').value.trim()
      };

      if (editingId) {
        for (var i = 0; i < records.length; i++) {
          if (records[i].id === editingId) {
            payload.id = editingId;
            records[i] = payload;
            break;
          }
        }
        toast('记录已更新');
      } else {
        payload.id = uid();
        records.push(payload);
        toast('已记账 ' + fmtSigned(payload.amount, payload.type));
      }
      save();
      closeModal();
      renderAll();
    });

    // 列表：删除（点击记录本体 = 编辑）
    $('recordList').addEventListener('click', function (e) {
      var delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        deletingId = delBtn.getAttribute('data-del');
        $('confirmMask').hidden = false;
        return;
      }
      var row = e.target.closest('.record');
      if (row) {
        var id = row.getAttribute('data-id');
        var rec = records.filter(function (r) { return r.id === id; })[0];
        if (rec) openModal(rec);
      }
    });

    $('btnCancelDelete').addEventListener('click', closeConfirm);
    $('confirmMask').addEventListener('click', function (e) {
      if (e.target === $('confirmMask')) closeConfirm();
    });
    $('btnConfirmDelete').addEventListener('click', function () {
      records = records.filter(function (r) { return r.id !== deletingId; });
      save();
      closeConfirm();
      renderAll();
      toast('记录已删除');
    });

    // 筛选 & 搜索
    $('filterTabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (!tab) return;
      filter = tab.getAttribute('data-filter');
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t === tab); });
      renderList();
    });
    $('searchInput').addEventListener('input', function (e) {
      keyword = e.target.value;
      renderList();
    });

    // 导出 / 导入
    $('btnExport').addEventListener('click', exportJSON);
    $('importFile').addEventListener('change', importJSON);

    // 修改课题组名称
    $('groupName').addEventListener('click', editGroupName);
  }

  function closeConfirm() {
    $('confirmMask').hidden = true;
    deletingId = null;
  }

  function editGroupName() {
    var el = $('groupName');
    var name = prompt('课题组名称：', el.textContent);
    if (name && name.trim()) {
      el.textContent = name.trim();
      localStorage.setItem(NAME_KEY, name.trim());
      document.title = 'Fund OS · ' + name.trim();
    }
  }

  function exportJSON() {
    var data = {
      app: 'Fund-OS',
      version: 1,
      exportedAt: new Date().toISOString(),
      groupName: $('groupName').textContent,
      records: records
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fund-os-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('已导出备份文件');
  }

  function importJSON(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var list = Array.isArray(data) ? data : data.records;
        if (!Array.isArray(list)) throw new Error('bad format');
        list = list.filter(function (r) {
          return r && (r.type === 'income' || r.type === 'expense') && typeof r.amount === 'number' && r.item && r.date;
        }).map(function (r) {
          return {
            id: r.id || uid(),
            type: r.type,
            amount: r.amount,
            item: String(r.item),
            category: r.category || (r.type === 'income' ? '其他收入' : '其他支出'),
            date: r.date,
            handler: r.handler || '',
            note: r.note || ''
          };
        });
        if (!list.length) throw new Error('empty');
        records = list;
        save();
        if (data.groupName) {
          $('groupName').textContent = data.groupName;
          localStorage.setItem(NAME_KEY, data.groupName);
        }
        renderAll();
        toast('已导入 ' + list.length + ' 条记录');
      } catch (err) {
        toast('导入失败：文件格式不正确');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  }

  /* ---------- 启动 ---------- */
  function init() {
    records = load();
    var name = localStorage.getItem(NAME_KEY);
    if (name) {
      $('groupName').textContent = name;
      document.title = 'Fund OS · ' + name;
    }
    bind();
    renderAll();
  }

  (window.FundOSReady || Promise.resolve()).then(init);
})();
