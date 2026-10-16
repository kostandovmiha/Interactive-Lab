import config from '../config.js';
import { validateConfig } from './configuration.js';
import { downloadModel } from './assets.js';

const $ = id => document.getElementById(id);
const labels = { exterior: 'Фасад', interior: 'Інтер’єр', roof: 'Дах / стеля', floors: 'Підлоги', walls: 'Стіни', doors: 'Двері', windows: 'Вікна', furniture: 'Меблі', surroundings: 'Оточення' };
let auth, client, access = null, scene = null, models = [], generation = 0, controller;
let busy = false, signingOut = false;
function error(message = '') { $('error').textContent = message; $('error').hidden = !message; }
function controls(authorized, loaded = false) {
  for (const id of ['model', 'load-model']) $(id).disabled = !authorized;
  for (const id of ['mode', 'reset', 'speed']) $(id).disabled = !loaded;
}
function gate(title, detail) { $('gate-title').textContent = title; $('gate-detail').textContent = detail; $('gate').hidden = false; }
function clearViewer() {
  generation++; controller?.abort(); access = null; busy = false;
  scene?.clear(); controls(false); $('loading').hidden = true; $('scene-label').hidden = true; $('enter-walk').hidden = true;
  $('mode').value = 'orbit'; $('groups').replaceChildren();
  $('model').replaceChildren(new Option('Вигаданий демобудинок', 'demo')); models = [];
}
function locked(message) { clearViewer(); $('auth-state').textContent = 'Доступ закрито'; gate('Доступ закрито', message); }

async function refresh() {
  if (signingOut) return;
  clearViewer(); const current = generation;
  $('auth-state').textContent = 'Перевіряємо дозвіл…'; gate('Перевіряємо доступ…', 'Сервер підтверджує сесію та дозвіл.');
  try {
    const { data: { session } } = await client.auth.getSession();
    if (current !== generation) return;
    $('logout').hidden = !session;
    const verified = await auth.authorize();
    if (current !== generation) return;
    if (!verified) { $('auth-state').textContent = 'Вхід не виконано'; gate('Увійди через Google', 'Власник має додати UUID твого облікового запису до списку дозволених користувачів.'); return; }
    const catalog = await auth.models();
    if (current !== generation) return;
    access = verified; models = catalog;
    for (const model of models) $('model').add(new Option(model.label, model.id));
    $('auth-state').textContent = 'Доступ дозволено'; controls(true); error();
    gate('Можна відкрити будинок', models.length ? 'Обери приватну модель або вигаданий демобудинок.' : 'Приватних моделей поки немає. Доступний вигаданий демобудинок.');
  } catch (e) { if (current === generation) locked(e.message); }
}

async function loadModel() {
  if (!access || busy) return;
  busy = true; const current = ++generation; controller?.abort(); controller = new AbortController();
  const requested = $('model').value; const previousUser = access.userId;
  scene?.clear(); controls(false); $('scene-label').hidden = true; $('enter-walk').hidden = true; $('mode').value = 'orbit'; $('groups').replaceChildren(); error();
  gate('Відкриваємо модель…', 'Дозвіл перевіряється перед кожним завантаженням.');
  $('loading').hidden = false; $('progress').removeAttribute('value'); $('load-text').textContent = 'Перевірка доступу…';
  let source, prepared;
  try {
    const verified = await auth.authorize();
    if (current !== generation) return;
    if (!verified || verified.userId !== previousUser) throw new Error('Дозвіл більше не підтверджено.');
    const [{ HouseScene }, { prepareModel, parseModel }, { createDemo }] = await Promise.all([import('./scene.js'), import('./model.js'), import('./demo.js')]);
    if (current !== generation) return;
    let settings = {}, title;
    if (requested === 'demo') {
      source = createDemo(); title = 'Вигаданий демобудинок · не реальне житло';
    } else {
      const model = models.find(m => m.id === requested);
      if (!model) throw new Error('Модель відсутня у дозволеному списку.');
      $('load-text').textContent = 'Завантажуємо приватний GLB…';
      const buffer = await downloadModel({ config, authorization: verified, model, signal: controller.signal, progress: (bytes, total) => {
        if (current !== generation) return;
        if (total) $('progress').value = Math.min(100, bytes / total * 100);
        $('load-text').textContent = `Завантажено ${(bytes / 1024 / 1024).toFixed(1)} МБ`;
      } });
      if (current !== generation) return;
      source = await parseModel(buffer); settings = model.settings || {}; title = model.label;
    }
    if (current !== generation) { const { disposeModel } = await import('./model.js'); disposeModel(source); return; }
    // Covers revocation or expiry during a slow fetch/parse, including demo creation.
    const finalAccess = await auth.authorize();
    if (current !== generation || !finalAccess || finalAccess.userId !== previousUser) throw new Error('Доступ змінився під час завантаження.');
    prepared = prepareModel(source, settings);
    if (!scene) scene = new HouseScene($('viewer'), config, locked => {
      $('enter-walk').hidden = locked || $('mode').value !== 'walk';
    }, error);
    const walkError = scene.setModel(prepared); source = null; prepared = null;
    access = finalAccess; controls(true, true); $('gate').hidden = true; $('scene-label').textContent = title; $('scene-label').hidden = false;
    for (const group of scene.groups.members.keys()) {
      const label = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = true;
      input.addEventListener('change', () => scene.groups?.setVisible(group, input.checked));
      label.append(input, document.createTextNode(labels[group] || group)); $('groups').append(label);
    }
    $('mode').querySelector('[value=walk]').disabled = Boolean(walkError);
    if (walkError) error(`Огляд доступний. Прогулянка: ${walkError}`);
  } catch (e) {
    if (source || prepared) { const { disposeModel } = await import('./model.js'); disposeModel(prepared?.root || source); }
    if (current !== generation) return;
    locked('Не вдалося безпечно відкрити модель. Повтори перевірку входом або оновленням сторінки.');
    error(e.message);
  } finally { if (current === generation) { busy = false; $('loading').hidden = true; } }
}

