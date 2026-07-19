import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildTraceabilityAudit } from "./traceability";
import type { IssueTheme, ReviewEvidence } from "./ai/issue-discovery";
import type { ProductRequirement } from "./ai/product-planning";
import type { GeneratedTestCase } from "./ai/test-generation";

const review: ReviewEvidence = {
  reviewId: "R-001",
  sourceReviewId: "source-1",
  rating: 1,
  title: "Locked plan",
  body: "I paid but the plan is locked.",
  version: "1.0.0",
  updatedAt: "2026-07-01T00:00:00Z"
};

const theme: IssueTheme = {
  issueId: "F-001",
  title: "Subscription access failure",
  summary: "Paid users cannot access paid plans.",
  severity: "high",
  confidence: "high",
  supportingReviewIds: ["R-001"],
  conflictingReviewIds: [],
  supportCount: 1,
  supportingReviews: [review],
  conflictingReviews: []
};

const requirement: ProductRequirement = {
  requirementId: "REQ-001",
  title: "Unlock paid plan",
  background: "Payment complaints appear in low reviews.",
  userProblem: "Paid users cannot access purchased plans.",
  productGoal: "Purchased plans open immediately.",
  proposedSolution: "Refresh entitlements after purchase.",
  inScope: ["Entitlement refresh"],
  outOfScope: ["Refund approval"],
  acceptanceCriteria: ["After purchase, paid plan opens without restart."],
  priority: "high",
  risks: ["Delayed payment callback"],
  sourceIssueIds: ["F-001"],
  sourceReviewIds: ["R-001"],
  sourceReviews: [review],
  traceability: [{ reviewId: "R-001", issueId: "F-001", requirementId: "REQ-001" }]
};

const testCase: GeneratedTestCase = {
  testCaseId: "TC-001",
  title: "Purchase unlocks paid plan",
  requirementId: "REQ-001",
  sourceIssueIds: ["F-001"],
  sourceReviewIds: ["R-001"],
  priority: "high",
  preconditions: ["A user can purchase a plan."],
  steps: ["Complete purchase.", "Open paid plan."],
  expectedResult: "The paid plan opens immediately.",
  testType: "functional",
  status: "generated"
};

describe("traceability audit", () => {
  it("calculates traceability completion rate", () => {
    const result = buildTraceabilityAudit({
      issueDiscovery: {
        status: "success",
        model: "test-model",
        inputReviewCount: 1,
        lowRatingReviewCount: 1,
        conflictCandidateCount: 0,
        themes: [theme],
        warnings: []
      },
      productPlanning: {
        status: "success",
        model: "test-model",
        inputIssueCount: 1,
        versionPlans: [],
        requirements: [requirement],
        warnings: []
      },
      testGeneration: {
        status: "success",
        model: "test-model",
        inputRequirementCount: 1,
        testCases: [testCase],
        warnings: []
      }
    });

    expect(result.status).toBe("complete");
    expect(result.metrics.validReviewCount).toBe(1);
    expect(result.metrics.issueThemeCount).toBe(1);
    expect(result.metrics.requirementCount).toBe(1);
    expect(result.metrics.testCaseCount).toBe(1);
    expect(result.metrics.traceabilityRate).toBe(1);
    expect(result.requirements[0].paths[0]).toMatchObject({
      reviewId: "R-001",
      issueId: "F-001",
      requirementId: "REQ-001",
      testCaseId: "TC-001"
    });
  });

  it("marks sample output as cached data", () => {
    const samplePath = path.join(process.cwd(), "sample_outputs", "example-analysis.json");
    const sample = JSON.parse(readFileSync(samplePath, "utf-8"));

    expect(sample.isSampleOutput).toBe(true);
    expect(sample.sampleNotice).toContain("示例缓存结果，不是本次实时模型输出");
  });
});
