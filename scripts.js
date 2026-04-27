/**
 * scripts.js
 * Lógica principal do dashboard — seções, CRUD, renderização, relatórios
 * Usa Helpers.* e SupabaseAPI.* diretamente, sem redeclarar variáveis.
 */

// ── ESTADO LOCAL ──────────────────────────────────────────────────────────────
var allLotes       = [];
var currentSection = 'dashboard';
var _custosCache   = [];

// ── INICIALIZAÇÃO ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  Helpers.requireAuth();
  loadUserInfo();
  loadDashboard();
  bindForms();
});

function loadUserInfo() {
  var user = SupabaseAPI.getCurrentUser();
  if (!user) return;
  var name     = (user.user_metadata && user.user_metadata.full_name) ? user.user_metadata.full_name : (user.email || '—');
  var initials = name.charAt(0).toUpperCase();
  setText('#user-avatar', initials);
  setText('#user-name',   name);
  setText('#user-role',   (user.user_metadata && user.user_metadata.role) ? user.user_metadata.role : 'usuário');
}

// ── NAVEGAÇÃO ENTRE SEÇÕES ────────────────────────────────────────────────────

function showSection(name) {
  currentSection = name;

  // Oculta todas as seções
  var sections = document.querySelectorAll('[id^="section-"]');
  sections.forEach(function(s) { s.classList.add('hidden'); });

  var target = document.getElementById('section-' + name);
  if (target) target.classList.remove('hidden');

  // Atualiza nav links
  var navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(function(l) { l.classList.remove('active'); });
  var navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');

  // Atualiza título
  var titles = {
    dashboard:  'Dashboard',
    lotes:      'Lotes',
    custos:     'Custos',
    vendas:     'Vendas',
    relatorios: 'Relatórios',
  };
  setText('#page-title', titles[name] || 'BovGest');

  // Botão de ação rápida
  var actionBtn = document.getElementById('action-btn');
  if (actionBtn) {
    var showFor = ['lotes', 'custos', 'vendas'];
    actionBtn.style.display = showFor.indexOf(name) >= 0 ? '' : 'none';
    var labels = { lotes: '+ Novo Lote', custos: '+ Novo Custo', vendas: '+ Nova Venda' };
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
    var summary = await SupabaseAPI.getDashboardSummary();
    allLotes = summary.lots || [];

    setText('#stat-animais', Helpers.formatNumber(summary.totalAnimals));
    setText('#stat-lotes',   summary.activeLots);
    setText('#stat-custos',  Helpers.formatCurrency(summary.totalCosts));
    setText('#stat-receita', Helpers.formatCurrency(summary.totalRevenue));

    var lucro = summary.profit;
    setText('#fin-receita', Helpers.formatCurrency(summary.totalRevenue));
    setText('#fin-custo',   Helpers.formatCurrency(summary.totalCosts));

    var lucroEl = document.getElementById('fin-lucro');
    if (lucroEl) {
      lucroEl.textContent = Helpers.formatCurrency(lucro);
      lucroEl.className   = lucro >= 0 ? 'text-success' : 'text-danger';
    }

    renderDashboardLotes(summary.lots.slice(0, 6));
    populateLotSelects(summary.lots);

  } catch (err) {
    Helpers.showToast('Erro ao carregar dashboard: ' + err.message, 'error');
  }
}

function renderDashboardLotes(lots) {
  var tbody = document.getElementById('tb-dashboard-lotes');
  if (!lots || !lots.length) { Helpers.renderTable(tbody, []); return; }

  var rows = lots.map(function(l) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="fw-bold">' + (l.name || '—') + '</td>' +
      '<td>' + Helpers.formatNumber(l.animal_count) + '</td>' +
      '<td>' + Helpers.statusBadge(l.status) + '</td>';
    return tr;
  });
  Helpers.renderTable(tbody, rows);
}

// ── LOTES ─────────────────────────────────────────────────────────────────────

