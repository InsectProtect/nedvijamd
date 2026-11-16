// Telegram: проверка входа из Mini App, вебхук бота и уведомления.
const crypto = require('crypto');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = process.env.TG_API_BASE || 'https://api.telegram.org';
const enabled = () => !!TOKEN;
const webhookSecret = () => crypto.createHash('sha256').update('dolya:' + TOKEN).digest('hex').slice(0, 48);
let botUsername = process.env.TELEGRAM_BOT_USERNAME || '';

async function call(method, params = {}) {
  if (!TOKEN) return null;
  try {
    const r = await fetch(`${API_BASE}/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) console.warn(`telegram ${method}:`, j.description || r.status);
    return j.ok ? j.result : null;
  } catch (e) {
    console.warn(`telegram ${method} failed:`, e.message);
    return null;
  }
}

// Проверка подписи initData по документации Telegram Mini Apps
function verifyInitData(initData, maxAgeSec = 7 * 24 * 3600) {
  if (!TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return { user, startParam: params.get('start_param') || '' };
  } catch {
    return null;
  }
}

const openButton = (text, url) => ({ inline_keyboard: [[{ text, web_app: { url } }]] });

async function send(chatId, text, url, buttonText = 'Открыть в Доле') {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: url ? openButton(buttonText, url) : undefined
  });
}

async function setup(publicUrl) {
  if (!TOKEN) return;
  const me = await call('getMe');
  if (me && me.username) botUsername = me.username;
  if (!publicUrl) {
    console.warn('PUBLIC_URL/RENDER_EXTERNAL_URL не задан — вебхук Telegram не настроен');
    return;
  }
  await call('setWebhook', {
    url: `${publicUrl}/tg/webhook`,
    secret_token: webhookSecret(),
    allowed_updates: ['message'],
    drop_pending_updates: true
  });
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Доля', web_app: { url: `${publicUrl}/` } } });
  await call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть Долю' }] });
  await call('setMyDescription', { description: 'Доля — учёт совместных вложений в недвижимость: взносы, расходы с чеками, план и факт, доли и прогноз прибыли. Нажмите «Запустить», затем кнопку «Доля».' });
  console.log(`Telegram-бот @${botUsername} подключён`);
  // Диагностика: куда Telegram шлёт обновления и были ли ошибки доставки
  setTimeout(async () => {
    const info = await call('getWebhookInfo');
    const menu = await call('getChatMenuButton', {});
    console.log('telegram webhook:', JSON.stringify(info), 'menu:', JSON.stringify(menu));
  }, 20000);
}

const escHtml = (s) => String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = {
  enabled,
  call,
  send,
  setup,
  verifyInitData,
  webhookSecret,
  escHtml,
  openButton,
  username: () => botUsername
};
