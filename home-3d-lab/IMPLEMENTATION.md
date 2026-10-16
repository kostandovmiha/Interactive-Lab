# Implementation report

Виконано на `feature/home-3d-lab`. Збережено статичну архітектуру Interactive Lab і всі наявні модулі; homepage отримав одну нову картку. Нова папка містить незалежні ES-модулі, український адаптивний UI та порожню безпечну публічну конфігурацію.

Реалізовано Google OAuth через Supabase SDK/PKCE, перевірку сесії сервером, allowlist за UUID, приватний каталог моделей і автентифіковане завантаження GLB. Міграція створює приватний Storage bucket та RLS із restrictive guards проти сторонніх широких політик. Немає client uploads, public assets, службових ключів або live-demo обходу авторизації. Вихід/зміна сесії скасовують завантаження й знищують сцену.

3D: GLTFLoader, світова трансформаційна обгортка, hierarchy/names/materials, bounds framing, Orbit, Pointer Lock/WASD, швидкість/eye height/gravity, Octree/capsule collision, visibility aliases, disposal геометрії/матеріалів/текстур. Вигаданий процедурний будинок має три кімнати, стелю/підлогу, отвори, відкриті дверні полотна й умовні меблі.

## Перевірено локально

- `node --test home-3d-lab/tests/core.mjs`: **7/7 passed**, без skipped tests.
- `node home-3d-lab/tests/policies.mjs`: міграція виконується у PostgreSQL engine PGlite; anonymous/denied/allowed/revoked read outcomes, broad-policy guards, відмова browser upload/update/delete та self-allowlisting підтверджені. Мінімальні Supabase role/schema fixtures; реальний Storage HTTP service тут не запускався.
- `python3 home-3d-lab/tests/browser.py`: Chromium, WebGL, GitHub Pages subpath, missing-config state, 7 попередніх сторінок, real pinned Supabase SDK import, mocked anonymous/denied/allowed states і OAuth redirect, Orbit, group visibility, pointer lock, WASD, Esc, logout cleanup/race, private GLB fetch/403 response, mobile width — passed.
- Фізика: рух до західної стіни зупиняється біля `x=-3.69`, очі лишаються на `y≈1.65`; doorway між кімнатами пропускає рух, partition зупиняє. GLB roundtrip зберігає назви/ієрархію, поворот і nonuniform scale; додаткова origin/rotation/scale обгортка коректна, disposal викликається.
- `git diff --check`, JavaScript syntax checks, огляд staged files — без приватних assets/привілейованих credentials.

Додано PR workflow `home-3d-checks.yml` для повторення core/RLS/browser перевірок. Запуск у GitHub Actions — окремий результат; локальний pass не означає, що CI вже завершено.

## Виправлення під час живого налаштування

Supabase SQL Editor відхилив `ALTER TABLE storage.objects` із `must be owner of table objects`. Прибрано непотрібну зміну службової таблиці: RLS вмикає платформа, а міграція перевіряє його наявність до створення об’єктів застосунку. Перевірки політик залишено. Додано regression check, що не допускає managed-table ALTER, та PostgreSQL-кейс для відсутнього Storage RLS: установка закривається без частково створених таблиць/bucket. Адміністративні policy grants Supabase відрізняються від звичайного PostgreSQL ownership; PGlite їх не емулює. Успішне виконання виправленої міграції у живому Supabase ще має підтвердити власник.

## Публічна конфігурація розгортання

До `config.js` додано URL проєкту та publishable key, надані власником. Порожній шаблон збережено у `config.example.js`. Власник повідомив про успішне виконання виправленої міграції та налаштування Google provider/redirects. Живий Google-вхід і Storage HTTP ще потребують перевірки; запити Cloud до домену Supabase наразі блокуються мережевим проксі. Синтаксична валідація ключа не підтверджує, що він приймається сервером. Тест відсутньої конфігурації тепер явно підставляє порожній fixture, не залежачи від production settings.

## Потребує власника

Створити Supabase-проєкт, застосувати міграцію, увімкнути Google provider із secret тільки в Dashboard, налаштувати exact callback/app redirects, заповнити public config і дозволені UUID. Після цього виконати всі direct Storage HTTP та live OAuth кейси в ACCEPTANCE.md з вигаданим файлом. Реальну модель завантажувати лише в перевірений private bucket, не в репозиторій. Ні живу production authentication, ні інтеграційний HTTP захист у неналаштованому проєкті тут не заявлено працюючими.

Наступна віха: end-to-end security acceptance на реальному Supabase з вигаданим GLB, потім імпорт приватної моделі зі спрощеними collision meshes. Furniture editing, lights, stairs/step-up, touch walkthrough і Solar Roof Lab залишаються поза MVP.
