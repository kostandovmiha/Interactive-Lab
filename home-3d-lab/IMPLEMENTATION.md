# Implementation report

Статична архітектура Interactive Lab, незалежний український Home 3D Lab і попередні застосунки збережені. Початковий MVP у PR #3 має Google OAuth/PKCE, UUID allowlist, приватний каталог, GLTFLoader/hierarchy/transforms, bounds framing, Orbit, Pointer Lock/WASD, gravity/Octree/capsule collisions, visibility, disposal, logout cancellation та вигаданий трикімнатний будинок. Публічний config містить тільки Supabase project URL/publishable key.

## Живий провал, який виправляє цей PR

У тесті власника чинна Google-сесія мала `home3d_is_allowed=false` і `home3d_can_read_object=false`, але старий authenticated Storage URL повертав 200 і 44 660 bytes вигаданого GLB. Нова URL з cacheNonce відмовляла з 400/NoSuchKey. Перевірка реальних DB policies підтвердила private bucket, enabled RLS і правильні guards. Повторний upload з backend `private, no-store, max-age=0, must-revalidate` не усунув видачу GLB старою адресою. Отже, клієнтські no-store/nonce та SQL mocks не підтверджували потрібну семантику відкликання.

## Зміна

- Клієнт робить POST `/functions/v1/home3d-download` із JWT та model UUID. Більше немає direct GET/signed URL fallback і передачі storage path у запиті.
- Серверний handler перевіряє JWT через Auth, authenticated identity, чинний allowlist і enabled model через caller JWT/RLS. Service-role credential використовується тільки для читання фіксованого server-only vault. Дозвіл/каталог перевіряються повторно перед видачею bytes. POST responses/errors мають private/no-store і не копіюють cache headers Storage.
- Нова міграція додає `home-3d-vault` і RESTRICTIVE guards, які закривають прямі browser reads/writes нового **та старого** bucket навіть дозволеному UUID. Сторонні bucket не змінюються. Файли не переміщуються/видаляються SQL-ом.
- CORS точного origin, POST-only route, обмежений JSON body, строгий UUID/catalog path, фіксований bucket, контроль upstream redirects/timeout/розміру потоку, без privileged credentials у client/errors.
- `verify_jwt=false` налаштовано свідомо: перевірка токена реалізована всередині handler через Auth `/user`, незалежно від legacy gateway verifier. Не є анонімним доступом до GLB.

## Перевірено локально

- `node --test home-3d-lab/tests/core.mjs home-3d-lab/tests/download-gateway.mjs`: **16/16 passed**, без skipped; configuration/OAuth/GLB gates/client POST і server authorization regression cases. У тесті upstream завжди готовий видати cached GLB; після відкликання повторний ідентичний POST відхилено до privileged Storage fetch.
- `node home-3d-lab/tests/policies.mjs`: реальний PostgreSQL RLS engine PGlite; обидві міграції; anonymous/denied/allowed не читають новий/старий bucket, browser writes/self-allowlisting denied, broad policy capped, server role reads, unrelated bucket preserved. HTTP CDN тут не емулюється.
- `deno check supabase/functions/home3d-download/index.ts`: Deno entrypoint пройшов перевірку (Deno 2.5.4, залежності для function не потрібні). Реальний Deno HTTP runtime також повернув 503/no-store при відсутній server configuration; процес зупинено після перевірки.
- Chromium/WebGL: GitHub Pages subpath, missing config, 7 попередніх сторінок, pinned SDK import, mocked anonymous/denied/allowed UI, Orbit/WASD/Esc, collisions/GLB transforms/disposal, gateway 200/403, logout race, mobile. У Cloud pinned CDN resources доставлено незміненими через Python urllib з TLS validation, без browser TLS bypass. Auth/DB/Storage підмінено тільки тестовими fixtures.

CI повторює core/gateway/PostgreSQL/browser перевірки. Локальний pass не є результатом CI або живого Supabase deployment.

## Залишилося власнику

Застосувати другу міграцію; завантажити тільки вигаданий GLB у новий vault; розгорнути function (обидва файли); після review оновити Pages із PR; видалити старий демофайл через Storage Dashboard і перевірити стару URL після інвалідації CDN. Повторити same-POST warm/revoke tests, anonymous/denied/allowed direct GET/signing rejection і model disable за [ACCEPTANCE](ACCEPTANCE.md). Точні кроки — [HOME3D_GATEWAY_SETUP](../supabase/HOME3D_GATEWAY_SETUP.md).

Новий live security acceptance **не виконаний**, функцію з Cloud не розгорнуто, PR автоматично не зливається. Живий провал старого direct GET залишається відкритим до завершення переходу й перевірки старої URL. Справжня модель не потрапляла до репозиторію чи цього deployment.

Наступна віха після security acceptance: імпорт справжнього приватного GLB зі спрощеними collision meshes. Редактор меблів, stairs/step-up, touch walkthrough і Solar Roof Lab залишаються поза цією зміною.
