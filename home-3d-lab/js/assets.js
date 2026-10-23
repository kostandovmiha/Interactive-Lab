export function validateGLB(buffer) {
  if (buffer.byteLength < 20) throw new Error('Файл не є GLB.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('Потрібен коректний GLB версії 2.');
  const jsonLength = view.getUint32(12, true);
  if (jsonLength > buffer.byteLength - 20) throw new Error('Пошкоджений GLB.');
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
  for (const asset of [...(document.buffers || []), ...(document.images || [])]) {
    if (asset.uri !== undefined) throw new Error('GLB має містити всі текстури й буфери всередині файлу; зовнішні URI заборонені.');
  }
  if (document.extensionsRequired?.some(name => !['KHR_materials_unlit', 'KHR_materials_clearcoat', 'KHR_materials_transmission', 'KHR_materials_ior', 'KHR_materials_specular', 'KHR_materials_volume', 'KHR_materials_sheen', 'KHR_materials_iridescence', 'KHR_materials_anisotropy', 'KHR_materials_emissive_strength', 'KHR_texture_transform', 'KHR_mesh_quantization', 'EXT_mesh_gpu_instancing'].includes(name))) {
    throw new Error('Модель потребує непідтримуваного розширення. Експортуй звичайний GLB без Draco/KTX2/Meshopt.');
  }
  return document;
}

export async function downloadModel({ config, authorization, model, signal, progress, fetchImpl = fetch }) {
  if (!authorization?.userId || !authorization.token) throw new Error('Для завантаження потрібен підтверджений дозвіл.');
  if (typeof model?.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(model.id)) throw new Error('Некоректний ID приватної моделі.');
  // POST is deliberately used for binary delivery: every request must reach
  // the authorization handler, including repeated downloads after revocation.
  // Never fall back to a direct Storage GET or a signed URL.
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/home3d-download`;
  const response = await fetchImpl(url, { method: 'POST', headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${authorization.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model_id: model.id }), signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 || response.status === 404 ? 'Приватна модель недоступна. Перевір дозвіл або звернися до власника.' : 'Не вдалося завантажити приватну модель. Спробуй пізніше або звернися до власника.');
  const total = Number(response.headers.get('content-length')) || 0;
  if (total > config.maxModelBytes) { await response.body?.cancel(); throw new Error('Модель перевищує ліміт розміру.'); }
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > config.maxModelBytes) throw new Error('Модель перевищує ліміт розміру.');
      chunks.push(value); progress?.(size, total);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const buffer = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  validateGLB(buffer.buffer);
  return buffer.buffer;
}
