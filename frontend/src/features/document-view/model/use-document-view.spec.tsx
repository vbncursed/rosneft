import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import { useDocumentView } from "./use-document-view";

const document = (id: number): Document => ({
  id,
  territorySlug: "t",
  title: `doc-${id}.pdf`,
  sourceBlobHash: `h${id}`,
  createdAt: "t0",
});

const docs = [document(1), document(2)];

describe("useDocumentView", () => {
  it("opens a document into the pip window, leaving the caller's other mode first", () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useDocumentView(docs, onOpen));

    act(() => result.current.open(2));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(result.current.active?.id).toBe(2);
    expect(result.current.window).toBe("pip");
  });

  it("escape steps expanded back to pip, without closing", () => {
    const { result } = renderHook(() => useDocumentView(docs, vi.fn()));
    act(() => result.current.open(1));
    act(() => result.current.setWindow("expanded"));

    let handled = false;
    act(() => {
      handled = result.current.escape();
    });

    expect(handled).toBe(true);
    expect(result.current.window).toBe("pip");
    expect(result.current.active?.id).toBe(1);
  });

  it("escape from pip closes the window", () => {
    const { result } = renderHook(() => useDocumentView(docs, vi.fn()));
    act(() => result.current.open(1));

    let handled = false;
    act(() => {
      handled = result.current.escape();
    });

    expect(handled).toBe(true);
    expect(result.current.active).toBeNull();
  });

  it("escape from collapsed also closes the window", () => {
    const { result } = renderHook(() => useDocumentView(docs, vi.fn()));
    act(() => result.current.open(1));
    act(() => result.current.setWindow("collapsed"));

    let handled = false;
    act(() => {
      handled = result.current.escape();
    });

    expect(handled).toBe(true);
    expect(result.current.active).toBeNull();
  });

  it("escape does nothing with no document open", () => {
    const { result } = renderHook(() => useDocumentView(docs, vi.fn()));

    let handled = true;
    act(() => {
      handled = result.current.escape();
    });

    expect(handled).toBe(false);
  });

  it("close clears the active document", () => {
    const { result } = renderHook(() => useDocumentView(docs, vi.fn()));
    act(() => result.current.open(1));

    act(() => result.current.close());
    expect(result.current.active).toBeNull();
  });

  it("re-derives active by id, closing the window when the document leaves the list", () => {
    const { result, rerender } = renderHook(({ list }) => useDocumentView(list, vi.fn()), {
      initialProps: { list: docs },
    });
    act(() => result.current.open(2));
    expect(result.current.active?.id).toBe(2);

    rerender({ list: [document(1)] });
    expect(result.current.active).toBeNull();
  });
});
