import { describe, it, expect, vi, afterEach } from "vitest";
import { requestBackgroundSend } from "./sync";

/** Lets a fire-and-forget promise chain inside requestBackgroundSend settle. */
async function tick(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

const realNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", { value: realNavigator, configurable: true });
});

describe("requestBackgroundSend", () => {
  it('registers sync tag "outbox" when registration.sync.register is available', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      value: {
        serviceWorker: {
          ready: Promise.resolve({ sync: { register } }),
          controller: null,
        },
      },
      configurable: true,
    });

    requestBackgroundSend();
    await tick();

    expect(register).toHaveBeenCalledWith("outbox");
  });

  it("posts an outbox-drain message to the controller when Background Sync is unsupported", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(globalThis, "navigator", {
      value: {
        serviceWorker: {
          ready: Promise.resolve({}),
          controller: { postMessage },
        },
      },
      configurable: true,
    });

    requestBackgroundSend();
    await tick();

    expect(postMessage).toHaveBeenCalledWith({ type: "outbox-drain" });
  });

  it("does nothing and does not throw when there is no service worker support", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    });

    expect(() => requestBackgroundSend()).not.toThrow();
    await tick();
  });

  it("does not throw when navigator.serviceWorker.ready rejects", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {
        serviceWorker: {
          ready: Promise.reject(new Error("no active worker")),
          controller: null,
        },
      },
      configurable: true,
    });

    expect(() => requestBackgroundSend()).not.toThrow();
    await tick();
  });
});
