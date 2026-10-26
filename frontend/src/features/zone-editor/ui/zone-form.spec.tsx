import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { ZoneForm, type ZoneFormProps } from "./zone-form";

const TAGS = [
  { slug: "tanks", title: "Tanks" },
  { slug: "ungrouped", title: "Ungrouped" },
];

const view = (over: Partial<ZoneFormProps> = {}, seed = true) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (seed) client.setQueryData(["model-tags"], TAGS);
  return render(
    <QueryClientProvider client={client}>
      <ZoneForm rectName="Rectangle 7.5 × 13.0 m" canPlace onCreate={vi.fn(async () => {})} {...over} />
    </QueryClientProvider>,
  );
};

describe("ZoneForm", () => {
  it("names the picked rectangle, or asks for one", () => {
    view();
    expect(screen.getByText("Selected: Rectangle 7.5 × 13.0 m")).toBeInTheDocument();
  });

  it("asks for a rectangle while none is picked, and cannot create", () => {
    view({ rectName: null, canPlace: false });
    expect(screen.getByText("Pick a rectangle on the plan to make it a zone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create zone" })).toBeDisabled();
  });

  it("shows why a blocked rectangle cannot become a zone, and keeps Create disabled", async () => {
    view({ blocked: "This rectangle has no area." });
    await userEvent.type(screen.getByRole("textbox", { name: /Title/ }), "Tank row");
    await userEvent.click(screen.getByRole("checkbox", { name: "Tanks" }));
    expect(screen.getByText("This rectangle has no area.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create zone" })).toBeDisabled();
  });

  it("never offers ungrouped", () => {
    view();
    expect(screen.queryByRole("checkbox", { name: "Ungrouped" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Tanks" })).toBeInTheDocument();
  });

  it("creates with a title and a tag", async () => {
    const onCreate = vi.fn(async () => {});
    view({ onCreate });
    const create = screen.getByRole("button", { name: "Create zone" });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: /Title/ }), "Tank row");
    await userEvent.click(screen.getByRole("checkbox", { name: "Tanks" }));
    await userEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith({ title: "Tank row", tagSlugs: ["tanks"] });
  });

  it("shows the server's refusal under the title", async () => {
    const onCreate = vi.fn().mockRejectedValue(new HttpError(400, null, "a zone titled Tank row already exists"));
    view({ onCreate });
    await userEvent.type(screen.getByRole("textbox", { name: /Title/ }), "Tank row");
    await userEvent.click(screen.getByRole("checkbox", { name: "Tanks" }));
    await userEvent.click(screen.getByRole("button", { name: "Create zone" }));
    expect(await screen.findByText("a zone titled Tank row already exists")).toBeInTheDocument();
  });

  it("submits with Enter in the title once the form is complete, and not before", async () => {
    const onCreate = vi.fn(async () => {});
    view({ onCreate });
    const title = screen.getByRole("textbox", { name: /Title/ });
    await userEvent.type(title, "Tank row{Enter}");
    expect(onCreate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("checkbox", { name: "Tanks" }));
    await userEvent.type(title, "{Enter}");
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("blocks creating while the tags are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))),
    );
    view({}, false);
    expect(await screen.findByText("Tags could not be loaded. Try again.")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: /Title/ }), "Tank row");
    expect(screen.getByRole("button", { name: "Create zone" })).toBeDisabled();
    vi.unstubAllGlobals();
  });
});

describe("ZoneForm tour anchor", () => {
  it("is the tour's anchor for making a zone", () => {
    view();
    expect(screen.getByRole("form", { name: "New zone" })).toHaveAttribute("data-tour", "zone-form");
  });
});
