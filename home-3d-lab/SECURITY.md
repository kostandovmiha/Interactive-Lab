# Security checklist

**Поточний стан:** власник підтвердив провал старого direct Storage GET після відкликання дозволу, навіть із backend `no-store`. Нова серверна видача перевірена локально; її живий deployment/HTTP acceptance ще не виконано. Реальну модель не завантажувати до завершення переходу.

Перед production власник має перевірити:

- [ ] Обидві міграції застосовано до потрібного проєкту; RLS увімкнено на таблицях і `storage.objects`.
- [ ] `home-3d-vault` і старий `home-3d-private` приватні. Чотири `home3d_vault_*_guard` RESTRICTIVE політики забороняють browser reads/writes обох bucket, навіть дозволеному UUID.
- [ ] Немає копій приватних assets у public bucket, Pages, Git history, CI artifact або публічному backup.
- [ ] `home3d-download` розгорнуто з обома файлами. Gateway `verify_jwt=false` компенсовано обов’язковими server-side Auth `/user`, authenticated role, UUID allowlist і model RLS checks на **кожний POST**.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` доступний тільки довіреному серверу/Dashboard, не Pages/browser/чат/GitHub. Відповіді й помилки не розкривають credential, upstream URL або довільні backend error bodies.
- [ ] Origin функції — точний HTTPS origin сайту; Google callback і app redirect allowlist збережено з Pages subpath.
- [ ] Новий viewer приймає лише model UUID; відсутній direct Storage/signed URL fallback. Клієнт не вибирає bucket/path/URL.
- [ ] POST відхиляє anonymous, valid JWT без дозволу, вимкнену/відсутню модель й помилки Auth/DB/Storage. Перед bytes повторно перевірено active UUID і каталог.
- [ ] Після успішного завантаження той самий POST URL/body/JWT кілька разів відхилено при `active=false`; headers мають `no-store`. Локальні unit mocks цього живого тесту не замінюють.
- [ ] Прямий authenticated/public GET і створення signed URL нового vault відхилено для anonymous, denied **і allowed** користувача.
- [ ] Старий вигаданий object видалено через Storage Dashboard/API, не SQL. Стара URL зі старою сесією не віддає GLB після інвалідації кешу; інакше міграцію ще не завершено.
- [ ] Вихід скасовує запит/очищає viewport, recheck доступу закриває UI. Service worker у цьому модулі відсутній.
- [ ] Самодостатній GLB, ліміт 100 MiB, відсутні зовнішні URI/непідтримані codecs; server stream також обмежує bytes і не повертає довільні upstream headers.
- [ ] Browser roles не можуть змінювати allowlist/catalog або vault. Allowlist UUID перевіряє власник; client email matching не використовується.
- [ ] Dashboard обмежено довіреними адміністраторами з MFA; усі програми того ж origin і JS dependencies довірені.

Перевірено локально: PostgreSQL RLS двох міграцій, широкі сторонні політики, заборона reads/writes browser roles і server read; серверний handler на керованих HTTP-відповідях, включно з кешованим upstream GLB та відкликаним UUID; frontend POST construction/fail-closed, rendering/navigation/collisions/logout. Cloud не мав живого Auth/Storage доступу й не розгортав функцію.

Кеш upstream Storage не є authorization boundary нового viewer: доступ до нього має тільки сервер, а він не кешує дозвіл чи власну POST response. Дозволений користувач може зберегти отримані bytes; відкликання не видаляє копії й не перериває гарантовано вже початий дозволений потік. Це контроль нових запитів, не DRM. Довірений адміністратор із service key може обійти RLS і відповідає за assets.
