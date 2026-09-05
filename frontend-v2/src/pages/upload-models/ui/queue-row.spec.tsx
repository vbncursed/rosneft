import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QueueRow } from "../model/batch";
import { QueueRowCard } from "./queue-row";

const file = (name: string, size = 1024): File => {
  const f = new File([new Uint8Array(16)], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: "r1",
  file: file("pump-jack-unit.zip", 38 * 1024 * 1024),
  title: "Pump Jack Unit",
  status: "queued",
  progress: 0,
  ...over,
});

describe("QueueRowCard", () => {
  it("shows the file name and an editable title", () => {
    render(<QueueRowCard row={row()} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />);
    expect(screen.getByText("pump-jack-unit.zip")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title for pump-jack-unit.zip" })).toHaveValue(
      "Pump Jack Unit",
    );
  });

  it("edits the title", async () => {
    const onTitle = vi.fn();
    render(<QueueRowCard row={row()} onTitle={onTitle} onRemove={() => {}} onThumbnail={() => {}} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Title for pump-jack-unit.zip" }), "!");
    expect(onTitle).toHaveBeenCalled();
  });

  it("names its remove button after the file, uniquely", () => {
    render(<QueueRowCard row={row()} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />);
    expect(screen.getByRole("button", { name: "Remove pump-jack-unit.zip" })).toBeInTheDocument();
  });

  it("removes on click", async () => {
    const onRemove = vi.fn();
    render(<QueueRowCard row={row()} onTitle={() => {}} onRemove={onRemove} onThumbnail={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove pump-jack-unit.zip" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("locks the title and disables remove while a row is busy", () => {
    render(
      <QueueRowCard row={row({ status: "uploading" })} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />,
    );
    expect(screen.getByRole("textbox", { name: "Title for pump-jack-unit.zip" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove pump-jack-unit.zip" })).toBeDisabled();
  });

  it("shows a progress row only while uploading", () => {
    const { rerender } = render(
      <QueueRowCard row={row({ status: "uploading", progress: 0.62 })} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />,
    );
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText("62%")).toBeInTheDocument();

    rerender(
      <QueueRowCard row={row({ status: "queued" })} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />,
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("prints the failure text only for a failed row", () => {
    render(
      <QueueRowCard
        row={row({ status: "failed", error: "OBJ parse error at line 84120" })}
        onTitle={() => {}}
        onRemove={() => {}}
        onThumbnail={() => {}}
      />,
    );
    expect(screen.getByText("OBJ parse error at line 84120")).toBeInTheDocument();
  });

  it("says whether a thumbnail is attached", () => {
    const { rerender } = render(
      <QueueRowCard row={row()} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />,
    );
    expect(screen.getByText(/add image/)).toBeInTheDocument();

    rerender(
      <QueueRowCard
        row={row({ thumbnail: file("t.png", 100) })}
        onTitle={() => {}}
        onRemove={() => {}}
        onThumbnail={() => {}}
      />,
    );
    expect(screen.getByText("thumbnail · attached")).toBeInTheDocument();
  });

  it("names its thumbnail input after the file, uniquely — not the editable title", () => {
    render(<QueueRowCard row={row()} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />);
    expect(screen.getByLabelText("Add thumbnail for pump-jack-unit.zip")).toBeInTheDocument();
  });

  it("renames the thumbnail control once one is attached", () => {
    render(
      <QueueRowCard
        row={row({ thumbnail: file("t.png", 100) })}
        onTitle={() => {}}
        onRemove={() => {}}
        onThumbnail={() => {}}
      />,
    );
    expect(screen.getByLabelText("Thumbnail attached for pump-jack-unit.zip")).toBeInTheDocument();
  });

  it("hands the picked thumbnail up through onThumbnail", async () => {
    const onThumbnail = vi.fn();
    render(<QueueRowCard row={row()} onTitle={() => {}} onRemove={() => {}} onThumbnail={onThumbnail} />);
    const thumb = new File(["x"], "cover.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Add thumbnail for pump-jack-unit.zip"), thumb);
    expect(onThumbnail).toHaveBeenCalledWith(thumb);
  });

  it("shows no thumbnail affordance on a done row that never got one", () => {
    render(<QueueRowCard row={row({ status: "done" })} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />);
    expect(screen.queryByText(/add image/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/thumbnail/i)).not.toBeInTheDocument();
  });

  it("still says thumbnail attached on a done row that has one", () => {
    render(
      <QueueRowCard
        row={row({ status: "done", thumbnail: file("t.png", 100) })}
        onTitle={() => {}}
        onRemove={() => {}}
        onThumbnail={() => {}}
      />,
    );
    expect(screen.getByText("thumbnail · attached")).toBeInTheDocument();
  });

  it("prints the archive size", () => {
    render(<QueueRowCard row={row()} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />);
    expect(screen.getByText("38 MB")).toBeInTheDocument();
  });

  it("prints the status as text, not colour alone", () => {
    render(<QueueRowCard row={row({ status: "failed" })} onTitle={() => {}} onRemove={() => {}} onThumbnail={() => {}} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
