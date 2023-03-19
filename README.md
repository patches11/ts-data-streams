# ts-data-streams

Inspired by Akka Streams, a library for processing infinite streaming data.

### Example 

```typescript
import { tick } from "ts-data-streams"

tick(1000, 1)
  .mapAsync(1, async (n) => n + 1)
  .run(async (n) => console.log(n))
```