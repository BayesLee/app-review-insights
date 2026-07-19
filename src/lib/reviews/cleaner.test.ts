import { describe, expect, it } from "vitest";
import { cleanReviews, buildReviewMetrics } from "./cleaner";
import { parseAppStoreAppId } from "./collector";
import type { RawReview } from "./types";

const baseReview: RawReview = {
  id: "review-1",
  title: "Subscription issue",
  body: "I paid but the workout plan is locked.",
  rating: 1,
  version: "1.0.0",
  updatedAt: "2026-07-10T10:00:00-07:00",
  author: "tester",
  country: "us",
  appId: "839285684",
  page: 1,
  sourceUrl: "https://example.com/review-1"
};

describe("App Store review utilities", () => {
  it("parses app ids from App Store links", () => {
    expect(
      parseAppStoreAppId("https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684")
    ).toBe("839285684");
  });

  it("cleans duplicates and malformed reviews", () => {
    const { reviews, report } = cleanReviews([
      baseReview,
      { ...baseReview, id: "review-duplicate" },
      { ...baseReview, id: "review-empty", title: "", body: "" },
      { ...baseReview, id: "review-bad-rating", rating: 6 }
    ]);

    expect(reviews).toHaveLength(1);
    expect(report).toEqual({
      rawCount: 4,
      cleanedCount: 1,
      emptyCount: 1,
      duplicateCount: 1,
      malformedCount: 1
    });
  });

  it("builds rating and version metrics", () => {
    const { reviews } = cleanReviews([
      baseReview,
      { ...baseReview, id: "review-2", body: "Great workouts", rating: 5, version: "1.0.1" },
      { ...baseReview, id: "review-3", body: "Too many ads", rating: 2, version: "1.0.1" }
    ]);
    const metrics = buildReviewMetrics(reviews);

    expect(metrics.averageRating).toBe(2.67);
    expect(metrics.lowRatingCount).toBe(2);
    expect(metrics.ratingDistribution[1]).toBe(1);
    expect(metrics.topVersions[0]).toEqual({ version: "1.0.1", count: 2 });
  });
});
