// Библиотека задач (чистые данные — проверяются тестами).
export const PUZZLES = [
  { id: 'p1', title: 'Последняя горизонталь', theme: 'мат в 1', rating: 600, fen: '6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1', solution: ['e1e8'] },
  { id: 'p2', title: 'Лестница', theme: 'мат в 1', rating: 650, fen: '7k/R7/8/8/8/8/8/1R5K w - - 0 1', solution: ['b1b8'] },
  { id: 'p3', title: 'Ферзь и король', theme: 'мат в 1', rating: 700, fen: '6k1/8/6K1/8/8/8/8/7Q w - - 0 1', solution: ['h1a8'] },
  { id: 'p4', title: 'Сплочённый мат', theme: 'мат в 1', rating: 900, fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', solution: ['g5f7'] },
  { id: 'p5', title: 'Детский мат', theme: 'мат в 1', rating: 750, fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1', solution: ['h5f7'] },
  { id: 'p6', title: 'Ферзь по задней линии', theme: 'мат в 1', rating: 600, fen: '6k1/5ppp/8/8/8/8/8/3Q2K1 w - - 0 1', solution: ['d1d8'] },
  { id: 'p7', title: 'Тихий ход', theme: 'мат в 2', rating: 1100, fen: '7k/8/5K2/8/8/8/8/7Q w - - 0 1', solution: ['h1h6', 'h8g8', 'h6g7'] },
  { id: 'p8', title: 'Отвлечение ладьи', theme: 'мат в 2', rating: 1200, fen: '6k1/5ppp/8/8/8/8/1r6/R5K1 w - - 0 1', solution: ['a1a8', 'b2b8', 'a8b8'] },
  { id: 'p9', title: 'Мат Филидора', theme: 'мат в 2', rating: 1300, fen: '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1', solution: ['b3g8', 'f8g8', 'h6f7'] },
  { id: 'p10', title: 'Вилка на миллион', theme: 'выигрыш ладьи', rating: 1000, fen: 'r2qk3/pp3ppp/2n5/3N4/8/8/PPP2PPP/R3K3 w Q - 0 1', solution: ['d5c7', 'e8f8', 'c7a8'] },
  { id: 'p11', title: 'Шампур', theme: 'выигрыш ферзя', rating: 950, fen: '8/1q6/8/1k6/8/8/8/R5K1 w - - 0 1', solution: ['a1b1', 'b5c5', 'b1b7'] },
  { id: 'p12', title: 'Съеденная защита', theme: 'мат в 1', rating: 800, fen: '3r2k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 1', solution: ['d1d8'] },
];
