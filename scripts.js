/**
 * scripts.js — BovGest completo
 * Gerencia todas as seções: Dashboard, Geral, Operações, Financeiro, Movimentação, Despesas, Bancário, Relatórios
 */

var currentSection = 'dashboard';
var _opCache = [], _cpCache = [], _crCache = [], _movCache = [];

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  Helpers.requireAuth();
  loadUserInfo();
  loadDashboard();
  bindForms();
});

function loadUserInfo() {
  var u = SupabaseAPI.getCurrentUser();
  if (!u) return;
  var name = (u.user_metadata && u.user_metadata.full_name) ? u.user_metadata.full_name : u.email;
  setText('#user-avatar', name.charAt(0).toUpperCase());
  setText('#user-name', name);
  setText('#user-role', (u.user_metadata && u.user_metadata.role) ? u.user_metadata.role : 'usuário');
}

// ── NAVEGAÇÃO ─────────────────────────────────────────────────────────────────
function showSection(name) {
  currentSection = name;
  document.querySelectorAll('[id^="section-"]').forEach(function(s){ s.classList.add('hidden'); });
  var t = document.getElementById('section-' + name);
  if (t) t.classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(function(l){ l.classList.remove('active'); });
  var nl = document.getElementById('nav-' + name);
  if (nl) nl.classList.add('active');
  var titles = { dashboard:'Dashboard', geral:'Demonstrativo Geral', operacoes:'Compras e Vendas',
    financeiro:'Financeiro', movimentacao:'Movimentações', despesas:'Despesas', bancario:'Lançamentos', relatorios:'Relatórios' };
  setText('#page-title', titles[name] || 'BovGest');
  var ab = document.getElementById('action-btn');
  if (ab) {
    var showFor = ['operacoes'];
    ab.style.display = showFor.indexOf(name) >= 0 ? '' : 'none';
    if (name === 'operacoes') ab.textContent = '+ Nova Operação';
  }
  if (name === 'geral')        loadGeral();
  if (name === 'operacoes')    loadOperacoes();
  if (name === 'financeiro')   loadFinanceiro();
  if (name === 'movimentacao') loadMovimentacao();
  if (name === 'despesas')     loadDespesas();
  if (name === 'bancario')     loadBancario();
  if (name === 'relatorios')   loadRelatorios();
}

