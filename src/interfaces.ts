export interface PartialStreamBuilder<Init, T> {
  getStages: () => StreamStage<any, any>[];
  buffer: (size: number) => PartialStreamBuilder<Init, T>;
  map: <S>(f: (t: T) => S) => PartialStreamBuilder<Init, S>;
  filter: (f: (t: T) => boolean) => PartialStreamBuilder<Init, T>;
  mapAsync: <S>(parallelism: number, f: (t: T) => Promise<S>) => PartialStreamBuilder<Init, S>;
  mapAsyncUnordered: <S>(
    parallelism: number,
    f: (t: T) => Promise<S>
  ) => PartialStreamBuilder<Init, S>;
  via: <S>(getLogic: GetLogic<T, S>) => PartialStreamBuilder<Init, S>;
  flatMap: <S>(f: (t: T) => S[]) => PartialStreamBuilder<Init, S>;
  reduce: <S>(
    f: (agg: S, t: T) => S,
    initial: S
  ) => PartialStreamBuilder<Init, S>;
}

export interface StreamBuilder<InputResult, T> {
  buffer: (size: number) => StreamBuilder<InputResult, T>;
  map: <S>(f: (t: T) => S) => StreamBuilder<InputResult, S>;
  filter: (f: (t: T) => boolean) => StreamBuilder<InputResult, T>;
  mapAsync: <S>(parallelism: number, f: (t: T) => Promise<S>) => StreamBuilder<InputResult, S>;
  mapAsyncUnordered: <S>(
    parallelism: number,
    f: (t: T) => Promise<S>
  ) => StreamBuilder<InputResult, S>;
  via: <S>(getLogic: GetLogic<T, S>) => StreamBuilder<InputResult, S>;
  flatMap: <S>(f: (t: T) => S[]) => StreamBuilder<InputResult, S>;
  reduce: <S>(
    f: (agg: S, t: T) => S,
    initial: S
  ) => StreamBuilder<InputResult, S>;
  connectTo: <S>(
    partialFlowBuilder: PartialStreamBuilder<T, S>
  ) => StreamBuilder<InputResult, S>;
  alsoTo: <S>(
    partialFlowBuilder: PartialStreamBuilder<T, S>
  ) => StreamBuilder<InputResult, T>;
  runAndDiscard: () => RunningStream<InputResult>;
  run: (onPush: (t: T) => Promise<void>) => RunningStream<InputResult>;
}

export interface RunningStream<T> {
  completion: Promise<void>;
  cancel: () => Promise<void>;
  inputConfig: T;
}

export type GetLogic<R, T> = (next: NextLogic<T>) => StreamLogic<R>;

export interface StreamStage<R, T> {
  getLogic: GetLogic<R, T>;
}

export interface NextLogic<T> {
  push: (t: T) => Promise<void>;
  initialReady: Promise<void>;
}

export interface StreamLogic<R> {
  onPush: (r: R) => Promise<void>;
  initialReady: Promise<void>;
}
