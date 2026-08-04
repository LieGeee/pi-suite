import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConcurrencyScheduler, mapWithConcurrencyLimits } from "./scheduler.js";

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("subagent provider-aware scheduler", () => {
  it("enforces global and per-provider concurrency limits", async () => {
    const items = [
      { id: 0, provider: "a" },
      { id: 1, provider: "a" },
      { id: 2, provider: "a" },
      { id: 3, provider: "b" },
      { id: 4, provider: "b" },
      { id: 5, provider: "b" },
      { id: 6, provider: "c" },
      { id: 7, provider: "c" },
    ];
    let activeGlobal = 0;
    let maxGlobal = 0;
    const activeByProvider = new Map<string, number>();
    const maxByProvider = new Map<string, number>();

    const results = await mapWithConcurrencyLimits(
      items,
      {
        globalLimit: 4,
        perKeyLimit: 2,
        getKey: (item) => item.provider,
      },
      async (item) => {
        activeGlobal++;
        maxGlobal = Math.max(maxGlobal, activeGlobal);
        const activeForProvider = (activeByProvider.get(item.provider) ?? 0) + 1;
        activeByProvider.set(item.provider, activeForProvider);
        maxByProvider.set(
          item.provider,
          Math.max(maxByProvider.get(item.provider) ?? 0, activeForProvider),
        );
        await delay(15);
        activeGlobal--;
        activeByProvider.set(item.provider, activeForProvider - 1);
        return item.id * 10;
      },
    );

    assert.deepEqual(results, [0, 10, 20, 30, 40, 50, 60, 70]);
    assert.equal(maxGlobal, 4);
    assert.equal(Math.max(...maxByProvider.values()), 2);
  });

  it("shares limits across separate concurrent maps", async () => {
    const scheduler = new ConcurrencyScheduler(4, 2);
    let activeForProvider = 0;
    let maxForProvider = 0;
    const run = async (id: number) => {
      activeForProvider++;
      maxForProvider = Math.max(maxForProvider, activeForProvider);
      await delay(10);
      activeForProvider--;
      return id;
    };

    const [left, right] = await Promise.all([
      scheduler.map([1, 2, 3], () => "shared", run),
      scheduler.map([4, 5, 6], () => "shared", run),
    ]);

    assert.deepEqual(left, [1, 2, 3]);
    assert.deepEqual(right, [4, 5, 6]);
    assert.equal(maxForProvider, 2);
  });

  it("removes an aborted job while it is still queued", async () => {
    const scheduler = new ConcurrencyScheduler(1, 1);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = scheduler.run("provider", async () => {
      await firstGate;
      return "first";
    });

    let queuedStarted = false;
    const controller = new AbortController();
    const queued = scheduler.run(
      "provider",
      async () => {
        queuedStarted = true;
        return "queued";
      },
      controller.signal,
    );
    controller.abort();

    await assert.rejects(queued, (error: Error) => error.name === "AbortError");
    releaseFirst();
    assert.equal(await first, "first");
    assert.equal(await scheduler.run("provider", async () => "third"), "third");
    assert.equal(queuedStarted, false);
  });

  it("rejects a job immediately when its signal is already aborted", async () => {
    const scheduler = new ConcurrencyScheduler(1, 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      scheduler.run("provider", async () => "never", controller.signal),
      (error: Error) => error.name === "AbortError",
    );
  });

  it("preserves input result order when later tasks finish first", async () => {
    const results = await mapWithConcurrencyLimits(
      [30, 5, 15],
      { globalLimit: 3, perKeyLimit: 3, getKey: () => "provider" },
      async (milliseconds, index) => {
        await delay(milliseconds);
        return `result-${index}`;
      },
    );

    assert.deepEqual(results, ["result-0", "result-1", "result-2"]);
  });

  it("rejects invalid limits and handles an empty task list", async () => {
    await assert.rejects(
      () => mapWithConcurrencyLimits([1], { globalLimit: 0, perKeyLimit: 1, getKey: () => "a" }, async () => 1),
      /positive integers/,
    );
    assert.deepEqual(
      await mapWithConcurrencyLimits([], { globalLimit: 1, perKeyLimit: 1, getKey: () => "a" }, async () => 1),
      [],
    );
  });

  it("rejects new jobs when the pending queue is full", async () => {
    const scheduler = new ConcurrencyScheduler(1, 1, 2);
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const first = scheduler.run("a", async () => {
      await gate;
      return 1;
    });
    // First job is active; two more fill the pending queue.
    const second = scheduler.run("b", async () => 2);
    const third = scheduler.run("c", async () => 3);
    assert.throws(() => scheduler.run("d", async () => 4), /pending queue is full/);
    releaseFirst!();
    await first;
    assert.equal(await second, 2);
    assert.equal(await third, 3);
  });
});
