import {
  StreamLogic,
  StreamBuilder,
  RunningStream,
  GetLogic,
  PartialStreamBuilder,
  StreamStage,
  NextLogic,
} from "./interfaces";
import {Buffer, Filter, FlatMap, Map, MapAsync, MapAsyncUnordered, Reduce, Via} from "./stream-stage";

export abstract class StreamBuilderBase<InputResult, T> implements StreamBuilder<InputResult, T> {
  abstract buildLogic(fl: StreamLogic<T>): RunningStream<InputResult>;

  buffer(size: number): StreamBuilderImpl<InputResult, T, T> {
    const nextStage = new Buffer<T>(size);
    return new StreamBuilderImpl(nextStage, this);
  }

  map<S>(f: (t: T) => S): StreamBuilderImpl<InputResult, T, S> {
    const nextStage = new Map(f);
    return new StreamBuilderImpl(nextStage, this);
  }

  filter(f: (t: T) => boolean): StreamBuilderImpl<InputResult, T, T> {
    const nextStage = new Filter(f);
    return new StreamBuilderImpl(nextStage, this);
  }

  mapAsync<S>(parallelism: number, f: (t: T) => Promise<S>): StreamBuilderImpl<InputResult, T, S> {
    const nextStage = new MapAsync(parallelism, f);
    return new StreamBuilderImpl(nextStage, this);
  }

  mapAsyncUnordered<S>(
    parallelism: number,
    f: (t: T) => Promise<S>
  ): StreamBuilderImpl<InputResult, T, S> {
    const nextStage = new MapAsyncUnordered(parallelism, f);
    return new StreamBuilderImpl(nextStage, this);
  }

  flatMap<S>(f: (t: T) => S[]): StreamBuilderImpl<InputResult, T, S> {
    const nextStage = new FlatMap(f);
    return new StreamBuilderImpl(nextStage, this);
  }

  via<S>(getLogic: GetLogic<T, S>): StreamBuilderImpl<InputResult, T, S> {
    const nextStage = new Via(getLogic);
    return new StreamBuilderImpl(nextStage, this);
  }

  reduce<S>(
    f: (agg: S, t: T) => S,
    initial: S
  ): StreamBuilderImpl<InputResult, T, S> {
    const nextStage = new Reduce(f, initial);
    return new StreamBuilderImpl(nextStage, this);
  }

  connectTo<S>(partialFlowBuilder: PartialStreamBuilder<T, S>): StreamBuilder<InputResult, S> {
    const [first, ...rest] = partialFlowBuilder.getStages()
    if (first) {
      return rest.reduce((builder, stage) => new StreamBuilderImpl(stage, builder), new StreamBuilderImpl(first, this))
    } else {
      // If the pfb is empty, T == S
      // TODO - Test
      return this as unknown as StreamBuilder<InputResult, S>
    }
  }

  alsoTo<S>(partialFlowBuilder: PartialStreamBuilder<T, S>): StreamBuilder<InputResult, T> {
    const stages = partialFlowBuilder.getStages()
    if (stages.length > 0) {
      const nextStage = new AlsoTo<T>(stages);
      return new StreamBuilderImpl(nextStage, this);
    } else {
      // If the pfb is empty, T == S
      // TODO - Test, Log
      return this
    }
  }

  runAndDiscard() {
    return this.run(async () => {});
  }

  run(onPush: (t: T) => Promise<void>) {
    return this.buildLogic({ onPush, initialReady: Promise.resolve() });
  }
}


export class StreamBuilderImpl<InputResult, R, T>
  extends StreamBuilderBase<InputResult, T>
  implements StreamBuilder<InputResult, T>
{
  prev: StreamBuilderBase<InputResult, R>;
  currentStage: StreamStage<R, T>;

  constructor(currentStage: StreamStage<R, T>, prev: StreamBuilderBase<InputResult, R>) {
    super();
    this.currentStage = currentStage;
    this.prev = prev;
  }

  toNextLogic({ onPush, initialReady }: StreamLogic<T>): NextLogic<T> {
    return {
      push: onPush,
      initialReady,
    };
  }

  buildLogic(fl: StreamLogic<T>): RunningStream<InputResult> {
    const logic = this.currentStage.getLogic(this.toNextLogic(fl));
    return this.prev.buildLogic(logic);
  }
}

