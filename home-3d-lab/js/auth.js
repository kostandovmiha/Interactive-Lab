import { redirectURL } from './configuration.js';

export class AuthorizationError extends Error {}

export class Auth {
  constructor(client) { this.client = client; }
  async authorize() {
    const { data: { session }, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw new AuthorizationError('Не вдалося прочитати сесію. Увійди повторно.');
    if (!session) return null;
    // Server validates JWT; local session/email claims alone never grant access.
    const { data: { user }, error } = await this.client.auth.getUser();
    if (error || !user || user.id !== session.user.id) throw new AuthorizationError('Сесію не підтверджено сервером. Увійди повторно.');
    const { data: row, error: denied } = await this.client.from('home3d_allowed_users')
      .select('user_id').eq('user_id', user.id).eq('active', true).maybeSingle();
    if (denied) throw new AuthorizationError('Не вдалося перевірити дозвіл. Доступ закрито.');
    if (!row || row.user_id !== user.id) throw new AuthorizationError('Для цього облікового запису немає дозволу. Звернися до власника.');
    return { userId: user.id, token: session.access_token };
  }
  async models() {
    const { data, error } = await this.client.from('home3d_models')
      .select('id,label,storage_path,settings').eq('enabled', true).order('label');
    if (error) throw new Error('Не вдалося отримати список приватних моделей.');
    return data || [];
  }
  async signIn() {
    const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectURL(location.href) } });
    if (error) throw new Error('Не вдалося почати вхід через Google.');
  }
  async signOut() {
    const { error } = await this.client.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Вихід не підтверджено сервером. Перегляд закрито; повтори вихід.');
  }
}
