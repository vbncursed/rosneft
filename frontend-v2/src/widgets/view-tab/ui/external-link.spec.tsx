import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TOUR_LINK } from "../model/copy";
import { ExternalLink, type ExternalLinkProps } from "./external-link";

const link = (over: Partial<ExternalLinkProps> = {}) => {
  const props: ExternalLinkProps = {
    url: "https://tour.example/refinery",
    canEdit: false,
    saving: false,
    onSave: vi.fn(async () => true),
    ...over,
  };
  return { props, ...render(<ExternalLink {...props} />) };
};

describe("ExternalLink", () => {
  it("opens the tour in a new tab, safely", () => {
    link();
    const a = screen.getByRole("link", { name: TOUR_LINK });
    expect(a).toHaveAttribute("href", "https://tour.example/refinery");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("draws nothing for a reader when there is no safe url", () => {
    const { container } = link({ url: "javascript:alert(1)" });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();

    const none = link({ url: undefined });
    expect(none.container).toBeEmptyDOMElement();
  });

  it("anchors the tour on the block a writer edits", () => {
    const { container } = link({ canEdit: true });
    expect(container.querySelector("[data-tour='external-link']")).not.toBeNull();
  });

  it("offers a writer the field, and saves what was typed", async () => {
    const onSave = vi.fn();
    link({ canEdit: true, url: undefined, onSave });

    await userEvent.click(screen.getByRole("button", { name: /^(Edit|Add) link$/ }));
    await userEvent.type(screen.getByLabelText("External tour URL"), " https://tour.example/b ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("https://tour.example/b");
  });

  it("closes the editor once the save answers true", async () => {
    const onSave = vi.fn(async () => true);
    const view = link({ canEdit: true, url: "https://tour.example/a", onSave });

    await userEvent.click(screen.getByRole("button", { name: /^(Edit|Add) link$/ }));
    await userEvent.clear(screen.getByLabelText("External tour URL"));
    await userEvent.type(screen.getByLabelText("External tour URL"), "https://tour.example/b");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("https://tour.example/b");
    expect(screen.queryByLabelText("External tour URL")).not.toBeInTheDocument();
    view.rerender(<ExternalLink {...view.props} url="https://tour.example/b" />);
    expect(screen.getByRole("link", { name: TOUR_LINK })).toHaveAttribute(
      "href",
      "https://tour.example/b",
    );
  });

  it("keeps a refused save on screen with the draft", async () => {
    const onSave = vi.fn(async () => false);
    link({ canEdit: true, url: "https://tour.example/a", onSave });

    await userEvent.click(screen.getByRole("button", { name: /^(Edit|Add) link$/ }));
    await userEvent.clear(screen.getByLabelText("External tour URL"));
    await userEvent.type(screen.getByLabelText("External tour URL"), "https://tour.example/b");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    // The hook toasted the refusal; the field stays open on what was typed so
    // the operator can fix it rather than retype it.
    expect(screen.getByLabelText("External tour URL")).toHaveValue("https://tour.example/b");
  });

  it("cancels back to the link, discarding the draft", async () => {
    const onSave = vi.fn(async () => true);
    link({ canEdit: true, onSave });

    await userEvent.click(screen.getByRole("button", { name: /^(Edit|Add) link$/ }));
    await userEvent.type(screen.getByLabelText("External tour URL"), "/typo");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("External tour URL")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /^(Edit|Add) link$/ }));
    expect(screen.getByLabelText("External tour URL")).toHaveValue("https://tour.example/refinery");
  });

  it("waits for a save in flight", async () => {
    link({ canEdit: true, saving: true });
    await userEvent.click(screen.getByRole("button", { name: /^(Edit|Add) link$/ }));
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });
});
