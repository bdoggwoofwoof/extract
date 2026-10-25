import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "../public/sync.js";

test("newer change from another device is applied", () => {
  assert.equal(decide({ updated_at: 200 }, { updatedAt: 100 }), "apply");
  assert.equal(decide({ updated_at: 200 }, undefined), "apply");
});
test("an older change never overwrites a newer one here", () => {
  assert.equal(decide({ updated_at: 100 }, { updatedAt: 200 }), "skip");
  assert.equal(decide({ updated_at: 100 }, { updatedAt: 100 }), "skip");
});
test("deletions sync, but not over a newer local edit", () => {
  assert.equal(decide({ updated_at: 300, deleted: true }, { updatedAt: 200 }), "delete");
  assert.equal(decide({ updated_at: 300, deleted: true }, undefined), "delete");
  assert.equal(decide({ updated_at: 100, deleted: true }, { updatedAt: 200 }), "skip");
});
test("something deleted here after the remote change stays deleted", () => {
  assert.equal(decide({ updated_at: 100 }, undefined, 150), "skip");
  assert.equal(decide({ updated_at: 200 }, undefined, 150), "apply");
});
