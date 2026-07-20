// Run with: yarn test  (Node's built-in runner, no framework dependency)
import { test } from "node:test";
import assert from "node:assert/strict";

import { toSeries } from "./prometheus-gateway.ts";

test("toSeries: maps a matrix response, one series per label set", () => {
  const body = {
    status: "success",
    data: {
      resultType: "matrix",
      result: [
        { metric: { service: "auth" }, values: [[10, "1.5"], [25, "2"]] },
        { metric: { service: "gateway" }, values: [[10, "3"]] },
      ],
    },
  };
  assert.deepEqual(toSeries(body), [
    { label: "auth", points: [{ t: 10, v: 1.5 }, { t: 25, v: 2 }] },
    { label: "gateway", points: [{ t: 10, v: 3 }] },
  ]);
});

test("toSeries: maps a vector response into single-point series", () => {
  const body = {
    status: "success",
    data: { resultType: "vector", result: [{ metric: { status: "failed" }, value: [42, "7"] }] },
  };
  assert.deepEqual(toSeries(body), [{ label: "failed", points: [{ t: 42, v: 7 }] }]);
});

test("toSeries: drops NaN and Inf samples instead of charting them", () => {
  const body = {
    status: "success",
    data: {
      resultType: "matrix",
      result: [{ metric: { service: "auth" }, values: [[10, "NaN"], [20, "+Inf"], [30, "4"]] }],
    },
  };
  assert.deepEqual(toSeries(body), [{ label: "auth", points: [{ t: 30, v: 4 }] }]);
});

test("toSeries: a series left with no finite samples is dropped entirely", () => {
  const body = {
    status: "success",
    data: { resultType: "matrix", result: [{ metric: { service: "auth" }, values: [[10, "NaN"]] }] },
  };
  assert.deepEqual(toSeries(body), []);
});

test("toSeries: empty result is empty output, not an error", () => {
  assert.deepEqual(toSeries({ status: "success", data: { resultType: "matrix", result: [] } }), []);
});

test("toSeries: label falls back through service, grpc_service, status, alertname", () => {
  const body = {
    status: "success",
    data: {
      resultType: "vector",
      result: [
        { metric: { grpc_service: "catalog.v1.Catalog" }, value: [1, "1"] },
        { metric: { alertname: "TargetDown", severity: "critical" }, value: [1, "1"] },
        { metric: {}, value: [1, "1"] },
      ],
    },
  };
  assert.deepEqual(toSeries(body).map((s) => s.label), ["catalog.v1.Catalog", "TargetDown", "value"]);
});

test("toSeries: a failed Prometheus response throws", () => {
  assert.throws(() => toSeries({ status: "error", error: "parse error" }), /parse error/);
});
