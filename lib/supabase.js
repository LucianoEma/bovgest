/**
 * lib/supabase.js — BovGest Local Storage Edition
 *
 * Substitui o Supabase por um banco de dados local (localStorage).
 * Mantém a mesma interface pública (window.SupabaseAPI) para que
 * nenhum outro arquivo precise ser alterado.
 *
 * Usuário padrão criado na primeira execução:
 *   E-mail:  admin@bovgest.com
 *   Senha:   admin123
 */

// ─── HELPERS DE STORAGE ───────────────────────────────────────────────────────

const SESSION_KEY = 'bovgest_session';
const DB_PREFIX   = 'bovgest_db_';

function _dbGet(table) {
  try { return JSON.parse(localStorage.getItem(DB_PREFIX + table) || '[]'); }
  catch { return []; }
}

function _dbSet(table, rows) {
  localStorage.setItem(DB_PREFIX + table, JSON.stringify(rows));
}

function _uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _now() { return new Date().toISOString(); }

// ─── SEED: dados iniciais ─────────────────────────────────────────────────────

function _seedIfEmpty() {
  if (!localStorage.getItem(DB_PREFIX + 'users')) {
    const users = [{
      id: _uuid(),
      email: 'admin@bovgest.com',
      password: 'admin123',
      user_metadata: { full_name: 'Administrador', role: 'admin', farm_name: 'Fazenda BovGest' },
      created_at: _now(),
    }];
    localStorage.setItem(DB_PREFIX + 'users', JSON.stringify(users));
  }
  ['lots', 'costs', 'sales', 'profiles'].forEach(t => {
    if (!localStorage.getItem(DB_PREFIX + t)) _dbSet(t, []);
  });
}

_seedIfEmpty();

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const users = JSON.parse(localStorage.getItem(DB_PREFIX + 'users') || '[]');
  const user  = users.find(u => u.email === email && u.password === password);
  if (!user) throw new Error('E-mail ou senha incorretos.');
  const session = {
    access_token: 'local_' + _uuid(),
    user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
    expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

async function signOut() { localStorage.removeItem(SESSION_KEY); }

function getCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return session?.user || null;
  } catch { return null; }
}

function isAuthenticated() {
  const user = getCurrentUser();
  if (!user) return false;
  try {
    const session   = JSON.parse(localStorage.getItem(SESSION_KEY));
    const expiresAt = session?.expires_at;
    if (expiresAt && Date.now() / 1000 > expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return false;
    }
  } catch {}
  return true;
}

// ─── LOTS ─────────────────────────────────────────────────────────────────────

async function getLots(filters = {}) {
  let rows = _dbGet('lots').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  if (filters.status) rows = rows.filter(r => r.status === filters.status);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(r => r.name?.toLowerCase().includes(q));
  }
  return rows;
}

async function getLotById(id) {
  const lot = _dbGet('lots').find(l => l.id === id);
  if (!lot) return null;
  return { ...lot, costs: _dbGet('costs').filter(c => c.lot_id === id), sales: _dbGet('sales').filter(s => s.lot_id === id) };
}

async function insertLot(lot) {
  const rows  = _dbGet('lots');
  const newRow = { ...lot, id: _uuid(), created_at: _now() };
  rows.unshift(newRow);
  _dbSet('lots', rows);
  return [newRow];
}

async function updateLot(id, changes) {
  const rows  = _dbGet('lots');
  const i     = rows.findIndex(r => r.id === id);
  if (i < 0) throw new Error('Lote não encontrado.');
  rows[i] = { ...rows[i], ...changes, updated_at: _now() };
  _dbSet('lots', rows);
  return [rows[i]];
}

async function deleteLot(id) {
  _dbSet('lots',  _dbGet('lots').filter(r => r.id !== id));
  _dbSet('costs', _dbGet('costs').filter(r => r.lot_id !== id));
  _dbSet('sales', _dbGet('sales').filter(r => r.lot_id !== id));
  return null;
}

// ─── COSTS ────────────────────────────────────────────────────────────────────

async function getCosts(filters = {}) {
  const lotMap = {};
  _dbGet('lots').forEach(l => { lotMap[l.id] = l; });
  let rows = _dbGet('costs').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (filters.lot_id)   rows = rows.filter(r => r.lot_id   === filters.lot_id);
  if (filters.category) rows = rows.filter(r => r.category === filters.category);
  if (filters.from)     rows = rows.filter(r => r.date >= filters.from);
  if (filters.to)       rows = rows.filter(r => r.date <= filters.to);
  return rows.map(r => ({ ...r, lots: lotMap[r.lot_id] ? { name: lotMap[r.lot_id].name } : null }));
}

