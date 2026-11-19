// Разбор ответа Adsgram SDK → понятное сообщение на русском.
// Чистая функция (без DOM) — покрыта юнит-тестами.
// SDK возвращает/бросает объект { description, state, error, done }.
export function adOutcome(r) {
  const d = String(r?.description || r?.message || (typeof r === 'string' ? r : '') || '');
  const raw = r && typeof r === 'object' ? r : { description: d };
  const res = (ok, msg, extra = {}) => ({ ok, msg, err: false, silent: false, raw, ...extra });

  // Награда засчитана только если ролик досмотрен и это не антифрод.
  if (r?.done && !/антифрод|anti-fraud/i.test(d)) return res(true, '');
  if (/no banner|нет доступной рекламы|no ads available/i.test(d))
    return res(false, 'Свободных роликов сейчас нет 🙏 Попробуй через минуту');
  if (/several ads in a row|слишком часто/i.test(d))
    return res(false, 'Слишком часто 🙏 Подожди 10 секунд и попробуй снова', { silent: true });
  if (/being shown/i.test(d))
    return res(false, 'Реклама уже показывается', { silent: true });
  if (/skipped/i.test(d))
    return res(false, 'Ролик закрыт до конца — награда не начислена');
  if (/антифрод|anti-fraud/i.test(d))
    return res(false, 'Реклама не засчитана (антифрод Adsgram). Попробуй позже');
  if (/render/i.test(d))
    return res(false, 'Не удалось открыть ролик. Обнови Telegram до последней версии', { err: true });
  if (/playing|player/i.test(d))
    return res(false, 'Видео не запустилось. Выключи энергосбережение и VPN/блокировщик рекламы', { err: true });
  return res(false, 'Реклама недоступна: ' + (d || 'неизвестная ошибка'), { err: true });
}
