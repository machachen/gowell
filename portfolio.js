'use strict';

const PF_DATA_URL = './data/portfolio.json';
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
  blue: '#1d4ed8', green: '#15803d', red: '#b91c1c', amber: '#d97706', gray: '#8a97a8', teal: '#0f766e'
};
const ECHARTS_BASE = {
  textStyle: { fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11 },
  color: ['#1d4ed8','#15803d','#0f766e','#7c3aed','#be185d','#0369a1','#b45309','#047857','#6d28d9']
};

function fmt(n, decimals = 0) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}
function fmtUSD(n) {
  if (n == null) return '—';
  return '$' + fmt(Math.abs(n));
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
    'Open': 'open', 'In Progress': 'in-progress', 'Complete': 'complete',
    'Pending': 'open', 'Not Started': 'not-started'
  };
  return `<span class="status-badge ${clsMap[s] || 'not-started'}">${escHtml(s)}</span>`;
}

function showLoading(v) { el('loading-overlay').style.display = v ? 'flex' : 'none'; }
function showError(msg) {
  const b = el('error-banner');
  b.textContent = '⚠ Failed to load portfolio data: ' + msg;
  b.style.display = 'block';
}

async function loadData() {
  showLoading(true);
  try {
    const d = await fetch(PF_DATA_URL).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    renderAll(d);
  } catch (err) {
    console.error(err);
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function renderAll(d) {
  renderNav(d);
  renderHeader(d);
  renderKeyFigures(d);
  renderSummary(d);
  renderAssetCards(d);
  renderAllocationChart(d);
  renderIncomeChart(d);
  renderComparisonTable(d);
  renderDebtTable(d);
  renderLTVChart(d);
  renderHistoryChart(d);
  renderActionsTable(d);
  renderRiskSummary(d);
}

function renderNav(d) {
  const updated = new Date(d.meta.lastUpdated).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  el('nav-updated-date').textContent = updated;
  el('nav-period-display').textContent = d.meta.periodLabel;
  el('pf-period-badge').textContent = d.meta.periodLabel;
}

function renderHeader(d) {
  const t = d.totals;
  el('pf-hdr-aum').textContent    = fmtCompact(t.totalAUM);
  el('pf-hdr-equity').textContent = fmtCompact(t.zhangFamilyEquity);
  el('pf-hdr-ltv').textContent    = fmtPct(t.blendedLTV);
  el('pf-asset-count').textContent = d.meta.assetCount + ' Assets';
}

function renderKeyFigures(d) {
  el('pf-key-figures').innerHTML = d.keyFigures.map(kf => `
    <div class="kf-item">
      <div class="kf-label">${escHtml(kf.label)}</div>
      <div class="kf-value">${escHtml(kf.value)}</div>
      <div class="kf-sub">
        <span>${escHtml(kf.subLabel)}</span>
        ${kf.trend ? `<span class="kf-trend ${kf.trend}">${escHtml(kf.trendValue)}</span>` : ''}
      </div>
    </div>`).join('');
}

function renderSummary(d) {
  el('pf-narrative').textContent  = d.summary.narrative;
  el('pf-keymessage').textContent = d.summary.keyMessage;
}

function renderAssetCards(d) {
  const urgencyColor = u => ({ high: 'var(--red)', medium: 'var(--amber)', low: 'var(--green)', none: 'var(--border)' }[u] || 'var(--border)');

  el('pf-asset-cards').innerHTML = d.assetCards.map(a => {
    const statusCls = a.statusColor === 'amber' ? 'hold'
                    : a.statusColor === 'green' ? 'active'
                    : a.statusColor === 'blue'  ? 'dev'
                    : 'vacant';
    const noiCls  = a.noi >= 0 ? 'pos' : 'neg';
    const noiFmt  = a.noi == null ? '—'
                  : a.noi < 0 ? `(${fmtCompact(Math.abs(a.noi))})`
                  : fmtCompact(a.noi);
    return `
    <a href="${escHtml(a.href)}" class="pf-asset-card">
      <div class="pf-ac-header">
        <div class="pf-ac-icon">
          <svg viewBox="0 0 24 24"><path d="M1 11l11-9 11 9v11H15v-7H9v7H1V11zm2 0v9h4v-7h8v7h4v-9L12 4 3 11z"/></svg>
        </div>
        <div class="pf-ac-title-block">
          <div class="pf-ac-name">${escHtml(a.name)}</div>
          <div class="pf-ac-type">${escHtml(a.type)}</div>
          <div class="pf-ac-loc">${escHtml(a.location)}</div>
        </div>
        <span class="status-pill ${statusCls}">${escHtml(a.status)}</span>
      </div>
      <div class="pf-ac-metrics">
        <div class="pf-ac-metric">
          <div class="pf-ac-metric-label">Value</div>
          <div class="pf-ac-metric-value">${fmtCompact(a.value)}</div>
        </div>
        <div class="pf-ac-metric">
          <div class="pf-ac-metric-label">Net Equity</div>
          <div class="pf-ac-metric-value">${fmtCompact(a.equity)}</div>
        </div>
        <div class="pf-ac-metric">
          <div class="pf-ac-metric-label">LTV</div>
          <div class="pf-ac-metric-value">${fmtPct(a.ltv)}</div>
        </div>
        <div class="pf-ac-metric">
          <div class="pf-ac-metric-label">Annual NOI</div>
          <div class="pf-ac-metric-value ${noiCls}">${noiFmt}</div>
        </div>
      </div>
      <div class="pf-ac-ownership">${escHtml(a.ownershipSummary)}</div>
      <div class="pf-ac-highlight" style="border-left-color:${urgencyColor(a.urgency)}">
        ${escHtml(a.keyHighlight)}
      </div>
    </a>`;
  }).join('');
}

function renderAllocationChart(d) {
  const chart = initChart('pf-allocation-chart');
  if (!chart) return;
  const a = d.allocation;
  chart.setOption({
    ...ECHARTS_BASE,
    tooltip: { trigger: 'item', formatter: p => `${p.name}<br>Value: ${fmtCompact(p.value)}<br>Weight: ${p.percent.toFixed(1)}%` },
    legend: { bottom: 0, textStyle: { fontSize: 10 }, orient: 'horizontal' },
    series: [{
      type: 'pie', radius: ['38%', '64%'], center: ['50%', '43%'],
      data: a.labels.map((label, i) => ({ name: label, value: a.values[i], itemStyle: { color: a.colors[i] } })),
      label: { fontSize: 10, formatter: '{b}\n{d}%' },
      itemStyle: { borderWidth: 2, borderColor: '#fff' }
    }]
  });
}

function renderIncomeChart(d) {
  const chart = initChart('pf-income-chart');
  if (!chart) return;
  const ib = d.incomeBreakdown;
  chart.setOption({
    ...ECHARTS_BASE,
    tooltip: {
      trigger: 'axis',
      formatter: p => `${p[0].axisValue}<br>${p.map(s => `${s.marker}${s.seriesName}: ${fmtCompact(s.value)}`).join('<br>')}`
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { top: 16, bottom: 44, left: 80, right: 20 },
    xAxis: { type: 'category', data: ib.labels, axisLabel: { fontSize: 9, interval: 0, rotate: 15 } },
    yAxis: { type: 'value', axisLabel: { formatter: v => fmtCompact(v), fontSize: 10 } },
    series: [
      {
        name: 'NOI',
        type: 'bar',
        data: ib.noi.map((v, i) => ({ value: v, itemStyle: { color: ib.colors[i] } })),
        label: { show: true, position: 'top', formatter: p => fmtCompact(p.value), fontSize: 9, color: '#4a5568' }
      },
      {
        name: 'Net Cash Flow',
        type: 'bar',
        data: ib.netCF.map((v, i) => ({ value: v, itemStyle: { color: ib.colors[i], opacity: 0.5 } })),
        label: { show: true, position: 'top', formatter: p => fmtCompact(p.value), fontSize: 9, color: '#4a5568' }
      }
    ]
  });
}

function renderComparisonTable(d) {
  const cards = d.assetCards;
  const signCompact = v => {
    if (v == null) return '—';
    const display = v < 0 ? `(${fmtCompact(Math.abs(v))})` : fmtCompact(v);
    return `<span class="${v < 0 ? 'neg' : 'pos'}">${display}</span>`;
  };
  const rows = [
    ['Assessed Value',          c => fmtCompact(c.value)],
    ['Debt Balance',            c => c.debt > 0 ? fmtCompact(c.debt) : '<span class="text-muted">Unencumbered</span>'],
    ['Net Equity',              c => fmtCompact(c.equity)],
    ['Zhang Family Stake',      c => fmtPct(c.zhangPct)],
    ['Zhang Family Equity',     c => fmtCompact(c.zhangEquity)],
    ['LTV',                     c => fmtPct(c.ltv)],
    ['Annual NOI',              c => signCompact(c.noi)],
    ['Annual Net Cash Flow',    c => signCompact(c.netCF)],
    ['Cap Rate',                c => c.capRate != null ? fmtPct(c.capRate) : '<span class="text-muted">N/A</span>'],
    ['Holding Structure',       c => escHtml(c.ownershipSummary)],
    ['Key Action',              c => `<span style="font-size:12px;color:var(--text-secondary)">${escHtml(c.keyHighlight)}</span>`]
  ];

  el('pf-comparison-table').innerHTML = `
    <div style="overflow-x:auto;">
    <table class="data-table">
      <thead>
        <tr>
          <th style="min-width:160px">Metric</th>
          ${cards.map(c => `<th class="num" style="min-width:100px">${escHtml(c.shortName)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(([label, fn]) => `
          <tr>
            <td class="font-bold text-secondary">${label}</td>
            ${cards.map(c => `<td class="num">${fn(c)}</td>`).join('')}
          </tr>`).join('')}
      </tbody>
    </table>
    </div>`;
}

function renderDebtTable(d) {
  const urgencyBadge = (u, label) => {
    if (u === 'none') return `<span class="text-muted">${escHtml(label)}</span>`;
    const cls = u === 'high' ? 'high' : u === 'medium' ? 'medium' : 'low';
    return `<span class="risk-badge ${cls}">${escHtml(label)}</span>`;
  };

  el('pf-debt-table').innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Asset</th><th>Lender</th>
          <th class="num">Balance (USD)</th>
          <th>Rate</th><th>LTV</th><th>DSCR</th>
          <th>Maturity</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${d.debtMatrix.map(row => `
          <tr>
            <td class="font-bold">${escHtml(row.asset)}</td>
            <td>${row.lender !== '—' ? escHtml(row.lender) : '<span class="text-muted">—</span>'}</td>
            <td class="num">${row.balance > 0 ? fmtUSD(row.balance) : '<span class="text-muted">—</span>'}</td>
            <td>${escHtml(row.rate)}</td>
            <td>${escHtml(row.ltv)}</td>
            <td>${escHtml(row.dscr)}</td>
            <td class="${row.urgency === 'high' ? 'font-bold' : 'text-muted'}">${escHtml(row.maturity)}</td>
            <td>${urgencyBadge(row.urgency, row.urgencyLabel)}</td>
          </tr>`).join('')}
        <tr class="row-total">
          <td class="font-bold">Portfolio Total</td>
          <td></td>
          <td class="num font-bold">${fmtUSD(d.totals.totalDebt)}</td>
          <td></td>
          <td class="font-bold">${fmtPct(d.totals.blendedLTV)} <span class="text-muted text-xs">blended</span></td>
          <td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>`;
}

function renderLTVChart(d) {
  const chart = initChart('pf-ltv-chart');
  if (!chart) return;
  const cards  = d.assetCards;
  const colors = d.allocation.colors;
  chart.setOption({
    ...ECHARTS_BASE,
    tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br>LTV: ${p[0].value.toFixed(1)}%` },
    grid: { top: 20, bottom: 30, left: 120, right: 64 },
    xAxis: {
      type: 'value', min: 0, max: 65,
      axisLabel: { formatter: v => v + '%', fontSize: 10 },
      splitLine: { lineStyle: { type: 'dashed' } }
    },
    yAxis: { type: 'category', data: cards.map(c => c.shortName), axisLabel: { fontSize: 10 } },
    series: [{
      type: 'bar', barMaxWidth: 24,
      data: cards.map((c, i) => ({ value: c.ltv, itemStyle: { color: colors[i % colors.length], borderRadius: [0, 4, 4, 0] } })),
      label: {
        show: true, position: 'right',
        formatter: p => p.value.toFixed(1) + '%',
        fontSize: 11, fontWeight: 700, color: '#4a5568'
      }
    }]
  });
}

function renderHistoryChart(d) {
  const chart = initChart('pf-history-chart');
  if (!chart) return;
  const h = d.portfolioHistory;
  const assetMeta = {
    'asset-001': { name: 'SG HQ',          color: '#1d4ed8' },
    'asset-002': { name: 'Houston',         color: '#0f766e' },
    'asset-003': { name: 'Johor Land',      color: '#c2410c' },
    'asset-004': { name: 'HK Masterpiece',  color: '#7c3aed' },
    'asset-005': { name: 'HK Bel-Air',      color: '#be185d' },
    'asset-006': { name: 'Dubai Marina',    color: '#0369a1' },
    'asset-007': { name: 'Dubai Downtown',  color: '#b45309' },
    'asset-008': { name: 'Dubai Palm',      color: '#047857' },
    'asset-009': { name: 'SG Home',         color: '#6d28d9' }
  };
  const series = Object.entries(h.assets).map(([id, values]) => {
    const m = assetMeta[id] || { name: id, color: '#8a97a8' };
    return {
      name: m.name,
      type: 'line', stack: 'total', smooth: true,
      symbol: 'circle', symbolSize: 5,
      data: values,
      itemStyle: { color: m.color },
      lineStyle: { width: 2, color: m.color },
      areaStyle: { opacity: 0.4, color: m.color }
    };
  });
  chart.setOption({
    ...ECHARTS_BASE,
    tooltip: {
      trigger: 'axis',
      formatter: p => {
        const total = p.reduce((s, item) => s + (item.value || 0), 0);
        return `${p[0].axisValue}<br>` +
          p.map(item => `${item.marker}${item.seriesName}: ${fmtCompact(item.value)}`).join('<br>') +
          `<br><b>Total: ${fmtCompact(total)}</b>`;
      }
    },
    legend: { bottom: 0, textStyle: { fontSize: 10 }, type: 'scroll' },
    grid: { top: 20, bottom: 60, left: 80, right: 20 },
    xAxis: { type: 'category', data: h.labels, axisLabel: { fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { formatter: v => fmtCompact(v), fontSize: 10 } },
    series
  });
}

function renderActionsTable(d) {
  const assetColor = id => ({
    'asset-001': '#1d4ed8', 'asset-002': '#0f766e', 'asset-003': '#c2410c',
    'asset-004': '#7c3aed', 'asset-005': '#be185d', 'asset-006': '#0369a1',
    'asset-007': '#b45309', 'asset-008': '#047857', 'asset-009': '#6d28d9'
  }[id] || '#8a97a8');

  el('pf-actions-table').innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Asset</th><th>Action Item</th><th>Priority</th><th>Deadline</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${d.actions.map(a => `
          <tr>
            <td>
              <span class="pf-asset-tag" style="background:${assetColor(a.assetId)}">
                ${escHtml(a.assetName)}
              </span>
            </td>
            <td class="font-bold">${escHtml(a.title)}</td>
            <td><span class="priority-badge ${a.priority.toLowerCase()}">${a.priority}</span></td>
            <td class="text-muted">${escHtml(a.deadline)}</td>
            <td>${statusBadgeHtml(a.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderRiskSummary(d) {
  const rs = d.riskSummary;
  el('pf-risk-high').textContent   = rs.highCount;
  el('pf-risk-medium').textContent = rs.mediumCount;
  el('pf-risk-low').textContent    = rs.lowCount;
  el('pf-risk-concern').textContent = rs.topConcern;
}

document.addEventListener('DOMContentLoaded', loadData);
