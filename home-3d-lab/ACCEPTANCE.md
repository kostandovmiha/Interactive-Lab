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
| Відкликання active | Наступний POST функції відхилено, навіть після успішного завантаження за тим самим URL/body; viewport очищається після recheck (до 30 с у активній вкладці) |
| Відсутня мережа/помилка перевірки | Viewer закривається; жодного fallback demo без auth |
| Orbit | Rotate, zoom, pan, reset коректні на desktop; touch Orbit на mobile |
| Walk | Pointer lock тільки після натискання, WASD, mouse look, speed, Esc; зміна mode й reset |
| Колізії | Не пройти через зовнішню/внутрішню стіну; пройти дверним отвором; не впасти крізь підлогу; приховані стіни лишаються solid |
| GLB | Унікальні object names/hierarchy, матеріали, orientation і реальні метри; bounds framing; origin wrapper |
| Заміна GLB | Старі meshes, materials/textures знищено, controls/collision tree оновлено |
| Помилковий GLB/зовнішній URI/надмірний розмір | Явна помилка, модель не показується |
| Visibility | Roof/floors/walls/furniture перемикаються згідно з aliases |
| Mobile 390 px | Без горизонтального overflow, login/model/Orbit доступні; Walk desktop-first |

## Серверна видача — обов’язкова жива перевірка

Спочатку завершити [перехід](../supabase/HOME3D_GATEWAY_SETUP.md). Усі bytes тільки вигаданого `fictional-house.glb`. Публічний ключ і JWT своєї тестової сесії використовувати локально; не вставляти JWT/службові ключі у чат, issues або screenshots.

1. POST `/functions/v1/home3d-download`, `Content-Type: application/json`, body `{ "model_id": "<UUID тестової моделі>" }`, header `apikey` — без Authorization: 401, не GLB.
2. Той самий POST із чинним JWT користувача без активного UUID: 403, не GLB.
3. Із дозволеним JWT: 200, GLB magic `glTF`; відповідь має `Cache-Control` із `no-store`. GET/HEAD до функції: 405, ніколи GLB.
4. Залишити ту саму сесію, попередньо успішно завантаживши файл. Вимкнути `active` через SQL Editor. Повторити **той самий POST URL, body і JWT без nonce** кілька разів: кожного разу 403, не GLB. Перевірити RPC false до й після тесту. Відновити `active` після завершення.
5. Повторити з `enabled=false`: 403/404, не GLB. Відновити тестовий запис.
6. Повторити з другого дозволеного користувача після відкликання першого: другий має 200. Якщо другого акаунта немає, позначити цей кейс невиконаним.
7. Вимкнена/відсутня функція, неправильна server config або помилка Auth/DB/Storage: жодного fallback до прямих Storage GET/signed URL, UI закритий.
8. Довільний `storage_path`, `bucket`, URL у POST або не-UUID ID: 400; зареєстрована вимкнена/відсутня модель: 403/404. Список каталогів не можна використати як довільний proxy.

## Прямий Storage — має відмовляти навіть дозволеному користувачу

Для anonymous, чинного Google JWT без дозволу **і дозволеного JWT**:

- GET `/storage/v1/object/authenticated/home-3d-vault/fictional-house.glb`: 4xx, не GLB, для звичайного URL та нового query параметра.
- GET `/storage/v1/object/public/home-3d-vault/fictional-house.glb`: 4xx, не GLB.
- POST `/storage/v1/object/sign/home-3d-vault/fictional-house.glb` із `{ "expiresIn": 60 }`: відмова, жодного signed URL.
- Upload/replace/delete/list об’єктів vault: відмова/порожній список; Dashboard власника працює.
- INSERT/UPDATE `home3d_allowed_users` із browser roles: відмова; user читає тільки свій активний UUID.

Також перевірити старі authenticated/public URL `home-3d-private/fictional-house.glb` після видалення старого демофайлу через Storage Dashboard та завершення інвалідації CDN. Повторити зі **старою сесією**, яка раніше отримувала GLB. Якщо старий URL ще віддає bytes, перехід не завершено: зберегти лише статус/cache headers і звернутися до Supabase support; реальну модель не завантажувати. SQL DELETE/UPDATE `storage.objects` не видаляє файл у backend і не є способом інвалідації.

Зафіксувати тільки HTTP status, GLB magic yes/no і pass/fail без токенів або bytes. Реальні POST/Storage/CDN тести після нового deployment ще не виконані в Cloud. Старий direct GET тест **не пройдено** за результатом власника; локальні тести нової реалізації не скасовують цей факт.
