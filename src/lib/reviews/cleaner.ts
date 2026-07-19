import type { CleanedReview, CleaningReport, RawReview, ReviewMetrics } from "./types";

export function cleanReviews(rawReviews: RawReview[]): {
  reviews: CleanedReview[];
  report: CleaningReport;
} {
  const seen = new Set<string>();
  const reviews: CleanedReview[] = [];
  const report: CleaningReport = {
    rawCount: rawReviews.length,
    cleanedCount: 0,
    emptyCount: 0,
    duplicateCount: 0,
    malformedCount: 0
  };

  for (const review of rawReviews) {
    const normalizedText = normalizeText(`${review.title}\n${review.body}`);

    if (!normalizedText) {
      report.emptyCount += 1;
      continue;
    }

    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 || !review.updatedAt) {
      report.malformedCount += 1;
      continue;
    }

    const duplicateKey = [
      normalizeText(review.title),
      normalizeText(review.body),
      review.rating,
      review.version
    ].join("|");

    if (seen.has(duplicateKey)) {
      report.duplicateCount += 1;
      continue;
    }

    seen.add(duplicateKey);
    reviews.push({
      ...review,
      normalizedText,
      bodyLength: review.body.length
    });
  }

  report.cleanedCount = reviews.length;
  return { reviews, report };
}

export function buildReviewMetrics(reviews: CleanedReview[]): ReviewMetrics {
  const ratingDistribution = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0
  };
  const versionCounts = new Map<string, number>();
  let ratingTotal = 0;
  let lowRatingCount = 0;
  let latestReviewAt: string | null = null;

  for (const review of reviews) {
    const rating = review.rating as 1 | 2 | 3 | 4 | 5;
    ratingDistribution[rating] += 1;
    ratingTotal += rating;

    if (rating <= 2) {
      lowRatingCount += 1;
    }

    versionCounts.set(review.version, (versionCounts.get(review.version) ?? 0) + 1);

    if (!latestReviewAt || new Date(review.updatedAt) > new Date(latestReviewAt)) {
      latestReviewAt = review.updatedAt;
    }
  }

  const averageRating = reviews.length ? roundTo(ratingTotal / reviews.length, 2) : 0;
  const lowRatingRatio = reviews.length ? roundTo(lowRatingCount / reviews.length, 4) : 0;
  const topVersions = [...versionCounts.entries()]
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    averageRating,
    lowRatingCount,
    lowRatingRatio,
    latestReviewAt,
    ratingDistribution,
    topVersions
  };
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
