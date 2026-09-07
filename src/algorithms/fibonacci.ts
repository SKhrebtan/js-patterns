// Fibonacci — що це взагалі?
//
// Послідовність: 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, ...
// Правило: F(n) = F(n - 1) + F(n - 2)
// Тобто кожне число = два попередніх, складені разом.
//
// F(0) = 0
// F(1) = 1
// F(2) = F(1) + F(0) = 1 + 0 = 1
// F(3) = F(2) + F(1) = 1 + 1 = 2
// F(4) = F(3) + F(2) = 2 + 1 = 3
// F(5) = F(4) + F(3) = 3 + 2 = 5
// F(6) = F(5) + F(4) = 5 + 3 = 8
//
// n:    0  1  2  3  4  5  6  7
// F(n): 0  1  1  2  3  5  8  13

// Приклад 1 — просто знайти Fibonacci(6) //
// Дивимося на правило: F(6) = F(5) + F(4)
// Треба знайти F(5) = F(4) + F(3), і F(4) = F(3) + F(2).
// Якщо все розписати:
//
// F(6)
// │
// ├── F(5)
// │   ├── F(4)
// │   │   ├── F(3)
// │   │   └── F(2)
// │   │
// │   └── F(3)
// │
// └── F(4)
//     ├── F(3)
//     └── F(2)
//
// Внизу доходить до базових випадків: F(0) = 0, F(1) = 1.
// Після цього результати повертаються назад:
// F(2) = 1, F(3) = 2, F(4) = 3, F(5) = 5, F(6) = 8
//
// fib(6) // 8

// Приклад 2 — Fibonacci через recursion //
// Це класичний приклад recursion: функція викликає сама себе.
function fibRecursive(n: number): number {
  if (n === 0 || n === 1) {
    return n;
  }

  return fibRecursive(n - 1) + fibRecursive(n - 2);
}

// Розберемо fib(4).
// Оскільки 4 не 0 і не 1: fib(4) = fib(3) + fib(2)
// Далі: fib(3) = fib(2) + fib(1)
// і:    fib(2) = fib(1) + fib(0)
// Тепер base cases: fib(1) = 1, fib(0) = 0
// Отже: fib(2) = 1 + 0 = 1
//       fib(3) = 1 + 1 = 2
//       fib(4) = 2 + 1 = 3
fibRecursive(4); // 3

// ⚠️ Але тут є проблема
//
//                  fib(5)
//                 /      \
//              fib(4)    fib(3)
//              /   \      /   \
//           fib(3) fib(2) fib(2) fib(1)
//
// Бачиш? fib(3) рахується декілька разів. А fib(2) — ще більше разів.
//
// fib(5)
// ├── fib(4)
// │   ├── fib(3)
// │   │   ├── fib(2)
// │   │   └── fib(1)
// │   └── fib(2)
// │
// └── fib(3)
//     ├── fib(2)
//     └── fib(1)
//
// Ми фактично говоримо: "Я вже рахував fib(3), але давай порахую його ще раз."
// Для великих n це стає дуже повільно.
// Часова складність наївної recursive реалізації — експоненційна;
// точніше вона росте приблизно як O(φⁿ), часто для простоти
// на співбесідах її описують як O(2ⁿ).

// Приклад 3 — Fibonacci через loop //
// Насправді нам не потрібно recursion.
// Нам достатньо тримати два останні числа.
//
// Хочемо F(6). Починаємо: a = 0 (F(0)), b = 1 (F(1))
// next = a + b = 0 + 1 = 1  ->  a = 1, b = 1
// next = 1 + 1 = 2          ->  a = 1, b = 2
// next = 1 + 2 = 3
// next = 2 + 3 = 5
// next = 3 + 5 = 8
// Отримуємо: 0 → 1 → 1 → 2 → 3 → 5 → 8
function fibIterative(n: number): number {
  let a = 0;
  let b = 1;

  for (let i = 0; i < n; i++) {
    [a, b] = [b, a + b];
  }

  return a;
}

fibIterative(6); // 8

// Складність: цикл виконується приблизно n разів
// Time:  O(n)
// Space: O(1)
// Це набагато краще, ніж наївна recursion.

// Приклад 4 — Fibonacci через Dynamic Programming //
// Проблема recursion:
//
// fib(5)
// ├── fib(4)
// │   ├── fib(3)
// │   └── fib(2)
// └── fib(3)
//     ├── fib(2)
//     └── fib(1)
//
// Ми повторно рахуємо fib(3) і fib(2).
//
// Ідея DP: якщо ми вже порахували fib(3), запам'ятаємо результат.
// fib(0) = 0, fib(1) = 1, fib(2) = 1, fib(3) = 2, fib(4) = 3, fib(5) = 5
//
// Зберігаємо це в масиві: const dp = [0, 1];
// dp[2] = dp[1] + dp[0]; // 1
// dp[3] = dp[2] + dp[1]; // 2
// dp[4] = dp[3] + dp[2]; // 3
// dp[5] = dp[4] + dp[3]; // 5
function fibDp(n: number): number {
  const dp = [0, 1];

  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }

  return dp[n];
}

fibDp(5); // 5

// Complexity:
// Time:  O(n)
// Space: O(n)

// Приклад 5 — Memoization //
// Можна залишити recursion, але додати cache.
function fibMemo(n: number, memo: Record<number, number> = {}): number {
  if (n === 0 || n === 1) {
    return n;
  }

  if (memo[n] !== undefined) {
    return memo[n];
  }

  memo[n] = fibMemo(n - 1, memo) + fibMemo(n - 2, memo);

  return memo[n];
}

// Тепер fib(5) перший раз обчислює fib(3) і fib(2), але записує результати.
// Коли вдруге потрібен fib(3) — ми не обчислюємо його знову. Просто: memo[3] → 2
//
// Time:  O(n)
// Space: O(n)
//
// Це називається: Memoization = recursion + cache
fibMemo(5); // 5

// 🔥 Порівняння всіх варіантів //
//
// Варіант         Time      Space   Ідея
// Recursive       ~O(2ⁿ)    O(n)    постійно перераховує
// Memoization     O(n)      O(n)    recursion + cache
// DP Tabulation   O(n)      O(n)    таблиця результатів
// Iterative       O(n)      O(1)    тільки 2 останніх числа

// 🧠 Чому Fibonacci — хороший приклад?
// Бо на ньому можна пояснити одразу декілька тем.
//
// Recursion: F(n) = F(n-1) + F(n-2) — функція викликає сама себе.
//
// Dynamic Programming: ми помічаємо, що одна й та сама підзадача (F(3), F(3), F(3), ...)
// повторюється. Тому: calculate once → save result → reuse result
//
// Complexity: наївна recursion ~O(2ⁿ), DP — O(n).
//
// Optimization: якщо нам потрібен тільки F(n), не обов'язково зберігати весь масив.
// Потрібні лише previous previous та previous. Тому можна отримати:
// Time:  O(n)
// Space: O(1)

export { fibRecursive, fibIterative, fibDp, fibMemo };
