import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDocument, type Document } from "@/entities/document";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useDocumentList } from "./use-document-list";

vi.mock("@/entities/document", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  deleteDocument: vi.fn(),
}));

const document = (id: number, over: Partial<Document> = {}): Document => ({
  id,
  territorySlug: "t",
  title: `doc-${id}.pdf`,
  sourceBlobHash: `h${id}`,
  createdAt: "t0",
  ...over,
});

let onChanged: ReturnType<typeof vi.fn<() => void>>;

const list = (initial: Document[]) =>
  renderHook(() => ({
    s: useDocumentList({ slug: "t", initial, onChanged }),
    notices: useNotices(),
  }));

beforeEach(() => {
  vi.mocked(deleteDocument).mockReset();
  onChanged = vi.fn();
  clearNotices();
});

describe("useDocumentList", () => {
  it("drops the row before the DELETE lands, then confirms it", async () => {
    let resolveDelete!: () => void;
    vi.mocked(deleteDocument).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const { result } = list([document(1), document(2)]);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.s.remove(1);
    });
    // The row is gone from the panel immediately — the round trip only
    // confirms it.
    expect(result.current.s.documents.map((d) => d.id)).toEqual([2]);
    expect(result.current.s.pendingId).toBe(1);

    await act(async () => {
      resolveDelete();
      await pending;
    });
    expect(result.current.notices[0]).toMatchObject({ tone: "success", message: "Document deleted" });
    expect(deleteDocument).toHaveBeenCalledWith("t", 1);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.s.pendingId).toBeNull();
  });

  it("puts the row back and surfaces the gateway's own message when the delete is refused", async () => {
    vi.mocked(deleteDocument).mockRejectedValue(new HttpError(409, null, "Still referenced."));
    const { result } = list([document(1), document(2)]);

    await act(async () => {
      await result.current.s.remove(1);
    });

    expect(result.current.s.documents.map((d) => d.id)).toEqual([1, 2]);
    expect(result.current.notices[0]).toMatchObject({ tone: "error", message: "Still referenced." });
    // Both ways: a refusal may mean the row is already gone for another
    // reason, and only the gateway can say. The page re-keys on the bundle
    // it refetches.
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.s.pendingId).toBeNull();
  });

  it("appends what the upload created, and marks nothing pending in between", () => {
    const { result } = list([document(1)]);
    expect(result.current.s.pendingId).toBeNull();

    act(() => result.current.s.add(document(2)));
    expect(result.current.s.documents.map((d) => d.id)).toEqual([1, 2]);
    expect(result.current.s.pendingId).toBeNull();
  });
});
