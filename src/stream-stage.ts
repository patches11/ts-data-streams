import {GetLogic, NextLogic, StreamStage} from "./interfaces";

export class Via<R, T> implements StreamStage<R, T> {
  getLogic: GetLogic<R, T>;

  constructor(getLogic: GetLogic<R, T>) {
    this.getLogic = getLogic;
  }
}

export class Map<R, T> implements StreamStage<R, T> {
  f: (r: R) => T;

  constructor(f: (t: R) => T) {
    this.f = f;
  }

  getLogic = ({ push, initialReady }: NextLogic<T>) => {
    const onPush = async (r: R) => {
      const result = this.f(r);
      await push(result);
    };

    return {
      onPush,
      initialReady,
    };
  };
}


export class Filter<T> implements StreamStage<T, T> {
  f: (r: T) => boolean;

  constructor(f: (t: T) => boolean) {
    this.f = f;
  }

  getLogic = ({ push, initialReady }: NextLogic<T>) => {
    const onPush = async (t: T) => {
      const pass = this.f(t);
      if (pass) {
        await push(t);
      }
    };

    return {
      onPush,
      initialReady,
    };
  };
}


export class Buffer<T> implements StreamStage<T, T> {
  size: number

  constructor(size: number) {
    this.size = size;
  }

  getLogic = ({ push, initialReady }: NextLogic<T>) => {
    let buffer: T[] = []
    let nextPromise: Promise<void> = initialReady;

    const onPush = async (t: T) => {
      buffer.push(t)
      nextPromise = nextPromise.then(async () => {
        const nextItem = buffer.shift()
        if (nextItem !== undefined) {
          await push(nextItem);
        } else {
          throw new Error("Empty Buffer")
        }
      });
      if (buffer.length >= this.size) {
        return nextPromise
      } else {
        return Promise.resolve()
      }
    };

    return {
      onPush,
      initialReady: nextPromise,
    };
  };
}


export class MapAsync<R, T> implements StreamStage<R, T> {
  parralelism: number;
  f: (r: R) => Promise<T>;

  constructor(parralelism: number, f: (t: R) => Promise<T>) {
    this.parralelism = parralelism;
    this.f = f;
  }

  // Our push result future should resolve when we are ready for a new value
  // next.push resolves when downstream is ready
  getLogic = ({push, initialReady}: NextLogic<T>) => {
    let futures: Promise<T>[] = []

    let nextPromise: Promise<void> = initialReady;

    const onPush = async (r: R) => {
      futures.push(this.f(r))
      nextPromise = nextPromise.then(async () => {
        const nextItem = await futures.shift()
        if (nextItem !== undefined) {
          await push(nextItem);
        }
      });
      const full = Object.keys(futures).length >= this.parralelism;
      const resultPromise = full
        ? futures[0]
        : Promise.resolve();
      return resultPromise.then(() => {});
    };

    return {
      onPush,
      initialReady: Promise.resolve(),
    };
  };
}

export class MapAsyncUnordered<R, T> implements StreamStage<R, T> {
  parralelism: number;
  f: (r: R) => Promise<T>;

  constructor(parralelism: number, f: (t: R) => Promise<T>) {
    this.parralelism = parralelism;
    this.f = f;
  }

  // Our push result future should resolve when we are ready for a new value
  // next.push resolves when downstream is ready
  getLogic = (next: NextLogic<T>) => {
    const futures: { [slot: number]: Promise<void> } = {};
    let nextPromise: Promise<void> = next.initialReady;

    const nextFreeSlot = (): number => {
      for (let x = 0; x < this.parralelism; x++) {
        if (futures[x] === undefined) {
          return x;
        }
      }
      // this should never happen
      throw new Error("Couldn't find a slot");
    };

    const onPush = async (r: R) => {
      const slot = nextFreeSlot();
      const promise = this.f(r).then(async (result) => {
        const newNextPromise = nextPromise.then(async () => {
          await next.push(result);
        });
        nextPromise = newNextPromise;
        await nextPromise;
        delete futures[slot];
      });
      futures[slot] = promise;
      const full = Object.keys(futures).length >= this.parralelism;
      const resultPromise = full
        ? Promise.race(Object.values(futures))
        : Promise.resolve();
      return resultPromise.then(() => {});
    };

    return {
      onPush,
      initialReady: Promise.resolve(),
    };
  };
}

// Probably use iterator
export class FlatMap<R, T> implements StreamStage<R, T> {
  f: (r: R) => T[];

  constructor(f: (t: R) => T[]) {
    this.f = f;
  }

  getLogic = (next: NextLogic<T>) => {
    const onPush = async (r: R) => {
      const results = this.f(r);
      for (const result of results) {
        await next.push(result);
      }
    };

    return {
      onPush,
      initialReady: next.initialReady,
    };
  };
}

export class Reduce<R, T> implements StreamStage<R, T> {
  f: (agg: T, t: R) => T;
  initial: T;

  constructor(f: (agg: T, t: R) => T, initial: T) {
    this.f = f;
    this.initial = initial;
  }

  getLogic = (next: NextLogic<T>) => {
    let agg: T = this.initial;

    const onPush = async (r: R) => {
      const result = this.f(agg, r);
      agg = result;
      await next.push(result);
    };

    return {
      onPush,
      initialReady: next.initialReady,
    };
  };
}


