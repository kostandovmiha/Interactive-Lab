# Home 3D Lab · MVP

Приватний переглядач будинку всередині публічного Interactive Lab. Статичні HTML/CSS/ES-модулі, Three.js 0.180.0, Supabase Auth (Google, PKCE), PostgreSQL RLS і приватний Storage. Демо повністю вигадане й відкривається лише після перевірки UUID користувача. Реального будинку, адрес, планів або фотографій у репозиторії немає.

**Стан:** локальні автоматичні перевірки виконано; живий Supabase, Google OAuth і прямі HTTP-завантаження з реального Storage потребують налаштування власником. Без `config.js` модуль показує явну помилку й не завантажує модель. Це очікувана безпечна поведінка нової інсталяції.

## Архітектура

| Файл | Відповідальність |
| --- | --- |
| `js/app.js` | UI, стани доступу, скасування запитів, зміна моделі, очищення при виході |
| `js/auth.js` | Google-вхід/вихід, перевірка сесії сервером та дозволеного UUID |
| `js/assets.js` | Автентифікований GET приватного GLB, ліміти, перевірка самодостатності |
| `js/model.js` | GLTFLoader, трансформаційна обгортка, групи, утилізація ресурсів |
| `js/scene.js` | WebGL, освітлення, bounds, OrbitControls, подія `modelchange` |
| `js/walkthrough.js` | PointerLockControls, капсула, Octree, гравітація й колізії |
| `js/demo.js` | Вигаданий будинок: три кімнати, дверні отвори, підлога, стеля, меблі |
| `../supabase/migrations/202610120001_home3d_private.sql` | Таблиці дозволів/моделей, приватний bucket і RLS |

Немає білого списку email у JavaScript, тестового параметра URL або анонімного деморежиму. Зміна UI чи виклик Storage вручну не обходять серверні політики. Публічний URL та publishable/anon key ідентифікують проєкт; вони не є дозволом на читання.

## 1. Supabase

1. Створи Supabase-проєкт, бажано окремий для приватного будинку. Запиши HTTPS URL `https://<project-ref>.supabase.co` та **publishable** key (або старий **anon** key).
2. У SQL Editor виконай міграцію `supabase/migrations/202610120001_home3d_private.sql` один раз, або застосуй її через Supabase CLI migrations. Скрипт транзакційний; повторне ручне виконання після успіху не потрібне.
3. Перевір, що Storage bucket `home-3d-private` має **Public = false**. Міграція встановлює це навіть для bucket з таким самим ID, якщо він уже існував. Не роби його публічним: public Storage не забезпечує потрібний захист скачування через RLS.
4. Таблиця `home3d_allowed_users` допускає SELECT лише власного активного UUID; browser roles не можуть додавати себе, змінювати дозволи або каталог. `home3d_models` доступна лише дозволеним користувачам.
5. Storage SELECT допускається лише для активного дозволеного UUID та точного шляху увімкненої моделі в каталозі. Restrictive guard обмежує інші permissive політики читання цього bucket. INSERT/UPDATE/DELETE для browser roles цього bucket заборонено, навіть за наявності широких політик іншого застосунку. Інші bucket міграція не закриває.
6. Адмініструй таблиці й завантажуй моделі через Dashboard/довірений сервер. `service_role`, secret keys і OAuth secret не потрібні вебклієнту та не повинні потрапляти у Git, чат, браузер або конфігурацію сайту.

## 2. Google OAuth

1. У Google Cloud створи OAuth consent screen і **Web application** OAuth client. У режимі Testing додай потрібних тестових користувачів.
2. Google **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback` (точне значення показує Supabase Google provider). JavaScript origin для сайту, якщо консоль його вимагає: `https://kostandovmiha.github.io`.
3. У Supabase → Authentication → Sign In / Providers → Google увімкни provider. Client ID і **client secret** вводяться лише в Supabase Dashboard.
4. Supabase Authentication → URL Configuration:
   - Site URL: `https://kostandovmiha.github.io/Interactive-Lab/home-3d-lab/`
   - Redirect allowlist: це саме повне значення з кінцевим `/`.
   - Для локальної перевірки додай конкретний origin/path, наприклад `http://localhost:8000/home-3d-lab/`. Для перевірки підшляху — `http://localhost:8000/Interactive-Lab/home-3d-lab/`. Не додавай широких production wildcard redirects.
