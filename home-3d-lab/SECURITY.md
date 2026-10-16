# Security checklist

Перед production власник має перевірити:

- [ ] Міграція застосована до потрібного Supabase-проєкту; RLS увімкнено на обох таблицях і `storage.objects`.
- [ ] Bucket `home-3d-private` приватний; жодної копії моделі у public bucket, GitHub Pages, Git history, CI artifact або публічному backup немає.
- [ ] Google OAuth callback вказує на Supabase; app redirect allowlist точно включає GitHub Pages subpath.
- [ ] У коді тільки publishable/anon key; service-role/secret key та OAuth secret є лише в Dashboard/довіреному сервері.
- [ ] Дозволені `auth.users.id` перевірені власником; немає client-side email allowlist, client writes або самореєстрації дозволу.
- [ ] Каталог моделі приватний; тільки увімкнені exact object paths доступні.
- [ ] Прямі authenticated/public Storage URL перевірено з анонімним, недозволеним і дозволеним користувачами за планом ACCEPTANCE.
- [ ] Відкликання дозволу блокує нові запити; logout очищає viewport і скасовує download.
- [ ] Приватний GLB самодостатній; зовнішні URL й сторонні resource extensions не використовуються.
- [ ] Cache-Control приватних upload налаштовано на `0`; app використовує no-store і не встановлює service worker.
- [ ] Тестові облікові записи/fixtures не залишено в production; приватні assets не використовуються в browser suite.
- [ ] Доступ до Supabase Dashboard обмежено довіреними адміністраторами з MFA; адміністратор може обійти RLS і відповідає за bucket privacy.
- [ ] JS залежності й усі застосунки на цьому origin довірені; оцінено потребу в окремому origin/self-hosted dependencies.

Перевірено локально: серверні RLS predicates у PostgreSQL engine, заборону browser writes і self-allowlisting, fail-closed client states, secure download construction, GLB URI gate, logout cleanup/race. Результати live HTTP/Auth поки не підтверджено.

Дозволений користувач може зберегти отриману модель або створити власний signed URL через Supabase API, якщо Storage дозволяє читання. App таких URL не створює. Відкликання не знищує вже отримані копії. Не передавай дозволи людям, яким не можна довірити сам файл.
