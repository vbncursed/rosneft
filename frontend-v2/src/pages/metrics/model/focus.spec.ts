import { describe, expect, it } from "vitest";
import type { MetricSeries } from "@/entities/metric";
import { focusSeries, shortGrpcLabel } from "./focus";

const s = (service: string, last: number): MetricSeries => ({
  label: service,
  labels: { service },
  points: [{ t: 0, v: last }],
});

describe("focusSeries", () => {
  it("keeps only the selected service", () => {
    const r = focusSeries([s("gateway", 1), s("mesh", 9)], "mesh");
    expect(r.series.map((x) => x.label)).toEqual(["mesh"]);
    expect(r.hidden).toBe(0);
  });

  it("shows the top three by last value and counts the rest", () => {
    const r = focusSeries([s("a", 1), s("b", 4), s("c", 3), s("d", 2), s("e", 5)], null);
    expect(r.series.map((x) => x.label)).toEqual(["e", "b", "c"]);
    expect(r.hidden).toBe(2);
  });

  it("passes unlabelled series through", () => {
    const plain = { label: "total", labels: {}, points: [] };
    expect(focusSeries([plain], "mesh")).toEqual({ series: [plain], hidden: 0 });
  });

  it("never hides a series a panel plots without a service label", () => {
    const plain = { label: "total", labels: {}, points: [{ t: 0, v: 7 }] };
    const r = focusSeries([plain, s("gateway", 1), s("mesh", 9)], "mesh");
    expect(r.series.map((x) => x.label)).toEqual(["total", "mesh"]);
  });

  it("hides nothing while three or fewer services are plotted", () => {
    expect(focusSeries([s("a", 1), s("b", 2)], null).hidden).toBe(0);
  });
});

describe("shortGrpcLabel", () => {
  it("shortens a full method path", () => {
    expect(shortGrpcLabel("/rosneft.catalog.v1.CatalogService/ListTerritories")).toBe(
      "Catalog.ListTerritories",
    );
  });

  it("leaves anything else alone", () => {
    expect(shortGrpcLabel("gateway")).toBe("gateway");
    expect(shortGrpcLabel("rosneft.catalog.v1.CatalogService")).toBe(
      "rosneft.catalog.v1.CatalogService",
    );
  });
});
