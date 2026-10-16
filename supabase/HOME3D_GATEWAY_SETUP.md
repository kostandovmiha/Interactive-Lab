# Перехід Home 3D Lab на серверну видачу

Живий тест старої версії отримав GLB зі старого authenticated Storage URL після `active=false`, хоча RPC дозволу повертав false і origin за новим URL відмовляв. Повторний upload із backend `private, no-store` не усунув видачу через старий URL. Тому приватність більше не залежить від per-user CDN cache або параметра `cacheNonce`.

Новий потік: **browser POST + user JWT → Edge Function → Auth + allowlist + enabled model → server-only Storage → no-store POST response**. Новий vault не мав успішних browser downloads і за RLS їх не допускає. Жодних service-role keys у Pages, browser helpers чи GitHub secrets для цього не потрібно.

## 1. Міграція, без повтору першої

Якщо первинну `202610120001_home3d_private.sql` уже виконано, у Supabase SQL Editor як `postgres` застосувати **тільки** `migrations/202610160001_home3d_download_gateway.sql` цілком. Для нового проєкту — обидві за порядком. Скрипт не видаляє/переміщує files і не змінює службову таблицю через ALTER.

Після другої міграції стара версія private GLB viewer перестане отримувати origin downloads. Це очікувана безпечна зупинка до оновлення сайту. Авторизоване процедурне demo лишається доступним. Інші застосунки Interactive Lab не змінюються.

```sql
select id, public from storage.buckets
where id in ('home-3d-private', 'home-3d-vault');
```

Обидва `public=false`. Чотири `home3d_vault_*_guard` політики мають бути RESTRICTIVE на `storage.objects`; вони закривають обидва bucket для browser roles навіть за сторонніх broad policies. Дозволений UUID також не читає Storage напряму й не створює signed URL.

## 2. Тільки вигаданий файл у новому vault

У Storage Dashboard відкрити **home-3d-vault**, перевірити Private. Завантажити локальний вигаданий `fictional-house.glb` у корінь. Не робити bucket публічним. Не завантажувати справжній будинок, доки не пройдено всі негативні HTTP-тести.

Каталог `public.home3d_models` лишається той самий. Якщо тестовий запис уже має `storage_path='fictional-house.glb'`, його ID/settings змінювати не потрібно: сервер читає цей шлях тільки з нового vault. Довірений upload може використовувати Cache-Control `0`, але авторизація забезпечується функцією й закритим прямим читанням, а не цим заголовком.

## 3. Розгорнути home3d-download

### Через Supabase Dashboard, без локального CLI

1. Edge Functions → Deploy a new function → editor. Назва: **home3d-download**.
2. Додати обидва файли з `functions/home3d-download/` зі збереженням імен: **index.ts** і **handler.mjs**. `index.ts` імпортує `./handler.mjs`; жодних SDK/packages не потрібно.
3. Deploy. У налаштуваннях функції вимкнути gateway **Verify JWT / Enforce JWT verification** згідно з `supabase/config.toml`. Це вимикає лише legacy gateway verifier; **handler сам перевіряє кожний JWT через Auth `/user`**, вимагає authenticated user та перевіряє дозвіл/каталог у базі. Якщо прибрати ці перевірки з handler, функцію розгортати не можна.
4. Supabase автоматично надає `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` на сервері. Не копіювати значення у файли, браузер чи чат. Якщо системні env недоступні, функція відмовляє з 503; перевірити конфігурацію проєкту.
5. Production origin за замовчуванням — `https://kostandovmiha.github.io`. Для іншого сайту задати серверний `HOME3D_ALLOWED_ORIGIN` як один точний HTTPS origin, без path, без wildcard. OAuth redirect і надалі має повний `/Interactive-Lab/home-3d-lab/` path.

### Або через Supabase CLI

На власному комп’ютері з доступом до проєкту, з кореня checkout:

```sh
supabase login
supabase functions deploy home3d-download --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Deno локально не потрібен для Dashboard deployment. Не передавати service-role key у CLI arguments чи репозиторій. Автоматичний GitHub deployment у цьому PR не налаштовується.

## 4. Оновити сайт і завершити відключення старого шляху

Після review/CI власник може злити PR. Pages використовує наявний workflow. Новий app POST-ить лише model ID у `/functions/v1/home3d-download`; прямого Storage fallback немає. Без розгорнутої функції private model не відкриється.

Відкрити новий сайт, увійти дозволеним UUID і завантажити вигаданий GLB. Потім через **Storage Dashboard/API**, не SQL, видалити **тільки старий вигаданий** `home-3d-private/fictional-house.glb`. Залишити нову копію у vault. Видалення backend object запускає інвалідацію CDN; воно не забирає вже збережені користувачем копії. Не видаляти інші assets навмання.

Перевірити старий URL зі старою сесією після інвалідації. Якщо він усе ще віддає GLB, перехід не завершено; зафіксувати status/cache headers без JWT і звернутися до Supabase support. Не відновлювати старі permissive reads і не публікувати реальні assets як обхід.

## 5. Обов’язкова перевірка до справжньої моделі

Виконати [ACCEPTANCE](../home-3d-lab/ACCEPTANCE.md). Найважливіше:

- Дозволений user: POST → 200 GLB; той самий URL/body/JWT після `active=false` → 403 щоразу, без cacheNonce.
- Anonymous і чинний user без дозволу: POST → 401/403, без bytes.
- Прямий authenticated/public GET нового vault і створення signed URL: відмова **для всіх browser users**, включно з дозволеними.
- Старий демофайл видалено; старий URL більше не видає GLB.
- Відновити своє `active=true` після тесту. Тільки після всіх negative HTTP cases розглядати завантаження справжньої моделі.

Уже отримані bytes та початий дозволений потік не можна відкликати як DRM. Дозвіл перевіряється для кожного нового запиту і повторно перед видачею після відкриття upstream. Довірений server key ніколи не повертається клієнту. Не створювати власні signed URLs для vault.

При rollback UI лишити guards і vault private: private models можуть бути недоступні, але старий прямий GET відкривати не можна.
