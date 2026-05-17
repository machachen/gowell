'use strict';

const BASE_URL = './data/assets/';
const ASSET_ID = new URLSearchParams(window.location.search).get('id') || 'asset-001';

const state = { latest: null, manifest: null, data: {} };

const chartInstances = [];
function initChart(domId) {
  const dom = el(domId);
  if (!dom) return null;
  const chart = echarts.init(dom);
  chartInstances.push(chart);
  return chart;
}
window.addEventListener('resize', () => chartInstances.forEach(c => c.resize()));

const CHART_COLORS = {
  blue:  '#1d4ed8', green: '#15803d', red:   '#b91c1c',
  amber: '#d97706', gray:  '#8a97a8', teal:  '#0f766e'
};
const ECHARTS_BASE = {
  textStyle: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11 },
  color: ['#1d4ed8', '#15803d', '#b91c1c', '#d97706', '#8a97a8', '#0f766e']
};

/* ── Formatters ──────────────────────────────────────────── */
function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(n);
}
function fmtUSD(n) {
  if (n == null) return '—';
  return '$' + fmt(Math.abs(n));
}
function fmtUSDSign(n) {
  if (n == null) return '—';
  const s = fmtUSD(n);
  return n < 0 ? `(${s})` : s;
}
function fmtCompact(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(0) + 'K';
  return sign + '$' + Math.round(abs);
}
function fmtPct(n) { return n == null ? '—' : n.toFixed(1) + '%'; }
function escHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function el(id) { return document.getElementById(id); }

function statusBadgeHtml(s) {
  const clsMap = {
    'Complete': 'complete', 'In Progress': 'in-progress', 'Not Started': 'not-started',
    'Proposed': 'proposed', 'Open': 'open', 'Monitoring': 'monitoring',
    'Active': 'active', 'Renewal Due': 'renewal-due', 'Current': 'active',
    'Under Consideration': 'proposed', 'Pending': 'open', 'Approved': 'complete'
  };
  const cls = clsMap[s] || 'not-started';
  return `<span class="status-badge ${cls}">${escHtml(s)}</span>`;
}

function riskLevelHtml(level) {
  return `<span class="risk-badge ${level.toLowerCase()}">${escHtml(level)}</span>`;
}

/* ── Data loading ────────────────────────────────────────── */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

async function loadData() {
  showLoading(true);
  try {
    state.latest = await fetchJSON(`${BASE_URL}${ASSET_ID}/latest.json`);
    const period = state.latest.currentPeriod;
    state.manifest = await fetchJSON(`${BASE_URL}${ASSET_ID}/${period}/manifest.json`);
    await Promise.all(state.manifest.sections.map(async sec => {
      state.data[sec.id] = await fetchJSON(`${BASE_URL}${ASSET_ID}/${period}/${sec.file}`);
    }));
    renderAll();
  } catch (err) {
    console.error(err);
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function showLoading(v) { el('loading-overlay').style.display = v ? 'flex' : 'none'; }
function showError(msg)  {
  const b = el('error-banner');
  b.textContent = '⚠ Failed to load data: ' + msg;
  b.style.display = 'block';
}

/* ── Render orchestrator ─────────────────────────────────── */
function renderAll() {
  renderNav();
  renderAssetHeader();
  renderOverview();
  renderOwnership();
  renderFinancial();
  renderRisk();
  renderOperations();
  renderDocuments();
  renderMarket();
}

/* ── Navigation ──────────────────────────────────────────── */
function renderNav() {
  const m = state.manifest;
  const updated = new Date(m.lastUpdated).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  el('nav-updated-date').textContent = updated;
  el('nav-period-select').value = m.period;
}

/* ── Asset Header ────────────────────────────────────────── */
function renderAssetHeader() {
  const l = state.latest;
  const ov  = state.data['overview'];
  const fin = state.data['financial'];

  el('asset-name').textContent = l.assetName;
  el('asset-type-badge').textContent = l.assetType;
  el('asset-location-meta').textContent = l.location;
  el('asset-ownership-meta').textContent = l.ownershipMeta ?? '';
  el('asset-period-badge').textContent = state.manifest.periodLabel;

  const jBadge = el('asset-jurisdiction-badge');
  if (jBadge && l.jurisdiction) jBadge.textContent = l.jurisdiction;

  const bcName = el('bc-asset-name');
  if (bcName) bcName.textContent = l.assetName;

  const pill = el('asset-status-pill');
  const cls = l.statusColor === 'amber' ? 'hold'
            : l.statusColor === 'green' ? 'active'
            : l.statusColor === 'blue'  ? 'dev'
            : 'vacant';
  pill.className = `status-pill ${cls}`;
  pill.textContent = l.status;

  if (fin?.valuation) {
    el('hdr-value').textContent = fmtCompact(fin.valuation.currentEstimatedValue);
  }
  if (ov?.basicInfo) {
    const area = ov.basicInfo.totalSQM;
    el('hdr-gba').textContent = area ? fmt(area) + ' sqm' : '—';
  }
  if (l.reportingCurrency) {
    el('hdr-currency').textContent = l.reportingCurrency;
  }
}

/* ── Tab switching ───────────────────────────────────────── */
function initTabs() {
  const tabNames = {
    'panel-overview':   'Overview',
    'panel-ownership':  'Ownership & Capital',
    'panel-financial':  'Financial & Valuation',
    'panel-risk':       'Risk Analysis',
    'panel-operations': 'Operations',
    'panel-documents':  'Documents',
    'panel-market':     'Market'
  };
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      el(btn.dataset.panel).classList.add('active');
      const bcTab = el('bc-current-tab');
      if (bcTab) bcTab.textContent = tabNames[btn.dataset.panel] || btn.textContent.trim();
      requestAnimationFrame(() => chartInstances.forEach(c => c.resize()));
    });
  });
}

