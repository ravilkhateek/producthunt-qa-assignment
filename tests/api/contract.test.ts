import { describe, expect, test } from "bun:test";
import { graphql, POSTS_QUERY, type PostsConnection } from "../../src/api-client";

/**
 * Error handling and rate limit disclosure.
 *
 * Both are part of the API's contract with its clients even though neither is
 * a "feature": an integration that cannot predict how failures arrive, or how
 * much budget it has left, cannot be built reliably.
 */
describe("error contract", () => {
  test("reports an unknown field as a structured error without leaking internals", async () => {
    const result = await graphql(
      `query { viewer { user { id fieldThatDoesNotExist } } }`,
    );

    // GraphQL convention: validation failures still return HTTP 200, with the
    // failure described in the errors array. Clients cannot rely on status
    // codes alone to detect a failed query, which is worth pinning down.
    expect(result.status).toBe(200);
    expect(result.errors).not.toBeNull();
    expect(result.data).toBeNull();

    const [first] = result.errors ?? [];
    expect(first?.message).toContain("fieldThatDoesNotExist");

    // The error should locate the problem for the developer...
    expect(first?.locations?.length ?? 0).toBeGreaterThan(0);
    expect(first?.extensions?.["code"]).toBe("undefinedField");

    // ...without exposing anything about the server that produced it.
    const serialised = JSON.stringify(result.errors);
    expect(serialised).not.toMatch(/stack|backtrace|\.rb:\d|\/usr\/|\/var\/|ActiveRecord/i);
  });
});

describe("rate limit disclosure", () => {
  test("returns a coherent rate limit budget on every successful response", async () => {
    const result = await graphql<PostsConnection>(POSTS_QUERY, {
      variables: { first: 2 },
    });

    expect(result.status).toBe(200);

    const { limit, remaining, reset } = result.rateLimit;

    // All three headers must be present. A client that cannot see its budget
    // cannot pace itself, and will discover the limit only by being throttled.
    expect(limit).not.toBeNull();
    expect(remaining).not.toBeNull();
    expect(reset).not.toBeNull();

    expect(limit).toBeGreaterThan(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(limit as number);

    // The window is 15 minutes, so the reset countdown must fall inside it.
    expect(reset).toBeGreaterThan(0);
    expect(reset).toBeLessThanOrEqual(900);
  });
});
