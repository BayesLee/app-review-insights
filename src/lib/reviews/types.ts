export type RawReview = {
  id: string;
  title: string;
  body: string;
  rating: number;
  version: string;
  updatedAt: string;
  author: string;
  country: "us";
  appId: string;
  page: number;
  sourceUrl: string;
};

export type CleanedReview = RawReview & {
  normalizedText: string;
  bodyLength: number;
};

export type CollectionPage = {
  page: number;
  url: string;
  count: number;
  status: "success" | "failed";
  error?: string;
};

export type CollectionResult = {
  appId: string;
  storefront: "us";
  source: string;
  fetchedAt: string;
  pages: CollectionPage[];
  reviews: RawReview[];
  warnings: string[];
};

export type CleaningReport = {
  rawCount: number;
  cleanedCount: number;
  emptyCount: number;
  duplicateCount: number;
  malformedCount: number;
};

export type RatingDistribution = Record<1 | 2 | 3 | 4 | 5, number>;

export type ReviewMetrics = {
  averageRating: number;
  lowRatingCount: number;
  lowRatingRatio: number;
  latestReviewAt: string | null;
  ratingDistribution: RatingDistribution;
  topVersions: Array<{ version: string; count: number }>;
};

export type ScopeSummary = {
  goal: string;
  appId: string;
  storefront: "us";
  maxPages: number;
  focusAreas: string[];
  evidenceLevel: "充足" | "一般" | "不足";
  notes: string[];
};

export type PipelineResult = {
  scope: ScopeSummary;
  collection: Omit<CollectionResult, "reviews"> & {
    rawCount: number;
  };
  cleaning: CleaningReport;
  metrics: ReviewMetrics;
  reviews: CleanedReview[];
  sampleReviews: CleanedReview[];
  nextSteps: string[];
};
