export function validateConfig(config) {
  let url;
  try { url = new URL(config.supabaseUrl); } catch { throw new Error('Налаштування відсутні: вкажи Supabase URL і публічний ключ у config.js.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Потрібен HTTPS URL проєкту Supabase (*.supabase.co).');
  }
  const key = config.supabasePublishableKey;
  let publicKey = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (typeof key === 'string' && key.split('.').length === 3) {
    try { const segment = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); publicKey = JSON.parse(atob(segment)).role === 'anon'; } catch { publicKey = false; }
  }
  if (!publicKey) throw new Error('Потрібен публічний publishable/anon ключ; привілейовані ключі заборонені.');
  if (!Number.isSafeInteger(config.maxModelBytes) || config.maxModelBytes < 1024 || config.maxModelBytes > 500 * 1024 * 1024) throw new Error('Некоректний ліміт розміру моделі.');
  if (!config.groups || typeof config.groups !== 'object' || Array.isArray(config.groups) || !Object.values(config.groups).every(a => Array.isArray(a) && a.every(s => typeof s === 'string' && s.length > 0))) throw new Error('Некоректні назви груп моделі.');
  return config;
}

export function redirectURL(locationURL) {
  const url = new URL('.', locationURL);
  url.search = ''; url.hash = '';
  return url.href;
}