async function loadLotes() {
  var search = (document.getElementById('search-lotes') || {}).value || '';
  var status = (document.getElementById('filter-status-lotes') || {}).value || '';
  try {
    var lots = await SupabaseAPI.getLots({ search: search, status: status });
    allLotes = lots || [];
    renderLotesGrid(lots);
    populateLotSelects(lots);
  } catch (err) {
    Helpers.showToast('Erro ao carregar lotes: ' + err.message, 'error');
  }
}

function filterLotes() {
  clearTimeout(window._filterTimer);
  window._filterTimer = setTimeout(loadLotes, 300);
}

function renderLotesGrid(lots) {
  var grid = document.getElementById('lotes-grid');
  if (!grid) return;

  if (!lots || lots.length === 0) {
    grid.innerHTML =
      '<div class="empty-state" style="grid-column:1/-1">' +
        '<div class="empty-state__icon">🐮</div>' +
        '<div class="empty-state__title">Nenhum lote encontrado</div>' +
        '<div class="empty-state__sub">Crie seu primeiro lote clicando em "+ Novo Lote"</div>' +
      '</div>';
    return;
  }

  grid.innerHTML = lots.map(function(l) {
    return '<div class="lot-card">' +
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">' +
        '<div>' +
          '<div class="lot-card__name">' + (l.name || '—') + '</div>' +
          '<div class="lot-card__info">' + (l.breed || 'Raça não informada') + ' · Entrada: ' + Helpers.formatDate(l.entry_date) + '</div>' +
        '</div>' +
        Helpers.statusBadge(l.status) +
      '</div>' +
      '<div class="lot-card__stats">' +
        '<div><div class="lot-card__stat-label">Animais</div><div class="lot-card__stat-value">' + Helpers.formatNumber(l.animal_count) + '</div></div>' +
        '<div><div class="lot-card__stat-label">Peso Médio</div><div class="lot-card__stat-value">' + (l.avg_weight_entry ? l.avg_weight_entry + ' kg' : '—') + '</div></div>' +
      '</div>' +
      '<div class="lot-card__actions">' +
        '<button class="btn btn-ghost btn-icon" title="Editar" onclick="openEditLote(\'' + l.id + '\')">✏️</button>' +
        '<button class="btn btn-ghost btn-icon" title="Excluir" onclick="deleteLote(\'' + l.id + '\', \'' + escHtml(l.name) + '\')">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function openEditLote(id) {
  var lote = allLotes.find(function(l) { return l.id === id; });
  if (!lote) return;
  document.getElementById('modal-lote-title').textContent = 'Editar Lote';
  document.getElementById('lote-id').value     = lote.id;
  document.getElementById('lote-name').value   = lote.name || '';
  document.getElementById('lote-count').value  = lote.animal_count || '';
  document.getElementById('lote-breed').value  = lote.breed || '';
  document.getElementById('lote-status').value = lote.status || 'active';
  document.getElementById('lote-entry').value  = lote.entry_date || '';
  document.getElementById('lote-weight').value = lote.avg_weight_entry || '';
  document.getElementById('lote-notes').value  = lote.notes || '';
  Helpers.openModal('modal-lote');
}

function resetLoteForm() {
  document.getElementById('modal-lote-title').textContent = 'Novo Lote';
  document.getElementById('form-lote').reset();
  document.getElementById('lote-id').value = '';
}

async function deleteLote(id, name) {
  if (!confirm('Excluir o lote "' + name + '"?\nIsso também apagará custos e vendas vinculados.')) return;
  try {
    await SupabaseAPI.deleteLot(id);
    Helpers.showToast('Lote excluído com sucesso.', 'success');
    loadLotes();
    loadDashboard();
  } catch (err) {
    Helpers.showToast('Erro ao excluir: ' + err.message, 'error');
  }
}

// ── CUSTOS ────────────────────────────────────────────────────────────────────

var catLabels = {
  alimentacao: 'Alimentação', veterinario: 'Veterinário',
  transporte: 'Transporte',   medicamento: 'Medicamento',
  mao_de_obra: 'Mão de obra', outros: 'Outros',
};

async function loadCustos() {
  var lot_id   = (document.getElementById('filter-lote-custo')  || {}).value || '';
  var category = (document.getElementById('filter-cat-custo')   || {}).value || '';
  try {
    var custos = await SupabaseAPI.getCosts({ lot_id: lot_id, category: category });
    _custosCache = custos || [];
    renderCustos(custos);
  } catch (err) {
    Helpers.showToast('Erro ao carregar custos: ' + err.message, 'error');
  }
}

function renderCustos(custos) {
  var tbody = document.getElementById('tb-custos');
  if (!custos || custos.length === 0) { Helpers.renderTable(tbody, []); return; }

  var rows = custos.map(function(c) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + Helpers.formatDate(c.date) + '</td>' +
      '<td>' + ((c.lots && c.lots.name) ? c.lots.name : '—') + '</td>' +
      '<td><span class="badge badge--orange">' + (catLabels[c.category] || c.category) + '</span></td>' +
      '<td>' + (c.description || '—') + '</td>' +
      '<td class="text-right fw-bold text-danger">' + Helpers.formatCurrency(c.amount) + '</td>' +
      '<td>' +
        '<button class="btn btn-ghost btn-sm" onclick="openEditCusto(\'' + c.id + '\')">✏️</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="deleteCusto(\'' + c.id + '\')">🗑️</button>' +
      '</td>';
    return tr;
  });
  Helpers.renderTable(tbody, rows);
}

function openEditCusto(id) {
  var custo = _custosCache.find(function(c) { return c.id === id; });
  if (!custo) return;
  document.getElementById('modal-custo-title').textContent = 'Editar Custo';
  document.getElementById('custo-id').value     = custo.id;
  document.getElementById('custo-lot').value    = custo.lot_id || '';
  document.getElementById('custo-cat').value    = custo.category || '';
  document.getElementById('custo-amount').value = custo.amount || '';
  document.getElementById('custo-date').value   = custo.date || '';
  document.getElementById('custo-desc').value   = custo.description || '';
  Helpers.openModal('modal-custo');
}

async function deleteCusto(id) {
  if (!confirm('Excluir este custo?')) return;
  try {
    await SupabaseAPI.deleteCost(id);
    Helpers.showToast('Custo removido.', 'success');
    loadCustos();
    loadDashboard();
  } catch (err) {
    Helpers.showToast(err.message, 'error');
  }
}

// ── VENDAS ────────────────────────────────────────────────────────────────────

async function loadVendas() {
  var lot_id = (document.getElementById('filter-lote-venda') || {}).value || '';
  try {
    var vendas = await SupabaseAPI.getSales({ lot_id: lot_id });
    renderVendas(vendas);
  } catch (err) {
    Helpers.showToast('Erro ao carregar vendas: ' + err.message, 'error');
  }
}

function renderVendas(vendas) {
  var tbody = document.getElementById('tb-vendas');
  if (!vendas || vendas.length === 0) { Helpers.renderTable(tbody, []); return; }

  var rows = vendas.map(function(v) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + Helpers.formatDate(v.sale_date) + '</td>' +
      '<td>' + ((v.lots && v.lots.name) ? v.lots.name : '—') + '</td>' +
      '<td class="text-mono">' + Helpers.formatNumber(v.animal_count) + '</td>' +
      '<td>' + (v.buyer_name || '—') + '</td>' +
      '<td class="text-right fw-bold text-success">' + Helpers.formatCurrency(v.total_value) + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" onclick="deleteVenda(\'' + v.id + '\')">🗑️</button></td>';
    return tr;
  });
  Helpers.renderTable(tbody, rows);
}

async function deleteVenda(id) {
  if (!confirm('Excluir esta venda?')) return;
  try {
    await SupabaseAPI.deleteSale(id);
    Helpers.showToast('Venda removida.', 'success');
    loadVendas();
    loadDashboard();
  } catch (err) {
    Helpers.showToast(err.message, 'error');
  }
}

// ── SELECTS DE LOTE ───────────────────────────────────────────────────────────

function populateLotSelects(lots) {
  var selects = ['custo-lot', 'venda-lot', 'filter-lote-custo', 'filter-lote-venda'];
  selects.forEach(function(selId) {
    var el = document.getElementById(selId);
    if (!el) return;
    var isFilter  = selId.indexOf('filter') >= 0;
    var currentVal = el.value;
    el.innerHTML = '<option value="">' + (isFilter ? 'Todos os lotes' : 'Selecione um lote') + '</option>';
    (lots || []).forEach(function(l) {
      var opt = document.createElement('option');
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
  var formLote = document.getElementById('form-lote');
  if (formLote) {
    formLote.addEventListener('submit', async function(e) {
      e.preventDefault();
      var data = Helpers.getFormData(e.target);
      var id   = data.id;
      delete data.id;
      if (data.animal_count)     data.animal_count     = Number(data.animal_count);
      if (data.avg_weight_entry) data.avg_weight_entry = Number(data.avg_weight_entry);

      var btn = document.getElementById('btn-save-lote');
      Helpers.setLoading(btn, true);
      try {
        if (id) {
          await SupabaseAPI.updateLot(id, data);
          Helpers.showToast('Lote atualizado!', 'success');
        } else {
          await SupabaseAPI.insertLot(data);
          Helpers.showToast('Lote criado com sucesso!', 'success');
        }
        Helpers.closeModal('modal-lote');
        resetLoteForm();
        if (currentSection === 'lotes') loadLotes();
        loadDashboard();
      } catch (err) {
        Helpers.showToast('Erro: ' + err.message, 'error');
      } finally {
        Helpers.setLoading(btn, false, 'Salvar Lote');
      }
    });
  }

  // Form: Custo
  var formCusto = document.getElementById('form-custo');
  if (formCusto) {
    formCusto.addEventListener('submit', async function(e) {
      e.preventDefault();
      var data = Helpers.getFormData(e.target);
      var id   = data.id;
      delete data.id;
      data.amount = Number(data.amount);

      var btn = document.getElementById('btn-save-custo');
      Helpers.setLoading(btn, true);
      try {
        if (id) {
          await SupabaseAPI.updateCost(id, data);
          Helpers.showToast('Custo atualizado!', 'success');
        } else {
          await SupabaseAPI.insertCost(data);
          Helpers.showToast('Custo registrado!', 'success');
        }
        Helpers.closeModal('modal-custo');
        e.target.reset();
        document.getElementById('custo-id').value = '';
        document.getElementById('modal-custo-title').textContent = 'Novo Custo';
        _custosCache = [];
        if (currentSection === 'custos') loadCustos();
        loadDashboard();
      } catch (err) {
        Helpers.showToast('Erro: ' + err.message, 'error');
      } finally {
        Helpers.setLoading(btn, false, 'Salvar Custo');
      }
    });
  }

  // Form: Venda
  var formVenda = document.getElementById('form-venda');
  if (formVenda) {
    formVenda.addEventListener('submit', async function(e) {
      e.preventDefault();
      var data = Helpers.getFormData(e.target);
      var id   = data.id;
      delete data.id;
      data.total_value  = Number(data.total_value);
      data.animal_count = Number(data.animal_count);

      var btn = document.getElementById('btn-save-venda');
      Helpers.setLoading(btn, true);
      try {
        if (id) {
          await SupabaseAPI.updateSale(id, data);
          Helpers.showToast('Venda atualizada!', 'success');
        } else {
          await SupabaseAPI.insertSale(data);
          Helpers.showToast('Venda registrada!', 'success');
        }
        Helpers.closeModal('modal-venda');
        e.target.reset();
        document.getElementById('venda-id').value = '';
        if (currentSection === 'vendas') loadVendas();
        loadDashboard();
      } catch (err) {
        Helpers.showToast('Erro: ' + err.message, 'error');
      } finally {
        Helpers.setLoading(btn, false, 'Registrar Venda');
      }
    });
  }
}

// ── RELATÓRIOS ────────────────────────────────────────────────────────────────

async function loadRelatorios() {
  try {
    var results = await Promise.all([
      SupabaseAPI.getLots(),
      SupabaseAPI.getCosts(),
      SupabaseAPI.getSales(),
    ]);
    var lots  = results[0];
    var costs = results[1];
    var sales = results[2];

    var totalAnimals  = lots.reduce(function(s, l)  { return s + (l.animal_count || 0); }, 0);
    var totalCosts    = costs.reduce(function(s, c)  { return s + (c.amount || 0); }, 0);
    var totalRevenue  = sales.reduce(function(s, v)  { return s + (v.total_value || 0); }, 0);
    var soldAnimals   = sales.reduce(function(s, v)  { return s + (v.animal_count || 0); }, 0);
    var lucro         = totalRevenue - totalCosts;
    var margem        = totalRevenue > 0 ? ((lucro / totalRevenue) * 100).toFixed(1) : 0;

    var custoAnimal   = totalAnimals > 0 ? totalCosts   / totalAnimals : 0;
    var receitaAnimal = soldAnimals  > 0 ? totalRevenue / soldAnimals  : 0;
    var lucroAnimal   = totalAnimals > 0 ? lucro        / totalAnimals : 0;

    setText('#kpi-margem',         margem + '%');
    setText('#kpi-custo-animal',   Helpers.formatCurrency(custoAnimal));
    setText('#kpi-receita-animal', Helpers.formatCurrency(receitaAnimal));

    var lucroAnimalEl = document.getElementById('kpi-lucro-animal');
    if (lucroAnimalEl) {
      lucroAnimalEl.textContent = Helpers.formatCurrency(lucroAnimal);
      lucroAnimalEl.style.color = lucroAnimal >= 0 ? '#16a34a' : '#dc2626';
    }

    drawDonutCategorias(costs);
    drawBarLotes(lots, costs, sales);
    drawLineCustos(costs);
    drawBarStatus(lots);

  } catch (err) {
    Helpers.showToast('Erro ao carregar relatórios: ' + err.message, 'error');
  }
}

function drawDonutCategorias(costs) {
  var svg    = document.getElementById('donut-svg');
  var legend = document.getElementById('donut-legend');
  if (!svg || !legend) return;

  var totals = {};
  costs.forEach(function(c) {
    var cat = c.category || 'outros';
    totals[cat] = (totals[cat] || 0) + (c.amount || 0);
  });

  var entries = Object.entries(totals).sort(function(a, b) { return b[1] - a[1]; });
  var total   = entries.reduce(function(s, e) { return s + e[1]; }, 0);
  var colors  = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];
  var cx = 80, cy = 80, r = 70, ri = 36;

  if (total === 0) {
    svg.innerHTML = '<text x="80" y="85" text-anchor="middle" font-size="12" fill="#9ca3af">Sem dados</text>';
    legend.innerHTML = '';
    return;
  }

  var startAngle = -Math.PI / 2;
  var pathsHtml  = '';

  entries.forEach(function(entry, i) {
    var cat = entry[0], val = entry[1];
    var angle    = (val / total) * 2 * Math.PI;
    var endAngle = startAngle + angle;
    var x1 = cx + r  * Math.cos(startAngle), y1 = cy + r  * Math.sin(startAngle);
    var x2 = cx + r  * Math.cos(endAngle),   y2 = cy + r  * Math.sin(endAngle);
    var xi1= cx + ri * Math.cos(startAngle), yi1= cy + ri * Math.sin(startAngle);
    var xi2= cx + ri * Math.cos(endAngle),   yi2= cy + ri * Math.sin(endAngle);
    var large = angle > Math.PI ? 1 : 0;
    var color  = colors[i % colors.length];
    pathsHtml += '<path d="M' + xi1 + ',' + yi1 + ' L' + x1 + ',' + y1 + ' A' + r + ',' + r + ' 0 ' + large + ',1 ' + x2 + ',' + y2 + ' L' + xi2 + ',' + yi2 + ' A' + ri + ',' + ri + ' 0 ' + large + ',0 ' + xi1 + ',' + yi1 + '" fill="' + color + '" opacity="0.9"/>';
    startAngle = endAngle;
  });
  svg.innerHTML = pathsHtml;

  legend.innerHTML = entries.map(function(entry, i) {
    var cat = entry[0], val = entry[1];
    return '<div class="legend-item"><div class="legend-dot" style="background:' + colors[i % colors.length] + '"></div><span style="color:var(--text-muted)">' + (catLabels[cat] || cat) + '</span><strong style="margin-left:auto;padding-left:8px">' + ((val/total)*100).toFixed(0) + '%</strong></div>';
  }).join('');
}

function drawBarLotes(lots, costs, sales) {
  var svg = document.getElementById('bar-lotes');
  if (!svg) return;

  var lotMap = {};
  lots.forEach(function(l) { lotMap[l.id] = { name: l.name, custo: 0, receita: 0 }; });
  costs.forEach(function(c) { if (lotMap[c.lot_id]) lotMap[c.lot_id].custo += c.amount || 0; });
  sales.forEach(function(v) { if (lotMap[v.lot_id]) lotMap[v.lot_id].receita += v.total_value || 0; });

  var entries = Object.values(lotMap)
    .filter(function(l) { return l.custo > 0 || l.receita > 0; })
    .sort(function(a, b) { return (b.custo + b.receita) - (a.custo + a.receita); })
    .slice(0, 6);

  if (!entries.length) {
    svg.innerHTML = '<text x="180" y="100" text-anchor="middle" font-size="12" fill="#9ca3af">Sem dados suficientes</text>';
    return;
  }

  var W=360,H=200,padL=8,padR=8,padT=16,padB=32;
  var chartW=W-padL-padR, chartH=H-padT-padB;
  var maxVal = Math.max.apply(null, entries.map(function(l) { return Math.max(l.custo, l.receita); }).concat([1]));
  var groupW = chartW / entries.length;
  var barW   = Math.min(groupW * 0.35, 28);
  var gap    = 4;
  var html   = '';

  [0,0.25,0.5,0.75,1].forEach(function(frac) {
    var y = padT + chartH * (1 - frac);
    html += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W-padR) + '" y2="' + y + '" stroke="#e5e7eb" stroke-width="1"/>';
  });

  entries.forEach(function(l, i) {
    var cx = padL + groupW * i + groupW / 2;
    var hC = (l.custo   / maxVal) * chartH;
    var hR = (l.receita / maxVal) * chartH;
    var xC = cx - barW - gap / 2, xR = cx + gap / 2;
    var yC = padT + chartH - hC,  yR = padT + chartH - hR;
    html += '<rect x="' + xC + '" y="' + yC + '" width="' + barW + '" height="' + hC + '" fill="#ef4444" rx="3" opacity="0.85"/>';
    html += '<rect x="' + xR + '" y="' + yR + '" width="' + barW + '" height="' + hR + '" fill="#10b981" rx="3" opacity="0.85"/>';
    var label = l.name.length > 8 ? l.name.slice(0, 7) + '…' : l.name;
    html += '<text x="' + cx + '" y="' + (H - padB + 14) + '" text-anchor="middle" font-size="8" fill="#6b7280">' + label + '</text>';
  });

  html += '<rect x="' + padL + '" y="' + (H-padB+22) + '" width="8" height="8" fill="#ef4444" rx="2"/>';
  html += '<text x="' + (padL+11) + '" y="' + (H-padB+30) + '" font-size="8" fill="#6b7280">Custo</text>';
  html += '<rect x="' + (padL+50) + '" y="' + (H-padB+22) + '" width="8" height="8" fill="#10b981" rx="2"/>';
  html += '<text x="' + (padL+63) + '" y="' + (H-padB+30) + '" font-size="8" fill="#6b7280">Receita</text>';
  svg.innerHTML = html;
}

function drawLineCustos(costs) {
  var svg = document.getElementById('line-custos');
  if (!svg) return;

  var now    = new Date();
  var months = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key:   d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      total: 0,
    });
  }

  costs.forEach(function(c) {
    if (!c.date) return;
    var key = c.date.slice(0, 7);
    var m = months.find(function(m) { return m.key === key; });
    if (m) m.total += c.amount || 0;
  });

  var W=360,H=200,padL=48,padR=16,padT=20,padB=28;
  var chartW=W-padL-padR, chartH=H-padT-padB;
  var maxVal = Math.max.apply(null, months.map(function(m) { return m.total; }).concat([1]));
  var html   = '';

  [0,0.5,1].forEach(function(frac) {
    var y = padT + chartH * (1 - frac);
    html += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W-padR) + '" y2="' + y + '" stroke="#e5e7eb" stroke-width="1"/>';
    html += '<text x="' + (padL-4) + '" y="' + (y+4) + '" text-anchor="end" font-size="8" fill="#9ca3af">' + Helpers.formatCurrency(maxVal * frac).replace('R$\u00a0','R$') + '</text>';
  });

  var pts = months.map(function(m, i) {
    return {
      x: padL + (i / (months.length - 1)) * chartW,
      y: padT + chartH * (1 - m.total / maxVal),
      m: m,
    };
  });

  var areaPath = 'M' + pts[0].x + ',' + (padT + chartH) + ' ' +
    pts.map(function(p) { return 'L' + p.x + ',' + p.y; }).join(' ') +
    ' L' + pts[pts.length-1].x + ',' + (padT + chartH) + ' Z';
  html += '<path d="' + areaPath + '" fill="#3b82f6" opacity="0.12"/>';

  var linePath = pts.map(function(p, i) { return (i===0?'M':'L') + p.x + ',' + p.y; }).join(' ');
  html += '<path d="' + linePath + '" stroke="#3b82f6" stroke-width="2.5" fill="none" stroke-linejoin="round"/>';

  pts.forEach(function(pt) {
    html += '<circle cx="' + pt.x + '" cy="' + pt.y + '" r="4" fill="#3b82f6" stroke="#fff" stroke-width="2"/>';
    html += '<text x="' + pt.x + '" y="' + (H-padB+14) + '" text-anchor="middle" font-size="9" fill="#6b7280">' + pt.m.label + '</text>';
  });
  svg.innerHTML = html;
}

