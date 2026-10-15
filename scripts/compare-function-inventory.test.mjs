import test from "node:test";
import assert from "node:assert/strict";
import {
  compareInventories,
  extractGhidraAddresses,
  extractR2Addresses,
} from "./compare-function-inventory.mjs";

test("extracts Ghidra addresses and skips external/thunk entries", () => {
  const addresses = extractGhidraAddresses({
    normalized_result: [
      { address: "0x140001350", value: "main" },
      { address: "EXTERNAL:0x1", value: "KERNEL32.DLL::LoadLibraryA" },
      { address: "not-an-address", value: "???" },
    ],
  });
  assert.deepEqual([...addresses], [0x140001350]);
});

test("extracts r2 aflj addresses", () => {
  const addresses = extractR2Addresses([
    { addr: 0x140001350, name: "main", size: 120 },
    { addr: "bad", name: "junk" },
  ]);
  assert.deepEqual([...addresses], [0x140001350]);
});

test("reports agreement and one-sided sets without voting", () => {
  const report = compareInventories(new Set([1, 2, 3]), new Set([2, 3, 4]));
  assert.equal(report.agreed, 2);
  assert.deepEqual(report.ghidraOnly, [1]);
  assert.deepEqual(report.r2Only, [4]);
  assert.equal(report.ghidraProcedures, 3);
  assert.equal(report.r2Functions, 3);
});

test("empty inventories compare cleanly", () => {
  const report = compareInventories(new Set(), new Set());
  assert.deepEqual(
    [report.agreed, report.ghidraOnly, report.r2Only],
    [0, [], []],
  );
});
