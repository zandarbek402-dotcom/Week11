# Неделя 11 — AMM и концентрированная ликвидность (Raydium CLMM)

**Задание:** разобраться, как работают пулы ликвидности и ценовые диапазоны. Создать свои тестовые токены и CLMM-пул Raydium в devnet.

- **Теория:** [THEORY.md](THEORY.md) — x·y=k, концентрированная ликвидность, тики, sqrtPriceX64, fee tiers, аккаунты Raydium CLMM, impermanent loss.
- **Практика:** токены, пул, позиция и обмены созданы в **devnet** скриптами из [`src/`](src). Все адреса и транзакции записаны в [devnet-output.json](devnet-output.json).

## Результат в devnet

| Что | Адрес / транзакция |
|---|---|
| Кошелёк | [`Gh36NV5M…EcdmEDn`](https://explorer.solana.com/address/Gh36NV5M71XXmgNYYA3AYxNvMkKB4nD2cSpP5EcdmEDn?cluster=devnet) |
| Токен **W11A** (6 decimals, 1 000 000 шт.) | [`G8hGd72y…iw2D1`](https://explorer.solana.com/address/G8hGd72yEJcCisWAEwewga7uFzXwvxwmHtRbDqDiw2D1?cluster=devnet) |
| Токен **W11B** (6 decimals, 1 000 000 шт.) | [`GYYZDRWd…drUgLG`](https://explorer.solana.com/address/GYYZDRWdqCexjk9o5aWA7Fdtm1uQio47Mu5KehdrUgLG?cluster=devnet) |
| **CLMM-пул W11A/W11B** (fee 0.25%, tickSpacing 60, старт: 1 A = 2 B) | [`8HUDR4pg…NFbvMmH`](https://explorer.solana.com/address/8HUDR4pgizvYtgRdAE82RyyK8jTEqVNLi9c9xNFbvMmH?cluster=devnet) · [tx создания](https://explorer.solana.com/tx/3BGdpHYZdE1WDByb2QwQPDzN6epvvzgZKSr8EGbK5UMenc9NbB8WUZKXWhfAtRWeXfUk23EkpktLMpztC7N4zXoe?cluster=devnet) |
| **Позиция (NFT)**, диапазон 1.5968 – 2.4012 (ticks 4680 … 8760): 1000 A + ~2438 B | [`HhnsfjRL…v9RcHo`](https://explorer.solana.com/address/HhnsfjRLHKcrNrQpmggGnvtu8aUoacPNHXgo42v9RcHo?cluster=devnet) · [tx](https://explorer.solana.com/tx/4mnCqcY5bfCPbQwRjyWfKF761qqan3wjbUWrmbt2ACGEygQNtLi33ufkUWWafMQgne2fAXvz9Ymo3cUVYC5ccv1f?cluster=devnet) |
| Обмен 50 A → 99.32 B: цена 2.0000 → 1.9827 | [tx](https://explorer.solana.com/tx/4QYcFF7C3hYkYjGhc4UCnUKNsGmyrEVPRQUenkSjvD9hP1vfZkvMbtciu7zizsHzb1no7u9xLb9zCS3bi2xURXrn?cluster=devnet) |
| Обмен 50 B → 25.10 A: цена 1.9827 → 1.9914 | [tx](https://explorer.solana.com/tx/3cx4T83Rg3EpUe72kQRF7eKL4vYwSRKr4EyUYxkp3BFLfLe42RXRKkbbB1iSPzg9WrUynxBDpmtMm4zHy78FVE1K?cluster=devnet) |

Raydium CLMM program (devnet): `DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH`.

Текущее состояние пула и позиции — в [pool-info-output.txt](pool-info-output.txt) (`npm run info`):

```
price (B per A): 1.991371602687595
tickCurrent:     6888
liquidity (L):   16189909849
vault balances:  1024.899654 A / 2388.621709 B
position: range 1.5968 – 2.4012, IN RANGE (earning fees)
```

**Проверка собственной математики.** Ликвидность `L ≈ 16189909849`, рассчитанная нашей формулой `L = Δx·√P·√Pb / (√Pb − √P)` в [`tick-math.ts`](src/tick-math.ts), **совпала** с `liquidity`, которую программа Raydium записала on-chain.

## Скрипты

| Команда | Файл | Что делает |
|---|---|---|
| `npm run math` | [`tick-math.ts`](src/tick-math.ts) | своя реализация: tick ↔ price, sqrtPriceX64, x·y=k, L ↔ amounts, impermanent loss ([вывод](tick-math-output.txt)) |
| `npm run tokens` | [`1-create-tokens.ts`](src/1-create-tokens.ts) | создаёт 2 SPL-токена и минтит по 1 000 000 |
| `npm run pool` | [`2-create-pool.ts`](src/2-create-pool.ts) | получает fee tiers devnet и создаёт CLMM-пул (`raydium.clmm.createPool`) |
| `npm run position` | [`3-open-position.ts`](src/3-open-position.ts) | цена → тики (кратно tickSpacing), расчёт L и суммы B, `openPositionFromBase` |
| `npm run swap [A\|B]` | [`4-swap.ts`](src/4-swap.ts) | котировка по TickArray (`computeAmountOutFormat`) и обмен (`clmm.swap`) |
| `npm run info` | [`5-pool-info.ts`](src/5-pool-info.ts) | PoolState и позиции владельца: in/out of range, сколько A/B держит позиция |

Все скрипты записывают результаты в `devnet-output.json`, поэтому их можно запускать повторно.

## Запуск

Требуется: Node.js 18+, кошелёк Solana CLI (`~/.config/solana/id.json`) с devnet SOL (хватает ~0.5 SOL).

```bash
npm install
solana airdrop 2 --url devnet
npm run math
npm run all          # tokens → pool → position → swap → info
```

Другой кошелёк или RPC: `KEYPAIR=path/to/key.json RPC_URL=https://... npm run all`.
Чтобы создать всё заново, удалите `devnet-output.json`.

## Замечания

- SDK `@raydium-io/raydium-sdk-v2` 0.2.84-alpha: `getPoolInfoFromRpc()` падает на **новом пуле без TickArray**. Поэтому `3-open-position.ts` использует `getSimplePoolInfo()` и собственную CLMM-математику для расчёта суммы второго токена.
- SDK сортирует mint-ы пула (mintA < mintB по байтам) и при необходимости инвертирует цену. В нашем пуле W11A оказался mintA, поэтому цена = W11B за 1 W11A.
- Это devnet: токены тестовые и не имеют стоимости.
