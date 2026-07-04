import { render } from "@testing-library/react";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

describe("ServiceWorkerRegistrar", () => {
  it("renders nothing and (in dev/test) cleans up stale workers without throwing", () => {
    const getRegistrations = jest.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistrations, register: jest.fn() },
      configurable: true,
    });
    const { container } = render(<ServiceWorkerRegistrar />);
    expect(container).toBeEmptyDOMElement();
    expect(getRegistrations).toHaveBeenCalled();
  });

  it("is a no-op when service workers are unsupported", () => {
    // Remove the property entirely so `"serviceWorker" in navigator` is false.
    delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
    expect(() => render(<ServiceWorkerRegistrar />)).not.toThrow();
  });
});
