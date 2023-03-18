import { PartialStreamBuilder, StreamStage, GetLogic, StreamBuilder, StreamLogic, NextLogic, RunningStream } from "./interfaces";
import { AlsoTo, Buffer, Map, MapAsync, Filter, Via, MapAsyncUnordered, FlatMap, Reduce } from "./stream-stage"

abstract class PartialStreamBuilderBase<Init, T> implements PartialStreamBuilder<Init, T> {
  abstract getStages(): StreamStage<any, any>[];

  buffer(size: number): PartialStreamBuilderImpl<Init, T, T> {
    const nextStage = new Buffer<T>(size);
    return new PartialStreamBuilderImpl(nextStage, this);
  }

  map<S>(f: (t: T) => S): PartialStreamBuilderImpl<Init, T, S> {
    const nextStage = new Map(f);
    return new PartialStreamBuilderImpl(nextStage, this);
  }
  
  filter(f: (t: T) => boolean): PartialStreamBuilderImpl<Init, T, T> {
    const nextStage = new Filter(f);
    return new PartialStreamBuilderImpl(nextStage, this);
  }

  mapAsync<S>(parallelism: number, f: (t: T) => Promise<S>): PartialStreamBuilderImpl<Init, T, S> {
    const nextStage = new MapAsync<T, S>(parallelism, f);
    return new PartialStreamBuilderImpl(nextStage, this);
  }

  mapAsyncUnordered<S>(
    parallelism: number,
    f: (t: T) => Promise<S>
  ): PartialStreamBuilderImpl<Init, T, S> {
    const nextStage = new MapAsyncUnordered<T, S>(parallelism, f);
    return new PartialStreamBuilderImpl(nextStage, this);
  }

  flatMap<S>(f: (t: T) => S[]):PartialStreamBuilderImpl<Init, T, S> {
    const nextStage = new FlatMap<T, S>(f);
    return new PartialStreamBuilderImpl(nextStage, this);
  }

  via<S>(getLogic: GetLogic<T, S>):PartialStreamBuilderImpl<Init, T, S>{
    const nextStage = new Via<T, S>(getLogic);
    return new PartialStreamBuilderImpl(nextStage, this);
  }

  reduce<S>(
    f: (agg: S, t: T) => S,
    initial: S
  ): PartialStreamBuilderImpl<Init, T, S> {
    const nextStage = new Reduce<T, S>(f, initial);
    return new PartialStreamBuilderImpl(nextStage, this);
  }
}

export class PartialStreamBuilderInitial<Init> extends PartialStreamBuilderBase<Init, Init> {
  
  getStages() {
    return []
  }
}

export class PartialStreamBuilderImpl<Init, R, T> extends PartialStreamBuilderBase<Init, T> {
  currentStage: StreamStage<R, T>
  prev: PartialStreamBuilderBase<Init, R>;

  getStages() {
    return [...this.prev.getStages(), this.currentStage]
  }

  constructor(currentStage: StreamStage<R, T>, prev: PartialStreamBuilderBase<Init, R>) {
    super()
    this.currentStage = currentStage
    this.prev = prev;
  }

}

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
