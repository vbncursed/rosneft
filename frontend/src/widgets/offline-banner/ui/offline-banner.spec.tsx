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
  // index.css turns --offline-h on while this marker is in the document; the
  // shells subtract it, so the banner's height is accounted for exactly.
  it("carries the marker that sets --offline-h, and is exactly that tall", () => {
    online.value = false;
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveAttribute("data-offline");
    expect(screen.getByRole("status")).toHaveClass("h-(--offline-h)", "shrink-0");
  });
});
