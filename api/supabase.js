/**
 * api/supabase.js
 * Configuração e conexão com o Supabase
 * Substitua SUPABASE_URL e SUPABASE_ANON_KEY com suas credenciais
 */

const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANONIMA';

/**
 * Realiza requisições autenticadas à API REST do Supabase
 * @param {string} path - Endpoint (ex: '/rest/v1/lots')
 * @param {object} options - Opções do fetch
 * @returns {Promise<any>}
 */
async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}${path}`;

  const defaultHeaders = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  const response = await fetch(url, {
    ...options,
    headers: { ...defaultHeaders, ...(options.headers || {}) },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `Erro HTTP ${response.status}`);
  }

  // DELETE retorna 204 sem body
  if (response.status === 204) return null;

  return response.json();
}

/**
 * Retorna o token JWT do usuário logado (localStorage)
 */
function getToken() {
  const session = JSON.parse(localStorage.getItem('bovgest_session') || 'null');
  return session?.access_token || SUPABASE_ANON_KEY;
}

/**
 * ─── AUTH ─────────────────────────────────────────────────────────────────────
 */

async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error_description || 'Falha ao autenticar');
  }

  const session = await response.json();
  localStorage.setItem('bovgest_session', JSON.stringify(session));
  return session;
}

async function signOut() {
  await supabaseFetch('/auth/v1/logout', { method: 'POST' });
  localStorage.removeItem('bovgest_session');
}

function getCurrentUser() {
  const session = JSON.parse(localStorage.getItem('bovgest_session') || 'null');
  return session?.user || null;
}

function isAuthenticated() {
  return !!getCurrentUser();
}

/**
 * ─── LOTS (Lotes) ─────────────────────────────────────────────────────────────
 */

async function getLots(filters = {}) {
  let path = '/rest/v1/lots?select=*&order=created_at.desc';
  if (filters.status) path += `&status=eq.${filters.status}`;
  if (filters.search) path += `&name=ilike.*${filters.search}*`;
  return supabaseFetch(path);
}

async function getLotById(id) {
  const data = await supabaseFetch(`/rest/v1/lots?id=eq.${id}&select=*,costs(*),sales(*)`);
  return data?.[0] || null;
}

async function insertLot(lot) {
  return supabaseFetch('/rest/v1/lots', {
    method: 'POST',
    body: JSON.stringify(lot),
  });
}

async function updateLot(id, changes) {
  return supabaseFetch(`/rest/v1/lots?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

async function deleteLot(id) {
  return supabaseFetch(`/rest/v1/lots?id=eq.${id}`, { method: 'DELETE' });
}

/**
 * ─── COSTS (Custos) ───────────────────────────────────────────────────────────
 */

async function getCosts(filters = {}) {
  let path = '/rest/v1/costs?select=*,lots(name)&order=date.desc';
  if (filters.lot_id) path += `&lot_id=eq.${filters.lot_id}`;
  if (filters.category) path += `&category=eq.${filters.category}`;
  if (filters.from) path += `&date=gte.${filters.from}`;
  if (filters.to) path += `&date=lte.${filters.to}`;
  return supabaseFetch(path);
}

async function getCostById(id) {
  const data = await supabaseFetch(`/rest/v1/costs?id=eq.${id}&select=*`);
  return data?.[0] || null;
}

async function insertCost(cost) {
  return supabaseFetch('/rest/v1/costs', {
    method: 'POST',
    body: JSON.stringify(cost),
  });
}

async function updateCost(id, changes) {
  return supabaseFetch(`/rest/v1/costs?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

async function deleteCost(id) {
  return supabaseFetch(`/rest/v1/costs?id=eq.${id}`, { method: 'DELETE' });
}

/**
 * ─── SALES (Vendas) ───────────────────────────────────────────────────────────
 */

async function getSales(filters = {}) {
  let path = '/rest/v1/sales?select=*,lots(name)&order=sale_date.desc';
  if (filters.lot_id) path += `&lot_id=eq.${filters.lot_id}`;
  if (filters.from) path += `&sale_date=gte.${filters.from}`;
  if (filters.to) path += `&sale_date=lte.${filters.to}`;
  return supabaseFetch(path);
}

async function getSaleById(id) {
  const data = await supabaseFetch(`/rest/v1/sales?id=eq.${id}&select=*`);
  return data?.[0] || null;
}

async function insertSale(sale) {
  return supabaseFetch('/rest/v1/sales', {
    method: 'POST',
    body: JSON.stringify(sale),
  });
}

async function updateSale(id, changes) {
  return supabaseFetch(`/rest/v1/sales?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

async function deleteSale(id) {
  return supabaseFetch(`/rest/v1/sales?id=eq.${id}`, { method: 'DELETE' });
}

/**
 * ─── PROFILES ─────────────────────────────────────────────────────────────────
 */

async function getProfile(userId) {
  const id = userId || getCurrentUser()?.id;
  const data = await supabaseFetch(`/rest/v1/profiles?id=eq.${id}&select=*`);
  return data?.[0] || null;
}

async function updateProfile(changes) {
  const id = getCurrentUser()?.id;
  return supabaseFetch(`/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

async function getAllProfiles() {
  return supabaseFetch('/rest/v1/profiles?select=*&order=full_name.asc');
}

/**
 * ─── DASHBOARD ANALYTICS ──────────────────────────────────────────────────────
 */

async function getDashboardSummary() {
  const [lots, costs, sales] = await Promise.all([
    supabaseFetch('/rest/v1/lots?select=id,name,status,animal_count'),
    supabaseFetch('/rest/v1/costs?select=amount,date'),
    supabaseFetch('/rest/v1/sales?select=total_value,sale_date'),
  ]);

  const totalAnimals = lots.reduce((sum, l) => sum + (l.animal_count || 0), 0);
  const totalCosts = costs.reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalRevenue = sales.reduce((sum, s) => sum + (s.total_value || 0), 0);
  const activeLots = lots.filter(l => l.status === 'active').length;

  return {
    totalAnimals,
    totalCosts,
    totalRevenue,
    profit: totalRevenue - totalCosts,
    activeLots,
    totalLots: lots.length,
    lots,
    recentCosts: costs.slice(0, 5),
    recentSales: sales.slice(0, 5),
  };
}

// Exporta todas as funções para uso global
window.SupabaseAPI = {
  // Auth
  signIn,
  signOut,
  getCurrentUser,
  isAuthenticated,
  // Lots
  getLots,
  getLotById,
  insertLot,
  updateLot,
  deleteLot,
  // Costs
  getCosts,
  getCostById,
  insertCost,
  updateCost,
  deleteCost,
  // Sales
  getSales,
  getSaleById,
  insertSale,
  updateSale,
  deleteSale,
  // Profiles
  getProfile,
  updateProfile,
  getAllProfiles,
  // Analytics
  getDashboardSummary,
};
