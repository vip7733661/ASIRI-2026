export async function runHealthCheck(context) {
  const checks = [];
  const record = (name, ok, detail = '') => checks.push({ name, ok, detail });

  record('DOM', Boolean(document.body), 'صفحة التطبيق جاهزة');
  record('Local Storage', (() => {
    try {
      const key = '__asiri_health__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  })(), 'التخزين المحلي متاح');

  record('Web Crypto', Boolean(window.crypto?.subtle), 'مطلوب لتسجيل الدخول الآمن');
  record('Spotify SDK', Boolean(window.Spotify?.Player), 'قد يصبح جاهزًا بعد تحميل السكربت');

  try {
    const token = await context.spotify.getAccessToken();
    record('Spotify Session', Boolean(token), 'الجلسة صالحة');
  } catch (error) {
    record('Spotify Session', error?.code === 'AUTH_REQUIRED', error?.message || 'غير متصل');
  }

  const featureStatus = context.registry.status();
  record('Critical Features', featureStatus.filter(x => x.critical).every(x => x.status === 'ready'), JSON.stringify(featureStatus));

  const result = {
    ok: checks.filter(x => x.name !== 'Spotify Session').every(x => x.ok),
    checks,
    checkedAt: Date.now(),
  };

  context.eventBus.emit('health:complete', result);
  return result;
}