/* ============================================================
   OVERVIEW TAB
   ============================================================ */
function renderOverview() {
  const d = state.data['overview'];

  el('ov-summary-narrative').textContent = d.summary.narrative;
  el('ov-summary-keymessage').textContent = d.summary.keyMessage;

  const bi = d.basicInfo;
  el('ov-basic-info').innerHTML = `
    <table class="info-table">
      <tr><td class="info-label">Asset Name</td><td class="info-value">${escHtml(bi.assetName)}</td></tr>
      <tr><td class="info-label">Asset Type</td><td class="info-value">${escHtml(bi.assetType)}</td></tr>
      <tr><td class="info-label">Address</td><td class="info-value">${escHtml(bi.location)}</td></tr>
      <tr><td class="info-label">Submarket</td><td class="info-value">${escHtml(bi.submarket)}</td></tr>
      <tr><td class="info-label">Year Built / Acquired</td><td class="info-value">${bi.yearBuilt} / ${bi.yearAcquired}</td></tr>
      ${bi.totalUnits ? `<tr><td class="info-label">Total Units</td><td class="info-value">${bi.totalUnits}</td></tr>` : ''}
      <tr><td class="info-label">Floor Area</td><td class="info-value">${bi.totalSQM ? fmt(bi.totalSQM) + ' sqm' : '—'}</td></tr>
      <tr><td class="info-label">Current Status</td><td class="info-value">${escHtml(bi.currentStatus)}</td></tr>
      <tr><td class="info-label">Reporting Period</td><td class="info-value">${escHtml(bi.reportingPeriod)}</td></tr>
      <tr><td class="info-label">Holding Structure</td><td class="info-value">${escHtml(bi.ownershipSummary)}</td></tr>
      ${bi.landArea ? `<tr><td class="info-label">Land Area</td><td class="info-value">${escHtml(bi.landArea)}</td></tr>` : ''}
      ${bi.tenure ? `<tr><td class="info-label">Tenure</td><td class="info-value">${escHtml(bi.tenure)}</td></tr>` : ''}
    </table>`;

  el('ov-key-figures').innerHTML = d.keyFigures.map(kf => `
    <div class="kf-item">
      <div class="kf-label">${escHtml(kf.label)}</div>
      <div class="kf-value">${escHtml(kf.value)}</div>
      <div class="kf-sub">
        <span>${escHtml(kf.subLabel)}</span>
        ${kf.trend ? `<span class="kf-trend ${kf.trend}">${escHtml(kf.trendValue)}</span>` : ''}
      </div>
    </div>`).join('');

  el('ov-kpi-cards').innerHTML = d.kpiCards.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${escHtml(k.title)}</div>
      <div class="kpi-value">${escHtml(k.value)}</div>
      <div class="kpi-period">${escHtml(k.period)}</div>
      <div class="kpi-trend ${k.trendDir}">${escHtml(k.trend)}</div>
      <div class="kpi-chart" id="kpi-chart-${k.id}"></div>
    </div>`).join('');

  requestAnimationFrame(() => d.kpiCards.forEach(k => renderKpiChart(k)));

  el('ov-actions').innerHTML = d.actions.map(a => `
    <div class="card action-card ${a.priority.toLowerCase()} mb-12">
      <div class="action-header">
        <div class="action-title">${escHtml(a.title)}</div>
        <span class="priority-badge ${a.priority.toLowerCase()}">${a.priority} Priority</span>
        ${statusBadgeHtml(a.status)}
      </div>
      <div class="action-body">${escHtml(a.recommendation)}</div>
      <div class="action-meta">
        <div class="action-meta-item"><strong>Decision Required:</strong> ${escHtml(a.decisionNeeded)}</div>
        <div class="action-meta-item"><strong>Owner:</strong> ${escHtml(a.owner)}</div>
        <div class="action-meta-item"><strong>Deadline:</strong> ${escHtml(a.deadline)}</div>
      </div>
    </div>`).join('');

  el('ov-linked-docs').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Document</th><th>Category</th><th>Date</th><th>Type</th></tr></thead>
      <tbody>${d.linkedDocuments.map(doc => `
        <tr>
          <td><a href="#" class="doc-link">${escHtml(doc.name)}</a></td>
          <td><span class="doc-category-badge">${escHtml(doc.category)}</span></td>
          <td class="text-muted">${escHtml(doc.date)}</td>
          <td><span class="doc-type-badge">${escHtml(doc.type)}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el('ov-top-risks').innerHTML = d.topRisks.map(r => `
    <div class="row-between mb-8" style="border-bottom:1px solid var(--border);padding-bottom:8px;">
      <div>${riskLevelHtml(r.level)}<span style="font-size:13px;font-weight:600;margin-left:8px;">${escHtml(r.title)}</span></div>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${escHtml(r.impact)}</div>
  `).join('');

  const ms = d.marketSnapshot;
  el('ov-market-snapshot').innerHTML = `
    <table class="info-table">
      <tr><td class="info-label">Submarket</td><td class="info-value">${escHtml(ms.submarket)}</td></tr>
      <tr><td class="info-label">Median Rent/sqm</td><td class="info-value">${escHtml(ms.medianRentPM2)}</td></tr>
      <tr><td class="info-label">Vacancy Rate</td><td class="info-value">${escHtml(ms.vacancyRate)}</td></tr>
      <tr><td class="info-label">YoY Rent Growth</td><td class="info-value">${escHtml(ms.yoyRentGrowth)}</td></tr>
      <tr><td class="info-label">Asset vs. Market</td><td class="info-value">${escHtml(ms.assetVsMarket)}</td></tr>
      <tr><td class="info-label">Cap Rate Benchmark</td><td class="info-value">${escHtml(ms.capRateBenchmark)}</td></tr>
    </table>`;
}

