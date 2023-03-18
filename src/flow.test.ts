import {describe, expect, test} from "@jest/globals";
import {pushable, tick} from "./stream-builder-base";
import {sleep} from "./utils";
import {PartialStreamBuilderImpl, PartialStreamBuilderInitial} from "./stream";

describe("stream", () => {
  describe("all streams", () => {
    test("handles errors", async () => {
      const result = tick(60 * 1000, 1)
        .map(() => {
          throw new Error("test");
        })
        .runAndDiscard();

      await expect(result.completion).rejects.toThrow(new Error("test"));
    });

    test("cancels", async () => {
      const result = tick(60 * 1000, 1)
        .mapAsync(1, async () => {
          return 1;
        })
        .runAndDiscard();
      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
    });

    test("processes items", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .run(async (number) => {
          allResults.push(number);
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }
      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe("filter", () => {
    test("filters items", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .filter(number => number % 2 == 0)
        .run(async number => {
          allResults.push(number);
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([0, 2, 4]);
    });
  });


  describe("map", () => {
    test("alters items", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .map(number => number + 2)
        .run(async number => {
          allResults.push(number);
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([2, 3, 4, 5, 6]);
    });
  });

  describe("reduce", () => {
    test("aggregates and emits items", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .reduce((agg, number) => agg + number, 1)
        .run(async number => {
          allResults.push(number);
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([1, 2, 4, 7, 11]);
    });
  });


  describe("mapAsync", () => {
    test("Emits in Order", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .mapAsync( 5, async number => {
          await sleep(10 - number * 2);
          return number + 1;
        })
        .run(async number => {
          allResults.push(number);
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }

      await sleep(20);

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([1, 2, 3, 4, 5]);
    });
  })


  describe("mapAsyncUnordered", () => {
    test("does X many at once", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .mapAsyncUnordered(5, async number => {
          await sleep(10 + number);
          return number + 1;
        })
        .run(async number => {
          allResults.push(number);
        });

      const pusher = async () => {
        await result.inputConfig.initialReady;
        for (const num of [...Array(5).keys()]) {
          await result.inputConfig.push(num);
        }
      };
      pusher();

      await sleep(20);

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([1, 2, 3, 4, 5]);
    });

    test("emits fast items first", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .mapAsyncUnordered(5, async number => {
          await sleep(10 - number * 2);
          return number + 1;
        })
        .run(async number => {
          allResults.push(number);
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }

      // TODO - Remove
      await sleep(15);

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([5, 4, 3, 2, 1]);
    });
  });

  describe("via", () => {
    test("runs provided logic", async () => {
      const allResults: string[] = [];
      const result = pushable<number>()
        .via<string>((next) => {
          const onPush = async (item: number) => {
            await next.push(item.toString())
          }

          return {
            initialReady: next.initialReady,
            onPush
          }
        })
        .run(async str => {
          allResults.push(str);
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual(["0", "1", "2", "3", "4"]);
    });
  });

  describe("flatMap", () => {
    test("flattens intermediate results", async () => {
      const allResults: number[] = [];
      const result = pushable<number>()
        .flatMap(() => {
          return [...Array(5).keys()];
        })
        .run(async number => {
          allResults.push(number);
        });

      await result.inputConfig.initialReady;
      await result.inputConfig.push(0);

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe("alsoTo", () => {
    test("passes items to alsoTo, if it is ready", async () => {
      const allResults: number[] = [];

      const pfb = new PartialStreamBuilderInitial<number>()
        .mapAsync(1, async (item) => {
          allResults.push(item);
          await sleep(25);
        });

      const result = pushable<number>()
        .alsoTo(pfb)
        .runAndDiscard();

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
        await sleep(10)
      }

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([0, 3]);
    });
  });

  describe("connectTo", () => {
    test("passes items through, and blocks", async () => {
      const allResults: number[] = [];

      const pfb = new PartialStreamBuilderInitial<number>()
        .mapAsync(1, async (item) => {
          allResults.push(item);
          await sleep(5);
        });

      const result = pushable<number>()
        .connectTo(pfb)
        .runAndDiscard();

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        await result.inputConfig.push(num);
      }

      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([0, 1, 2, 3, 4]);
    });
  });


  describe("buffer", () => {
    test("buffers items", async () => {
      const allResults: number[] = [];

      const result = pushable<number>()
        .buffer(5)
        .run(async (number) => {
          allResults.push(number)
          await sleep(2)
        });

      await result.inputConfig.initialReady;
      for (const num of [...Array(5).keys()]) {
        result.inputConfig.push(num);
        await sleep(1)
      }

      await sleep(15)
      await result.cancel();
      await expect(result.completion).resolves.toBeUndefined();
      expect(allResults).toEqual([0, 1, 2, 3, 4]);
    });
  });
});
