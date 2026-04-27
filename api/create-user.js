/**
 * api-functions/create-user.js
 * Vercel Serverless Function — cria usuário via Supabase Admin API
 *
 * Variáveis de ambiente (configurar na Vercel):
 *   SUPABASE_URL         → https://SEU_PROJETO.supabase.co
 *   SUPABASE_SERVICE_KEY → sua service_role key (secreta, nunca exposta no frontend)
 *   ADM_PASSWORD         → senha do painel administrativo
 */

export default async function handler(req, res) {
  // CORS mínimo
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const SUPABASE_URL         = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({
      error: 'Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY não configuradas na Vercel.',
    });
  }

  const { email, password, full_name, role, farm_name, phone } = req.body || {};

  // Validações básicas
  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres.' });
  }

  try {
    // 1. Cria o usuário via Supabase Auth Admin API
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name || '',
          role:      role      || 'user',
        },
      }),
    });

    const authData = await authRes.json();

    if (!authRes.ok) {
      return res.status(authRes.status).json({
        error: authData.msg || authData.message || 'Erro ao criar usuário no Supabase Auth.',
      });
    }

    const userId = authData?.id || authData?.user?.id;

    // 2. Atualiza o perfil com dados extras
    // (O trigger do Supabase cria a linha base em 'profiles' ao criar o auth user)
    if (userId) {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method:  'PATCH',
        headers: {
          'apikey':        SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          full_name: full_name || null,
          role:      role      || 'user',
          farm_name: farm_name || null,
          phone:     phone     || null,
          email,
        }),
      });
    }

    return res.status(200).json({ success: true, user_id: userId });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no servidor.' });
  }
}