$('load-model').addEventListener('click', loadModel);
$('mode').addEventListener('change', () => {
  if (!access || !scene?.model) return;
  try {
    scene.setMode($('mode').value); $('enter-walk').hidden = $('mode').value !== 'walk';
    $('hint').textContent = $('mode').value === 'walk' ? 'WASD — рух · Миша — погляд · Esc — звільнити курсор' : 'Обертання — перетягування · Масштаб — колесо · Панорама — права кнопка';
  } catch (e) { $('mode').value = 'orbit'; scene.setMode('orbit'); error(e.message); }
});
$('enter-walk').addEventListener('click', () => { if (access) scene?.walk.lock(); });
$('reset').addEventListener('click', () => { if (access) scene?.reset(); });
$('speed').addEventListener('input', () => { $('speed-value').value = $('speed').value; if (scene) scene.walk.speed = Number($('speed').value); });
$('login').addEventListener('click', async () => { try { await auth.signIn(); } catch (e) { error(e.message); } });
$('logout').addEventListener('click', async () => {
  signingOut = true; locked('Перегляд закрито. Завершуємо сесію…');
  try { await auth.signOut(); $('logout').hidden = true; gate('Вихід виконано', 'Для перегляду потрібен новий вхід і підтверджений дозвіл.'); } catch (e) { error(e.message); }
  finally { signingOut = false; }
});

try {
  validateConfig(config);
  const [{ createClient }, { Auth }] = await Promise.all([import('@supabase/supabase-js'), import('./auth.js')]);
  client = createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { flowType: 'pkce', storage: sessionStorage, storageKey: 'home3d-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  auth = new Auth(client); $('login').disabled = false;
  client.auth.onAuthStateChange(event => {
    // Do not await SDK methods inside this callback (SDK auth lock).
    clearViewer();
    if (event === 'SIGNED_OUT') { $('logout').hidden = true; gate('Вихід виконано', 'Доступ до моделі закрито.'); $('auth-state').textContent = 'Вхід не виконано'; return; }
    if (!signingOut) setTimeout(refresh, 0);
  });
  await refresh();
  // Recheck UUID authorization, including revocations, on a bounded interval and tab return.
  let checking = false;
  const recheck = async () => {
    if (!access || checking || busy) return;
    checking = true; const user = access.userId, current = generation;
    try { const verified = await auth.authorize(); if (current === generation) { if (!verified || verified.userId !== user) locked('Дозвіл відкликано або сесію завершено.'); else access = verified; } }
    catch { if (current === generation) locked('Сервер не підтвердив доступ. Перегляд закрито.'); }
    finally { checking = false; }
  };
  setInterval(recheck, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheck(); else scene?.walk.blur(); });
  window.addEventListener('offline', () => locked('Немає мережі для підтвердження доступу. Перегляд закрито.'));
  window.addEventListener('pagehide', () => { clearViewer(); scene?.dispose(); scene = null; });
} catch (e) { locked(e.message); $('auth-state').textContent = 'Налаштування відсутні або недоступні'; }