async function insertCost(cost) {
  const rows   = _dbGet('costs');
  const newRow = { ...cost, id: _uuid(), created_at: _now() };
  rows.unshift(newRow);
  _dbSet('costs', rows);
  return [newRow];
}

async function updateCost(id, changes) {
  const rows = _dbGet('costs');
  const i    = rows.findIndex(r => r.id === id);
  if (i < 0) throw new Error('Custo não encontrado.');
  rows[i] = { ...rows[i], ...changes };
  _dbSet('costs', rows);
  return [rows[i]];
}

async function deleteCost(id) {
  _dbSet('costs', _dbGet('costs').filter(r => r.id !== id));
  return null;
}

// ─── SALES ────────────────────────────────────────────────────────────────────

async function getSales(filters = {}) {
  const lotMap = {};
  _dbGet('lots').forEach(l => { lotMap[l.id] = l; });
  let rows = _dbGet('sales').sort((a, b) => (b.sale_date || '').localeCompare(a.sale_date || ''));
  if (filters.lot_id) rows = rows.filter(r => r.lot_id === filters.lot_id);
  if (filters.from)   rows = rows.filter(r => r.sale_date >= filters.from);
  if (filters.to)     rows = rows.filter(r => r.sale_date <= filters.to);
  return rows.map(r => ({ ...r, lots: lotMap[r.lot_id] ? { name: lotMap[r.lot_id].name } : null }));
}

async function insertSale(sale) {
  const rows   = _dbGet('sales');
  const newRow = { ...sale, id: _uuid(), created_at: _now() };
  rows.unshift(newRow);
  _dbSet('sales', rows);
  return [newRow];
}

async function updateSale(id, changes) {
  const rows = _dbGet('sales');
  const i    = rows.findIndex(r => r.id === id);
  if (i < 0) throw new Error('Venda não encontrada.');
  rows[i] = { ...rows[i], ...changes };
  _dbSet('sales', rows);
  return [rows[i]];
}

async function deleteSale(id) {
  _dbSet('sales', _dbGet('sales').filter(r => r.id !== id));
  return null;
}

// ─── PROFILES ────────────────────────────────────────────────────────────────

async function getProfile(userId) {
  const id = userId || getCurrentUser()?.id;
  return _dbGet('profiles').find(r => r.id === id) || null;
}

async function updateProfile(changes) {
  const id   = getCurrentUser()?.id;
  const rows = _dbGet('profiles');
  const i    = rows.findIndex(r => r.id === id);
  if (i >= 0) rows[i] = { ...rows[i], ...changes };
  else rows.push({ id, ...changes });
  _dbSet('profiles', rows);
  return rows.find(r => r.id === id);
}

// ─── DASHBOARD SUMMARY ───────────────────────────────────────────────────────

async function getDashboardSummary() {
  const lots  = _dbGet('lots');
  const costs = _dbGet('costs');
  const sales = _dbGet('sales');
  const totalAnimals = lots.reduce((s, l)  => s + (l.animal_count || 0), 0);
  const totalCosts   = costs.reduce((s, c) => s + (c.amount || 0), 0);
  const totalRevenue = sales.reduce((s, v) => s + (v.total_value || 0), 0);
  const activeLots   = lots.filter(l => l.status === 'active').length;
  return {
    totalAnimals, totalCosts, totalRevenue,
    profit: totalRevenue - totalCosts,
    activeLots, totalLots: lots.length,
    lots, recentCosts: costs.slice(0, 5), recentSales: sales.slice(0, 5),
  };
}

// ─── ADMIN: CRIAR USUÁRIO ─────────────────────────────────────────────────────

async function adminCreateUser({ email, password, full_name, role, farm_name, phone }) {
  const users = JSON.parse(localStorage.getItem(DB_PREFIX + 'users') || '[]');
  if (users.find(u => u.email === email)) throw new Error('E-mail já cadastrado.');
  const newUser = { id: _uuid(), email, password, user_metadata: { full_name, role, farm_name, phone }, created_at: _now() };
  users.push(newUser);
  localStorage.setItem(DB_PREFIX + 'users', JSON.stringify(users));
  return { user: newUser };
}

// ─── EXPORT ──────────────────────────────────────────────────────────────────

window.SupabaseAPI = {
  signIn, signOut, getCurrentUser, isAuthenticated,
  getLots, getLotById, insertLot, updateLot, deleteLot,
  getCosts, insertCost, updateCost, deleteCost,
  getSales, insertSale, updateSale, deleteSale,
  getProfile, updateProfile,
  adminCreateUser,
  getDashboardSummary,
};
