import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import fixture from "../edit-entity.fixture";
import { EditDetailsDialog, type EditDetailsDialogProps } from "./edit-details-dialog";

const { updateModel, updateTerritory } = vi.hoisted(() => ({
  updateModel: vi.fn(),
  updateTerritory: vi.fn(),
}));
vi.mock("@/entities/model", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateModel,
}));
vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateTerritory,
}));

const MODEL = { slug: "valve", title: "Valve", description: "Gate valve.", sourceBlobHash: "a".repeat(64), usageCount: 0 };
const TERRITORY = { slug: "yard", title: "Yard", sourceBlobHash: "h", placementCount: 0 };

let client: QueryClient;

function Toasts() {
  return (
    <>
      {useNotices().map((n) => (
        <p key={n.id}>{n.message}</p>
      ))}
    </>
  );
}

const open = (over: Partial<EditDetailsDialogProps> = {}) => {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <EditDetailsDialog kind="model" slug="valve" title="Valve" description="Gate valve." onClose={onClose} {...over} />
      <Toasts />
    </QueryClientProvider>,
  );
  return onClose;
};

const titleField = () => screen.getByRole("textbox", { name: /Title/ });
const descriptionField = () => screen.getByRole("textbox", { name: "Description" });
const saveButton = () => screen.getByRole("button", { name: "Save changes" });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  updateModel.mockReset();
  updateTerritory.mockReset();
  clearNotices();
});

describe("EditDetailsDialog", () => {
  it("opens on the saved details, with Save disabled until something changes", async () => {
    open();
    expect(titleField()).toHaveValue("Valve");
    expect(descriptionField()).toHaveValue("Gate valve.");
    expect(saveButton()).toBeDisabled();

    await userEvent.type(titleField(), " B");
    expect(saveButton()).toBeEnabled();
  });

  // A whitespace-padded stored title trims to itself, so it is no change.
  it("opens with Save disabled when the stored details carry stray spaces", () => {
    open({ title: "  Valve ", description: "Gate valve. " });
    expect(saveButton()).toBeDisabled();
  });

  // fixtures.spec renders the closed button only; the dialog's mutation hook
  // needs a query client the moment it opens.
  it("opens from its Cosmos fixture", async () => {
    render(fixture);
    await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect(titleField()).toHaveValue("North Ridge Pad");
  });

  it("keeps Save disabled while the title is blank", async () => {
    open();
    await userEvent.clear(titleField());
    await userEvent.type(descriptionField(), " More.");
    expect(saveButton()).toBeDisabled();
  });

  it("sends only the fields that changed, the title trimmed, and closes", async () => {
    updateModel.mockResolvedValue({ ...MODEL, title: "Valve B" });
    const onClose = open();
    await userEvent.clear(titleField());
    await userEvent.type(titleField(), "  Valve B ");
    await userEvent.click(saveButton());

    expect(updateModel).toHaveBeenCalledWith("valve", { title: "Valve B" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("writes the saved details into the model's own query and its library row", async () => {
    client.setQueryData(["model", "valve"], MODEL);
    client.setQueryData(["models"], [MODEL, { ...MODEL, slug: "pump", title: "Pump" }]);
    updateModel.mockResolvedValue({ ...MODEL, description: "Ball valve." });
    open();
    await userEvent.clear(descriptionField());
    await userEvent.type(descriptionField(), "Ball valve.");
    await userEvent.click(saveButton());

    expect(updateModel).toHaveBeenCalledWith("valve", { description: "Ball valve." });
    await waitFor(() => expect(client.getQueryData(["model", "valve"])).toMatchObject({ description: "Ball valve." }));
    const library = client.getQueryData<{ slug: string; title: string }[]>(["models"])!;
    expect(library.map((m) => m.title)).toEqual(["Valve", "Pump"]);
    expect(library[0]).toMatchObject({ description: "Ball valve." });
    expect(screen.getByText("Changes saved")).toBeInTheDocument();
  });

  it("writes a territory's scene bundle too, so the viewer header follows", async () => {
    client.setQueryData(["territory", "yard"], TERRITORY);
    client.setQueryData(["territories"], [TERRITORY]);
    client.setQueryData(["scene", "yard"], { territory: TERRITORY, placements: [] });
    updateTerritory.mockResolvedValue({ ...TERRITORY, title: "North yard" });
    open({ kind: "territory", slug: "yard", title: "Yard", description: undefined });
    await userEvent.clear(titleField());
    await userEvent.type(titleField(), "North yard");
    await userEvent.click(saveButton());

    expect(updateTerritory).toHaveBeenCalledWith("yard", { title: "North yard" });
    await waitFor(() =>
      expect(client.getQueryData<{ territory: { title: string } }>(["scene", "yard"])!.territory.title).toBe("North yard"),
    );
    expect(client.getQueryData(["territory", "yard"])).toMatchObject({ title: "North yard" });
    expect(client.getQueryData(["territories"])).toMatchObject([{ title: "North yard" }]);
  });

  it("trims the description too, and treats trailing spaces alone as no change", async () => {
    updateModel.mockResolvedValue({ ...MODEL, description: "Ball valve." });
    open();
    await userEvent.type(descriptionField(), "   ");
    expect(saveButton()).toBeDisabled();

    await userEvent.clear(descriptionField());
    await userEvent.type(descriptionField(), " Ball valve.  ");
    await userEvent.click(saveButton());
    expect(updateModel).toHaveBeenCalledWith("valve", { description: "Ball valve." });
  });

  it("keeps the dialog open and says why when the gateway refuses", async () => {
    updateModel.mockRejectedValue(new HttpError(400, { code: "invalid_input", message: "empty title" }, "empty title"));
    const onClose = open();
    await userEvent.type(titleField(), "!");
    await userEvent.click(saveButton());

    expect(await screen.findByText(/empty title/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(titleField()).toHaveValue("Valve!");
  });
});
