import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { dropOrOweScene, takeSceneDrop } from "./owed-scene-drop";

const read = (client: QueryClient, slug: string) =>
  new QueryObserver(client, { queryKey: ["scene", slug], queryFn: () => ({}), enabled: false }).subscribe(() => {});

describe("owed scene drop", () => {
  it("drops a bundle nobody is reading, and owes nothing", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", "yard"], {});
    dropOrOweScene(client, "yard");
    expect(client.getQueryData(["scene", "yard"])).toBeUndefined();
    expect(takeSceneDrop(client, "yard")).toBe(false);
  });

  it("keeps a bundle a visit is reading and owes its drop, paid exactly once", () => {
    const client = new QueryClient();
    client.setQueryData(["scene", "yard"], {});
    const stop = read(client, "yard");
    dropOrOweScene(client, "yard");
    expect(client.getQueryData(["scene", "yard"])).toEqual({});
    expect(takeSceneDrop(client, "plant")).toBe(false);
    expect(takeSceneDrop(client, "yard")).toBe(true);
    expect(takeSceneDrop(client, "yard")).toBe(false);
    stop();
  });

  it("keeps each client's debts apart", () => {
    const a = new QueryClient();
    const b = new QueryClient();
    a.setQueryData(["scene", "yard"], {});
    const stop = read(a, "yard");
    dropOrOweScene(a, "yard");
    expect(takeSceneDrop(b, "yard")).toBe(false);
    expect(takeSceneDrop(a, "yard")).toBe(true);
    stop();
  });
});
