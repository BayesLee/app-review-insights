import { describe, expect, it } from "vitest";
import { discoverIssueThemes } from "./issue-discovery";
import type { CleanedReview } from "@/lib/reviews/types";

function makeReview(overrides: Partial<CleanedReview>): CleanedReview {
  const body = overrides.body ?? "I paid but cannot access the workout plan.";

  return {
    id: overrides.id ?? "source-1",
    title: overrides.title ?? "Subscription problem",
    body,
    rating: overrides.rating ?? 1,
    version: overrides.version ?? "unknown",
    updatedAt: overrides.updatedAt ?? "2026-07-10T10:00:00Z",
    author: overrides.author ?? "tester",
    country: "us",
    appId: "839285684",
    page: 1,
    sourceUrl: "https://example.com/review",
    normalizedText: `${overrides.title ?? "Subscription problem"} ${body}`.toLowerCase(),
    bodyLength: body.length
  };
}

const mixedReviews = [
  makeReview({ id: "low-1", rating: 1, title: "Paywall issue", body: "Everything is behind a paywall now." }),
  makeReview({ id: "low-2", rating: 2, title: "Trial charge", body: "The free trial charged me immediately." }),
  makeReview({ id: "high-1", rating: 5, title: "Great app", body: "The workouts are easy and helpful." })
];

describe("model-driven issue discovery", () => {
  it("accepts a normal model response and computes support count in code", async () => {
    const result = await discoverIssueThemes({
      reviews: mixedReviews,
      goal: "find subscription issues",
      apiKey: "test-key",
      model: "test-model",
      callModel: async () =>
        JSON.stringify({
          themes: [
            {
              issueId: "F-001",
              title: "Subscription and paywall friction",
              summary: "Users complain that previously accessible workouts now require payment.",
              severity: "high",
              confidence: "high",
              supportingReviewIds: ["R-001", "R-002"],
              conflictingReviewIds: ["R-003"]
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.model).toBe("test-model");
    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].supportCount).toBe(2);
    expect(result.themes[0].supportingReviews.map((review) => review.reviewId)).toEqual(["R-001", "R-002"]);
    expect(result.themes[0].conflictingReviews[0].reviewId).toBe("R-003");
  });

  it("removes hallucinated review ids and filters themes without evidence", async () => {
    const result = await discoverIssueThemes({
      reviews: mixedReviews,
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          themes: [
            {
              issueId: "F-001",
              title: "Valid theme",
              summary: "One valid support id remains after validation.",
              severity: "medium",
              confidence: "medium",
              supportingReviewIds: ["R-001", "R-999"],
              conflictingReviewIds: ["R-003", "R-888"]
            },
            {
              issueId: "F-002",
              title: "No evidence theme",
              summary: "This should not be shown.",
              severity: "low",
              confidence: "low",
              supportingReviewIds: ["R-999"],
              conflictingReviewIds: []
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.themes).toHaveLength(1);
    expect(result.themes[0].supportingReviewIds).toEqual(["R-001"]);
    expect(result.themes[0].conflictingReviewIds).toEqual(["R-003"]);
    expect(result.themes[0].supportCount).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("R-999"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("主题已过滤"))).toBe(true);
  });

  it("returns a readable error for invalid model JSON", async () => {
    const result = await discoverIssueThemes({
      reviews: mixedReviews,
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () => "not json"
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("模型返回非法 JSON");
    expect(result.themes).toHaveLength(0);
  });

  it("skips model analysis when there are no low-rating reviews", async () => {
    const result = await discoverIssueThemes({
      reviews: [makeReview({ id: "high-1", rating: 5 }), makeReview({ id: "high-2", rating: 4 })],
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () => {
        throw new Error("model should not be called");
      }
    });

    expect(result.status).toBe("skipped");
    expect(result.lowRatingReviewCount).toBe(0);
    expect(result.themes).toHaveLength(0);
  });

  it("returns a clear error when API key is not configured", async () => {
    const result = await discoverIssueThemes({
      reviews: mixedReviews,
      goal: "find issues",
      apiKey: ""
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("未配置 OPENAI_API_KEY");
    expect(result.themes).toHaveLength(0);
  });
});