5. Код обчислює redirect від поточного каталогу модуля, зберігаючи `/Interactive-Lab/`, й видаляє query/hash. PKCE виконує SDK. Сесія зберігається у `sessionStorage` вкладки, а не довготривало в `localStorage`. Вихід закриває перегляд негайно й завершує поточну локальну сесію.

## 3. Дозволені користувачі

Після першого Google-входу користувач може існувати в Supabase Auth, але бачить **«Доступ закрито»**. У Dashboard → Authentication → Users знайди його точний UUID, перевір особу й додай UUID у SQL Editor:

```sql
-- Замінити UUID реальним auth.users.id, лише після перевірки власником.
insert into public.home3d_allowed_users (user_id, active)
values ('00000000-0000-4000-8000-000000000001', true);
```

UUID прикладу не є наявним/дозволеним користувачем. Немає автоматичного доступу за доменом email. Усі дозволені користувачі MVP читають усі увімкнені моделі цього проєкту; індивідуальні дозволи на будинок — наступне розширення.

Для відкликання:

```sql
update public.home3d_allowed_users set active = false
where user_id = '00000000-0000-4000-8000-000000000001';
```

Storage відхиляє наступні запити одразу після застосування зміни. Відкритий клієнт перевіряє дозвіл кожні 30 с, при поверненні до вкладки й перед/після завантаження; при помилці/відкликанні очищає сцену. Уже отримані байти неможливо відібрати в дозволеного користувача: він може зберегти їх. Це контроль доступу, не DRM.

## 4. Публічна конфігурація та GitHub Pages

`config.js` — готовий приклад без секретів. Заповни тільки `supabaseUrl` та `supabasePublishableKey`; решта значень мають безпечні типові налаштування. Не додавай UUID користувачів, приватні шляхи/плани, токени або секрети до цього файлу. Каталог приватних моделей зберігається в базі з RLS.

GitHub Pages має публікувати корінь чинного репозиторію так само, як попередні модулі. Нового build pipeline немає. Посилання `./home-3d-lab/`, CSS та ES-модулі відносні й працюють за `/Interactive-Lab/`. Homepage має публічну картку; доступ до моделі перевіряється окремо. Не змінюй існуючі workflow генерації голосів для deployment цього модуля.

Залежності завантажуються з `cdn.jsdelivr.net` з фіксованими версіями. CSP дозволяє тільки цей script origin та Supabase HTTPS destinations для запитів. При зміні import map онови її SHA-256 у CSP. Нестандартний Supabase custom domain у MVP не підтримується; URL validator та CSP навмисно обмежені `*.supabase.co`. Для Cloud live-тесту потрібно додати конкретний `<project-ref>.supabase.co` у мережеві налаштування; звичайний браузер користувача не залежить від Cloud allowlist.

Локальний запуск із кореня checkout:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

GitHub Pages не дозволяє HTTP response headers для захисту між модулями. Усі програми на цьому origin треба вважати довіреними; CSP знижує ризик XSS, але не ізолює Home Lab від скомпрометованого сусіднього застосунку того ж origin. Для підвищеної ізоляції наступним кроком розглянь окремий origin і self-hosted JS залежності.

## 5. Приватний GLB

Експортуй **GLB 2.0**, Y-up, у метрах, з текстурами всередині. Застосуй/перевір transforms у Blender/3ds Max. GLTFLoader зберігає імена, дерево вузлів, матеріали та початкові локальні transforms; додаткова обгортка відповідає за origin/orientation/scale без переписування вузлів. GLTFLoader може нормалізувати недопустимі символи/дублікати імен — використовуй унікальні прості імена.

Завантаж GLB через Supabase Dashboard у `home-3d-private`, наприклад за шляхом `house/main.glb` (приклад, не реальний asset). Рекомендований Cache-Control для приватного файлу: `0`. Не клади GLB у GitHub checkout або Pages. Після upload додай запис через SQL Editor:

```sql
insert into public.home3d_models (label, storage_path, settings)
values ('Мій будинок', 'house/main.glb', '{
  "scale": 1,
  "origin": [0,0,0],
  "rotationDegrees": [0,0,0],
  "walkthroughSpawn": [-2,0.05,-2],
  "collisionNames": ["COLLISION_"]
}'::jsonb);
```

`origin` — світове зміщення обгортки; `rotationDegrees` — Euler XYZ, градуси; `scale` — додатний коефіцієнт імпорту; `walkthroughSpawn` — **світові координати стоп у метрах після всіх transforms**. Прибери `collisionNames`, якщо треба використовувати всі статичні меші. За наявності префікса `COLLISION_` експортуй прості окремі collision meshes; їх можна приховати у вихідній сцені, колізії все одно включають їх. Вказані імена шукаються регістронезалежно в мешах і батьківських групах. Колізії не залежать від перемикачів видимості.

