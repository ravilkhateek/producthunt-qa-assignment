import { describe, expect, test } from "bun:test";
import { graphql, POSTS_QUERY, type PostsConnection } from "../../src/api-client";

/**
 * The posts connection is the core read path of the API — it is what any
 * integration is actually built on.
 *
 * Every assertion here targets structure and invariants, never values. The
 * featured products change daily, so a test asserting on a specific product
 * name would pass today and fail tomorrow for no useful reason.
 */
describe("posts connection", () => {
  test("returns a well-formed collection with the documented node shape", async () => {
    const result = await graphql<PostsConnection>(POSTS_QUERY, {
      variables: { first: 5 },
    });

    expect(result.status).toBe(200);
    expect(result.errors).toBeNull();

    const edges = result.data?.posts.edges ?? [];
    expect(edges.length).toBeGreaterThan(0);

    for (const edge of edges) {
      const post = edge.node;

      expect(typeof post.id).toBe("string");
      expect(post.id.length).toBeGreaterThan(0);

      expect(typeof post.name).toBe("string");
      expect(post.name.trim().length).toBeGreaterThan(0);

      expect(typeof post.tagline).toBe("string");
      expect(typeof post.slug).toBe("string");

      // Counts are non-negative integers, never null.
      expect(Number.isInteger(post.votesCount)).toBe(true);
      expect(post.votesCount).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(post.commentsCount)).toBe(true);
      expect(post.commentsCount).toBeGreaterThanOrEqual(0);

      // createdAt must be a parseable timestamp that is not in the future.
      const createdAt = new Date(post.createdAt);
      expect(Number.isNaN(createdAt.getTime())).toBe(false);
      expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
    }
  });

  test("honours the requested page size", async () => {
    const requested = 3;
    const result = await graphql<PostsConnection>(POSTS_QUERY, {
      variables: { first: requested },
    });

    expect(result.status).toBe(200);

    const edges = result.data?.posts.edges ?? [];
    expect(edges.length).toBeLessThanOrEqual(requested);
    expect(edges.length).toBeGreaterThan(0);

    const pageInfo = result.data?.posts.pageInfo;
    expect(typeof pageInfo?.hasNextPage).toBe("boolean");
  });

  test("paginates forward without repeating items from the first page", async () => {
    const firstPage = await graphql<PostsConnection>(POSTS_QUERY, {
      variables: { first: 3 },
    });

    expect(firstPage.status).toBe(200);

    const pageInfo = firstPage.data?.posts.pageInfo;
    expect(pageInfo?.hasNextPage).toBe(true);
    expect(pageInfo?.endCursor).toBeTruthy();

    const secondPage = await graphql<PostsConnection>(POSTS_QUERY, {
      variables: { first: 3, after: pageInfo?.endCursor },
    });

    expect(secondPage.status).toBe(200);

    const firstIds = (firstPage.data?.posts.edges ?? []).map((e) => e.node.id);
    const secondIds = (secondPage.data?.posts.edges ?? []).map((e) => e.node.id);

    expect(secondIds.length).toBeGreaterThan(0);

    // The two pages must be disjoint. Overlapping pages are the classic
    // cursor bug, and they silently duplicate rows in any consuming client.
    const overlap = secondIds.filter((id) => firstIds.includes(id));
    expect(overlap).toEqual([]);
  });
});
