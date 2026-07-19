import { describe, expect, it } from "vitest";
import { generateTestCases } from "./test-generation";
import type { ReviewEvidence } from "./issue-discovery";
import type { ProductRequirement } from "./product-planning";

const sourceReview: ReviewEvidence = {
  reviewId: "R-001",
  sourceReviewId: "source-1",
  rating: 1,
  title: "Paid plan locked",
  body: "I paid but the workout plan is still locked.",
  version: "1.0.0",
  updatedAt: "2026-07-01T00:00:00Z"
};

function makeRequirement(overrides: Partial<ProductRequirement> = {}): ProductRequirement {
  return {
    requirementId: overrides.requirementId ?? "REQ-001",
    title: overrides.title ?? "Unlock paid workouts",
    background: overrides.background ?? "Users complain that paid plans stay locked.",
    userProblem: overrides.userProblem ?? "Paid users cannot access purchased workouts.",
    productGoal: overrides.productGoal ?? "Paid content unlocks immediately after purchase.",
    proposedSolution: overrides.proposedSolution ?? "Refresh purchase entitlement and show restore purchase entry.",
    inScope: overrides.inScope ?? ["Entitlement refresh", "Restore purchase entry"],
    outOfScope: overrides.outOfScope ?? ["Pricing redesign"],
    acceptanceCriteria: overrides.acceptanceCriteria ?? ["Successful purchase unlocks paid workout without restart."],
    priority: overrides.priority ?? "high",
    risks: overrides.risks ?? ["Payment callback latency"],
    sourceIssueIds: overrides.sourceIssueIds ?? ["F-001"],
    sourceReviewIds: overrides.sourceReviewIds ?? ["R-001"],
    sourceReviews: overrides.sourceReviews ?? [sourceReview],
    traceability: overrides.traceability ?? [{ reviewId: "R-001", issueId: "F-001", requirementId: "REQ-001" }]
  };
}

const validResponse = {
  testCases: [
    {
      title: "Paid purchase unlocks the workout plan",
      requirementId: "REQ-001",
      sourceIssueIds: ["F-001"],
      sourceReviewIds: ["R-001"],
      priority: "high",
      preconditions: ["A user account can purchase the yearly plan."],
      steps: ["Complete a yearly plan purchase.", "Open a previously locked workout plan.", "Refresh subscription status."],
      expectedResult: "The workout plan is available and the subscription status shows active.",
      testType: "functional"
    },
    {
      title: "Delayed payment callback shows restore path",
      requirementId: "REQ-001",
      sourceIssueIds: ["F-001"],
      sourceReviewIds: ["R-001"],
      priority: "high",
      preconditions: ["Payment succeeds but entitlement callback is delayed."],
      steps: ["Complete payment with delayed entitlement.", "Open the locked workout plan.", "Tap restore purchase."],
      expectedResult: "The app explains the entitlement delay and unlocks content after restore succeeds.",
      testType: "exception"
    }
  ]
};

describe("test case generation", () => {
  it("generates validated test cases from model output", async () => {
    const result = await generateTestCases({
      requirements: [makeRequirement()],
      goal: "重点分析订阅问题",
      apiKey: "test-key",
      model: "test-model",
      callModel: async () => JSON.stringify(validResponse)
    });

    expect(result.status).toBe("success");
    expect(result.model).toBe("test-model");
    expect(result.testCases).toHaveLength(2);
    expect(result.testCases[0].testCaseId).toBe("TC-001");
    expect(result.testCases[0].requirementId).toBe("REQ-001");
    expect(result.testCases[0].status).toBe("generated");
  });

  it("filters hallucinated requirement ids", async () => {
    const result = await generateTestCases({
      requirements: [makeRequirement()],
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          testCases: [
            {
              ...validResponse.testCases[0],
              requirementId: "REQ-999"
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.testCases).toHaveLength(2);
    expect(result.warnings.some((warning) => warning.includes("REQ-999"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("缺少正常流程用例"))).toBe(true);
  });

  it("removes hallucinated issue ids and review ids", async () => {
    const result = await generateTestCases({
      requirements: [makeRequirement()],
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          testCases: [
            {
              ...validResponse.testCases[0],
              sourceIssueIds: ["F-001", "F-999"],
              sourceReviewIds: ["R-001", "R-999"]
            },
            validResponse.testCases[1]
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.testCases[0].sourceIssueIds).toEqual(["F-001"]);
    expect(result.testCases[0].sourceReviewIds).toEqual(["R-001"]);
    expect(result.warnings.some((warning) => warning.includes("F-999"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("R-999"))).toBe(true);
  });

  it("filters test cases with empty steps", async () => {
    const result = await generateTestCases({
      requirements: [makeRequirement({ priority: "medium" })],
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () =>
        JSON.stringify({
          testCases: [
            {
              ...validResponse.testCases[0],
              steps: []
            }
          ]
        })
    });

    expect(result.status).toBe("success");
    expect(result.testCases).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes("缺少有效步骤或预期结果"))).toBe(true);
  });

  it("skips generation when requirements are empty", async () => {
    let called = false;
    const result = await generateTestCases({
      requirements: [],
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () => {
        called = true;
        return JSON.stringify(validResponse);
      }
    });

    expect(called).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.testCases).toHaveLength(0);
  });

  it("returns a readable error for invalid model JSON", async () => {
    const result = await generateTestCases({
      requirements: [makeRequirement()],
      goal: "find issues",
      apiKey: "test-key",
      callModel: async () => "not json"
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("模型返回非法 JSON");
  });

  it("returns a clear error when API key is not configured", async () => {
    const result = await generateTestCases({
      requirements: [makeRequirement()],
      goal: "find issues",
      apiKey: ""
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("未配置 OPENAI_API_KEY");
    expect(result.testCases).toHaveLength(0);
  });
});
