import { describe, expect, it } from "vitest";
import type { MetricSeries } from "@/entities/metric";
import { focusSeries, shortGrpcLabel } from "./focus";

const s = (service: string, last: number): MetricSeries => ({
  label: service,
  labels: { service },
  points: [{ t: 0, v: last }],
});

const grpc = (name: string, last: number): MetricSeries => ({
  label: name,
  labels: { grpc_service: name },
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

  it("focuses a panel grouped by grpc_service too — it is the same hairball", () => {
    const r = focusSeries(
      [grpc("a.AService", 1), grpc("b.BService", 4), grpc("c.CService", 3), grpc("d.DService", 2)],
      null,
    );
    expect(r.series.map((x) => x.label)).toEqual(["b.BService", "c.CService", "d.DService"]);
    expect(r.hidden).toBe(1);
  });

  it("matches a selected service name against the gRPC service that contains it", () => {
    const r = focusSeries(
      [grpc("rosneft.catalog.v1.CatalogService", 1), grpc("rosneft.mesh.v1.MeshService", 9)],
      "mesh-worker",
    );
    expect(r.series.map((x) => x.label)).toEqual([]);

    const hit = focusSeries(
      [grpc("rosneft.catalog.v1.CatalogService", 1), grpc("rosneft.mesh.v1.MeshService", 9)],
      "catalog",
    );
    expect(hit.series.map((x) => x.label)).toEqual(["rosneft.catalog.v1.CatalogService"]);
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

  it("shortens the bare service name the latency panel actually groups by", () => {
    // red-latency groups by `grpc_service`, which carries no slash and no
    // method — seven of these stacked under a chart is what the mock objects to.
    expect(shortGrpcLabel("rosneft.catalog.v1.CatalogService")).toBe("Catalog");
    expect(shortGrpcLabel("grpc.health.v1.Health")).toBe("Health");
  });

  it("leaves a name with nothing to shorten alone", () => {
    expect(shortGrpcLabel("gateway")).toBe("gateway");
    expect(shortGrpcLabel("mesh-worker")).toBe("mesh-worker");
  });
});