function renderKpiChart(kpi) {
  const chart = initChart(`kpi-chart-${kpi.id}`);
  if (!chart) return;
  const cd = kpi.chartData;
  const isLine = kpi.chartType === 'line';
  chart.setOption({
    ...ECHARTS_BASE,
    grid: { top: 4, bottom: 20, left: 0, right: 0, containLabel: false },
    tooltip: { trigger: 'axis', confine: true, textStyle: { fontSize: 11 } },
    xAxis: { type: 'category', data: cd.labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { fontSize: 9, color: CHART_COLORS.gray } },
    yAxis: { type: 'value', show: false },
    series: [{
      type: isLine ? 'line' : 'bar',
      data: cd.values,
      smooth: true, symbol: 'none',
      itemStyle: { color: CHART_COLORS.blue, borderRadius: isLine ? 0 : [2, 2, 0, 0] },
      lineStyle: { width: 2 },
      areaStyle: isLine ? { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(29,78,216,0.18)' }, { offset: 1, color: 'rgba(29,78,216,0)' }] } } : null
    }]
  });
}

/* ============================================================
   OWNERSHIP & CAPITAL TAB
   ============================================================ */
function renderOwnership() {
  const d = state.data['ownership-capital'];

  el('ow-entity-info').innerHTML = `
    <table class="info-table">
      <tr><td class="info-label">Entity Name</td><td class="info-value">${escHtml(d.entity.name)}</td></tr>
      <tr><td class="info-label">Entity Type</td><td class="info-value">${escHtml(d.entity.type)}</td></tr>
      <tr><td class="info-label">Registered In</td><td class="info-value">${escHtml(d.entity.registered)}</td></tr>
      <tr><td class="info-label">Tax Classification</td><td class="info-value">${escHtml(d.entity.taxElection)}</td></tr>
      <tr><td class="info-label">Formed</td><td class="info-value">${escHtml(d.entity.formed)}</td></tr>
    </table>`;

  el('ow-owners-table').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Owner</th><th>Type</th><th>Role</th>
        <th class="num">Ownership %</th>
        <th class="num">Equity Contributed</th>
        <th class="num">Current Equity Value</th>
        <th>Since</th>
      </tr></thead>
      <tbody>${d.owners.map(o => `
        <tr>
          <td class="font-bold">${escHtml(o.name)}</td>
          <td class="text-secondary">${escHtml(o.type)}</td>
          <td>${escHtml(o.role)}</td>
          <td class="num font-bold">${fmtPct(o.ownershipPct)}</td>
          <td class="num">${fmtUSD(o.equityContributed)}</td>
          <td class="num font-bold">${fmtUSD(o.currentEquityValue)}</td>
          <td class="text-muted">${escHtml(o.since)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  const ownershipChart = initChart('ow-donut-chart');
  if (ownershipChart) {
    ownershipChart.setOption({
      ...ECHARTS_BASE,
      tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['40%', '68%'], center: ['50%', '44%'],
        data: d.owners.map(o => ({ name: o.name, value: o.ownershipPct })),
        label: { fontSize: 11, formatter: '{b}\n{d}%' },
        itemStyle: { borderWidth: 2, borderColor: '#fff' }
      }]
    });
  }

  el('ow-contributions-table').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Date</th><th>Contributor</th><th>Type</th><th class="num">Amount (USD)</th><th>Notes</th></tr></thead>
      <tbody>${d.capitalContributions.map(c => `
        <tr>
          <td class="text-muted">${escHtml(c.date)}</td>
          <td>${escHtml(c.contributor)}</td>
          <td><span class="doc-category-badge">${escHtml(c.type)}</span></td>
          <td class="num">${fmtUSD(c.amount)}</td>
          <td class="text-secondary">${escHtml(c.note)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  const cs = d.capitalStack;
  const debtPct = cs.seniorDebtPct;
  const eqPct   = cs.equityPct;
  el('ow-capital-stack').innerHTML = `
    <div class="capital-stack-bar">
      <div class="cs-segment cs-debt"  style="width:${debtPct}%">${debtPct > 8 ? 'Debt ' + debtPct.toFixed(1) + '%' : ''}</div>
      <div class="cs-segment cs-equity"style="width:${eqPct}%">Equity ${eqPct.toFixed(1)}%</div>
    </div>
    <div class="cs-legend mb-12">
      <div class="cs-legend-item"><div class="cs-legend-dot" style="background:var(--red)"></div>Senior Debt — ${fmtUSD(cs.seniorDebt)}</div>
      <div class="cs-legend-item"><div class="cs-legend-dot" style="background:var(--accent)"></div>Net Equity — ${fmtUSD(cs.netEquity)}</div>
    </div>`;

  const stackChart = initChart('ow-stack-chart');
  if (stackChart) {
    stackChart.setOption({
      ...ECHARTS_BASE,
      tooltip: { trigger: 'axis', confine: true, formatter: p => p.map(s => `${s.seriesName}: ${fmtCompact(s.value)}`).join('<br>') },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 10, bottom: 40, left: 80, right: 20 },
      xAxis: { type: 'category', data: ['Senior Debt', 'Equity Contributed', 'Retained Earnings', 'Net Equity'], axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => fmtCompact(v), fontSize: 10 } },
      series: [{
        name: 'Amount', type: 'bar', barWidth: '50%',
        data: [cs.seniorDebt, cs.equityContributed, cs.accumulatedRetainedEarnings, cs.netEquity],
        itemStyle: { color: p => [CHART_COLORS.red, CHART_COLORS.blue, CHART_COLORS.green, '#6366f1'][p.dataIndex], borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top', formatter: p => fmtCompact(p.value), fontSize: 10 }
      }]
    });
  }

  el('ow-debt-table').innerHTML = d.debtSummary.length === 0
    ? `<p class="text-muted" style="padding:12px 0;font-size:13px;">No debt on this asset.</p>`
    : `<table class="data-table">
      <thead><tr>
        <th>Lender</th><th>Type</th><th class="num">Balance (USD)</th>
        <th>Interest Rate</th><th>Maturity</th><th>DSCR</th><th>LTV</th><th>Status</th>
      </tr></thead>
      <tbody>${d.debtSummary.map(loan => `
        <tr>
          <td class="font-bold">${escHtml(loan.lender)}</td>
          <td class="text-secondary">${escHtml(loan.type)}</td>
          <td class="num">${fmtUSD(loan.currentBalance)}</td>
          <td>${escHtml(loan.interestRate)} <span class="text-muted">${escHtml(loan.rateType)}</span></td>
          <td>${escHtml(loan.maturityDate)}</td>
          <td class="num font-bold">${escHtml(loan.dscr)}</td>
          <td class="num">${escHtml(loan.ltv)}</td>
          <td>${statusBadgeHtml(loan.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el('ow-net-equity').innerHTML = `
    <div class="grid-4">
      <div class="card val-card">
        <div class="val-label">Asset Value</div>
        <div class="val-value">${fmtUSD(cs.assetValue)}</div>
        <div class="val-sub">Assessed, ${state.manifest.periodLabel}</div>
      </div>
      <div class="card val-card">
        <div class="val-label">Senior Debt</div>
        <div class="val-value" style="color:var(--red)">${fmtUSD(cs.seniorDebt)}</div>
        <div class="val-sub">${fmtPct(cs.seniorDebtPct)} LTV</div>
      </div>
      <div class="card val-card">
        <div class="val-label">Net Equity</div>
        <div class="val-value" style="color:var(--green)">${fmtUSD(cs.netEquity)}</div>
        <div class="val-sub">${fmtPct(cs.equityPct)} of asset value</div>
      </div>
      <div class="card val-card">
        <div class="val-label">Equity Contributed</div>
        <div class="val-value">${fmtUSD(cs.equityContributed)}</div>
        <div class="val-sub">Total capital deployed</div>
      </div>
    </div>`;

  if (d.guaranteesObligations && d.guaranteesObligations.length > 0) {
    el('ow-guarantee').innerHTML = d.guaranteesObligations.map(g => `
      <div class="guarantee-card mb-12">
        <div class="guarantee-title">Active Guarantee / Obligation</div>
        <table class="info-table">
          <tr><td class="info-label">Type</td><td class="info-value">${escHtml(g.type)}</td></tr>
          <tr><td class="info-label">Obligor</td><td class="info-value">${escHtml(g.obligor)}</td></tr>
          <tr><td class="info-label">Beneficiary</td><td class="info-value">${escHtml(g.beneficiary)}</td></tr>
          <tr><td class="info-label">Amount</td><td class="info-value">${fmtUSD(g.amount)}</td></tr>
          <tr><td class="info-label">Expiry</td><td class="info-value">${escHtml(g.expiryDate)}</td></tr>
          <tr><td class="info-label">Description</td><td class="info-value">${escHtml(g.description)}</td></tr>
        </table>
      </div>`).join('');
  }
}

/* ============================================================
   FINANCIAL TAB
   ============================================================ */
function renderFinancial() {
  const d = state.data['financial'];

  const typeMap = {
    income:    '', deduction: 'neg', expense: 'neg',
    subtotal: 'row-subtotal', noi: 'row-noi', total: 'row-total'
  };

  el('fin-income-statement').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Line Item</th>
        <th class="num">Actual (TTM)</th><th class="num">Budget</th>
        <th class="num">Prior Year</th><th class="num">Variance</th>
      </tr></thead>
      <tbody>${d.incomeStatement.rows.map(row => {
        const rowClass    = typeMap[row.type] || '';
        const indentClass = row.indent > 0 ? 'indent' : '';
        const variance    = row.actual - row.budget;
        const varClass    = variance >= 0 ? 'pos' : 'neg';
        return `<tr class="${rowClass}">
          <td class="${indentClass}">${escHtml(row.label)}</td>
          <td class="num ${row.actual < 0 ? 'neg' : ''}">${fmtUSDSign(row.actual)}</td>
          <td class="num text-muted">${fmtUSDSign(row.budget)}</td>
          <td class="num text-muted">${fmtUSDSign(row.priorYear)}</td>
          <td class="num ${varClass}">${variance >= 0 ? '+' : ''}${fmtUSDSign(variance)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;

  const v = d.valuation;
  el('fin-valuation-cards').innerHTML = `
    <div class="grid-4 mb-16">
      <div class="card val-card">
        <div class="val-label">Purchase Price</div>
        <div class="val-value">${fmtUSD(v.purchasePrice)}</div>
        <div class="val-sub">${escHtml(v.purchaseDate)}</div>
      </div>
      <div class="card val-card">
        <div class="val-label">Last Appraisal</div>
        <div class="val-value">${fmtUSD(v.lastAppraisalValue)}</div>
        <div class="val-sub">${escHtml(v.lastAppraisalDate)}</div>
      </div>
      <div class="card val-card">
        <div class="val-label">Current Est. Value</div>
        <div class="val-value">${fmtUSD(v.currentEstimatedValue)}</div>
        <div class="val-sub">${escHtml(v.impliedCapRate)} cap rate</div>
      </div>
      <div class="card val-card">
        <div class="val-label">Value Change</div>
        <div class="val-value val-delta pos">+${fmtUSD(v.valueChange)}</div>
        <div class="val-sub">+${fmtPct(v.valueChangePct)} since acquisition</div>
      </div>
    </div>
    <div class="grid-2 mb-16">
      <div class="card val-card">
        <div class="val-label">Value per sqm</div>
        <div class="val-value">$${fmt(v.valuePM2)}</div>
        <div class="val-sub">Blended USD/sqm</div>
      </div>
      <div class="card val-card">
        <div class="val-label">Owner Net Equity</div>
        <div class="val-value" style="color:var(--green)">${fmtUSD(v.netEquity)}</div>
        <div class="val-sub">After senior debt</div>
      </div>
    </div>`;

  const vhChart = initChart('fin-valuation-chart');
  if (vhChart) {
    vhChart.setOption({
      ...ECHARTS_BASE,
      tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br>Value: ${fmtCompact(p[0].value)}` },
      grid: { top: 10, bottom: 30, left: 80, right: 20 },
      xAxis: { type: 'category', data: v.history.map(h => h.date.substr(0,7)), axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { formatter: val => fmtCompact(val), fontSize: 10 } },
      series: [{
        type: 'line', data: v.history.map(h => h.value),
        smooth: true, symbol: 'circle', symbolSize: 6,
        itemStyle: { color: CHART_COLORS.blue },
        lineStyle: { width: 2.5 },
        areaStyle: { color: { type:'linear', x:0,y:0,x2:0,y2:1, colorStops:[{offset:0,color:'rgba(29,78,216,0.18)'},{offset:1,color:'rgba(29,78,216,0)'}] } },
        markPoint: { data: [{ type: 'max', name: 'Max' }], symbolSize: 36, label: { fontSize: 10 } }
      }]
    });
  }

  const proj = d.projections;
  const projChart = initChart('fin-projection-chart');
  if (projChart) {
    projChart.setOption({
      ...ECHARTS_BASE,
      tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br>${p.map(s=>`${s.seriesName}: ${fmtCompact(s.value)}`).join('<br>')}` },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 10, bottom: 40, left: 80, right: 20 },
      xAxis: { type: 'category', data: proj.years, axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => fmtCompact(v), fontSize: 10 } },
      series: [
        { name: 'Downside', type: 'line', data: proj.value.Downside, smooth: true, symbol: 'none', lineStyle: { color: CHART_COLORS.red,   type: 'dashed', width: 1.5 } },
        { name: 'Base',     type: 'line', data: proj.value.Base,     smooth: true, symbol: 'none', lineStyle: { color: CHART_COLORS.blue,  width: 2.5 } },
        { name: 'Upside',   type: 'line', data: proj.value.Upside,   smooth: true, symbol: 'none', lineStyle: { color: CHART_COLORS.green, type: 'dashed', width: 1.5 } }
      ]
    });
  }

  el('fin-capex-table').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Project</th><th>Year</th>
        <th class="num">Budgeted</th><th class="num">Actual / Spent</th><th class="num">Remaining</th>
        <th>Status</th><th>Notes</th>
      </tr></thead>
      <tbody>${d.capex.map(c => `
        <tr>
          <td class="font-bold">${escHtml(c.project)}</td>
          <td class="text-muted">${c.year}</td>
          <td class="num">${fmtUSD(c.budgeted)}</td>
          <td class="num">${c.actual > 0 ? fmtUSD(c.actual) : '<span class="text-muted">—</span>'}</td>
          <td class="num">${c.budgeted - c.actual > 0 ? fmtUSD(c.budgeted - c.actual) : '<span class="text-muted">—</span>'}</td>
          <td>${statusBadgeHtml(c.status)}</td>
          <td class="text-secondary">${escHtml(c.notes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ============================================================
   RISK TAB
   ============================================================ */
function renderRisk() {
  const d = state.data['risk'];

  el('risk-summary-cards').innerHTML = `
    <div class="grid-4">
      <div class="card val-card">
        <div class="val-label">Overall Risk Level</div>
        <div class="val-value" style="color:var(--amber)">${escHtml(d.summary.overallRiskLevel)}</div>
        <div class="val-sub">As at ${escHtml(d.summary.lastReviewed)}</div>
      </div>
      <div class="card val-card">
        <div class="val-label" style="color:var(--red)">High Risk</div>
        <div class="val-value" style="color:var(--red)">${d.summary.highRisks}</div>
        <div class="val-sub">Open high-risk items</div>
      </div>
      <div class="card val-card">
        <div class="val-label" style="color:var(--amber)">Medium Risk</div>
        <div class="val-value" style="color:var(--amber)">${d.summary.mediumRisks}</div>
        <div class="val-sub">Open medium-risk items</div>
      </div>
      <div class="card val-card">
        <div class="val-label" style="color:var(--green)">Low Risk</div>
        <div class="val-value" style="color:var(--green)">${d.summary.lowRisks}</div>
        <div class="val-sub">Open low-risk items</div>
      </div>
    </div>`;

  el('risk-register-table').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>ID</th><th>Category</th><th>Risk</th>
        <th class="num">Likelihood</th><th class="num">Impact</th><th class="num">Score</th>
        <th>Level</th><th>Owner</th><th>Status</th>
      </tr></thead>
      <tbody>${d.register.map(r => `
        <tr>
          <td class="text-muted font-mono">${r.id}</td>
          <td><span class="doc-category-badge">${escHtml(r.category)}</span></td>
          <td><div class="font-bold">${escHtml(r.title)}</div><div class="text-secondary text-sm">${escHtml(r.description)}</div></td>
          <td class="num">${r.probability}</td>
          <td class="num">${r.impact}</td>
          <td class="num font-bold">${r.riskScore}</td>
          <td>${riskLevelHtml(r.level)}</td>
          <td class="text-secondary">${escHtml(r.owner)}</td>
          <td>${statusBadgeHtml(r.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  renderRiskMatrix(d.register);

  el('risk-scenarios').innerHTML = d.scenarios.map(s => `
    <div class="scenario-card">
      <div class="scenario-title">${escHtml(s.name)}</div>
      ${s.scenarioCashFlow != null ? `
        <div class="scenario-stat"><span class="s-label">Base Cash Flow</span><span class="s-val">${fmtUSD(s.baseCashFlow)}</span></div>
        <div class="scenario-stat"><span class="s-label">Scenario Cash Flow</span><span class="s-val" style="color:var(--red)">${fmtUSD(s.scenarioCashFlow)}</span></div>
        <div class="scenario-stat"><span class="s-label">Delta</span><span class="s-val neg">${fmtUSDSign(s.cashFlowDelta)}/yr</span></div>
        ${s.newDSCR ? `<div class="scenario-stat"><span class="s-label">New DSCR</span><span class="s-val">${s.newDSCR}</span></div>` : ''}
      ` : `
        <div class="scenario-stat"><span class="s-label">Base Asset Value</span><span class="s-val">${fmtUSD(s.baseValue)}</span></div>
        <div class="scenario-stat"><span class="s-label">Scenario Value</span><span class="s-val" style="color:var(--red)">${fmtUSD(s.scenarioValue)}</span></div>
        <div class="scenario-stat"><span class="s-label">Scenario LTV</span><span class="s-val">${fmtPct(s.scenarioLTV)}</span></div>
      `}
      <div class="scenario-verdict">${escHtml(s.verdict)}</div>
    </div>`).join('');

  const sc = d.scenarioChart;
  const scenChart = initChart('risk-scenario-chart');
  if (scenChart) {
    scenChart.setOption({
      ...ECHARTS_BASE,
      tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br>${p.map(s=>`${s.seriesName}: ${fmtCompact(s.value)}`).join('<br>')}` },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 10, bottom: 40, left: 80, right: 20 },
      xAxis: { type: 'category', data: sc.labels },
      yAxis: { type: 'value', axisLabel: { formatter: v => fmtCompact(v), fontSize: 10 } },
      series: [
        { name: 'Downside', type: 'line', data: sc.cashFlow.Downside, smooth: true, symbol: 'none', lineStyle: { color: CHART_COLORS.red,   type: 'dashed', width: 1.5 } },
        { name: 'Base',     type: 'line', data: sc.cashFlow.Base,     smooth: true, symbol: 'none', lineStyle: { color: CHART_COLORS.blue,  width: 2.5 } },
        { name: 'Upside',   type: 'line', data: sc.cashFlow.Upside,   smooth: true, symbol: 'none', lineStyle: { color: CHART_COLORS.green, type: 'dashed', width: 1.5 } }
      ]
    });
  }

  el('risk-mitigation-table').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Risk ID</th><th>Mitigation Action</th><th>Owner</th><th>Deadline</th><th>Status</th></tr></thead>
      <tbody>${d.mitigationPlan.map(m => `
        <tr>
          <td class="text-muted font-mono">${m.riskId}</td>
          <td>${escHtml(m.action)}</td>
          <td class="text-secondary">${escHtml(m.owner)}</td>
          <td class="text-muted">${escHtml(m.deadline)}</td>
          <td>${statusBadgeHtml(m.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderRiskMatrix(register) {
  const chart = initChart('risk-matrix-chart');
  if (!chart) return;
  const colorMap = { High: CHART_COLORS.red, Medium: CHART_COLORS.amber, Low: CHART_COLORS.green };
  chart.setOption({
    ...ECHARTS_BASE,
    tooltip: {
      trigger: 'item',
      formatter: p => {
        const r = register.find(x => x.id === p.data[2]);
        return r ? `<b>${r.id} — ${r.title}</b><br>Likelihood: ${r.probability} / Impact: ${r.impact}<br>Level: ${r.level}` : '';
      }
    },
    xAxis: { type: 'value', name: 'Impact', min: 0, max: 6, nameLocation: 'middle', nameGap: 25, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' } } },
    yAxis: { type: 'value', name: 'Likelihood', min: 0, max: 6, nameLocation: 'middle', nameGap: 30, axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' } } },
    grid: { top: 20, bottom: 50, left: 60, right: 20 },
    series: [{
      type: 'scatter', symbolSize: 32,
      data: register.map(r => [r.impact, r.probability, r.id]),
      itemStyle: { color: p => colorMap[register.find(x => x.id === p.data[2])?.level] || CHART_COLORS.gray, opacity: 0.85 },
      label: { show: true, formatter: p => p.data[2], fontSize: 9, fontWeight: 700, color: '#fff' }
    }]
  });
}

/* ============================================================
   OPERATIONS TAB
   ============================================================ */
function renderOperations() {
  const d = state.data['operations'];

  const quadrantMap = { 'Do First': 'q1', 'Schedule': 'q2', 'Delegate': 'q4', 'Eliminate': 'q3' };
  const quadrantLabels = {
    q1: { label: 'Do First (Urgent + Important)',     el: 'pm-q1' },
    q2: { label: 'Schedule (Important, Not Urgent)',  el: 'pm-q2' },
    q3: { label: 'Delegate (Urgent, Less Important)', el: 'pm-q3' },
    q4: { label: 'Defer / Eliminate',                 el: 'pm-q4' }
  };
  const qItems = { q1: [], q2: [], q3: [], q4: [] };
  d.priorityMatrix.items.forEach(item => {
    const q = quadrantMap[item.quadrant] || 'q4';
    qItems[q].push(item);
  });
  Object.entries(quadrantLabels).forEach(([q, meta]) => {
    el(meta.el).innerHTML = `
      <div class="pm-quadrant-label">${meta.label}</div>
      ${qItems[q].map(item => `
        <div class="pm-item">
          <div class="pm-item-title">${escHtml(item.title)}</div>
          <div class="pm-item-meta">${escHtml(item.owner)} · ${escHtml(item.deadline)} · ${statusBadgeHtml(item.status)}</div>
        </div>`).join('')}`;
  });

  el('ops-capex-table').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Project</th><th class="num">Budget (USD)</th><th class="num">Spent</th>
        <th>Progress</th><th>Contractor</th><th>Est. Completion</th><th>Status</th>
      </tr></thead>
      <tbody>${d.capexProjects.map(c => `
        <tr>
          <td><div class="font-bold">${escHtml(c.project)}</div><div class="text-secondary text-sm">${escHtml(c.expectedROI)}</div></td>
          <td class="num">${fmtUSD(c.budgeted)}</td>
          <td class="num">${c.spent > 0 ? fmtUSD(c.spent) : '<span class="text-muted">—</span>'}</td>
          <td style="min-width:120px">
            <div class="progress-bar-wrap">
              <div class="progress-bar"><div class="progress-bar-fill" style="width:${c.pctComplete}%"></div></div>
              <span class="progress-label">${c.pctComplete}%</span>
            </div>
          </td>
          <td class="text-secondary">${escHtml(c.contractor)}</td>
          <td class="text-muted">${escHtml(c.estCompletion)}</td>
          <td>${statusBadgeHtml(c.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el('ops-opex-table').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Category</th><th>Vendor</th><th class="num">Annual Cost (USD)</th>
        <th>Frequency</th><th>Contract Expiry</th><th>Status</th><th>Notes</th>
      </tr></thead>
      <tbody>${d.opexRecurring.map(o => `
        <tr>
          <td><span class="doc-category-badge">${escHtml(o.category)}</span></td>
          <td>${escHtml(o.vendor)}</td>
          <td class="num">${fmtUSD(o.annualCost)}</td>
          <td class="text-secondary">${escHtml(o.frequency)}</td>
          <td class="text-muted">${escHtml(o.contractExpiry)}</td>
          <td>${statusBadgeHtml(o.status || 'Active')}</td>
          <td class="text-secondary">${escHtml(o.notes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el('ops-suppliers-table').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Vendor</th><th>Category</th><th>Contact</th>
        <th>Contract Period</th><th>SLA / Warranty</th><th>Status</th><th>Notes</th>
      </tr></thead>
      <tbody>${d.suppliers.map(s => `
        <tr>
          <td class="font-bold">${escHtml(s.name)}</td>
          <td><span class="doc-category-badge">${escHtml(s.category)}</span></td>
          <td class="text-secondary text-sm">${escHtml(s.contact)}</td>
          <td class="text-muted">${escHtml(s.contractPeriod)}</td>
          <td class="text-secondary">${escHtml(s.warrantyOrSLA)}</td>
          <td>${statusBadgeHtml(s.status)}</td>
          <td class="text-secondary">${escHtml(s.notes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el('ops-service-history').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Date</th><th>Vendor</th><th>Description</th>
        <th>Category</th><th class="num">Cost (USD)</th><th>Status</th>
      </tr></thead>
      <tbody>${d.serviceHistory.map(s => `
        <tr>
          <td class="text-muted">${escHtml(s.date)}</td>
          <td>${escHtml(s.vendor)}</td>
          <td>${escHtml(s.description)}</td>
          <td><span class="doc-category-badge">${escHtml(s.category)}</span></td>
          <td class="num">${fmtUSD(s.cost)}</td>
          <td>${statusBadgeHtml(s.status)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

/* ============================================================
   DOCUMENTS TAB
   ============================================================ */
function renderDocuments() {
  const d = state.data['documents'];
  let activeFilter = 'All';

  el('docs-important').innerHTML = `
    <table class="data-table">
      <thead><tr><th>Document Name</th><th>Category</th><th>Date</th><th>Type</th><th>Notes</th></tr></thead>
      <tbody>${d.importantDocuments.map(doc => `
        <tr>
          <td><a href="${doc.url || '#'}" class="doc-link">${escHtml(doc.name)}</a></td>
          <td><span class="doc-category-badge">${escHtml(doc.category)}</span></td>
          <td class="text-muted">${escHtml(doc.date)}</td>
          <td><span class="doc-type-badge">${escHtml(doc.type)}</span></td>
          <td class="text-secondary">${escHtml(doc.notes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  const categories = ['All', ...new Set(d.library.map(doc => doc.category))];
  el('docs-filter-bar').innerHTML = categories.map(cat =>
    `<button class="doc-filter-btn ${cat === 'All' ? 'active' : ''}" data-cat="${escHtml(cat)}">${escHtml(cat)}</button>`
  ).join('');

  function renderDocTable(filter) {
    const rows = filter === 'All' ? d.library : d.library.filter(doc => doc.category === filter);
    el('docs-library-table').innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>ID</th><th>Document Name</th><th>Category</th>
          <th>Date</th><th>Source</th><th>Related Section</th><th>Type</th><th>Notes</th>
        </tr></thead>
        <tbody>${rows.map(doc => `
          <tr>
            <td class="text-muted font-mono">${escHtml(doc.id)}</td>
            <td><a href="${doc.url || '#'}" class="doc-link">${escHtml(doc.name)}</a></td>
            <td><span class="doc-category-badge">${escHtml(doc.category)}</span></td>
            <td class="text-muted">${escHtml(doc.date)}</td>
            <td class="text-secondary">${escHtml(doc.source)}</td>
            <td class="text-secondary">${escHtml(doc.relatedSection)}</td>
            <td><span class="doc-type-badge">${escHtml(doc.type)}</span></td>
            <td class="text-secondary">${escHtml(doc.notes)}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  renderDocTable('All');
  el('docs-filter-bar').addEventListener('click', e => {
    const btn = e.target.closest('.doc-filter-btn');
    if (!btn) return;
    activeFilter = btn.dataset.cat;
    document.querySelectorAll('.doc-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDocTable(activeFilter);
  });
}

/* ============================================================
   MARKET TAB
   ============================================================ */
function renderMarket() {
  const d = state.data['market'];

  if (d.summary.title) {
    const titleEl = el('mkt-narrative-title');
    if (titleEl) titleEl.textContent = d.summary.title;
  }

  el('mkt-narrative').innerHTML = `
    <p class="market-narrative">${escHtml(d.summary.narrative)}</p>
    <ul class="market-theme-list">${d.summary.keyThemes.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>`;

  el('mkt-competitiveness').innerHTML = `
    <div class="grid-2">
      <div>
        <div class="section-title mb-8" style="color:var(--green)">Strengths</div>
        <ul class="market-theme-list">${d.assetCompetitiveness.strengths.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>
        <div class="section-title mb-8" style="margin-top:14px;color:var(--accent)">Opportunities</div>
        <ul class="market-theme-list">${d.assetCompetitiveness.opportunities.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>
      </div>
      <div>
        <div class="section-title mb-8" style="color:var(--amber)">Weaknesses</div>
        <ul class="market-theme-list">${d.assetCompetitiveness.weaknesses.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>
        <div class="section-title mb-8" style="margin-top:14px;color:var(--red)">Threats</div>
        <ul class="market-theme-list">${d.assetCompetitiveness.threats.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>
      </div>
    </div>`;

  el('mkt-comp-sales').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Address</th><th>Type</th><th class="num">Units</th>
        <th>Year Built</th><th>Sale Date</th>
        <th class="num">Sale Price</th><th class="num">Per Unit</th><th class="num">Per sqm</th>
        <th class="num">Cap Rate</th><th class="num">Occ.</th><th>Notes</th>
      </tr></thead>
      <tbody>${d.comparables.map(c => `
        <tr>
          <td>${escHtml(c.address)}</td>
          <td class="text-secondary">${escHtml(c.type)}</td>
          <td class="num">${c.units ?? '—'}</td>
          <td class="text-muted">${c.yearBuilt}</td>
          <td class="text-muted">${escHtml(c.soldDate)}</td>
          <td class="num">${fmtUSD(c.salePrice)}</td>
          <td class="num">${c.pricePerUnit ? fmtUSD(c.pricePerUnit) : '—'}</td>
          <td class="num">${c.pricePM2 ? '$' + fmt(c.pricePM2) : '—'}</td>
          <td class="num">${escHtml(c.capRate)}</td>
          <td class="num">${escHtml(c.occupancy)}</td>
          <td class="text-secondary">${escHtml(c.notes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  el('mkt-comp-rents').innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Address</th><th>Unit Type</th><th class="num">Area (sqm)</th>
        <th class="num">Asking Rent</th><th class="num">Rent/sqm</th>
        <th class="num">Occupancy</th><th>Amenities</th>
      </tr></thead>
      <tbody>${d.rentComparables.map(r => {
        const isSubject = r.isSubject === true;
        return `<tr ${isSubject ? 'style="background:#eff6ff;font-weight:600;"' : ''}>
          <td>${escHtml(r.address)} ${isSubject ? '<span class="comp-badge">Subject</span>' : ''}</td>
          <td>${escHtml(r.unitType)}</td>
          <td class="num">${r.areaM2}</td>
          <td class="num">${escHtml(r.askingRent)}/mo</td>
          <td class="num">${escHtml(r.rentPM2)}/sqm</td>
          <td class="num">${escHtml(r.occupancy)}</td>
          <td class="text-secondary">${escHtml(r.amenities)}</td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;

  const crChart = initChart('mkt-caprate-chart');
  if (crChart) {
    const crt = d.capRateTrend;
    crChart.setOption({
      ...ECHARTS_BASE,
      tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br>Cap Rate: ${p[0].value}%` },
      grid: { top: 10, bottom: 30, left: 50, right: 20 },
      xAxis: { type: 'category', data: crt.labels, axisLabel: { fontSize: 9, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => v.toFixed(1)+'%', fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' } } },
      series: [{
        type: 'line', data: crt.values, smooth: true, symbol: 'none',
        lineStyle: { color: CHART_COLORS.blue, width: 2 },
        areaStyle: { color: { type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'rgba(29,78,216,0.15)'},{offset:1,color:'rgba(29,78,216,0)'}] } }
      }]
    });
  }

  const vcChart = initChart('mkt-vacancy-chart');
  if (vcChart) {
    const vt = d.vacancyTrend;
    vcChart.setOption({
      ...ECHARTS_BASE,
      tooltip: { trigger: 'axis', formatter: p => `${p[0].axisValue}<br>${p.map(s=>`${s.seriesName}: ${s.value}%`).join('<br>')}` },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: { top: 10, bottom: 40, left: 44, right: 20 },
      xAxis: { type: 'category', data: vt.labels, axisLabel: { fontSize: 9, rotate: 30 } },
      yAxis: { type: 'value', axisLabel: { formatter: v => v+'%', fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' } } },
      series: [
        { name: 'Submarket', type: 'line', data: vt.submarket, smooth: true, symbol: 'none', lineStyle: { color: CHART_COLORS.gray, width: 2 } },
        { name: 'Asset',     type: 'line', data: vt.asset,     smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { color: CHART_COLORS.blue, width: 2 } }
      ]
    });
  }

  el('mkt-risks').innerHTML = d.marketRisks.map(r => `
    <div class="row-between mb-8" style="border-bottom:1px solid var(--border);padding-bottom:8px;">
      ${riskLevelHtml(r.level)}
      <span style="font-size:13px;font-weight:600;flex:1;margin-left:8px;">${escHtml(r.title)}</span>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${escHtml(r.description)}</div>
  `).join('');

  el('mkt-opportunities').innerHTML = d.marketOpportunities.map(o => `
    <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border);">
      <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:3px;">${escHtml(o.title)}</div>
      <div style="font-size:12px;color:var(--text-secondary);">${escHtml(o.description)}</div>
    </div>`).join('');

  el('mkt-implication').innerHTML = `
    <div class="implication-card">
      <div class="implication-title">${escHtml(d.marketImplication.title)}</div>
      <div class="implication-body">${escHtml(d.marketImplication.body)}</div>
    </div>`;
}

/* ── Boot ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadData();
});
