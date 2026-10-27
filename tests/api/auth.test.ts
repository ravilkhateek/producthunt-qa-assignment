import { describe, expect, test } from "bun:test";
import { graphql, VIEWER_QUERY, type Viewer } from "../../src/api-client";

/**
 * Authentication is the first thing worth testing on a credentialed API: if it
 * fails open, nothing else matters. These also check that a rejection does not
 * disclose more than it should.
 *
 * The two negative cases cost no rate limit budget — rejected requests are not
 * charged — so they are effectively free coverage.
 */
describe("authentication", () => {
  test("rejects a request with no Authorization header", async () => {
    const result = await graphql(VIEWER_QUERY, { auth: "none" });

    expect(result.status).toBe(401);
    expect(result.data).toBeNull();
    expect(result.errors).not.toBeNull();

    const [first] = result.errors ?? [];
    expect(first?.error).toBe("invalid_oauth_token");
  });

  test("rejects an invalid token without disclosing why it is invalid", async () => {
    const result = await graphql(VIEWER_QUERY, { auth: "invalid" });

    expect(result.status).toBe(401);
    expect(result.data).toBeNull();

    const [first] = result.errors ?? [];
    expect(first?.error).toBe("invalid_oauth_token");

    // A missing token and a wrong token must be indistinguishable. If the
    // responses differed, an attacker could use the difference to confirm
    // whether a captured token was ever real.
    const noAuth = await graphql(VIEWER_QUERY, { auth: "none" });
    expect(first?.error).toBe((noAuth.errors ?? [])[0]?.error ?? "");
    expect(result.status).toBe(noAuth.status);

    // And it must not leak internals while doing so.
    const description = first?.error_description ?? "";
    expect(description).not.toMatch(/stack|trace|sql|exception|\.rb:|\.js:/i);
  });

  test("accepts a valid token and returns the authenticated viewer", async () => {
    const result = await graphql<Viewer>(VIEWER_QUERY, { auth: "valid" });

    expect(result.status).toBe(200);
    expect(result.errors).toBeNull();

    const user = result.data?.viewer?.user;
    expect(user).toBeDefined();
    expect(typeof user?.id).toBe("string");
    expect(user?.id.length).toBeGreaterThan(0);
    expect(typeof user?.username).toBe("string");
  });
});