function drawBarStatus(lots) {
  var svg = document.getElementById('bar-status');
  if (!svg) return;

  var statusMap = { active: 0, finished: 0, sold: 0 };
  lots.forEach(function(l) {
    if (statusMap[l.status] !== undefined) statusMap[l.status] += l.animal_count || 0;
  });

  var labels = { active: 'Ativo', finished: 'Finalizado', sold: 'Vendido' };
  var colors = { active: '#10b981', finished: '#9ca3af', sold: '#3b82f6' };
  var entries = Object.entries(statusMap);

  var W=360,H=200,padL=24,padR=24,padT=20,padB=36;
  var chartW=W-padL-padR, chartH=H-padT-padB;
  var maxVal = Math.max.apply(null, entries.map(function(e) { return e[1]; }).concat([1]));
  var barW   = Math.min((chartW / entries.length) * 0.55, 70);
  var html   = '';

  [0,0.5,1].forEach(function(frac) {
    var y = padT + chartH * (1 - frac);
    html += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W-padR) + '" y2="' + y + '" stroke="#e5e7eb" stroke-width="1"/>';
  });

  entries.forEach(function(entry, i) {
    var status = entry[0], val = entry[1];
    var cx = padL + ((i + 0.5) / entries.length) * chartW;
    var bh = (val / maxVal) * chartH;
    var bx = cx - barW / 2;
    var by = padT + chartH - bh;
    html += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + colors[status] + '" rx="4" opacity="0.85"/>';
    html += '<text x="' + cx + '" y="' + (by-6) + '" text-anchor="middle" font-size="10" font-weight="700" fill="' + colors[status] + '">' + Helpers.formatNumber(val) + '</text>';
    html += '<text x="' + cx + '" y="' + (H-padB+16) + '" text-anchor="middle" font-size="10" fill="#6b7280">' + labels[status] + '</text>';
  });
  svg.innerHTML = html;
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────

function handleLogout() {
  SupabaseAPI.signOut().then(function() {
    window.location.href = 'index.html';
  });
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function setText(selector, value) {
  var el = document.querySelector(selector);
  if (el) el.textContent = (value !== undefined && value !== null) ? value : '—';
}

function escHtml(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function openCreateModal() {
  var modals = { lotes: 'modal-lote', custos: 'modal-custo', vendas: 'modal-venda' };
  var id = modals[currentSection];
  if (id) Helpers.openModal(id);
}
