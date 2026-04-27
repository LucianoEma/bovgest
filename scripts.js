/**
 * scripts.js
 * Lógica principal do dashboard — seções, CRUD, renderização, relatórios
 */

'use strict';

// ── ALIASES HELPERS ──────────────────────────────────────────────────────────
const {
  $, $$, formatCurrency, formatDate, formatNumber,
  showToast, openModal, closeModal, setLoading,
  renderTable, statusBadge, requireAuth, getFormData,
} = Helpers;

// ── ESTADO LOCAL ─────────────────────────────────────────────────────────────
let allLotes      = [];
let currentSection = 'dashboard';

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  requireAuth();
  loadUserInfo();
  await loadDashboard();
  bindForms();
});

function loadUserInfo() {
  const user = SupabaseAPI.getCurrentUser();
  if (!user) return;
  const name     = user.user_metadata?.full_name || user.email || '—';
  const initials = name.charAt(0).toUpperCase();
  setText('#user-avatar', initials);
  setText('#user-name',   name);
  setText('#user-role',   user.user_metadata?.role || 'usuário');
}

// ── NAVEGAÇÃO ENTRE SEÇÕES ────────────────────────────────────────────────────
// Correção: usa parâmetro `name` explícito, sem depender de `event` global.

function showSection(name) {
  currentSection = name;

  // Oculta todas as seções
  $$('[id^="section-"]').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById('section-' + name);
  if (target) target.classList.remove('hidden');

  // Atualiza nav links
  $$('.nav-link').forEach(l => l.classList.remove('active'));
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  // Atualiza título
  const titles = {
    dashboard:  'Dashboard',
    lotes:      'Lotes',
    custos:     'Custos',
    vendas:     'Vendas',
    relatorios: 'Relatórios',
  };
  setText('#page-title', titles[name] || 'BovGest');

  // Botão de ação rápida
  const actionBtn = $('#action-btn');
  if (actionBtn) {
    const showFor = ['lotes', 'custos', 'vendas'];
    actionBtn.style.display = showFor.includes(name) ? '' : 'none';
    const labels = { lotes: '+ Novo Lote', custos: '+ Novo Custo', vendas: '+ Nova Venda' };
    if (labels[name]) actionBtn.textContent = labels[name];
  }

  // Carrega dados da seção
  if (name === 'lotes')      loadLotes();
  if (name === 'custos')     loadCustos();
  if (name === 'vendas')     loadVendas();
  if (name === 'relatorios') loadRelatorios();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const summary = await SupabaseAPI.getDashboardSummary();
    allLotes = summary.lots || [];

    // Stats
    setText('#stat-animais', formatNumber(summary.totalAnimals));
    setText('#stat-lotes',   summary.activeLots);
    setText('#stat-custos',  formatCurrency(summary.totalCosts));
    setText('#stat-receita', formatCurrency(summary.totalRevenue));

    // Financeiro
    const lucro = summary.profit;
    setText('#fin-receita', formatCurrency(summary.totalRevenue));
    setText('#fin-custo',   formatCurrency(summary.totalCosts));

    const lucroEl = $('#fin-lucro');
    if (lucroEl) {
      lucroEl.textContent = formatCurrency(lucro);
      lucroEl.className   = lucro >= 0 ? 'text-success' : 'text-danger';
    }

    renderDashboardLotes(summary.lots.slice(0, 6));
    populateLotSelects(summary.lots);

  } catch (err) {
    showToast('Erro ao carregar dashboard: ' + err.message, 'error');
  }
}

