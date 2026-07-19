import type { PipelineResult } from "@/lib/reviews/types";

export function buildJsonReport(result: PipelineResult) {
  return {
    generatedAt: new Date().toISOString(),
    sampleNotice: result.sampleNotice,
    isSampleOutput: result.isSampleOutput ?? false,
    dataSource: result.scope.dataSource,
    analysisGoal: result.scope.goal,
    metrics: result.metrics,
    cleaning: result.cleaning,
    aiModels: {
      issueDiscovery: result.issueDiscovery?.model ?? null,
      productPlanning: result.productPlanning?.model ?? null,
      testGeneration: result.testGeneration?.model ?? null
    },
    issueThemes: result.issueDiscovery?.themes ?? [],
    versionPlans: result.productPlanning?.versionPlans ?? [],
    requirements: result.productPlanning?.requirements ?? [],
    testCases: result.testGeneration?.testCases ?? [],
    traceability: result.traceability ?? null,
    warnings: collectWarnings(result),
    limitations: [
      "App Store 公共评论接口不稳定时需要使用 JSON/CSV 或示例数据兜底。",
      "模型输出只作为候选内容，ID、证据链和可展示结果由代码校验。",
      "当前未接入数据库、登录和在线部署，适合作为本地可运行 Demo。"
    ]
  };
}

export function buildMarkdownReport(result: PipelineResult): string {
  const report = buildJsonReport(result);
  const lines = [
    "# App Review Insights Report",
    "",
    result.isSampleOutput ? `> ${result.sampleNotice ?? "示例缓存结果，不是本次实时模型输出。"}` : "",
    "",
    "## 数据来源和分析时间",
    "",
    `- 数据来源：${result.scope.dataSource.label}${result.scope.dataSource.fileName ? ` (${result.scope.dataSource.fileName})` : ""}`,
    `- 分析时间：${formatDate(result.collection.fetchedAt)}`,
    `- 分析目标：${result.scope.goal}`,
    "",
    "## 基础统计",
    "",
    `- 原始评论：${result.collection.rawCount}`,
    `- 清洗后评论：${result.cleaning.cleanedCount}`,
    `- 平均评分：${result.metrics.averageRating}`,
    `- 低评分评论：${result.metrics.lowRatingCount}`,
    `- 证据充分度：${result.scope.evidenceLevel}`,
    "",
    "## AI 模型名称",
    "",
    `- 问题主题：${result.issueDiscovery?.model ?? "未运行"}`,
    `- 版本规划/PRD：${result.productPlanning?.model ?? "未运行"}`,
    `- 测试用例：${result.testGeneration?.model ?? "未运行"}`,
    "",
    "## 问题主题",
    "",
    ...(result.issueDiscovery?.themes.length
      ? result.issueDiscovery.themes.flatMap((theme) => [
          `### ${theme.issueId} ${theme.title}`,
          "",
          `- 严重程度：${theme.severity}`,
          `- 置信度：${theme.confidence}`,
          `- 支持评论：${theme.supportingReviewIds.join(", ")}`,
          `- 冲突评论：${theme.conflictingReviewIds.join(", ") || "无"}`,
          "",
          theme.summary,
          ""
        ])
      : ["暂无有效问题主题。", ""]),
    "## 版本规划",
    "",
    ...(result.productPlanning?.versionPlans.length
      ? result.productPlanning.versionPlans.flatMap((plan) => [
          `### ${plan.versionPlanId} ${plan.versionName}`,
          "",
          `- 目标：${plan.objective}`,
          `- 优先级：${plan.priority}`,
          `- 包含问题：${plan.includedIssueIds.join(", ")}`,
          `- 理由：${plan.rationale}`,
          ""
        ])
      : ["暂无有效版本规划。", ""]),
    "## PRD",
    "",
    ...(result.productPlanning?.requirements.length
      ? result.productPlanning.requirements.flatMap((requirement) => [
          `### ${requirement.requirementId} ${requirement.title}`,
          "",
          `- 用户问题：${requirement.userProblem}`,
          `- 产品目标：${requirement.productGoal}`,
          `- 解决方案：${requirement.proposedSolution}`,
          `- 范围内：${requirement.inScope.join("；") || "暂无"}`,
          `- 非范围：${requirement.outOfScope.join("；") || "暂无"}`,
          `- 验收标准：${requirement.acceptanceCriteria.join("；")}`,
          `- 风险：${requirement.risks.join("；") || "暂无"}`,
          `- 来源问题：${requirement.sourceIssueIds.join(", ")}`,
          `- 来源评论：${requirement.sourceReviewIds.join(", ")}`,
          ""
        ])
      : ["暂无有效 PRD 需求。", ""]),
    "## 测试用例",
    "",
    ...(result.testGeneration?.testCases.length
      ? result.testGeneration.testCases.flatMap((testCase) => [
          `### ${testCase.testCaseId} ${testCase.title}`,
          "",
          `- 需求：${testCase.requirementId}`,
          `- 类型：${testCase.testType}`,
          `- 优先级：${testCase.priority}`,
          `- 前置条件：${testCase.preconditions.join("；") || "无"}`,
          `- 步骤：${testCase.steps.join("；")}`,
          `- 预期结果：${testCase.expectedResult}`,
          `- 来源问题：${testCase.sourceIssueIds.join(", ")}`,
          `- 来源评论：${testCase.sourceReviewIds.join(", ")}`,
          ""
        ])
      : ["暂无有效测试用例。", ""]),
    "## 完整追溯链",
    "",
    ...(result.traceability?.requirements.length
      ? result.traceability.requirements.flatMap((requirement) => [
          `### ${requirement.requirementId} ${requirement.requirementTitle}`,
          "",
          `- 完整性：${requirement.isComplete ? "完整" : "不完整"}`,
          `- Warning：${requirement.warnings.join("；") || "无"}`,
          "",
          ...requirement.paths.map(
            (path) =>
              `- 评论 ${path.reviewId} → 问题 ${path.issueId} → 需求 ${path.requirementId} → 测试用例 ${path.testCaseId}`
          ),
          ""
        ])
      : ["暂无完整追溯链。", ""]),
    "## Warnings 和当前限制",
    "",
    ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- 暂无 warning。"]),
    ...report.limitations.map((limitation) => `- ${limitation}`)
  ].filter((line) => line !== undefined);

  return `${lines.join("\n")}\n`;
}

function collectWarnings(result: PipelineResult): string[] {
  return [
    ...(result.collection.warnings ?? []),
    ...(result.issueDiscovery?.warnings ?? []),
    ...(result.productPlanning?.warnings ?? []),
    ...(result.testGeneration?.warnings ?? []),
    ...(result.traceability?.warnings ?? [])
  ];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
