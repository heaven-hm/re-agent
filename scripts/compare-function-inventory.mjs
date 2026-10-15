#!/usr/bin/env node
/**
 * Compare Ghidra and radare2 function inventories for one binary.
 *
 * Inputs: two JSON files —
 *   1. REA procedure listing (normalized_result array, or an object with a
 *      `procedures`/`items` array of {address, value}).
 *   2. radare2 `aflj` output (array of {addr, name, size}).
 *
 * Output (JSON): agreed addresses, ghidra-only, r2-only, and counts.
 * Disagreement is reported, never resolved by voting: a function seen by
 * only one engine is a candidate for boundary review, not evidence.
 */
import { readFile } from "node:fs/promises";

const parseAddress = (raw) => {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw !== "string") return null;
  const body = raw.includes(":") ? raw.split(":").pop() : raw;
  if (!/^0[xX][0-9a-fA-F]+$/.test(body ?? "")) return null;
  const value = Number.parseInt(body, 16);
  return Number.isSafeInteger(value) ? value : null;
};

export const extractGhidraAddresses = (document) => {
  const normalized = document?.normalized_result ?? document;
  const items = Array.isArray(normalized)
    ? normalized
    : (normalized?.procedures ?? normalized?.items ?? []);
  const addresses = new Set();
  for (const item of items) {
    const address = item?.address;
    if (typeof address === "string" && address.startsWith("EXTERNAL")) continue;
    const parsed = parseAddress(address);
    if (parsed !== null) addresses.add(parsed);
  }
  return addresses;
};

export const extractR2Addresses = (functions) => {
  const addresses = new Set();
  for (const item of Array.isArray(functions) ? functions : []) {
    const parsed = parseAddress(item?.addr);
    if (parsed !== null) addresses.add(parsed);
  }
  return addresses;
};

export const compareInventories = (ghidraAddresses, r2Addresses) => {
  const agreed = [];
  const ghidraOnly = [];
  for (const address of ghidraAddresses) {
    if (r2Addresses.has(address)) agreed.push(address);
    else ghidraOnly.push(address);
  }
  const r2Only = [];
  for (const address of r2Addresses) {
    if (!ghidraAddresses.has(address)) r2Only.push(address);
  }
  agreed.sort((a, b) => a - b);
  ghidraOnly.sort((a, b) => a - b);
  r2Only.sort((a, b) => a - b);
  return {
    ghidraProcedures: ghidraAddresses.size,
    r2Functions: r2Addresses.size,
    agreed: agreed.length,
    ghidraOnly,
    r2Only,
  };
};

const main = async (argv = process.argv.slice(2)) => {
  if (argv.length !== 2 || argv.includes("--help")) {
    console.log(
      "usage: compare-function-inventory.mjs <ghidra-procedures.json> <r2-aflj.json>",
    );
    return argv.length === 2 ? 0 : 2;
  }
  const [ghidraPath, r2Path] = argv;
  const ghidra = extractGhidraAddresses(
    JSON.parse(await readFile(ghidraPath, "utf8")),
  );
  const r2 = extractR2Addresses(JSON.parse(await readFile(r2Path, "utf8")));
  console.log(JSON.stringify(compareInventories(ghidra, r2), null, 2));
  return 0;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}

export default {
  extractGhidraAddresses,
  extractR2Addresses,
  compareInventories,
};
