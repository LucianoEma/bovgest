/**
 * scripts.js
 * Lógica principal do dashboard — seções, CRUD, renderização
 */

'use strict';

// ── ALIASES HELPERS ──────────────────────────────────────────────────────────
const {
  $, $$, formatCurrency, formatDate, formatNumber,
  showToast, openModal, closeModal, setLoading,
  renderTable, statusBadge, requireAuth, validateForm, getFormData,
} = Helpers;

// ── ESTADO LOCAL ─────────────────────────────────────────────────────────────
let allLotes = [];
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
  const name = user.user_metadata?.full_name || user.email || '—';
  const initials = name.charAt(0).toUpperCase();
  if ($('#user-avatar')) $('#user-avatar').textContent = initials;
  if ($('#user-name'))   $('#user-name').textContent  = name;
  if ($('#user-role'))   $('#user-role').textContent  = user.user_metadata?.role || 'usuário';
}

// ── NAVEGAÇÃO ENTRE SEÇÕES ────────────────────────────────────────────────────

function showSection(name) {
  event?.preventDefault();
  currentSection = name;

  // Toggle seções
  $$('[id^="section-"]').forEach(s => s.classList.add('hidden'));
  $(`#section-${name}`)?.classList.remove('hidden');

  // Atualiza nav
  $$('.nav-link').forEach(l => l.classList.remove('active'));
  const activeLink = $$('.nav-link').find(l => l.getAttribute('onclick')?.includes(name));
  if (activeLink) activeLink.classList.add('active');

  // Atualiza título do header
  const titles = {
    dashboard: 'Dashboard',
    lotes: 'Lotes',
    custos: 'Custos',
    vendas: 'Vendas',
  };
  if ($('#page-title')) $('#page-title').textContent = titles[name] || 'BovGest';

  // Carrega dados da seção
  if (name === 'lotes')  loadLotes();
  if (name === 'custos') loadCustos();
  if (name === 'vendas') loadVendas();
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const summary = await SupabaseAPI.getDashboardSummary();
    allLotes = summary.lots || [];

    // Stats
    setText('#stat-animais', formatNumber(summary.totalAnimals));
    setText('#stat-lotes', summary.activeLots);
    setText('#stat-custos', formatCurrency(summary.totalCosts));
    setText('#stat-receita', formatCurrency(summary.totalRevenue));

    // Financeiro
    const lucro = summary.profit;
    setText('#fin-receita', formatCurrency(summary.totalRevenue));
    setText('#fin-custo', formatCurrency(summary.totalCosts));
    const lucroEl = $('#fin-lucro');
    if (lucroEl) {
      lucroEl.textContent = formatCurrency(lucro);
      lucroEl.className = lucro >= 0 ? 'text-success' : 'text-danger';
    }

    // Tabela de lotes no dashboard
    renderDashboardLotes(summary.lots.slice(0, 6));
    populateLotSelects(summary.lots);

  } catch (err) {
    showToast('Erro ao carregar dashboard: ' + err.message, 'error');
  }
}

function renderDashboardLotes(lots) {
  const tbody = $('#tb-dashboard-lotes');
  if (!lots || !lots.length) {
    renderTable(tbody, []);
    return;
  }
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
  // Debounce simples
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
        <div class="empty-state__sub">Crie seu primeiro lote clicando em "Novo Lote"</div>
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
        <button class="btn btn-ghost btn-icon" title="Editar" onclick="openEditLote('${l.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon" title="Excluir" onclick="deleteLote('${l.id}', '${l.name}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function openEditLote(id) {
  const lote = allLotes.find(l => l.id === id);
  if (!lote) return;
  $('#modal-lote-title').textContent = 'Editar Lote';
  $('#lote-id').value       = lote.id;
  $('#lote-name').value     = lote.name || '';
  $('#lote-count').value    = lote.animal_count || '';
  $('#lote-breed').value    = lote.breed || '';
  $('#lote-status').value   = lote.status || 'active';
  $('#lote-entry').value    = lote.entry_date || '';
  $('#lote-weight').value   = lote.avg_weight_entry || '';
  $('#lote-notes').value    = lote.notes || '';
  openModal('modal-lote');
}

function resetLoteForm() {
  $('#modal-lote-title').textContent = 'Novo Lote';
  $('#form-lote').reset();
  $('#lote-id').value = '';
}

async function deleteLote(id, name) {
  if (!confirm(`Tem certeza que deseja excluir o lote "${name}"?\nIsso também apagará custos e vendas vinculados.`)) return;
  try {
    await SupabaseAPI.deleteLot(id);
    showToast('Lote excluído com sucesso.', 'success');
    loadLotes();
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
    renderCustos(custos);
  } catch (err) {
    showToast('Erro ao carregar custos: ' + err.message, 'error');
  }
}

const catLabels = {
  alimentacao: 'Alimentação', veterinario: 'Veterinário',
  transporte: 'Transporte', medicamento: 'Medicamento',
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

async function openEditCusto(id) {
  if (!_custosCache.length) {
    _custosCache = await SupabaseAPI.getCosts();
  }
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
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── SELECTS DE LOTE ───────────────────────────────────────────────────────────

function populateLotSelects(lots) {
  const selects = [
    '#custo-lot', '#venda-lot',
    '#filter-lote-custo', '#filter-lote-venda',
  ];
  selects.forEach(sel => {
    const el = $(sel);
    if (!el) return;
    const isFilter = sel.startsWith('#filter');
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
    if (data.animal_count) data.animal_count = Number(data.animal_count);
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
    const id = data.id;
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
    const id = data.id;
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

// ── LOGOUT ────────────────────────────────────────────────────────────────────

async function handleLogout() {
  await SupabaseAPI.signOut();
  window.location.href = 'index.html';
}

// ── UTILS ─────────────────────────────────────────────────────────────────────

function setText(selector, value) {
  const el = $(selector);
  if (el) el.textContent = value;
}

function openCreateModal() {
  const modals = { lotes: 'modal-lote', custos: 'modal-custo', vendas: 'modal-venda' };
  const id = modals[currentSection];
  if (id) openModal(id);
}
