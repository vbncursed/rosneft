import { test } from "node:test";
import assert from "node:assert/strict";
import { readWithProgress } from "./read-with-progress.ts";

function streamResponse(chunks: Uint8Array[], contentLength?: number): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
  const headers = new Headers();
  if (contentLength !== undefined) headers.set("Content-Length", String(contentLength));
  return new Response(stream, { headers });
}

test("reports monotonic progress ending at 100 when Content-Length is known", async () => {
  const chunks = [new Uint8Array(3), new Uint8Array(2)];
  const seen: (number | null)[] = [];
  const blob = await readWithProgress(streamResponse(chunks, 5), (p) => seen.push(p));

  assert.equal(blob.size, 5);
  assert.deepEqual(seen, [60, 100]);
  for (let i = 1; i < seen.length; i++) {
    assert.ok((seen[i] as number) >= (seen[i - 1] as number), "progress must not decrease");
  }
});

test("reports null (indeterminate) once when Content-Length is missing", async () => {
  const chunks = [new Uint8Array(3), new Uint8Array(2)];
  const seen: (number | null)[] = [];
  const blob = await readWithProgress(streamResponse(chunks), (p) => seen.push(p));

  assert.equal(blob.size, 5);
  assert.deepEqual(seen, [null]);
});

test("caps progress at 100 if the stream overruns Content-Length", async () => {
  const chunks = [new Uint8Array(4), new Uint8Array(4)]; // 8 bytes vs declared 5
  const seen: (number | null)[] = [];
  await readWithProgress(streamResponse(chunks, 5), (p) => seen.push(p));

  assert.ok(seen.every((p) => (p as number) <= 100), "progress never exceeds 100");
  assert.equal(seen.at(-1), 100);
});
