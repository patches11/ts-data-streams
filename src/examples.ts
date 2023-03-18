import fetch from "node-fetch";

import { tick, repeat } from "./stream-builder-base";
import { sleep } from "./utils";
import { PartialStreamBuilderInitial } from "./stream";

interface EarthquakeFeed {
  features: any[];
}

const url =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/1.0_hour.geojson";

export const urlExample = () => {
    console.log(`starting tick for url ${url}`);
  
    tick(60 * 1000, 1)
      .mapAsync(1, async () => fetch(url))
      .mapAsync(1, async (response) => {
        return (await response.json()) as EarthquakeFeed;
      })
      .mapAsync(1, async (json) => console.log(json.features))
      .runAndDiscard();
};


export const asyncExample = () => {
var counter = 0;
tick(1000, 1)
    .flatMap(() => {
    const result = [0, 1, 2, 3, 4].map((v) => v + counter);
    counter += result.length;
    return result;
    })
    .mapAsyncUnordered(4, async (n) => {
    console.log(`processing ${n}`);
    await sleep(Math.random() * 1000);
    return n;
    })
    .mapAsync(1, async (n) => {
    console.log(`resolving ${n}`);
    return n;
    })
    .reduce((sum, n) => {
    return sum + n
    }, 0)
    .mapAsync(1, async n => n.toString())
    .run(async sum => console.log(`sum ${sum}`));
};

export const digitsOfPi = () => {

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
}

const getLoggerPartial = (name: string) => {
    return new PartialStreamBuilderInitial<number>().mapAsync(1, async (n) => console.log(`${name} item ${n}`))
}

export const alsoToExample = tick(1000, 1)
  .reduce((agg, _) => {
      const counter = agg[agg.length - 1]
      const result = [0, 1, 2, 3, 4].map((v) => v + counter);
      return result;
  }, [0])
  .flatMap(arr => arr)
  .alsoTo(getLoggerPartial("before processing"))
  .mapAsyncUnordered(4, async (n) => {
      console.log(`processing ${n}`);
      await sleep(Math.random() * 1000);
      return n;
  })
  .mapAsync(1, async (n) => {
      console.log(`resolving ${n}`);
      return n;
  })
  .reduce((sum, n) => {
      return sum + n
  }, 0)
  .alsoTo(getLoggerPartial("after sum"))
  .mapAsync(1, async n => n.toString())