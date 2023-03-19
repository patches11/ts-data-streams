import { PartialStreamBuilder, StreamStage, GetLogic } from "./interfaces";
import {  Buffer, Map, MapAsync, Filter, Via, MapAsyncUnordered, FlatMap, Reduce } from "./stream-stage"

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

