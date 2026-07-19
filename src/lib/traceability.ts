import type { IssueDiscoveryResult } from "./ai/issue-discovery";
import type { ProductPlanningResult, ProductRequirement } from "./ai/product-planning";
import type { GeneratedTestCase, TestGenerationResult } from "./ai/test-generation";

export type TraceabilityPath = {
  reviewId: string;
  reviewTitle: string;
  reviewBody: string;
  issueId: string;
  issueTitle: string;
  requirementId: string;
  requirementTitle: string;
  testCaseId: string;
  testCaseTitle: string;
};

export type RequirementTraceability = {
  requirementId: string;
  requirementTitle: string;
  isComplete: boolean;
  warnings: string[];
  paths: TraceabilityPath[];
};

export type TraceabilityResult = {
  status: "complete" | "incomplete";
  metrics: {
    validReviewCount: number;
    issueThemeCount: number;
    requirementCount: number;
    testCaseCount: number;
    completeRequirementCount: number;
    traceabilityRate: number;
  };
  requirements: RequirementTraceability[];
  warnings: string[];
};

export function buildTraceabilityAudit(input: {
  issueDiscovery?: IssueDiscoveryResult;
  productPlanning?: ProductPlanningResult;
  testGeneration?: TestGenerationResult;
}): TraceabilityResult {
  const themes = input.issueDiscovery?.themes ?? [];
  const requirements = input.productPlanning?.requirements ?? [];
  const testCases = input.testGeneration?.testCases ?? [];
  const issueById = new Map(themes.map((theme) => [theme.issueId, theme]));
  const warnings: string[] = [
    ...(input.issueDiscovery?.warnings ?? []),
    ...(input.productPlanning?.warnings ?? []),
    ...(input.testGeneration?.warnings ?? [])
  ];

  const requirementAudits = requirements.map((requirement) =>
    auditRequirement({
      requirement,
      testCases: testCases.filter((testCase) => testCase.requirementId === requirement.requirementId),
      issueById
    })
  );
  const completeRequirementCount = requirementAudits.filter((audit) => audit.isComplete).length;
  const traceabilityRate =
    requirements.length === 0 ? 0 : Number((completeRequirementCount / requirements.length).toFixed(2));

  requirementAudits.forEach((audit) => {
    warnings.push(...audit.warnings);
  });

  return {
    status: requirements.length > 0 && completeRequirementCount === requirements.length ? "complete" : "incomplete",
    metrics: {
      validReviewCount: new Set(requirements.flatMap((requirement) => requirement.sourceReviewIds)).size,
      issueThemeCount: themes.length,
      requirementCount: requirements.length,
      testCaseCount: testCases.length,
      completeRequirementCount,
      traceabilityRate
    },
    requirements: requirementAudits,
    warnings: unique(warnings)
  };
}

function auditRequirement(input: {
  requirement: ProductRequirement;
  testCases: GeneratedTestCase[];
  issueById: Map<string, NonNullable<IssueDiscoveryResult["themes"]>[number]>;
}): RequirementTraceability {
  const warnings: string[] = [];
  const paths: TraceabilityPath[] = [];

  if (input.requirement.sourceIssueIds.length === 0) {
    warnings.push(`需求 ${input.requirement.requirementId} 缺少有效来源问题。`);
  }

  if (input.requirement.sourceReviewIds.length === 0) {
    warnings.push(`需求 ${input.requirement.requirementId} 缺少有效来源评论。`);
  }

  if (input.testCases.length === 0) {
    warnings.push(`需求 ${input.requirement.requirementId} 尚未映射到有效测试用例。`);
  }

  input.requirement.sourceIssueIds.forEach((issueId) => {
    const issue = input.issueById.get(issueId);

    if (!issue) {
      warnings.push(`需求 ${input.requirement.requirementId} 引用了不存在的问题 ${issueId}。`);
      return;
    }

    input.requirement.sourceReviewIds.forEach((reviewId) => {
      const review = issue.supportingReviews.find((candidate) => candidate.reviewId === reviewId);

      if (!review) {
        warnings.push(`需求 ${input.requirement.requirementId} 的评论 ${reviewId} 不属于问题 ${issueId} 的有效支持证据。`);
        return;
      }

      input.testCases.forEach((testCase) => {
        if (!testCase.sourceIssueIds.includes(issueId)) {
          warnings.push(`测试用例 ${testCase.testCaseId} 未包含需求 ${input.requirement.requirementId} 的问题 ${issueId}。`);
          return;
        }

        if (!testCase.sourceReviewIds.includes(reviewId)) {
          warnings.push(`测试用例 ${testCase.testCaseId} 未包含需求 ${input.requirement.requirementId} 的评论 ${reviewId}。`);
          return;
        }

        paths.push({
          reviewId,
          reviewTitle: review.title,
          reviewBody: review.body,
          issueId,
          issueTitle: issue.title,
          requirementId: input.requirement.requirementId,
          requirementTitle: input.requirement.title,
          testCaseId: testCase.testCaseId,
          testCaseTitle: testCase.title
        });
      });
    });
  });

  const isComplete = paths.length > 0 && warnings.length === 0;

  return {
    requirementId: input.requirement.requirementId,
    requirementTitle: input.requirement.title,
    isComplete,
    warnings: unique(warnings),
    paths: uniquePaths(paths)
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function uniquePaths(paths: TraceabilityPath[]): TraceabilityPath[] {
  const seen = new Set<string>();

  return paths.filter((path) => {
    const key = `${path.reviewId}-${path.issueId}-${path.requirementId}-${path.testCaseId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
