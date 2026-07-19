import { describe, expect, it } from "vitest";
import { buildJsonReport, buildMarkdownReport } from "./export";
import type { PipelineResult } from "@/lib/reviews/types";

const result = {
  isSampleOutput: true,
  sampleNotice: "示例缓存结果，不是本次实时模型输出。",
  scope: {
    goal: "分析订阅问题",
    appId: "imported-reviews",
    storefront: "us",
    maxPages: 4,
    dataSource: {
      type: "sample-data",
      label: "示例数据",
      fileName: "sample_data/reviews.json"
    },
    focusAreas: ["订阅转化"],
    evidenceLevel: "不足",
    notes: []
  },
  collection: {
    appId: "imported-reviews",
    storefront: "us",
    source: "sample",
    fetchedAt: "2026-07-19T00:00:00.000Z",
    pages: [],
    warnings: [],
    rawCount: 1
  },
  cleaning: {
    rawCount: 1,
    cleanedCount: 1,
    emptyCount: 0,
    duplicateCount: 0,
    malformedCount: 0
  },
  metrics: {
    averageRating: 1,
    lowRatingCount: 1,
    lowRatingRatio: 1,
    latestReviewAt: "2026-07-19T00:00:00.000Z",
    ratingDistribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
    topVersions: [{ version: "1.0.0", count: 1 }]
  },
  reviews: [],
  sampleReviews: [],
  issueDiscovery: {
    status: "success",
    model: "sample-cache",
    inputReviewCount: 1,
    lowRatingReviewCount: 1,
    conflictCandidateCount: 0,
    themes: [
      {
        issueId: "F-001",
        title: "订阅问题",
        summary: "用户无法解锁付费内容。",
        severity: "high",
        confidence: "high",
        supportingReviewIds: ["R-001"],
        conflictingReviewIds: [],
        supportCount: 1,
        supportingReviews: [],
        conflictingReviews: []
      }
    ],
    warnings: []
  },
  productPlanning: {
    status: "success",
    model: "sample-cache",
    inputIssueCount: 1,
    versionPlans: [
      {
        versionPlanId: "VP-001",
        versionName: "V1.1",
        objective: "修复订阅权益。",
        priority: "high",
        includedIssueIds: ["F-001"],
        rationale: "影响付费用户。"
      }
    ],
    requirements: [
      {
        requirementId: "REQ-001",
        title: "付费权益解锁",
        background: "用户付费后仍锁定。",
        userProblem: "无法访问已购内容。",
        productGoal: "购买后立即解锁。",
        proposedSolution: "刷新权益并提供恢复购买入口。",
        inScope: ["权益刷新"],
        outOfScope: ["定价调整"],
        acceptanceCriteria: ["购买成功后内容可访问。"],
        priority: "high",
        risks: ["支付回调延迟"],
        sourceIssueIds: ["F-001"],
        sourceReviewIds: ["R-001"],
        sourceReviews: [],
        traceability: [{ reviewId: "R-001", issueId: "F-001", requirementId: "REQ-001" }]
      }
    ],
    warnings: []
  },
  testGeneration: {
    status: "success",
    model: "sample-cache",
    inputRequirementCount: 1,
    testCases: [
      {
        testCaseId: "TC-001",
        title: "购买后解锁",
        requirementId: "REQ-001",
        sourceIssueIds: ["F-001"],
        sourceReviewIds: ["R-001"],
        priority: "high",
        preconditions: ["测试账号可购买。"],
        steps: ["完成购买。", "打开付费内容。"],
        expectedResult: "内容可访问。",
        testType: "functional",
        status: "generated"
      }
    ],
    warnings: []
  },
  traceability: {
    status: "complete",
    metrics: {
      validReviewCount: 1,
      issueThemeCount: 1,
      requirementCount: 1,
      testCaseCount: 1,
      completeRequirementCount: 1,
      traceabilityRate: 1
    },
    requirements: [],
    warnings: []
  },
  nextSteps: []
} satisfies PipelineResult;

describe("report export", () => {
  it("exports complete JSON and Markdown reports without API keys", () => {
    const jsonReport = buildJsonReport(result);
    const markdownReport = buildMarkdownReport(result);
    const serialized = JSON.stringify(jsonReport) + markdownReport;

    expect(jsonReport.analysisGoal).toBe("分析订阅问题");
    expect(jsonReport.issueThemes).toHaveLength(1);
    expect(jsonReport.versionPlans).toHaveLength(1);
    expect(jsonReport.requirements).toHaveLength(1);
    expect(jsonReport.testCases).toHaveLength(1);
    expect(markdownReport).toContain("## 完整追溯链");
    expect(markdownReport).toContain("TC-001");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("sk-test");
  });
});