function openCreateModal() {
  openModal('modal-operacao');
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
async function loadDashboard() {
  try {
    var s = await SupabaseAPI.getDashboardSummary();
    var geral = s.geral || [];
    var ativos = geral.filter(function(r){ return r.compras || r.vendas; });

    // Saldo cards
    var saldos = document.getElementById('dash-saldos');
    if (saldos) saldos.innerHTML = [
      { label:'Lucro Líquido 2025', value: fc(s.totalLucro), cls: s.totalLucro>=0?'green':'red', sub:'Jan–Out 2025' },
      { label:'Compras 2025',       value: fc(s.totalCompras), cls:'red',   sub:'Total investido' },
      { label:'Vendas 2025',        value: fc(s.totalVendas),  cls:'blue',  sub:'Total faturado' },
      { label:'Gado em Estoque',    value: fc(s.valorGado),    cls:'amber', sub: (s.qtGado||0) + ' animais' },
      { label:'Saldo Conta',        value: fc(s.saldoConta),   cls:'green', sub:'Crediarcos' },
      { label:'Saldo Dinheiro',     value: fc(s.saldoCofre),   cls:'blue',  sub:'Cofre' },
      { label:'A Pagar',            value: fc(s.totalAPagar),  cls:'red',   sub:'Pendente' },
      { label:'A Receber',          value: fc(s.totalAReceber),cls:'green', sub:'Pendente' },
    ].map(function(k){
      return '<div class="saldo-card saldo-card--'+k.cls+'"><div class="saldo-card__label">'+k.label+'</div><div class="saldo-card__value">'+k.value+'</div><div style="font-size:.72rem;color:var(--text-muted);margin-top:4px;">'+k.sub+'</div></div>';
    }).join('');

    // Charts
    drawLucroMensal(ativos);
    drawCVMensal(ativos);
    drawDonutDespesas();
    drawQtGado(ativos);
  } catch(e) {
    Helpers.showToast('Erro no dashboard: ' + e.message, 'error');
  }
}

function drawLucroMensal(geral) {
  var svg = document.getElementById('chart-lucro-mensal');
  if (!svg) return;
  var vals = geral.map(function(r){ return r.lucro_liquido || 0; });
  var labels = geral.map(function(r){ return fmesAbrev(r.mes); });
  drawBarChart(svg, vals, labels, function(v){ return v >= 0 ? '#10b981' : '#ef4444'; });
}

function drawCVMensal(geral) {
  var svg = document.getElementById('chart-cv-mensal');
  if (!svg) return;
  var W=400,H=200,pL=8,pR=8,pT=16,pB=36;
  var chartW=W-pL-pR, chartH=H-pT-pB;
  var maxVal = Math.max.apply(null, geral.map(function(r){ return Math.max(r.compras||0, r.vendas||0); }).concat([1]));
  var gw = chartW / geral.length;
  var bw = Math.min(gw*0.3, 22);
  svg.innerHTML = gridLines(W,H,pL,pR,pT,pB);
  geral.forEach(function(r,i){
    var cx  = pL + gw*i + gw/2;
    var mes = fmesAbrev(r.mes);
    var hC  = Math.max(((r.compras||0)/maxVal)*chartH, 2);
    var hV  = Math.max(((r.vendas||0)/maxVal)*chartH,  2);
    var lucro = (r.vendas||0)-(r.compras||0);
    var rC = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rC.setAttribute('x', cx-bw-2); rC.setAttribute('y', pT+chartH-hC);
    rC.setAttribute('width', bw);  rC.setAttribute('height', hC);
    rC.setAttribute('fill','#ef4444'); rC.setAttribute('rx','3'); rC.setAttribute('opacity','.85');
    rC.style.transition = 'opacity .15s';
    rC.addEventListener('mouseenter', function(){ this.setAttribute('opacity','1'); });
    rC.addEventListener('mouseleave', function(){ this.setAttribute('opacity','.85'); });
    _tipHover(rC, '<strong>'+mes+'</strong><br>Compras: <b>'+fc(r.compras)+'</b>');
    svg.appendChild(rC);
    var rV = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rV.setAttribute('x', cx+2);    rV.setAttribute('y', pT+chartH-hV);
    rV.setAttribute('width', bw);  rV.setAttribute('height', hV);
    rV.setAttribute('fill','#10b981'); rV.setAttribute('rx','3'); rV.setAttribute('opacity','.85');
    rV.style.transition = 'opacity .15s';
    rV.addEventListener('mouseenter', function(){ this.setAttribute('opacity','1'); });
    rV.addEventListener('mouseleave', function(){ this.setAttribute('opacity','.85'); });
    _tipHover(rV, '<strong>'+mes+'</strong><br>Vendas: <b>'+fc(r.vendas)+'</b><br>Lucro: <b style="color:'+(lucro>=0?'#10b981':'#ef4444')+'">'+fc(lucro)+'</b>');
    svg.appendChild(rV);
    var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.setAttribute('x', cx); txt.setAttribute('y', H-pB+14);
    txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','8');
    txt.setAttribute('fill','#6b7280'); txt.textContent = mes;
    svg.appendChild(txt);
  });
  svg.innerHTML += legend(pL, H, pB, [{c:'#ef4444',l:'Compras'},{c:'#10b981',l:'Vendas'}]);
}

async function drawDonutDespesas() {
  var svg = document.getElementById('donut-desp');
  var leg = document.getElementById('donut-desp-legend');
  if (!svg || !leg) return;
  var desp = await SupabaseAPI.getDespesas();
  var totals = {};
  desp.forEach(function(d){ totals[d.categoria] = (totals[d.categoria]||0) + (d.valor||0); });
  drawDonut(svg, leg, totals);
}

function drawQtGado(geral) {
  var svg = document.getElementById('chart-qt-gado');
  if (!svg) return;
  var vals = geral.map(function(r){ return r.qt_gado || 0; });
  var labels = geral.map(function(r){ return fmesAbrev(r.mes); });
  drawLineChart(svg, vals, labels, '#f59e0b');
}

// ══════════════════════════════════════════════════════════════════════════════
// DEMONSTRATIVO GERAL
// ══════════════════════════════════════════════════════════════════════════════
async function loadGeral() {
  try {
    var rows = await SupabaseAPI.getGeral();
    var tbody = document.getElementById('tb-geral');
    var tfoot = document.getElementById('tfoot-geral');
    if (!rows || !rows.length) { renderEmpty(tbody, 9); return; }

    var totCompras=0, totVendas=0, totLB=0, totDesp=0, totLL=0;
    tbody.innerHTML = rows.map(function(r){
      totCompras += r.compras||0; totVendas += r.vendas||0;
      totLB += r.lucro_bruto||0; totDesp += r.despesas||0; totLL += r.lucro_liquido||0;
      var ll = r.lucro_liquido||0;
      return '<tr><td class="fw-bold">'+fmesNome(r.mes)+'</td>'+
        '<td class="text-right text-mono">'+fc(r.inicio)+'</td>'+
        '<td class="text-right text-mono text-danger">'+fc(r.compras)+'</td>'+
        '<td class="text-right text-mono text-success">'+fc(r.vendas)+'</td>'+
        '<td class="text-right text-mono">'+fc(r.lucro_bruto)+'</td>'+
        '<td class="text-right text-mono text-danger">'+fc(r.despesas)+'</td>'+
        '<td class="text-right text-mono '+(ll>=0?'lucro-pos':'lucro-neg')+'">'+fc(ll)+'</td>'+
        '<td class="text-right text-mono">'+fc(r.valor_final_gado)+'</td>'+
        '<td class="text-right text-mono">'+(r.qt_gado||'—')+'</td></tr>';
    }).join('');

    tfoot.innerHTML = '<tr style="font-weight:800;background:var(--surface-alt,#f9fafb)">'+
      '<td>TOTAL</td><td></td>'+
      '<td class="text-right text-danger">'+fc(totCompras)+'</td>'+
      '<td class="text-right text-success">'+fc(totVendas)+'</td>'+
      '<td class="text-right">'+fc(totLB)+'</td>'+
      '<td class="text-right text-danger">'+fc(totDesp)+'</td>'+
      '<td class="text-right '+(totLL>=0?'lucro-pos':'lucro-neg')+'">'+fc(totLL)+'</td>'+
      '<td colspan="2"></td></tr>';

    // KPIs
    var kpis = document.getElementById('geral-kpis');
    if (kpis) {
      var ultimo = rows[rows.length-1] || {};
      kpis.innerHTML = [
        { label:'Lucro Líquido Total', value:fc(totLL), cls:totLL>=0?'green':'red' },
        { label:'Total Compras',       value:fc(totCompras), cls:'red' },
        { label:'Total Vendas',        value:fc(totVendas), cls:'blue' },
        { label:'Total Despesas',      value:fc(totDesp), cls:'amber' },
        { label:'Gado Atual',          value:(ultimo.qt_gado||0)+' cab', cls:'green' },
        { label:'Valor Gado',          value:fc(ultimo.valor_final_gado), cls:'amber' },
      ].map(function(k){
        return '<div class="saldo-card saldo-card--'+k.cls+'"><div class="saldo-card__label">'+k.label+'</div><div class="saldo-card__value">'+k.value+'</div></div>';
      }).join('');
    }

    // Situação financeira
    var sf = document.getElementById('sit-financeira');
    if (sf) sf.innerHTML = [
      { l:'Lucro 2025', v:totLL, bold:false },
      { l:'Valor Total Gado', v:-(ultimo_valor(rows)), bold:false },
      { l:'Investimento e Lucro 2023', v:201874.17, bold:false },
      { l:'Situação Financeira', v:totLL+201874.17, bold:true },
    ].map(function(i){
      return '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">'+
        '<span style="'+(i.bold?'font-weight:800':'')+'">'+i.l+'</span>'+
        '<span class="'+(i.v>=0?'text-success':'text-danger')+'" style="font-weight:'+(i.bold?800:600)+';font-family:var(--font-mono)">'+fc(i.v)+'</span></div>';
    }).join('');
  } catch(e) {
    Helpers.showToast('Erro: ' + e.message, 'error');
  }
}

function ultimo_valor(rows) {
  for (var i = rows.length-1; i>=0; i--) {
    if (rows[i].valor_final_gado) return rows[i].valor_final_gado;
  }
  return 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// OPERAÇÕES (Compras e Vendas)
// ══════════════════════════════════════════════════════════════════════════════
async function loadOperacoes() {
  try {
    var mes  = (document.getElementById('filter-op-mes')  || {}).value || '';
    var forn = (document.getElementById('filter-op-forn') || {}).value || '';
    var comp = (document.getElementById('filter-op-comp') || {}).value || '';
    var ref  = (document.getElementById('filter-op-ref')  || {}).value || '';
    var ops  = await SupabaseAPI.getOperacoes({ mes:mes, fornecedor:forn, comprador:comp, referencia:ref });
    _opCache = ops;
    var tbody = document.getElementById('tb-operacoes');
    var tfoot = document.getElementById('tfoot-operacoes');
    if (!ops || !ops.length) { renderEmpty(tbody, 12); tfoot.innerHTML=''; return; }

    var totC=0, totV=0, totL=0;
    tbody.innerHTML = ops.map(function(o){
      var lb = o.lucro_bruto || 0;
      totC += o.total_compra||0; totV += o.total_venda||0; totL += lb;
      return '<tr>'+
        '<td class="text-mono">'+(o.data_compra ? fd(o.data_compra) : '—')+'</td>'+
        '<td class="text-mono text-center">'+(o.qtd||'—')+'</td>'+
        '<td><span class="badge badge--gray" style="font-size:.72rem">'+(o.referencia||'—')+'</span></td>'+
        '<td>'+(o.fornecedor||'—')+'</td>'+
        '<td class="text-right text-mono">'+fc(o.valor_un)+'</td>'+
        '<td class="text-right text-mono text-danger fw-bold">'+fc(o.total_compra)+'</td>'+
        '<td class="text-mono">'+(o.data_venda ? fd(o.data_venda) : '—')+'</td>'+
        '<td>'+(o.comprador||'—')+'</td>'+
        '<td class="text-right text-mono text-success fw-bold">'+fc(o.total_venda)+'</td>'+
        '<td class="text-right text-mono">'+(o.dias_pasto !== null && o.dias_pasto !== undefined ? o.dias_pasto : '—')+'</td>'+
        '<td class="text-right text-mono '+(lb>=0?'lucro-pos':'lucro-neg')+'">'+fc(lb)+'</td>'+
        '<td>'+
          '<button class="btn btn-ghost btn-sm btn-icon" onclick="editOp(\''+o.id+'\')">✏️</button>'+
          '<button class="btn btn-ghost btn-sm btn-icon" onclick="delOp(\''+o.id+'\')">🗑️</button>'+
        '</td></tr>';
    }).join('');

    tfoot.innerHTML = '<tr style="font-weight:800;background:var(--surface-alt,#f9fafb)">'+
      '<td colspan="5">TOTAL ('+ops.length+' operações)</td>'+
      '<td class="text-right text-danger">'+fc(totC)+'</td>'+
      '<td colspan="2"></td>'+
      '<td class="text-right text-success">'+fc(totV)+'</td>'+
      '<td></td>'+
      '<td class="text-right '+(totL>=0?'lucro-pos':'lucro-neg')+'">'+fc(totL)+'</td>'+
      '<td></td></tr>';
  } catch(e) {
    Helpers.showToast('Erro: ' + e.message, 'error');
  }
}

function clearFiltersOp() {
  ['filter-op-mes','filter-op-forn','filter-op-comp','filter-op-ref'].forEach(function(id){
    var el = document.getElementById(id); if (el) el.value = '';
  });
  loadOperacoes();
}

function editOp(id) {
  var o = _opCache.find(function(r){ return r.id === id; });
  if (!o) return;
  document.getElementById('modal-op-title').textContent = 'Editar Operação';
  document.getElementById('op-id').value           = o.id;
  document.getElementById('op-data-compra').value  = o.data_compra || '';
  document.getElementById('op-qtd').value           = o.qtd || '';
  document.getElementById('op-ref').value           = o.referencia || '';
  document.getElementById('op-fornecedor').value    = o.fornecedor || '';
  document.getElementById('op-valor-un').value      = o.valor_un || '';
  document.getElementById('op-total-compra').value  = o.total_compra || '';
  document.getElementById('op-data-venda').value    = o.data_venda || '';
  document.getElementById('op-qtd-venda').value     = o.qtd_venda || '';
  document.getElementById('op-valor-venda').value   = o.valor_venda_un || '';
  document.getElementById('op-comprador').value     = o.comprador || '';
  document.getElementById('op-total-venda').value   = o.total_venda || '';
  document.getElementById('op-dias').value          = o.dias_pasto || '';
  openModal('modal-operacao');
}

async function delOp(id) {
  if (!confirm('Excluir esta operação?')) return;
  try { await SupabaseAPI.deleteOperacao(id); Helpers.showToast('Removido.','success'); loadOperacoes(); }
  catch(e) { Helpers.showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// FINANCEIRO
// ══════════════════════════════════════════════════════════════════════════════
async function loadFinanceiro() {
  try {
    var mes = (document.getElementById('filter-fin-mes') || {}).value || '';
    var sit = (document.getElementById('filter-fin-sit') || {}).value || '';
    var f = {};
    if (mes) f.mes = mes;
    if (sit) f.situacao = sit;

    var cp = await SupabaseAPI.getContasPagar(f);
    var cr = await SupabaseAPI.getContasReceber(f);
    _cpCache = cp; _crCache = cr;

    // Totais
    var totCP = cp.reduce(function(s,r){ return s+(r.valor||0); }, 0);
    var totCR = cr.reduce(function(s,r){ return s+(r.valor||0); }, 0);
    var pendCP = cp.filter(function(r){ return r.situacao !== 'OK'; }).reduce(function(s,r){ return s+(r.valor||0); }, 0);
    var pendCR = cr.filter(function(r){ return r.situacao !== 'OK'; }).reduce(function(s,r){ return s+(r.valor||0); }, 0);
    var el = document.getElementById('fin-totais');
    if (el) el.innerHTML = [
      { label:'Total a Pagar',    value:fc(totCP),  cls:'red'   },
      { label:'Total a Receber',  value:fc(totCR),  cls:'green' },
      { label:'Pendente Pagar',   value:fc(pendCP), cls:'amber' },
      { label:'Pendente Receber', value:fc(pendCR), cls:'blue'  },
    ].map(function(k){
      return '<div class="saldo-card saldo-card--'+k.cls+'"><div class="saldo-card__label">'+k.label+'</div><div class="saldo-card__value">'+k.value+'</div></div>';
    }).join('');

    // Tabela Contas a Pagar
    var tbCP = document.getElementById('tb-cp');
    if (!cp.length) { renderEmpty(tbCP, 7); }
    else tbCP.innerHTML = cp.map(function(r){
      return '<tr>'+
        '<td class="text-mono">'+(r.ref ? fd(r.ref) : '—')+'</td>'+
        '<td class="text-mono">'+(r.data_pgto ? fd(r.data_pgto) : '—')+'</td>'+
        '<td class="text-right text-mono fw-bold text-danger">'+fc(r.valor)+'</td>'+
        '<td><span class="badge badge--gray" style="font-size:.7rem">'+(r.forma_pg||'—')+'</span></td>'+
        '<td>'+(r.referencia||'—')+'</td>'+
        '<td>'+sitBadge(r.situacao)+'</td>'+
        '<td><button class="btn btn-ghost btn-xs" onclick="delCP(\''+r.id+'\')">🗑️</button></td></tr>';
    }).join('');

    // Tabela Contas a Receber
    var tbCR = document.getElementById('tb-cr');
    if (!cr.length) { renderEmpty(tbCR, 7); }
    else tbCR.innerHTML = cr.map(function(r){
      return '<tr>'+
        '<td class="text-mono">'+(r.ref ? fd(r.ref) : '—')+'</td>'+
        '<td class="text-mono">'+(r.data_recb ? fd(r.data_recb) : '—')+'</td>'+
        '<td class="text-right text-mono fw-bold text-success">'+fc(r.valor)+'</td>'+
        '<td><span class="badge badge--gray" style="font-size:.7rem">'+(r.forma_pg||'—')+'</span></td>'+
        '<td>'+(r.referencia||'—')+'</td>'+
        '<td>'+sitBadge(r.situacao)+'</td>'+
        '<td><button class="btn btn-ghost btn-xs" onclick="delCR(\''+r.id+'\')">🗑️</button></td></tr>';
    }).join('');
  } catch(e) {
    Helpers.showToast('Erro: ' + e.message, 'error');
  }
}

async function delCP(id) {
  if (!confirm('Excluir?')) return;
  try { await SupabaseAPI.deleteContaPagar(id); Helpers.showToast('Removido.','success'); loadFinanceiro(); }
  catch(e) { Helpers.showToast(e.message,'error'); }
}
async function delCR(id) {
  if (!confirm('Excluir?')) return;
  try { await SupabaseAPI.deleteContaReceber(id); Helpers.showToast('Removido.','success'); loadFinanceiro(); }
  catch(e) { Helpers.showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// MOVIMENTAÇÕES
// ══════════════════════════════════════════════════════════════════════════════
async function loadMovimentacao() {
  try {
    var mes   = (document.getElementById('filter-mov-mes')   || {}).value || '';
    var conta = (document.getElementById('filter-mov-conta') || {}).value || '';
    var tipo  = (document.getElementById('filter-mov-tipo')  || {}).value || '';
    var f = {};
    if (mes)   f.mes = mes;
    if (conta) f.conta = conta;
    if (tipo)  f.identificacao = tipo;

    var movs = await SupabaseAPI.getMovimentacoes(f);
    _movCache = movs;

    var totalEntradas = movs.filter(function(r){ return r.valor > 0; }).reduce(function(s,r){ return s+r.valor; }, 0);
    var totalSaidas   = movs.filter(function(r){ return r.valor < 0; }).reduce(function(s,r){ return s+r.valor; }, 0);
    var saldo = totalEntradas + totalSaidas;

    var el = document.getElementById('mov-totais');
    if (el) el.innerHTML = [
      { label:'Entradas', value:fc(totalEntradas), cls:'green' },
      { label:'Saídas',   value:fc(Math.abs(totalSaidas)), cls:'red' },
      { label:'Saldo',    value:fc(saldo), cls:saldo>=0?'green':'red' },
      { label:'Lançamentos', value:movs.length+' reg', cls:'blue' },
    ].map(function(k){
      return '<div class="saldo-card saldo-card--'+k.cls+'"><div class="saldo-card__label">'+k.label+'</div><div class="saldo-card__value">'+k.value+'</div></div>';
    }).join('');

    var tbody = document.getElementById('tb-mov');
    var tfoot = document.getElementById('tfoot-mov');
    if (!movs.length) { renderEmpty(tbody, 7); tfoot.innerHTML=''; return; }

    tbody.innerHTML = movs.map(function(r){
      var cls = r.valor >= 0 ? 'mov-entrada' : 'mov-saida';
      var contaAbrev = r.conta && r.conta.includes('Crediarcos') ? 'Crediarcos' : (r.conta||'—');
      return '<tr>'+
        '<td class="text-mono">'+(r.data ? fd(r.data) : '—')+'</td>'+
        '<td class="text-right text-mono fw-bold '+cls+'">'+fc(r.valor)+'</td>'+
        '<td>'+(r.referencia||'—')+'</td>'+
        '<td><span class="badge badge--gray" style="font-size:.7rem">'+(r.identificacao||'—')+'</span></td>'+
        '<td style="font-size:.8rem">'+contaAbrev+'</td>'+
        '<td style="font-size:.8rem;color:var(--text-muted)">'+(r.observacao||'')+'</td>'+
        '<td><button class="btn btn-ghost btn-xs" onclick="delMov(\''+r.id+'\')">🗑️</button></td></tr>';
    }).join('');

    tfoot.innerHTML = '<tr style="font-weight:800;background:var(--surface-alt,#f9fafb)">'+
      '<td>SALDO</td>'+
      '<td class="text-right '+(saldo>=0?'text-success':'text-danger')+'">'+fc(saldo)+'</td>'+
      '<td colspan="5"></td></tr>';
  } catch(e) {
    Helpers.showToast('Erro: ' + e.message, 'error');
  }
}

async function delMov(id) {
  if (!confirm('Excluir?')) return;
  try { await SupabaseAPI.deleteMovimentacao(id); Helpers.showToast('Removido.','success'); loadMovimentacao(); }
  catch(e) { Helpers.showToast(e.message,'error'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// DESPESAS
// ══════════════════════════════════════════════════════════════════════════════
async function loadDespesas() {
  try {
    var desp = await SupabaseAPI.getDespesas();
    var meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

    // Agrupar por categoria
    var cats = {};
    desp.forEach(function(d){
      if (!cats[d.categoria]) cats[d.categoria] = {};
      cats[d.categoria][d.mes_num] = (cats[d.categoria][d.mes_num]||0) + (d.valor||0);
    });

    // Totais por mês
    var totMes = {};
    for (var mn = 1; mn <= 12; mn++) totMes[mn] = 0;
    desp.forEach(function(d){ totMes[d.mes_num] = (totMes[d.mes_num]||0) + (d.valor||0); });

    var thead = document.getElementById('desp-thead');
    var tbody = document.getElementById('desp-tbody');
    var tfoot = document.getElementById('desp-tfoot');

    thead.innerHTML = '<tr><th style="min-width:180px">Categoria</th>' +
      meses.map(function(m,i){ return '<th class="text-right" style="min-width:80px">'+m.substr(0,3)+'</th>'; }).join('') +
      '<th class="text-right" style="min-width:90px">TOTAL</th></tr>';

    var catList = Object.keys(cats).sort();
    tbody.innerHTML = catList.map(function(cat){
      var total = 0;
      var cols = '';
      for (var mn=1; mn<=12; mn++) {
        var v = cats[cat][mn] || 0;
        total += v;
        cols += '<td class="text-right text-mono" style="font-size:.8rem">'+(v > 0 ? fc(v) : '<span style="color:var(--text-muted)">—</span>')+'</td>';
      }
      return '<tr><td style="font-size:.82rem;font-weight:600">'+cat+'</td>'+cols+
        '<td class="text-right text-mono fw-bold" style="font-size:.82rem">'+fc(total)+'</td></tr>';
    }).join('');

    tfoot.innerHTML = '<tr style="font-weight:800;background:var(--surface-alt,#f9fafb)"><td>TOTAL MENSAL</td>' +
      [1,2,3,4,5,6,7,8,9,10,11,12].map(function(mn){
        return '<td class="text-right text-mono text-danger">'+fc(totMes[mn])+'</td>';
      }).join('') +
      '<td class="text-right text-mono text-danger fw-bold">'+fc(Object.values(totMes).reduce(function(a,b){return a+b;},0))+'</td></tr>';
  } catch(e) {
    Helpers.showToast('Erro: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BANCÁRIO
// ══════════════════════════════════════════════════════════════════════════════
async function loadBancario() {
  try {
    var conta = await SupabaseAPI.getLancamentosConta();
    var cofre = await SupabaseAPI.getLancamentosCofre();

    function renderBanco(tbodyId, rows) {
      var tbody = document.getElementById(tbodyId);
      if (!rows || !rows.length) { renderEmpty(tbody, 5); return; }
      tbody.innerHTML = rows.map(function(r){
        var sf = r.saldo_final || 0;
        return '<tr>'+
          '<td class="fw-bold">'+fmesNome(r.mes)+'</td>'+
          '<td class="text-right text-mono">'+fc(r.saldo_inicial)+'</td>'+
          '<td class="text-right text-mono text-danger">'+fc(r.debitos)+'</td>'+
          '<td class="text-right text-mono text-success">'+fc(r.creditos)+'</td>'+
          '<td class="text-right text-mono fw-bold '+(sf>=0?'lucro-pos':'lucro-neg')+'">'+fc(sf)+'</td></tr>';
      }).join('');
    }
    renderBanco('tb-banco', conta);
    renderBanco('tb-cofre', cofre);
  } catch(e) {
    Helpers.showToast('Erro: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS
// ══════════════════════════════════════════════════════════════════════════════
async function loadRelatorios() {
  try {
    var geral = await SupabaseAPI.getGeral();
    var ops   = await SupabaseAPI.getOperacoes();
    var desp  = await SupabaseAPI.getDespesas();

    var ativos = geral.filter(function(r){ return r.compras || r.vendas; });
    var totLL   = ativos.reduce(function(s,r){ return s+(r.lucro_liquido||0); }, 0);
    var totV    = ativos.reduce(function(s,r){ return s+(r.vendas||0); }, 0);
    var totC    = ativos.reduce(function(s,r){ return s+(r.compras||0); }, 0);
    var totD    = ativos.reduce(function(s,r){ return s+(r.despesas||0); }, 0);
    var margem  = totV > 0 ? ((totLL/totV)*100).toFixed(1) : 0;
    var totAnimais = ops.reduce(function(s,r){ return s+(r.qtd||0); }, 0);
    var lucroAnim  = totAnimais > 0 ? totLL/totAnimais : 0;

    var kpis = document.getElementById('rel-kpis');
    if (kpis) kpis.innerHTML = [
      { label:'Margem de Lucro',  value:margem+'%',  sub:'Lucro/Receita' },
      { label:'Lucro por Animal', value:fc(lucroAnim), sub:'Média do rebanho' },
      { label:'Receita Total',    value:fc(totV), sub:'Todas as vendas' },
      { label:'Total Despesas',   value:fc(totD), sub:'Custos operacionais' },
    ].map(function(k){
      return '<div class="kpi-card"><div class="kpi-card__label">'+k.label+'</div>'+
        '<div class="kpi-card__value">'+k.value+'</div>'+
        '<div class="kpi-card__sub">'+k.sub+'</div></div>';
    }).join('');

    // Gráfico resultado mensal
    var svgM = document.getElementById('rel-bar-mensal');
    if (svgM) {
      var W=400,H=200,pL=8,pR=8,pT=16,pB=28;
      var chartW=W-pL-pR, chartH=H-pT-pB;
      var maxVal = Math.max.apply(null, ativos.map(function(r){ return Math.max(r.compras||0, r.vendas||0); }).concat([1]));
      var gw = chartW/ativos.length;
      var bw = Math.min(gw*0.22, 16);
      svgM.innerHTML = gridLines(W,H,pL,pR,pT,pB);
      ativos.forEach(function(r,i){
        var cx  = pL+gw*i+gw/2;
        var mes = fmesAbrev(r.mes);
        var ll  = r.lucro_liquido||0;
        var hC = Math.max(((r.compras||0)/maxVal)*chartH,2);
        var hV = Math.max(((r.vendas||0)/maxVal)*chartH,2);
        var hL = Math.max((Math.abs(ll)/maxVal)*chartH,2);
        function mkRect(x,h,color,tip){
          var el=document.createElementNS('http://www.w3.org/2000/svg','rect');
          el.setAttribute('x',x); el.setAttribute('y',pT+chartH-h);
          el.setAttribute('width',bw); el.setAttribute('height',h);
          el.setAttribute('fill',color); el.setAttribute('rx','2'); el.setAttribute('opacity','.82');
          el.style.transition='opacity .15s';
          el.addEventListener('mouseenter',function(){this.setAttribute('opacity','1');});
          el.addEventListener('mouseleave',function(){this.setAttribute('opacity','.82');});
          _tipHover(el,'<strong>'+mes+'</strong><br>'+tip);
          svgM.appendChild(el);
        }
        mkRect(cx-bw*1.6, hC, '#ef4444', 'Compras: <b>'+fc(r.compras)+'</b>');
        mkRect(cx-bw*0.1, hV, '#10b981', 'Vendas: <b>'+fc(r.vendas)+'</b>');
        mkRect(cx+bw*1.4,  hL, ll>=0?'#3b82f6':'#f97316', 'Lucro Líquido: <b>'+fc(ll)+'</b>');
        var txt=document.createElementNS('http://www.w3.org/2000/svg','text');
        txt.setAttribute('x',cx); txt.setAttribute('y',H-pB+14);
        txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','8');
        txt.setAttribute('fill','#6b7280'); txt.textContent=mes;
        svgM.appendChild(txt);
      });
      svgM.innerHTML += legend(pL,H,pB,[{c:'#ef4444',l:'Compras'},{c:'#10b981',l:'Vendas'},{c:'#3b82f6',l:'Lucro'}]);
    }

        // Donut tipos de animal
    var svgT = document.getElementById('rel-donut-tipo');
    var legT = document.getElementById('rel-donut-tipo-legend');
    if (svgT && legT) {
      var tipos = {};
      ops.forEach(function(o){ var t = o.referencia||'Outros'; tipos[t]=(tipos[t]||0)+(o.qtd||0); });
      drawDonut(svgT, legT, tipos);
    }

    // Linha despesas por mês
    var svgD = document.getElementById('rel-line-desp');
    if (svgD) {
      var vals = ativos.map(function(r){ return r.despesas||0; });
      var labs = ativos.map(function(r){ return fmesAbrev(r.mes); });
      drawLineChart(svgD, vals, labs, '#8b5cf6');
    }

    // Bar fornecedores
    var svgF = document.getElementById('rel-bar-forn');
    if (svgF) {
      var fornMap = {};
      ops.forEach(function(o){ if(o.fornecedor) fornMap[o.fornecedor]=(fornMap[o.fornecedor]||0)+(o.total_compra||0); });
      var top = Object.entries(fornMap).sort(function(a,b){ return b[1]-a[1]; }).slice(0,8);
      var W=400,H=200,pL=8,pR=8,pT=16,pB=42;
      var chartW=W-pL-pR, chartH=H-pT-pB;
      var maxV = top[0] ? top[0][1] : 1;
      var bw = Math.min((chartW/top.length)*0.6, 36);
      svgF.innerHTML = gridLines(W,H,pL,pR,pT,pB);
      top.forEach(function(e,i){
        var cx = pL+(chartW/top.length)*i+(chartW/top.length/2);
        var bh = Math.max((e[1]/maxV)*chartH, 2);
        var rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
        rect.setAttribute('x', cx-bw/2); rect.setAttribute('y', pT+chartH-bh);
        rect.setAttribute('width', bw);  rect.setAttribute('height', bh);
        rect.setAttribute('fill','#3b82f6'); rect.setAttribute('rx','3'); rect.setAttribute('opacity','.85');
        rect.style.transition = 'opacity .15s';
        rect.addEventListener('mouseenter', function(){ this.setAttribute('opacity','1'); });
        rect.addEventListener('mouseleave', function(){ this.setAttribute('opacity','.85'); });
        _tipHover(rect, '<strong>'+e[0]+'</strong><br>Volume: <b>'+fc(e[1])+'</b>');
        svgF.appendChild(rect);
        var label = e[0].length>10 ? e[0].substr(0,9)+'…' : e[0];
        var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
        txt.setAttribute('x', cx); txt.setAttribute('y', H-pB+14);
        txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','7');
        txt.setAttribute('fill','#6b7280'); txt.textContent = label;
        svgF.appendChild(txt);
      });
    }
  
  } catch(e) {
    Helpers.showToast('Erro: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// BIND FORMS
// ══════════════════════════════════════════════════════════════════════════════
function bindForms() {
  // Operação
  var fOp = document.getElementById('form-operacao');
  if (fOp) fOp.addEventListener('submit', async function(e){
    e.preventDefault();
    var id = document.getElementById('op-id').value;
    var data = {
      data_compra:    document.getElementById('op-data-compra').value || null,
      qtd:            +document.getElementById('op-qtd').value,
      referencia:     document.getElementById('op-ref').value,
      fornecedor:     document.getElementById('op-fornecedor').value,
      valor_un:       +document.getElementById('op-valor-un').value || null,
      total_compra:   +document.getElementById('op-total-compra').value || null,
      data_venda:     document.getElementById('op-data-venda').value || null,
      qtd_venda:      +document.getElementById('op-qtd-venda').value || null,
      valor_venda_un: +document.getElementById('op-valor-venda').value || null,
      comprador:      document.getElementById('op-comprador').value,
      total_venda:    +document.getElementById('op-total-venda').value || null,
      dias_pasto:     +document.getElementById('op-dias').value || null,
    };
    data.lucro_bruto = (data.total_venda||0) - (data.total_compra||0);
    try {
      if (id) await SupabaseAPI.updateOperacao(id, data);
      else    await SupabaseAPI.insertOperacao(data);
      Helpers.showToast('Salvo!','success');
      closeModal('modal-operacao');
      e.target.reset();
      document.getElementById('op-id').value = '';
      document.getElementById('modal-op-title').textContent = 'Nova Operação';
      if (currentSection === 'operacoes') loadOperacoes();
    } catch(err) { Helpers.showToast(err.message,'error'); }
  });

  // Conta a Pagar
  var fCP = document.getElementById('form-cp');
  if (fCP) fCP.addEventListener('submit', async function(e){
    e.preventDefault();
    var id = document.getElementById('cp-id').value;
    var data = {
      ref:        document.getElementById('cp-ref').value || null,
      data_pgto:  document.getElementById('cp-data').value || null,
      valor:      +document.getElementById('cp-valor').value,
      forma_pg:   document.getElementById('cp-forma').value,
      referencia: document.getElementById('cp-referencia').value,
      situacao:   document.getElementById('cp-situacao').value,
      pago:       document.getElementById('cp-situacao').value === 'OK' ? +document.getElementById('cp-valor').value : 0,
    };
    try {
      if (id) await SupabaseAPI.updateContaPagar(id, data);
      else    await SupabaseAPI.insertContaPagar(data);
      Helpers.showToast('Salvo!','success'); closeModal('modal-cp'); e.target.reset();
      document.getElementById('cp-id').value = '';
      if (currentSection === 'financeiro') loadFinanceiro();
    } catch(err) { Helpers.showToast(err.message,'error'); }
  });

  // Conta a Receber
  var fCR = document.getElementById('form-cr');
  if (fCR) fCR.addEventListener('submit', async function(e){
    e.preventDefault();
    var id = document.getElementById('cr-id').value;
    var data = {
      ref:        document.getElementById('cr-ref').value || null,
      data_recb:  document.getElementById('cr-data').value || null,
      valor:      +document.getElementById('cr-valor').value,
      forma_pg:   document.getElementById('cr-forma').value,
      referencia: document.getElementById('cr-referencia').value,
      situacao:   document.getElementById('cr-situacao').value,
      recebido:   document.getElementById('cr-situacao').value === 'OK' ? +document.getElementById('cr-valor').value : 0,
    };
    try {
      if (id) await SupabaseAPI.updateContaReceber(id, data);
      else    await SupabaseAPI.insertContaReceber(data);
      Helpers.showToast('Salvo!','success'); closeModal('modal-cr'); e.target.reset();
      document.getElementById('cr-id').value = '';
      if (currentSection === 'financeiro') loadFinanceiro();
    } catch(err) { Helpers.showToast(err.message,'error'); }
  });

  // Movimentação
  var fMov = document.getElementById('form-mov');
  if (fMov) fMov.addEventListener('submit', async function(e){
    e.preventDefault();
    var data = {
      data:          document.getElementById('mov-data').value,
      valor:         +document.getElementById('mov-valor').value,
      referencia:    document.getElementById('mov-ref').value,
      identificacao: document.getElementById('mov-ident').value,
      conta:         document.getElementById('mov-conta').value,
      observacao:    document.getElementById('mov-obs').value,
    };
    try {
      await SupabaseAPI.insertMovimentacao(data);
      Helpers.showToast('Lançado!','success'); closeModal('modal-mov'); e.target.reset();
      if (currentSection === 'movimentacao') loadMovimentacao();
    } catch(err) { Helpers.showToast(err.message,'error'); }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CHART HELPERS
// ══════════════════════════════════════════════════════════════════════════════
// ── TOOLTIP GLOBAL ────────────────────────────────────────────────────────────
(function() {
  if (document.getElementById('chart-tooltip')) return;
  var tip = document.createElement('div');
  tip.id = 'chart-tooltip';
  tip.style.cssText = [
    'position:fixed','z-index:9999','pointer-events:none','opacity:0',
    'background:rgba(17,24,39,.92)','color:#f9fafb','font-size:.78rem',
    'font-family:var(--font-mono,monospace)','padding:7px 11px',
    'border-radius:7px','box-shadow:0 4px 16px rgba(0,0,0,.25)',
    'transition:opacity .12s','white-space:nowrap','max-width:220px',
    'line-height:1.5'
  ].join(';');
  document.body.appendChild(tip);
  document.addEventListener('mousemove', function(e){
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top  = (e.clientY - 36) + 'px';
  });
  window._chartTip = {
    show: function(html) { tip.innerHTML = html; tip.style.opacity = '1'; },
    hide: function()     { tip.style.opacity = '0'; },
  };
})();

function _tipHover(el, html) {
  el.style.cursor = 'pointer';
  el.addEventListener('mouseenter', function(){ window._chartTip.show(html); });
  el.addEventListener('mouseleave', function(){ window._chartTip.hide(); });
}

function drawBarChart(svg, vals, labels, colorFn) {
  var W=400,H=200,pL=8,pR=8,pT=16,pB=28;
  var chartW=W-pL-pR, chartH=H-pT-pB;
  var maxVal = Math.max.apply(null, vals.map(Math.abs).concat([1]));
  var bw = Math.min((chartW/vals.length)*0.6, 32);
  svg.innerHTML = gridLines(W,H,pL,pR,pT,pB);

  vals.forEach(function(v,i){
    var cx = pL+(chartW/vals.length)*i+(chartW/vals.length/2);
    var bh = Math.max((Math.abs(v)/maxVal)*chartH, 2);
    var color = typeof colorFn === 'function' ? colorFn(v) : colorFn;

    // Barra
    var rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('x',     cx - bw/2);
    rect.setAttribute('y',     pT + chartH - bh);
    rect.setAttribute('width', bw);
    rect.setAttribute('height',bh);
    rect.setAttribute('fill',  color);
    rect.setAttribute('rx',    '3');
    rect.setAttribute('opacity','0.85');
    rect.style.transition = 'opacity .15s';
    rect.addEventListener('mouseenter', function(){ this.setAttribute('opacity','1'); });
    rect.addEventListener('mouseleave', function(){ this.setAttribute('opacity','0.85'); });
    _tipHover(rect, '<strong>'+(labels[i]||'')+'</strong><br>'+fc(v));
    svg.appendChild(rect);

    // Label eixo X
    var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.setAttribute('x', cx);
    txt.setAttribute('y', H - pB + 14);
    txt.setAttribute('text-anchor','middle');
    txt.setAttribute('font-size','8');
    txt.setAttribute('fill','#6b7280');
    txt.textContent = labels[i] || '';
    svg.appendChild(txt);

    // Valor acima da barra (só se >= 4px)
    if (bh >= 14) {
      var vl = document.createElementNS('http://www.w3.org/2000/svg','text');
      vl.setAttribute('x', cx);
      vl.setAttribute('y', pT + chartH - bh - 3);
      vl.setAttribute('text-anchor','middle');
      vl.setAttribute('font-size','7');
      vl.setAttribute('fill', color);
      vl.setAttribute('font-weight','700');
      vl.setAttribute('opacity','0');
      vl.textContent = fcShort(v);
      vl.style.transition = 'opacity .15s';
      rect.addEventListener('mouseenter', function(){ vl.setAttribute('opacity','1'); });
      rect.addEventListener('mouseleave', function(){ vl.setAttribute('opacity','0'); });
      svg.appendChild(vl);
    }
  });
}

function drawLineChart(svg, vals, labels, color) {
  var W=400,H=200,pL=40,pR=12,pT=16,pB=28;
  var chartW=W-pL-pR, chartH=H-pT-pB;
  var maxVal = Math.max.apply(null, vals.concat([1]));
  svg.innerHTML = gridLines(W,H,pL,pR,pT,pB);

  var pts = vals.map(function(v,i){
    return { x: pL+(i/(vals.length-1||1))*chartW, y: pT+chartH*(1-v/maxVal), v:v, l:labels[i] };
  });

  if (pts.length > 1) {
    var area = document.createElementNS('http://www.w3.org/2000/svg','path');
    var areaD = 'M'+pts[0].x+','+(pT+chartH)+' '+pts.map(function(p){ return 'L'+p.x+','+p.y; }).join(' ')+' L'+pts[pts.length-1].x+','+(pT+chartH)+' Z';
    area.setAttribute('d', areaD);
    area.setAttribute('fill', color);
    area.setAttribute('opacity', '0.12');
    svg.appendChild(area);

    var line = document.createElementNS('http://www.w3.org/2000/svg','path');
    line.setAttribute('d', pts.map(function(p,i){ return (i===0?'M':'L')+p.x+','+p.y; }).join(' '));
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(line);
  }

  pts.forEach(function(p){
    // Área de hover invisível (maior que o círculo)
    var hit = document.createElementNS('http://www.w3.org/2000/svg','circle');
    hit.setAttribute('cx', p.x); hit.setAttribute('cy', p.y);
    hit.setAttribute('r', '12'); hit.setAttribute('fill', 'transparent');
    _tipHover(hit, '<strong>'+p.l+'</strong><br>'+fc(p.v));
    svg.appendChild(hit);

    var circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx', p.x); circle.setAttribute('cy', p.y);
    circle.setAttribute('r', '4'); circle.setAttribute('fill', color);
    circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '2');
    circle.style.transition = 'r .15s';
    hit.addEventListener('mouseenter', function(){ circle.setAttribute('r','6'); });
    hit.addEventListener('mouseleave', function(){ circle.setAttribute('r','4'); });
    svg.appendChild(circle);

    var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.setAttribute('x', p.x); txt.setAttribute('y', p.y - 10);
    txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-size','7');
    txt.setAttribute('fill', color); txt.setAttribute('font-weight','700');
    txt.setAttribute('opacity','0');
    txt.textContent = fcShort(p.v);
    txt.style.transition = 'opacity .15s';
    hit.addEventListener('mouseenter', function(){ txt.setAttribute('opacity','1'); });
    hit.addEventListener('mouseleave', function(){ txt.setAttribute('opacity','0'); });
    svg.appendChild(txt);

    var lbl = document.createElementNS('http://www.w3.org/2000/svg','text');
    lbl.setAttribute('x', p.x); lbl.setAttribute('y', H - pB + 14);
    lbl.setAttribute('text-anchor','middle'); lbl.setAttribute('font-size','9');
    lbl.setAttribute('fill','#6b7280');
    lbl.textContent = p.l;
    svg.appendChild(lbl);
  });
}

function drawDonut(svg, leg, totals) {
  var entries = Object.entries(totals).sort(function(a,b){ return b[1]-a[1]; }).slice(0,7);
  var total = entries.reduce(function(s,e){ return s+e[1]; }, 0);
  var colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];
  var CX=75, CY=75, R=65, Ri=32;
  svg.innerHTML = '';
  if (!total) {
    var nt = document.createElementNS('http://www.w3.org/2000/svg','text');
    nt.setAttribute('x','75'); nt.setAttribute('y','80'); nt.setAttribute('text-anchor','middle');
    nt.setAttribute('font-size','11'); nt.setAttribute('fill','#9ca3af');
    nt.textContent = 'Sem dados'; svg.appendChild(nt); leg.innerHTML=''; return;
  }
  var start = -Math.PI/2;
  entries.forEach(function(e,i){
    var angle = (e[1]/total)*2*Math.PI;
    var end   = start + angle;
    var x1=CX+R*Math.cos(start),  y1=CY+R*Math.sin(start);
    var x2=CX+R*Math.cos(end),    y2=CY+R*Math.sin(end);
    var xi1=CX+Ri*Math.cos(start),yi1=CY+Ri*Math.sin(start);
    var xi2=CX+Ri*Math.cos(end),  yi2=CY+Ri*Math.sin(end);
    var lg = angle > Math.PI ? 1 : 0;
    var col = colors[i % colors.length];
    var pct = ((e[1]/total)*100).toFixed(1);
    var d = 'M'+xi1+','+yi1+' L'+x1+','+y1+' A'+R+','+R+' 0 '+lg+',1 '+x2+','+y2+' L'+xi2+','+yi2+' A'+Ri+','+Ri+' 0 '+lg+',0 '+xi1+','+yi1;
    var path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', d);
    path.setAttribute('fill', col);
    path.setAttribute('opacity', '0.9');
    path.style.transition = 'transform .15s, opacity .15s';
    path.style.transformOrigin = CX+'px '+CY+'px';
    path.addEventListener('mouseenter', function(){
      this.style.transform = 'scale(1.06)';
      this.setAttribute('opacity','1');
      window._chartTip.show('<strong>'+e[0]+'</strong><br>'+fc(e[1])+'<br><span style="color:#9ca3af">'+pct+'% do total</span>');
    });
    path.addEventListener('mouseleave', function(){
      this.style.transform = 'scale(1)';
      this.setAttribute('opacity','0.9');
      window._chartTip.hide();
    });
    svg.appendChild(path);
    start = end;
  });

  leg.innerHTML = entries.map(function(e,i){
    var pct = ((e[1]/total)*100).toFixed(0);
    var label = e[0].length>16 ? e[0].substr(0,15)+'…' : e[0];
    return '<div class="legend-item"><div class="legend-dot" style="background:'+colors[i%colors.length]+'"></div>'+
      '<span style="color:var(--text-muted);flex:1" title="'+e[0]+'">'+label+'</span>'+
      '<strong style="padding-left:6px">'+pct+'%</strong></div>';
  }).join('');
}

// Valor compacto para labels dentro do gráfico (ex: R$81,4K)
function fcShort(v) {
  if (!v && v !== 0) return '';
  var abs = Math.abs(v);
  var prefix = v < 0 ? '-' : '';
  if (abs >= 1000000) return prefix + 'R$' + (abs/1000000).toFixed(1) + 'M';
  if (abs >= 1000)    return prefix + 'R$' + (abs/1000).toFixed(1) + 'K';
  return prefix + 'R$' + abs.toFixed(0);
}

function gridLines(W,H,pL,pR,pT,pB) {
  var chartH=H-pT-pB;
  var html='';
  [0,0.25,0.5,0.75,1].forEach(function(f){
    var y=pT+chartH*(1-f);
    html+='<line x1="'+pL+'" y1="'+y+'" x2="'+(W-pR)+'" y2="'+y+'" stroke="#e5e7eb" stroke-width="1"/>';
  });
  return html;
}

function legend(pL,H,pB,items) {
  var html='', x=pL;
  items.forEach(function(it){
    html+='<rect x="'+x+'" y="'+(H-pB+22)+'" width="8" height="8" fill="'+it.c+'" rx="2"/>';
    html+='<text x="'+(x+11)+'" y="'+(H-pB+30)+'" font-size="8" fill="#6b7280">'+it.l+'</text>';
    x += 55;
  });
  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGOUT / UTILS
// ══════════════════════════════════════════════════════════════════════════════
function handleLogout() {
  SupabaseAPI.signOut().then(function(){ window.location.href = 'index.html'; });
}

function setText(sel, val) {
  var el = document.querySelector(sel);
  if (el) el.textContent = (val !== null && val !== undefined) ? val : '—';
}

// Formatters
function fc(v) { return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0); }
function fd(s) {
  if (!s) return '—';
  // s pode ser 'YYYY-MM-DD'
  var parts = s.split('-');
  if (parts.length === 3) return parts[2]+'/'+parts[1]+'/'+parts[0];
  return s;
}
function fmesAbrev(s) {
  if (!s) return '';
  var m = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var parts = s.split('-');
  return m[parseInt(parts[1],10)-1] || s;
}
function fmesNome(s) {
  if (!s) return '—';
  var m = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var parts = s.split('-');
  return m[parseInt(parts[1],10)-1] || s;
}

function sitBadge(sit) {
  if (!sit) return '<span class="badge badge--gray" style="font-size:.7rem">Pendente</span>';
  var map = { 'OK':'badge--green','CH':'badge--blue','EM ATRASO':'badge--em-atraso','PARCELADO':'badge--parcelado' };
  var cls = map[sit.toUpperCase()] || 'badge--gray';
  return '<span class="badge '+cls+'" style="font-size:.7rem">'+sit+'</span>';
}

function renderEmpty(tbody, cols) {
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="'+cols+'" class="table__empty">Nenhum registro encontrado.</td></tr>';
}

// openModal/closeModal defined in lib/helpers.js

function debounce(fn, delay) {
  return function() {
    clearTimeout(fn._t);
    fn._t = setTimeout(fn, delay);
  };
}
