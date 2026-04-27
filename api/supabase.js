/**
 * api/supabase.js
 * Camada de acesso ao Supabase (REST + Auth)
 *
 * CORREÇÕES aplicadas:
 *  - SUPABASE_URL agora é a raiz do projeto (sem /rest/v1/ no final)
 *  - supabaseFetch() monta URLs corretas: BASE + path completo
 *  - signIn/signOut usam o path correto /auth/v1/...
 *  - getToken() usa chave de armazenamento consistente
 */

// ─── CONFIGURAÇÃO ──────────────────────────────────────────────────────────────
// Apenas o domínio base — sem trailing slash, sem /rest/v1/
const SUPABASE_URL      = 'https://qqxxzrymmscqamqljmae.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeHh6cnltbXNjcWFtcWxqbWFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODM5MDksImV4cCI6MjA5MjU1OTkwOX0.kIwLs2Bmb9k9ZCC6vBxpoiW2SEZIeeOM0JUHIegA_ZU';

const SESSION_STORAGE_KEY = 'bovgest_session';

// ─── FETCH BASE ────────────────────────────────────────────────────────────────
/**
 * Faz uma requisição autenticada à API REST do Supabase.
 * @param {string} path  - Ex: '/rest/v1/lots?select=*'
 * @param {object} opts  - Opções fetch extras
 */
async function supabaseFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}${path}`;

  const headers = {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${_getToken()}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
    ...(opts.headers || {}),
  };

  const response = await fetch(url, { ...opts, headers });

  // DELETE retorna 204 (sem body)
  if (response.status === 204) return null;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const msg = body?.message || body?.error_description || body?.msg || `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return body;
}

function _getToken() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
    return session?.access_token || SUPABASE_ANON_KEY;
  } catch {
    return SUPABASE_ANON_KEY;
  }
}

// ─── AUTH ──────────────────────────────────────────────────────────────────────

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method:  'POST',
    headers: {
      'apikey':       SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || 'Credenciais inválidas.');
  }

  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  return data;
}

async function signOut() {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${_getToken()}`,
        'Content-Type':  'application/json',
      },
    });
  } catch (_) {
    // Ignora erro de rede no logout — limpa a sessão de qualquer jeito
  }
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function getCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
    return session?.user || null;
  } catch {
    return null;
  }
}

function isAuthenticated() {
  const user = getCurrentUser();
  if (!user) return false;
  // Verifica expiração do token
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
    const expiresAt = session?.expires_at; // unix timestamp em segundos
    if (expiresAt && Date.now() / 1000 > expiresAt) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return false;
    }
  } catch (_) {}
  return true;
}

// ─── LOTS (Lotes) ──────────────────────────────────────────────────────────────

async function getLots(filters = {}) {
  let path = '/rest/v1/lots?select=*&order=created_at.desc';
  if (filters.status) path += `&status=eq.${encodeURIComponent(filters.status)}`;
  if (filters.search) path += `&name=ilike.*${encodeURIComponent(filters.search)}*`;
  const data = await supabaseFetch(path);
  return data || [];
}

async function getLotById(id) {
  const data = await supabaseFetch(`/rest/v1/lots?id=eq.${id}&select=*,costs(*),sales(*)`);
  return data?.[0] || null;
}

async function insertLot(lot) {
  const data = await supabaseFetch('/rest/v1/lots', {
    method: 'POST',
    body:   JSON.stringify(lot),
  });
  return data;
}

async function updateLot(id, changes) {
  const data = await supabaseFetch(`/rest/v1/lots?id=eq.${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(changes),
  });
  return data;
}

async function deleteLot(id) {
  return supabaseFetch(`/rest/v1/lots?id=eq.${id}`, { method: 'DELETE' });
}

// ─── COSTS (Custos) ────────────────────────────────────────────────────────────

async function getCosts(filters = {}) {
  let path = '/rest/v1/costs?select=*,lots(name)&order=date.desc';
  if (filters.lot_id)   path += `&lot_id=eq.${filters.lot_id}`;
  if (filters.category) path += `&category=eq.${encodeURIComponent(filters.category)}`;
  if (filters.from)     path += `&date=gte.${filters.from}`;
  if (filters.to)       path += `&date=lte.${filters.to}`;
  const data = await supabaseFetch(path);
  return data || [];
}

