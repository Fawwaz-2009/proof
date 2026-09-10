import { describe, expect, test } from "bun:test";
import { otpFromAddress } from "../config/auth.ts";

/**
 * The dev sign-in trick: on capture stages an address whose local part is
 * exactly six digits signs in with those digits. The anchor is the whole
 * security story: no real address can be made to carry a six-digit local
 * part, so no crafted address predicts someone else's code.
 */

describe("otpFromAddress", () => {
  test("an exactly-six-digit local part is the code", () => {
    expect(otpFromAddress("123456@dev.example.com")).toBe("123456");
    expect(otpFromAddress("000000@preview.proof.test")).toBe("000000");
  });

  test("shorter, longer, or embedded digits never match", () => {
    expect(otpFromAddress("12345@dev.example.com")).toBeNull();
    expect(otpFromAddress("1234567@dev.example.com")).toBeNull();
    expect(otpFromAddress("dev123456@example.com")).toBeNull();
    expect(otpFromAddress("123456.extra@example.com")).toBeNull();
  });

  test("ordinary addresses never match", () => {
    expect(otpFromAddress("fawwaz@proof.dev")).toBeNull();
    expect(otpFromAddress("")).toBeNull();
  });
});
