import { StreamBuilderBase } from "./stream";
import { StreamLogic, StreamBuilder } from "./interfaces";

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
