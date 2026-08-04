export interface ConcurrencyLimitOptions<T> {
  globalLimit: number;
  perKeyLimit: number;
  getKey: (item: T, index: number) => string;
}

interface PendingJob {
  key: string;
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}

function createSchedulerAbortError(): Error {
  const error = new Error("Scheduled operation was aborted before it started.");
  error.name = "AbortError";
  return error;
}

export class ConcurrencyScheduler {
  private readonly pending: PendingJob[] = [];
  private readonly activeByKey = new Map<string, number>();
  private activeGlobal = 0;
  private readonly maxPending: number;

  constructor(
    private readonly globalLimit: number,
    private readonly perKeyLimit: number,
    maxPending: number = 64,
  ) {
    if (
      !Number.isInteger(globalLimit)
      || !Number.isInteger(perKeyLimit)
      || globalLimit < 1
      || perKeyLimit < 1
    ) {
      throw new RangeError("Concurrency limits must be positive integers.");
    }
    if (!Number.isInteger(maxPending) || maxPending < 1) {
      throw new RangeError("maxPending must be a positive integer.");
    }
    this.maxPending = maxPending;
  }

  run<T>(key: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(createSchedulerAbortError());
    if (this.pending.length >= this.maxPending) {
      throw new RangeError(`Scheduler pending queue is full (limit ${this.maxPending}).`);
    }

    return new Promise<T>((resolve, reject) => {
      const job: PendingJob = {
        key,
        run: operation,
        resolve: (value) => resolve(value as T),
        reject,
        signal,
      };
      this.pending.push(job);

      if (signal) {
        const abortListener = () => {
          const pendingIndex = this.pending.indexOf(job);
          if (pendingIndex < 0) return;
          this.pending.splice(pendingIndex, 1);
          signal.removeEventListener("abort", abortListener);
          job.abortListener = undefined;
          reject(createSchedulerAbortError());
          this.schedule();
        };
        job.abortListener = abortListener;
        signal.addEventListener("abort", abortListener, { once: true });
        if (signal.aborted) {
          abortListener();
          return;
        }
      }

      this.schedule();
    });
  }

  map<TIn, TOut>(
    items: readonly TIn[],
    getKey: (item: TIn, index: number) => string,
    fn: (item: TIn, index: number) => Promise<TOut>,
  ): Promise<TOut[]> {
    return Promise.all(
      items.map((item, index) => this.run(getKey(item, index), () => fn(item, index))),
    );
  }

  private schedule(): void {
    let pendingIndex = 0;
    while (this.activeGlobal < this.globalLimit && pendingIndex < this.pending.length) {
      const job = this.pending[pendingIndex];
      if ((this.activeByKey.get(job.key) ?? 0) >= this.perKeyLimit) {
        pendingIndex++;
        continue;
      }

      this.pending.splice(pendingIndex, 1);
      this.launch(job);
    }
  }

  private launch(job: PendingJob): void {
    if (job.signal && job.abortListener) {
      job.signal.removeEventListener("abort", job.abortListener);
      job.abortListener = undefined;
    }
    this.activeGlobal++;
    this.activeByKey.set(job.key, (this.activeByKey.get(job.key) ?? 0) + 1);

    Promise.resolve()
      .then(job.run)
      .then(job.resolve, job.reject)
      .finally(() => {
        this.activeGlobal--;
        const remainingForKey = (this.activeByKey.get(job.key) ?? 1) - 1;
        if (remainingForKey === 0) this.activeByKey.delete(job.key);
        else this.activeByKey.set(job.key, remainingForKey);
        this.schedule();
      });
  }
}

export async function mapWithConcurrencyLimits<TIn, TOut>(
  items: readonly TIn[],
  options: ConcurrencyLimitOptions<TIn>,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  const scheduler = new ConcurrencyScheduler(options.globalLimit, options.perKeyLimit);
  return scheduler.map(items, options.getKey, fn);
}