function renderDashboardLotes(lots) {
  const tbody = $('#tb-dashboard-lotes');
  if (!lots || !lots.length) { renderTable(tbody, []); return; }

  const rows = lots.map(l => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${l.name}</td>
      <td>${formatNumber(l.animal_count)}</td>
      <td>${statusBadge(l.status)}</td>
    `;
    return tr;
  });
  renderTable(tbody, rows);
}

// ── LOTES ─────────────────────────────────────────────────────────────────────

async function loadLotes() {
  const search = $('#search-lotes')?.value || '';
  const status = $('#filter-status-lotes')?.value || '';
  try {
    const lots = await SupabaseAPI.getLots({ search, status });
    allLotes = lots || [];
    renderLotesGrid(lots);
    populateLotSelects(lots);
  } catch (err) {
    showToast('Erro ao carregar lotes: ' + err.message, 'error');
  }
}

function filterLotes() {
  clearTimeout(window._filterTimer);
  window._filterTimer = setTimeout(loadLotes, 300);
}

function renderLotesGrid(lots) {
  const grid = $('#lotes-grid');
  if (!grid) return;

  if (!lots || lots.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state__icon">🐮</div>
        <div class="empty-state__title">Nenhum lote encontrado</div>
        <div class="empty-state__sub">Crie seu primeiro lote clicando em "+ Novo Lote"</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = lots.map(l => `
    <div class="lot-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
        <div>
          <div class="lot-card__name">${l.name}</div>
          <div class="lot-card__info">${l.breed || 'Raça não informada'} · Entrada: ${formatDate(l.entry_date)}</div>
        </div>
        ${statusBadge(l.status)}
      </div>
      <div class="lot-card__stats">
        <div>
          <div class="lot-card__stat-label">Animais</div>
          <div class="lot-card__stat-value">${formatNumber(l.animal_count)}</div>
        </div>
        <div>
          <div class="lot-card__stat-label">Peso Médio</div>
          <div class="lot-card__stat-value">${l.avg_weight_entry ? l.avg_weight_entry + ' kg' : '—'}</div>
        </div>
      </div>
      <div class="lot-card__actions">
        <button class="btn btn-ghost btn-icon" title="Editar"  onclick="openEditLote('${l.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon" title="Excluir" onclick="deleteLote('${l.id}', '${escHtml(l.name)}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openEditLote(id) {
  const lote = allLotes.find(l => l.id === id);
  if (!lote) return;
  $('#modal-lote-title').textContent = 'Editar Lote';
  $('#lote-id').value     = lote.id;
  $('#lote-name').value   = lote.name || '';
  $('#lote-count').value  = lote.animal_count || '';
  $('#lote-breed').value  = lote.breed || '';
  $('#lote-status').value = lote.status || 'active';
  $('#lote-entry').value  = lote.entry_date || '';
  $('#lote-weight').value = lote.avg_weight_entry || '';
  $('#lote-notes').value  = lote.notes || '';
  openModal('modal-lote');
}

function resetLoteForm() {
  $('#modal-lote-title').textContent = 'Novo Lote';
  $('#form-lote').reset();
  $('#lote-id').value = '';
}

async function deleteLote(id, name) {
  if (!confirm(`Excluir o lote "${name}"?\nIsso também apagará custos e vendas vinculados.`)) return;
  try {
    await SupabaseAPI.deleteLot(id);
    showToast('Lote excluído com sucesso.', 'success');
    loadLotes();
    loadDashboard();
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// ── CUSTOS ────────────────────────────────────────────────────────────────────

async function loadCustos() {
  const lot_id   = $('#filter-lote-custo')?.value  || '';
  const category = $('#filter-cat-custo')?.value   || '';
  try {
    const custos = await SupabaseAPI.getCosts({ lot_id, category });
    _custosCache = custos || [];
    renderCustos(custos);
  } catch (err) {
    showToast('Erro ao carregar custos: ' + err.message, 'error');
  }
}

const catLabels = {
  alimentacao: 'Alimentação', veterinario: 'Veterinário',
  transporte: 'Transporte',   medicamento: 'Medicamento',
  mao_de_obra: 'Mão de obra', outros: 'Outros',
};

function renderCustos(custos) {
  const tbody = $('#tb-custos');
  if (!custos || custos.length === 0) { renderTable(tbody, []); return; }

  const rows = custos.map(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(c.date)}</td>
      <td>${c.lots?.name || '—'}</td>
      <td><span class="badge badge--orange">${catLabels[c.category] || c.category}</span></td>
      <td>${c.description || '—'}</td>
      <td class="text-right fw-bold text-danger">${formatCurrency(c.amount)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="openEditCusto('${c.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteCusto('${c.id}')">🗑️</button>
      </td>
    `;
    return tr;
  });
  renderTable(tbody, rows);
}

let _custosCache = [];

function openEditCusto(id) {
  const custo = _custosCache.find(c => c.id === id);
  if (!custo) return;
  $('#modal-custo-title').textContent = 'Editar Custo';
  $('#custo-id').value     = custo.id;
  $('#custo-lot').value    = custo.lot_id || '';
  $('#custo-cat').value    = custo.category || '';
  $('#custo-amount').value = custo.amount || '';
  $('#custo-date').value   = custo.date || '';
  $('#custo-desc').value   = custo.description || '';
  openModal('modal-custo');
}

async function deleteCusto(id) {
  if (!confirm('Excluir este custo?')) return;
  try {
    await SupabaseAPI.deleteCost(id);
    showToast('Custo removido.', 'success');
    loadCustos();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── VENDAS ────────────────────────────────────────────────────────────────────

async function loadVendas() {
  const lot_id = $('#filter-lote-venda')?.value || '';
  try {
    const vendas = await SupabaseAPI.getSales({ lot_id });
    renderVendas(vendas);
  } catch (err) {
    showToast('Erro ao carregar vendas: ' + err.message, 'error');
  }
}

function renderVendas(vendas) {
  const tbody = $('#tb-vendas');
  if (!vendas || vendas.length === 0) { renderTable(tbody, []); return; }

  const rows = vendas.map(v => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(v.sale_date)}</td>
      <td>${v.lots?.name || '—'}</td>
      <td class="text-mono">${formatNumber(v.animal_count)}</td>
      <td>${v.buyer_name || '—'}</td>
      <td class="text-right fw-bold text-success">${formatCurrency(v.total_value)}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="deleteVenda('${v.id}')">🗑️</button>
      </td>
    `;
    return tr;
  });
  renderTable(tbody, rows);
}

async function deleteVenda(id) {
  if (!confirm('Excluir esta venda?')) return;
  try {
    await SupabaseAPI.deleteSale(id);
    showToast('Venda removida.', 'success');
    loadVendas();
    loadDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── SELECTS DE LOTE ───────────────────────────────────────────────────────────

function populateLotSelects(lots) {
  const selects = ['#custo-lot', '#venda-lot', '#filter-lote-custo', '#filter-lote-venda'];
  selects.forEach(sel => {
    const el = $(sel);
    if (!el) return;
    const isFilter  = sel.startsWith('#filter');
    const currentVal = el.value;
    el.innerHTML = `<option value="">${isFilter ? 'Todos os lotes' : 'Selecione um lote'}</option>`;
    (lots || []).forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      el.appendChild(opt);
    });
    if (currentVal) el.value = currentVal;
  });
}

// ── BIND FORMS ────────────────────────────────────────────────────────────────

function bindForms() {
  // Form: Lote
  $('#form-lote')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getFormData(e.target);
    const id   = data.id;
    delete data.id;
    if (data.animal_count)    data.animal_count    = Number(data.animal_count);
    if (data.avg_weight_entry) data.avg_weight_entry = Number(data.avg_weight_entry);

    const btn = $('#btn-save-lote');
    setLoading(btn, true);
    try {
      if (id) {
        await SupabaseAPI.updateLot(id, data);
        showToast('Lote atualizado!', 'success');
      } else {
        await SupabaseAPI.insertLot(data);
        showToast('Lote criado com sucesso!', 'success');
      }
      closeModal('modal-lote');
      resetLoteForm();
      if (currentSection === 'lotes') loadLotes();
      loadDashboard();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    } finally {
      setLoading(btn, false, 'Salvar Lote');
    }
  });

  // Form: Custo
  $('#form-custo')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getFormData(e.target);
    const id   = data.id;
    delete data.id;
    data.amount = Number(data.amount);

    const btn = $('#btn-save-custo');
    setLoading(btn, true);
    try {
      if (id) {
        await SupabaseAPI.updateCost(id, data);
        showToast('Custo atualizado!', 'success');
      } else {
        await SupabaseAPI.insertCost(data);
        showToast('Custo registrado!', 'success');
      }
      closeModal('modal-custo');
      e.target.reset();
      $('#custo-id').value = '';
      $('#modal-custo-title').textContent = 'Novo Custo';
      _custosCache = [];
      if (currentSection === 'custos') loadCustos();
      loadDashboard();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    } finally {
      setLoading(btn, false, 'Salvar Custo');
    }
  });

  // Form: Venda
  $('#form-venda')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = getFormData(e.target);
    const id   = data.id;
    delete data.id;
    data.total_value  = Number(data.total_value);
    data.animal_count = Number(data.animal_count);

    const btn = $('#btn-save-venda');
    setLoading(btn, true);
    try {
      if (id) {
        await SupabaseAPI.updateSale(id, data);
        showToast('Venda atualizada!', 'success');
      } else {
        await SupabaseAPI.insertSale(data);
        showToast('Venda registrada!', 'success');
      }
      closeModal('modal-venda');
      e.target.reset();
      $('#venda-id').value = '';
      if (currentSection === 'vendas') loadVendas();
      loadDashboard();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    } finally {
      setLoading(btn, false, 'Registrar Venda');
    }
  });
}

