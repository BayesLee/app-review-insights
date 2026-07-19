import { describe, expect, it } from "vitest";
import { generateProductPlanning } from "./product-planning";
import type { IssueTheme, ReviewEvidence } from "./issue-discovery";

function makeReviewEvidence(overrides: Partial<ReviewEvidence>): ReviewEvidence {
  return {
    reviewId: overrides.reviewId ?? "R-001",
    sourceReviewId: overrides.sourceReviewId ?? "source-1",
    rating: overrides.rating ?? 1,
    title: overrides.title ?? "Locked plan",
    body: overrides.body ?? "I paid for the plan but the workouts are still locked.",
    version: overrides.version ?? "unknown",
    updatedAt: overrides.updatedAt ?? "2026-07-10T10:00:00Z"
  };
}

const reviewOne = makeReviewEvidence({ reviewId: "R-001" });
const reviewTwo = makeReviewEvidence({
  reviewId: "R-002",
  sourceReviewId: "source-2",
  title: "Trial charged",
  body: "The free trial charged me immediately."
});
const reviewThree = makeReviewEvidence({
  reviewId: "R-003",
  sourceReviewId: "source-3",
  title: "Crashes during workout",
  body: "The workout crashes before I can finish a session."
});

function makeTheme(overrides: Partial<IssueTheme>): IssueTheme {
  const supportingReviews = overrides.supportingReviews ?? [reviewOne];
  const supportingReviewIds = overrides.supportingReviewIds ?? supportingReviews.map((review) => review.reviewId);

  return {
    issueId: overrides.issueId ?? "F-001",
    title: overrides.title ?? "Subscription access failure",
    summary: overrides.summary ?? "Users report that paid plans remain locked after purchase.",
    severity: overrides.severity ?? "high",
    confidence: overrides.confidence ?? "high",
    supportingReviewIds,
    conflictingReviewIds: overrides.conflictingReviewIds ?? [],
    supportCount: overrides.supportCount ?? supportingReviewIds.length,
    supportingReviews,
    conflictingReviews: overrides.conflictingReviews ?? []
  };
}

const themes = [
  makeTheme({
    issueId: "F-001",
    supportingReviews: [reviewOne, reviewTwo],
    supportingReviewIds: ["R-001", "R-002"]
  }),
  makeTheme({
    issueId: "F-002",
    title: "Workout stability failure",
    summary: "Users report crashes during workout sessions.",
    severity: "medium",
    confidence: "medium",
    supportingReviews: [reviewThree],
    supportingReviewIds: ["R-003"]
  })
];

const normalModelResponse = {
  versionPlans: [
    {
      versionName: "V1.1",
      objective: "Restore paid access trust and reduce subscription friction.",
      priority: "high",
      includedIssueIds: ["F-001"],
      rationale: "This issue is high severity and directly blocks paid users."
    }
  ],
  requirements: [
    {
      title: "Unlock purchased workout plans reliably",
      background: "Low-rating reviewers complain about paying without receiving access.",
      userProblem: "Paid users cannot open workouts after purchase.",
      productGoal: "Make successful purchases immediately unlock the promised content.",
      proposedSolution: "Add entitlement refresh, payment-state messaging, and retry recovery.",
      inScope: ["Refresh entitlements after purchase", "Show clear payment state"],
      outOfScope: ["Pricing redesign"],
      acceptanceCriteria: ["Given a successful purchase, the user can open the purchased plan without restarting."],
      priority: "high",
      risks: ["Receipt validation latency may delay access."],
      sourceIssueIds: ["F-001"],
      sourceReviewIds: ["R-001", "R-002"]
    }
  ]
};

describe("version planning and PRD generation", () => {
  it("generates validated version planning and PRD from model output", async () => {
    let prompt = "";
    const result = await generateProductPlanning({
      themes,
      goal: "重点分析订阅和付费问题",
      apiKey: "test-key",
      model: "test-model",
      callModel: async ({ messages }) => {
        prompt = messages.map((message) => message.content).join("\n");
        return JSON.stringify(normalModelResponse);
      }
    });

    expect(result.status).toBe("success");
    expect(result.model).toBe("test-model");
    expect(result.versionPlans[0].versionPlanId).toBe("VP-001");
    expect(result.versionPlans[0].includedIssueIds).toEqual(["F-001"]);
    expect(result.requirements[0].requirementId).toBe("REQ-001");
    expect(result.requirements[0].sourceReviewIds).toEqual(["R-001", "R-002"]);
    expect(result.requirements[0].traceability).toContainEqual({
      reviewId: "R-001",
      issueId: "F-001",
      requirementId: "REQ-001"
    });
    expect(prompt).toContain("本次分析目标：重点分析订阅和付费问题");
  });

  it("removes hallucinated issue ids from plans and requirements", async () => {
    const result = await generateProductPlanning({
      themes,
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          versionPlans: [
            {
              versionName: "V1.1",
              objective: "Fix validated issues only.",
              priority: "high",
              includedIssueIds: ["F-999", "F-001"],
              rationale: "The valid issue has strong evidence."
            }
          ],
          requirements: [
            {
              ...normalModelResponse.requirements[0],
              sourceIssueIds: ["F-999", "F-001"],
              sourceReviewIds: ["R-001"]
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.versionPlans[0].includedIssueIds).toEqual(["F-001"]);
    expect(result.requirements[0].sourceIssueIds).toEqual(["F-001"]);
    expect(result.warnings.some((warning) => warning.includes("F-999"))).toBe(true);
  });

  it("removes hallucinated review ids from requirements", async () => {
    const result = await generateProductPlanning({
      themes,
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          ...normalModelResponse,
          requirements: [
            {
              ...normalModelResponse.requirements[0],
              sourceReviewIds: ["R-001", "R-999"]
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.requirements[0].sourceReviewIds).toEqual(["R-001"]);
    expect(result.warnings.some((warning) => warning.includes("R-999"))).toBe(true);
  });

  it("skips model calls when there are no themes", async () => {
    let called = false;
    const result = await generateProductPlanning({
      themes: [],
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () => {
        called = true;
        return JSON.stringify(normalModelResponse);
      }
    });

    expect(called).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.versionPlans).toHaveLength(0);
    expect(result.requirements).toHaveLength(0);
  });

  it("returns a readable error for invalid model JSON", async () => {
    const result = await generateProductPlanning({
      themes,
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () => "not json"
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("模型返回非法 JSON");
    expect(result.requirements).toHaveLength(0);
  });

  it("filters requirements without acceptance criteria", async () => {
    const result = await generateProductPlanning({
      themes,
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          versionPlans: normalModelResponse.versionPlans,
          requirements: [
            {
              ...normalModelResponse.requirements[0],
              acceptanceCriteria: []
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.requirements).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes("缺少有效验收标准"))).toBe(true);
    expect(result.warnings).toContain("证据不足，暂不生成需求。");
  });

  it("prevents the same issue from being reused by multiple requirements", async () => {
    const result = await generateProductPlanning({
      themes,
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          versionPlans: normalModelResponse.versionPlans,
          requirements: [
            normalModelResponse.requirements[0],
            {
              ...normalModelResponse.requirements[0],
              title: "Duplicate subscription requirement",
              sourceIssueIds: ["F-001"],
              sourceReviewIds: ["R-001"]
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].requirementId).toBe("REQ-001");
    expect(result.warnings.some((warning) => warning.includes("被多个需求重复引用"))).toBe(true);
  });
});
