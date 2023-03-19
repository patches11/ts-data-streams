# ts-data-streams

Inspired by Akka Streams, a library for processing infinite streaming data.

### Examples

See [examples.ts](src/examples.ts) for more examples.

#### Basic

```typescript
import { tick } from "ts-data-streams"

tick(1000, 1)
  .mapAsync(1, async (n) => n + 1)
  .run(async (n) => console.log(n))
```

#### PI

```typescript
repeat(1)
    .reduce(([_, q, r, t, i]) => {
      let digit = ((i * BigInt(27) - BigInt(12)) * q + r * BigInt(5)) / (t * BigInt(5));
      let u = i * BigInt(3);
      u = (u + BigInt(1)) * BigInt(3) * (u + BigInt(2));
      const r2 = u * BigInt(10) * (q * (i * BigInt(5) - BigInt(2)) + r - t * digit);
      const q2 = q * BigInt(10) * i * (i * BigInt(2) - BigInt(1));
      const t2 = t * u;
      const i2 = i + BigInt(1);
      return [digit, q2, r2, t2, i2] as [bigint, bigint, bigint, bigint, bigint]
    }, [BigInt(3), BigInt(1), BigInt(180), BigInt(60), BigInt(2)] as [bigint, bigint, bigint, bigint, bigint])
    .mapAsync(1, async ([digit, _q, _r, _t, i]) => {
      if (i === BigInt(3)) {
        // First Digit
        return Number(digit).toString() + "."
      } else {
        return Number(digit).toString()
      }
    })
    .run(async piDigit => {
      process.stdout.write(piDigit)
    })
```