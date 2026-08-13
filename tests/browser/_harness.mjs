/** Shared bits for the browser suites: one way to launch, one way to assert.
 *
 *  Set CHROMIUM_PATH to use a Chromium you already have rather than the one
 *  Playwright downloads — handy in a container that ships one. */

import { chromium } from "playwright";

export const BASE = process.env.BASE_URL ?? "http://localhost:4183";

export const launch = () =>
  chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );

/** Suites report by printing; the runner counts the PASS and FAIL lines. The
 *  detail only prints on failure, where it's the difference between "something
 *  broke" and knowing what. */
export const ok = (label, condition, detail) => {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition && detail !== undefined) {
    console.log(`        got: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
};