export interface TickInputResult {}

class TickImpl<T> extends StreamBuilderBase<TickInputResult, T> {
  ms: number;
  what: T;
  canPush: boolean = true;

  constructor(ms: number, what: T) {
    super();
    this.ms = ms;
    this.what = what;
  }

  buildLogic = (next: StreamLogic<T>) => {
    let id: NodeJS.Timer | undefined = undefined;

    let cancel = async () => {};

    const pr = new Promise<void>((resolve, reject) => {
      const f = async () => {
        if (this.canPush) {
          this.canPush = false;
          try {
            await next.onPush(this.what);
          } catch (e) {
            clearInterval(id);
            reject(e);
          }
          this.canPush = true;
        }
      };
      id = setInterval(f, this.ms);
      cancel = async () => {
        resolve();
        clearInterval(id);
      };
      f();
    });

    return {
      inputConfig: {},
      cancel,
      completion: pr,
    };
  };
}

export interface RepeatInputResult {}

class RepeatImpl<T> extends StreamBuilderBase<RepeatInputResult, T> {
  what: T;

  constructor(what: T) {
    super();
    this.what = what;
  }

  buildLogic = (next: StreamLogic<T>) => {
    let cont = true;

    const cancel = async () => {
      cont = false;
    };

    const pr = next.initialReady.then(
      () =>
        new Promise<void>(async (_, reject) => {
          while (cont) {
            try {
              await next.onPush(this.what);
            } catch (e) {
              cancel();
              reject(e);
            }
          }
        })
    );

    return {
      inputConfig: {},
      cancel,
      completion: pr,
    };
  };
}

export interface PushableInputResult<T> {
  initialReady: Promise<void>;
  push: (t: T) => Promise<void>;
}

class PushableImpl<T> extends StreamBuilderBase<PushableInputResult<T>, T> {
  constructor() {
    super();
  }

  buildLogic = (next: StreamLogic<T>) => {
    let canPush = false;

    const defaultPush = () => Promise.reject()
    let push: (t: T) => Promise<void> = defaultPush;

    let cancel = async () => {};

    const pr = new Promise<void>((resolve, reject) => {
      cancel = async () => {
        resolve();
        push = defaultPush;
      };
      push = async (t: T) => {
        if (canPush) {
          canPush = false;
          try {
            await next.onPush(t).then(() => {
              canPush = true;
            });
          } catch (e) {
            push = defaultPush;
            reject(e);
          }
        }
      };
    });
    next.initialReady.then(() => {
      canPush = true;
    });

    return {
      inputConfig: {
        push,
        initialReady: next.initialReady,
      },
      cancel,
      completion: pr,
    };
  };
}

export const tick = <T>(ms: number, what: T): StreamBuilder<TickInputResult, T> =>
  new TickImpl(ms, what);

export const repeat = <T>(what: T): StreamBuilder<RepeatInputResult, T> =>
  new RepeatImpl(what);

export const pushable = <T>(): StreamBuilderBase<PushableInputResult<T>, T> =>
  new PushableImpl();


export class AlsoTo<T> implements StreamStage<T, T> {
  stages: StreamStage<any, any>[]
  constructor(stages: StreamStage<any, any>[]) {
    this.stages = stages;
  }

  getLogic = (next: NextLogic<T>) => {
    const builder = this.stages.reduce<StreamBuilderBase<PushableInputResult<any>, any>>((builder, stage) => new StreamBuilderImpl(stage, builder), pushable<any>())

    const {inputConfig: {push, initialReady}} = builder.runAndDiscard()
    let alsoToReady = false

    initialReady.then(() => {
      alsoToReady = true
    })

    const onPush = async (t: T) => {
      if (alsoToReady) {
        alsoToReady = false
        push(t).then(() => {
          alsoToReady = true
        })
      }
      await next.push(t);
    };

    return {
      onPush,
      initialReady: next.initialReady,
    };
  };
}