async function insertCost(cost) {
  return supabaseFetch('/rest/v1/costs', {
    method: 'POST',
    body:   JSON.stringify(cost),
  });
}

async function updateCost(id, changes) {
  return supabaseFetch(`/rest/v1/costs?id=eq.${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(changes),
  });
}

async function deleteCost(id) {
  return supabaseFetch(`/rest/v1/costs?id=eq.${id}`, { method: 'DELETE' });
}

// ─── SALES (Vendas) ────────────────────────────────────────────────────────────

async function getSales(filters = {}) {
  let path = '/rest/v1/sales?select=*,lots(name)&order=sale_date.desc';
  if (filters.lot_id) path += `&lot_id=eq.${filters.lot_id}`;
  if (filters.from)   path += `&sale_date=gte.${filters.from}`;
  if (filters.to)     path += `&sale_date=lte.${filters.to}`;
  const data = await supabaseFetch(path);
  return data || [];
}

async function insertSale(sale) {
  return supabaseFetch('/rest/v1/sales', {
    method: 'POST',
    body:   JSON.stringify(sale),
  });
}

async function updateSale(id, changes) {
  return supabaseFetch(`/rest/v1/sales?id=eq.${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(changes),
  });
}

async function deleteSale(id) {
  return supabaseFetch(`/rest/v1/sales?id=eq.${id}`, { method: 'DELETE' });
}

// ─── PROFILES ──────────────────────────────────────────────────────────────────

async function getProfile(userId) {
  const id   = userId || getCurrentUser()?.id;
  const data = await supabaseFetch(`/rest/v1/profiles?id=eq.${id}&select=*`);
  return data?.[0] || null;
}

async function updateProfile(changes) {
  const id = getCurrentUser()?.id;
  return supabaseFetch(`/rest/v1/profiles?id=eq.${id}`, {
    method: 'PATCH',
    body:   JSON.stringify(changes),
  });
}

// ─── DASHBOARD SUMMARY ─────────────────────────────────────────────────────────

async function getDashboardSummary() {
  const [lots, costs, sales] = await Promise.all([
    supabaseFetch('/rest/v1/lots?select=id,name,status,animal_count,breed,entry_date'),
    supabaseFetch('/rest/v1/costs?select=amount,date,category,lot_id'),
    supabaseFetch('/rest/v1/sales?select=total_value,sale_date,animal_count,lot_id'),
  ]);

  const safeArr = (v) => Array.isArray(v) ? v : [];

  const lotsArr  = safeArr(lots);
  const costsArr = safeArr(costs);
  const salesArr = safeArr(sales);

  const totalAnimals = lotsArr.reduce((s, l) => s + (l.animal_count || 0), 0);
  const totalCosts   = costsArr.reduce((s, c) => s + (c.amount || 0), 0);
  const totalRevenue = salesArr.reduce((s, v) => s + (v.total_value || 0), 0);
  const activeLots   = lotsArr.filter(l => l.status === 'active').length;

  return {
    totalAnimals,
    totalCosts,
    totalRevenue,
    profit:      totalRevenue - totalCosts,
    activeLots,
    totalLots:   lotsArr.length,
    lots:        lotsArr,
    recentCosts: costsArr.slice(0, 5),
    recentSales: salesArr.slice(0, 5),
  };
}

// ─── ADMIN: CRIAR USUÁRIO ──────────────────────────────────────────────────────
// Chama a Serverless Function /api/create-user na Vercel.
// A SERVICE_ROLE KEY nunca passa pelo frontend.

async function adminCreateUser({ email, password, full_name, role, farm_name, phone }) {
  const res = await fetch('/api/create-user', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password, full_name, role, farm_name, phone }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário.');
  return data;
}

// ─── EXPORT ────────────────────────────────────────────────────────────────────

window.SupabaseAPI = {
  // Auth
  signIn, signOut, getCurrentUser, isAuthenticated,
  // Lots
  getLots, getLotById, insertLot, updateLot, deleteLot,
  // Costs
  getCosts, insertCost, updateCost, deleteCost,
  // Sales
  getSales, insertSale, updateSale, deleteSale,
  // Profiles
  getProfile, updateProfile,
  // Admin
  adminCreateUser,
  // Analytics
  getDashboardSummary,
};
