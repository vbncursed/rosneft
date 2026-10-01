import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const online = vi.hoisted(() => ({ value: true }));
vi.mock("@/shared/lib/use-online", () => ({ useOnline: () => online.value }));
const { OfflineBanner } = await import("./offline-banner");

describe("OfflineBanner", () => {
  it("says nothing while online", () => {
    online.value = true;
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });
  it("says it is showing saved data when offline", () => {
    online.value = false;
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Offline — showing saved data");
  });
});