Групи видимості визначає `config.groups` за частинами імен мешів/батьків. Для різних exporter conventions змінюй aliases. Меш, що належить кільком групам, видимий лише якщо всі його групи увімкнено.

Файл отримується тільки через `/storage/v1/object/authenticated/home-3d-private/...` з JWT у заголовку, `cache: no-store`, без query token або public URL. App не генерує signed URLs. Зовнішні image/buffer URI, включно з data URI, відхиляються: всі ресурси мають бути у GLB bufferViews. Draco, KTX2, Meshopt і нестандартні required extensions потребують майбутнього явного decoder support. Ліміт app/bucket за замовчуванням — 100 MiB. Анімація не відтворюється. Для skinned/instanced мешів потрібні окремі статичні колізії; якщо їх немає, залишається Orbit і зрозуміла помилка прогулянки.

## Керування та межі MVP

- Orbit: ліва кнопка/дотик — обертання, колесо/pinch — zoom, права кнопка — pan, «Повернути камеру» — bounds framing.
- Walk: обрати «Прогулянка», натиснути кнопку у viewport; WASD і mouse look, Esc звільняє курсор. Швидкість 0,5–5 м/с, очі 1,65 м, гравітація 9,81 м/с².
- Капсула та Octree використовують статичні трикутники у world space. Обмежені кроки фізики запобігають проходженню крізь демостіни; підтримано ковзання й підлогу. Стрибків, сходового step-up, рухомих дверей, ліфтів і складної фізики ще немає. Великі meshes варто замінити спрощеними collision meshes; автоматичного BVH/LOD/streaming немає.
- Mobile: адаптивний viewport, авторизація, Orbit і visibility; touch walkthrough ще не реалізовано.
- Furniture tools, doors, measurements, lights, saved layouts і Solar Roof Lab не реалізовані. `HouseScene` дає світову обгортку, bounds та `modelchange`; майбутні модулі можуть працювати в тій самій метричній Y-up системі координат без доступу до auth token. Цей event не є окремим дозволом на дані.

## Автоматичні перевірки

Запускати з кореня репозиторію. Залежності тестів встановлюються поза checkout:

```sh
node --test home-3d-lab/tests/core.mjs
npm --prefix /tmp/home3d-tools --cache /tmp/home3d-npm-cache install --no-audit --no-fund @electric-sql/pglite@0.3.14
node home-3d-lab/tests/policies.mjs
python3 home-3d-lab/tests/browser.py
```

Browser suite потребує Python Playwright і Chromium (наявні в Codex Cloud); `HOME3D_CHROMIUM` може вказувати явний binary, інакше використовується системний або bundled Playwright Chromium; на іншій машині встанови їх через звичайні перевірені пакети. Cloud HTTPS proxy CA має бути довіреним для Chromium: встановлений environment `install_script` реєструє `CODEX_PROXY_CERT` у NSS; не застосовуй `ignore_https_errors`/`--ignore-certificate-errors`. Тести стартують/зупиняють власний локальний HTTP-сервер, не змінюють джерела, генерують лише вигаданий GLB у пам’яті. Знімок демо пишеться в `/tmp/home3d-demo.png`.

`core.mjs`: configuration, OAuth subpath, UUID authorization, Storage headers/errors/limits, GLB restrictions. `policies.mjs`: **справжній PostgreSQL RLS engine** через PGlite з мінімальними Supabase schema/role fixtures. Перевіряє anonymous/denied/allowed/revoked, broad-policy guard і заборону browser writes/self-allowlisting. `rls.sql` також можна виконати через `psql -v ON_ERROR_STOP=1` у ізольованій локальній Supabase DB після міграції; fixture transaction відкочується. **Не запускай fixture SQL на production.**

`browser.py`: реальний Chromium/WebGL і pinned SDK import, але Auth/Storage integration підмінено контрольованими відповідями тільки в тестовому браузері. Це перевіряє UI, HTTP request construction, rendering, pointer lock, WASD, колізії, GLB, logout race і підшлях. Це **не підтверджує** живий Google-вхід, налаштування реального Supabase або відмову прямого HTTP Storage запиту на production.

Див. [SECURITY.md](SECURITY.md), [ACCEPTANCE.md](ACCEPTANCE.md) і [IMPLEMENTATION.md](IMPLEMENTATION.md).
