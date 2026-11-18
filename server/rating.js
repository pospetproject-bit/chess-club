// Elo-рейтинг. Очки за победу/поражение/ничью, zero-сумма для PvP.
export const START_RATING = 1200;
export const BOT_RATING = { easy: 800, medium: 1200, hard: 1600 };
export const K_FRIEND = 32;
export const K_BOT = 20;

export const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));

// score: 1 победа, 0.5 ничья, 0 поражение. Возвращает изменение рейтинга.
export function delta(rating, oppRating, score, K) {
  return Math.round(K * (score - expected(rating, oppRating)));
}

export const scoreOf = (result, playerColor) =>
  result === 'draw' ? 0.5 : result === playerColor ? 1 : 0;