// ── RELATÓRIOS ────────────────────────────────────────────────────────────────

async function loadRelatorios() {
  try {
    const [lots, costs, sales] = await Promise.all([
      SupabaseAPI.getLots(),
      SupabaseAPI.getCosts(),
      SupabaseAPI.getSales(),
    ]);

    const totalAnimals  = lots.reduce((s, l) => s + (l.animal_count || 0), 0);
    const totalCosts    = costs.reduce((s, c) => s + (c.amount || 0), 0);
    const totalRevenue  = sales.reduce((s, v) => s + (v.total_value || 0), 0);
    const soldAnimals   = sales.reduce((s, v) => s + (v.animal_count || 0), 0);
    const lucro         = totalRevenue - totalCosts;
    const margem        = totalRevenue > 0 ? ((lucro / totalRevenue) * 100).toFixed(1) : 0;

    // KPIs
    const custoAnimal   = totalAnimals > 0 ? totalCosts / totalAnimals : 0;
    const receitaAnimal = soldAnimals  > 0 ? totalRevenue / soldAnimals  : 0;
    const lucroAnimal   = totalAnimals > 0 ? lucro / totalAnimals : 0;

    setText('#kpi-margem',        margem + '%');
    setText('#kpi-custo-animal',  formatCurrency(custoAnimal));
    setText('#kpi-receita-animal',formatCurrency(receitaAnimal));

    const lucroAnimalEl = $('#kpi-lucro-animal');
    if (lucroAnimalEl) {
      lucroAnimalEl.textContent = formatCurrency(lucroAnimal);
      lucroAnimalEl.style.color = lucroAnimal >= 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)';
    }

    // Gráficos
    drawDonutCategorias(costs);
    drawBarLotes(lots, costs, sales);
    drawLineCustos(costs);
    drawBarStatus(lots);

  } catch (err) {
    showToast('Erro ao carregar relatórios: ' + err.message, 'error');
  }
}

