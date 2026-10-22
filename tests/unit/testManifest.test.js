import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { activeUnitTests, legacyUnitTests } from "../unit-manifest";

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;

function discoverTestFiles(directory, relativeDirectory = "tests/unit") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    const relativePath = `${relativeDirectory}/${entry.name}`;

    if (entry.isDirectory()) {
      return discoverTestFiles(path, relativePath);
    }

    return entry.isFile() && TEST_FILE_PATTERN.test(entry.name)
      ? [relativePath]
      : [];
  });
}

describe("unit test manifest", () => {
  test("accounts for every unit test as active or documented legacy debt", () => {
    // Vitest rewrites import.meta.url to the jsdom page URL, so resolve from
    // the package working directory instead of assuming a file: URL here.
    const unitDirectory = [
      join(process.cwd(), "tests", "unit"),
      join(process.cwd(), "frontend", "tests", "unit"),
    ].find((candidate) => existsSync(candidate));
    if (!unitDirectory) throw new Error("Unable to locate frontend tests/unit");
    const discovered = discoverTestFiles(unitDirectory).sort();
    const accountedFor = [
      ...activeUnitTests,
      ...Object.keys(legacyUnitTests),
    ].sort();

    expect(discovered).toEqual(accountedFor);
  });
});
