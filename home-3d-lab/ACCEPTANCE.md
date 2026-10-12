# Manual acceptance plan

Виконати після налаштування Supabase/Google, спочатку з вигаданим self-contained GLB. Використовувати окремі профілі браузера: anonymous, Google user **без UUID у allowlist**, user **з active UUID**. Не використовувати справжній будинок до перевірки всіх негативних HTTP-кейсів. Не записувати токени або приватні bytes у screenshots/logs/issue.

| Перевірка | Очікуваний результат |
| --- | --- |
| Home card за `/Interactive-Lab/` | Веде в `/Interactive-Lab/home-3d-lab/`, інші картки/ігри працюють |
| Порожній `config.js` | Явна помилка налаштування, кнопки моделі disabled, немає Storage запитів |
| Anonymous | Google-вхід доступний, demo/private viewer закриті |
| Google user без дозволу | OAuth завершується, потім «Доступ закрито»; немає моделі/каталогу |
| Дозволений UUID | Видно приватний каталог і demo, моделі відкриваються |
| Інший email/UUID із тим самим доменом | Доступ закрито, якщо UUID не додано адміністратором |
| Вихід під час завантаження | Запит скасовано, модель не з’являється після виходу |
| Відкликання active | Наступний Storage GET відхилено; viewport очищається після recheck (до 30 с у активній вкладці) |
| Відсутня мережа/помилка перевірки | Viewer закривається; жодного fallback demo без auth |
| Orbit | Rotate, zoom, pan, reset коректні на desktop; touch Orbit на mobile |
| Walk | Pointer lock тільки після натискання, WASD, mouse look, speed, Esc; зміна mode й reset |
| Колізії | Не пройти через зовнішню/внутрішню стіну; пройти дверним отвором; не впасти крізь підлогу; приховані стіни лишаються solid |
| GLB | Унікальні object names/hierarchy, матеріали, orientation і реальні метри; bounds framing; origin wrapper |
| Заміна GLB | Старі meshes, materials/textures знищено, controls/collision tree оновлено |
| Помилковий GLB/зовнішній URI/надмірний розмір | Явна помилка, модель не показується |
| Visibility | Roof/floors/walls/furniture перемикаються згідно з aliases |
| Mobile 390 px | Без горизонтального overflow, login/model/Orbit доступні; Walk desktop-first |

## Прямі Storage запити — обов’язково

У Network DevTools або локальному HTTP-клієнті використовуй **тільки вигаданий тестовий файл** і публічний publishable/anon key. Реальні JWT бери зі своєї тестової сесії локально, не вставляй у чат чи issue.

1. GET `https://<ref>.supabase.co/storage/v1/object/authenticated/home-3d-private/<test-path>.glb`, headers `apikey: <publishable-key>`, без Authorization: 4xx, **не байти GLB**.
2. Той самий GET з `Authorization: Bearer <non-allowlisted-user-jwt>`: 4xx, **не GLB**. Supabase може маскувати denied як not found; перевір bytes/content, не лише конкретний status.
3. Той самий GET з дозволеним JWT: 200 і GLB magic `glTF`.
4. GET `/storage/v1/object/public/home-3d-private/<test-path>.glb` без JWT: 4xx; перевір також із JWT, private bucket не повинен ставати public.
5. Відключи модель (`enabled=false`) або відклич user (`active=false`), повтори authenticated GET зі ще чинним JWT: 4xx.
6. З обох browser roles спробуй INSERT у `home3d_allowed_users`, upload/replace/delete цього bucket: відмова. Owner Dashboard залишається адміністративним шляхом.
7. Перевір невключений у каталог object path: відмова навіть для дозволеного user.
8. Перевір запит списку allowlist: user бачить тільки свій активний UUID. Anonymous не читає таблиці/каталог.

Зафіксуй тільки статуси, тип відповіді й pass/fail; не зберігай секрети. Ці HTTP-перевірки та живий Google OAuth ще **не виконані** у Codex через відсутність налаштованого Supabase-проєкту.
