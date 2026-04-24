/**
 * api/helpers.js
 * Utilitários e helpers compartilhados
 */

// ─── FORMATADORES ─────────────────────────────────────────────────────────────

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(dateStr));
}

function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR').format(n || 0);
}

// ─── DOM HELPERS ──────────────────────────────────────────────────────────────

function $(selector, context = document) {
  return context.querySelector(selector);
}

function $$(selector, context = document) {
  return [...context.querySelectorAll(selector)];
}

function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  });
  children.forEach(child => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  });
  return el;
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────

function showToast(message, type = 'info', duration = 3500) {
  let container = $('#toast-container');
  if (!container) {
    container = createElement('div', { id: 'toast-container', class: 'toast-container' });
    document.body.appendChild(container);
  }

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = createElement('div', { class: `toast toast--${type}` }, [
    createElement('span', { class: 'toast__icon', text: icons[type] || icons.info }),
    createElement('span', { class: 'toast__msg', text: message }),
  ]);

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--show'));

  setTimeout(() => {
    toast.classList.remove('toast--show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

function openModal(id) {
  const modal = $(`#${id}`);
  if (modal) {
    modal.classList.add('modal--open');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (modal) {
    modal.classList.remove('modal--open');
    document.body.style.overflow = '';
  }
}

function closeAllModals() {
  $$('.modal--open').forEach(m => m.classList.remove('modal--open'));
  document.body.style.overflow = '';
}

// Fechar modal ao clicar fora
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal')) closeAllModals();
});

// ─── LOADING STATE ────────────────────────────────────────────────────────────

function setLoading(element, isLoading, originalText = '') {
  if (typeof element === 'string') element = $(element);
  if (!element) return;
  if (isLoading) {
    element.dataset.originalText = element.textContent;
    element.textContent = 'Carregando...';
    element.disabled = true;
    element.classList.add('loading');
  } else {
    element.textContent = originalText || element.dataset.originalText || 'OK';
    element.disabled = false;
    element.classList.remove('loading');
  }
}

// ─── VALIDAÇÃO ────────────────────────────────────────────────────────────────

function validateForm(formEl) {
  const errors = [];
  $$('[required]', formEl).forEach(field => {
    if (!field.value.trim()) {
      field.classList.add('input--error');
      errors.push(`Campo "${field.dataset.label || field.name}" é obrigatório`);
    } else {
      field.classList.remove('input--error');
    }
  });
  return errors;
}

function getFormData(formEl) {
  const data = {};
  const fd = new FormData(formEl);
  fd.forEach((val, key) => { data[key] = val; });
  return data;
}

// ─── TABELA HELPER ────────────────────────────────────────────────────────────

function renderTable(tableBodyEl, rows, emptyMessage = 'Nenhum registro encontrado.') {
  if (typeof tableBodyEl === 'string') tableBodyEl = $(tableBodyEl);
  if (!tableBodyEl) return;
  if (!rows || rows.length === 0) {
    const cols = tableBodyEl.closest('table')?.querySelectorAll('thead th').length || 4;
    tableBodyEl.innerHTML = `<tr><td colspan="${cols}" class="table__empty">${emptyMessage}</td></tr>`;
    return;
  }
  tableBodyEl.innerHTML = '';
  rows.forEach(row => tableBodyEl.appendChild(row));
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    active: { label: 'Ativo', cls: 'badge--green' },
    finished: { label: 'Finalizado', cls: 'badge--gray' },
    sold: { label: 'Vendido', cls: 'badge--blue' },
    pending: { label: 'Pendente', cls: 'badge--yellow' },
  };
  const s = map[status] || { label: status, cls: 'badge--gray' };
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

// ─── REDIRECT COM AUTH GUARD ───────────────────────────────────────────────────

function requireAuth() {
  if (!window.SupabaseAPI?.isAuthenticated()) {
    window.location.href = '/index.html';
  }
}

function redirectIfAuth() {
  if (window.SupabaseAPI?.isAuthenticated()) {
    window.location.href = '/dashboard.html';
  }
}

// Exporta globalmente
window.Helpers = {
  $, $$, createElement,
  formatCurrency, formatDate, formatNumber,
  showToast, openModal, closeModal, closeAllModals,
  setLoading, validateForm, getFormData,
  renderTable, statusBadge,
  requireAuth, redirectIfAuth,
};