// ── GRÁFICO: Donut – custos por categoria ─────────────────────────────────────

function drawDonutCategorias(costs) {
  const svg    = document.getElementById('donut-svg');
  const legend = document.getElementById('donut-legend');
  if (!svg || !legend) return;

  // Agrupa por categoria
  const totals = {};
  costs.forEach(c => {
    const cat = c.category || 'outros';
    totals[cat] = (totals[cat] || 0) + (c.amount || 0);
  });

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const total   = entries.reduce((s, [, v]) => s + v, 0);

  const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];
  const cx = 80, cy = 80, r = 70, ri = 36;

  if (total === 0) {
    svg.innerHTML = `<text x="80" y="85" text-anchor="middle" font-size="12" fill="#9ca3af">Sem dados</text>`;
    legend.innerHTML = '';
    return;
  }

  let startAngle = -Math.PI / 2;
  let pathsHtml  = '';

  entries.forEach(([cat, val], i) => {
    const angle    = (val / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const xi1 = cx + ri * Math.cos(startAngle);
    const yi1 = cy + ri * Math.sin(startAngle);
    const xi2 = cx + ri * Math.cos(endAngle);
    const yi2 = cy + ri * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    const color = colors[i % colors.length];

    pathsHtml += `<path d="M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${ri},${ri} 0 ${large},0 ${xi1},${yi1}" fill="${color}" opacity="0.9"/>`;
    startAngle = endAngle;
  });

  svg.innerHTML = pathsHtml;

  legend.innerHTML = entries.map(([cat, val], i) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${colors[i % colors.length]}"></div>
      <span style="color:var(--text-muted)">${catLabels[cat] || cat}</span>
      <strong style="margin-left:auto;padding-left:8px">${((val/total)*100).toFixed(0)}%</strong>
    </div>
  `).join('');
}

// ── GRÁFICO: Barras agrupadas – Receita vs Custo por lote ────────────────────

function drawBarLotes(lots, costs, sales) {
  const svg = document.getElementById('bar-lotes');
  if (!svg) return;

  // Agrupa custo e receita por lote
  const lotMap = {};
  lots.forEach(l => { lotMap[l.id] = { name: l.name, custo: 0, receita: 0 }; });
  costs.forEach(c => { if (lotMap[c.lot_id]) lotMap[c.lot_id].custo += c.amount || 0; });
  sales.forEach(v => { if (lotMap[v.lot_id]) lotMap[v.lot_id].receita += v.total_value || 0; });

  const entries = Object.values(lotMap)
    .filter(l => l.custo > 0 || l.receita > 0)
    .sort((a, b) => (b.custo + b.receita) - (a.custo + a.receita))
    .slice(0, 6);

  if (!entries.length) {
    svg.innerHTML = `<text x="180" y="100" text-anchor="middle" font-size="12" fill="#9ca3af">Sem dados suficientes</text>`;
    return;
  }

  const W = 360, H = 200, padL = 8, padR = 8, padT = 16, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...entries.map(l => Math.max(l.custo, l.receita)), 1);
  const groupW = chartW / entries.length;
  const barW   = Math.min(groupW * 0.35, 28);
  const gap    = 4;

  let html = '';

  // Grade horizontal
  [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
    const y = padT + chartH * (1 - frac);
    html += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    if (frac > 0) {
      const label = formatCurrency(maxVal * frac).replace('R$\u00a0', 'R$');
      html += `<text x="${padL + 2}" y="${y - 3}" font-size="7" fill="#9ca3af">${label}</text>`;
    }
  });

  entries.forEach((l, i) => {
    const cx     = padL + groupW * i + groupW / 2;
    const hC     = (l.custo   / maxVal) * chartH;
    const hR     = (l.receita / maxVal) * chartH;
    const xC     = cx - barW - gap / 2;
    const xR     = cx + gap / 2;
    const yC     = padT + chartH - hC;
    const yR     = padT + chartH - hR;

    html += `<rect x="${xC}" y="${yC}" width="${barW}" height="${hC}" fill="#ef4444" rx="3" opacity="0.85"/>`;
    html += `<rect x="${xR}" y="${yR}" width="${barW}" height="${hR}" fill="#10b981" rx="3" opacity="0.85"/>`;

    // Label do lote (truncado)
    const label = l.name.length > 8 ? l.name.slice(0, 7) + '…' : l.name;
    html += `<text x="${cx}" y="${H - padB + 14}" text-anchor="middle" font-size="8" fill="#6b7280">${label}</text>`;
  });

  // Legenda
  html += `<rect x="${padL}" y="${H - padB + 22}" width="8" height="8" fill="#ef4444" rx="2"/>`;
  html += `<text x="${padL + 11}" y="${H - padB + 30}" font-size="8" fill="#6b7280">Custo</text>`;
  html += `<rect x="${padL + 50}" y="${H - padB + 22}" width="8" height="8" fill="#10b981" rx="2"/>`;
  html += `<text x="${padL + 63}" y="${H - padB + 30}" font-size="8" fill="#6b7280">Receita</text>`;

  svg.innerHTML = html;
}

// ── GRÁFICO: Linha – Evolução de custos por mês ───────────────────────────────

function drawLineCustos(costs) {
  const svg = document.getElementById('line-custos');
  if (!svg) return;

  // Últimos 6 meses
  const now    = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      total: 0,
    });
  }

  costs.forEach(c => {
    if (!c.date) return;
    const key = c.date.slice(0, 7);
    const m   = months.find(m => m.key === key);
    if (m) m.total += c.amount || 0;
  });

  const W = 360, H = 200, padL = 48, padR = 16, padT = 20, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...months.map(m => m.total), 1);

  let html = '';

  // Grade horizontal
  [0, 0.5, 1].forEach(frac => {
    const y = padT + chartH * (1 - frac);
    html += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    const label = formatCurrency(maxVal * frac).replace('R$\u00a0', 'R$');
    html += `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="8" fill="#9ca3af">${label}</text>`;
  });

  const pts = months.map((m, i) => {
    const x = padL + (i / (months.length - 1)) * chartW;
    const y = padT + chartH * (1 - m.total / maxVal);
    return { x, y, m };
  });

  // Área preenchida
  const areaPath = `M${pts[0].x},${padT + chartH} ` +
    pts.map(p => `L${p.x},${p.y}`).join(' ') +
    ` L${pts[pts.length - 1].x},${padT + chartH} Z`;
  html += `<path d="${areaPath}" fill="#3b82f6" opacity="0.12"/>`;

  // Linha
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  html += `<path d="${linePath}" stroke="#3b82f6" stroke-width="2.5" fill="none" stroke-linejoin="round"/>`;

  // Pontos e labels
  pts.forEach(({ x, y, m }) => {
    html += `<circle cx="${x}" cy="${y}" r="4" fill="#3b82f6" stroke="#fff" stroke-width="2"/>`;
    html += `<text x="${x}" y="${H - padB + 14}" text-anchor="middle" font-size="9" fill="#6b7280">${m.label}</text>`;
  });

  svg.innerHTML = html;
}

// ── GRÁFICO: Barras – Animais por status ─────────────────────────────────────

function drawBarStatus(lots) {
  const svg = document.getElementById('bar-status');
  if (!svg) return;

  const statusMap = { active: 0, finished: 0, sold: 0 };
  lots.forEach(l => {
    if (statusMap[l.status] !== undefined) statusMap[l.status] += l.animal_count || 0;
  });

  const labels = { active: 'Ativo', finished: 'Finalizado', sold: 'Vendido' };
  const colors = { active: '#10b981', finished: '#9ca3af', sold: '#3b82f6' };
  const entries = Object.entries(statusMap);

  const W = 360, H = 200, padL = 24, padR = 24, padT = 20, padB = 36;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);

  const barW   = Math.min((chartW / entries.length) * 0.55, 70);

  let html = '';

  // Grade
  [0, 0.5, 1].forEach(frac => {
    const y = padT + chartH * (1 - frac);
    html += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
  });

  entries.forEach(([status, val], i) => {
    const cx = padL + ((i + 0.5) / entries.length) * chartW;
    const bh = (val / maxVal) * chartH;
    const bx = cx - barW / 2;
    const by = padT + chartH - bh;

    html += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh}" fill="${colors[status]}" rx="4" opacity="0.85"/>`;
    html += `<text x="${cx}" y="${by - 6}" text-anchor="middle" font-size="10" font-weight="700" fill="${colors[status]}">${formatNumber(val)}</text>`;
    html += `<text x="${cx}" y="${H - padB + 16}" text-anchor="middle" font-size="10" fill="#6b7280">${labels[status]}</text>`;
  });

  svg.innerHTML = html;
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────

async function handleLogout() {
  await SupabaseAPI.signOut();
  window.location.href = 'index.html';
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value ?? '—';
}

function escHtml(str) {
  return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function openCreateModal() {
  const modals = { lotes: 'modal-lote', custos: 'modal-custo', vendas: 'modal-venda' };
  const id = modals[currentSection];
  if (id) openModal(id);
}
