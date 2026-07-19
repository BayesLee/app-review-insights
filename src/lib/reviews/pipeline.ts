import { cleanReviews, buildReviewMetrics } from "./cleaner";
import { collectAppStoreReviews, parseAppStoreAppId } from "./collector";
import type { PipelineResult, ScopeSummary } from "./types";

export async function runReviewPipeline(input: {
  appUrl: string;
  goal: string;
  maxPages?: number;
}): Promise<PipelineResult> {
  const maxPages = Math.max(1, Math.min(input.maxPages ?? Number(process.env.MAX_REVIEW_PAGES ?? 4), 10));
  const appId = parseAppStoreAppId(input.appUrl);
  const collection = await collectAppStoreReviews({
    appUrl: input.appUrl,
    maxPages
  });
  const cleaning = cleanReviews(collection.reviews);
  const metrics = buildReviewMetrics(cleaning.reviews);
  const scope = buildScopeSummary({
    goal: input.goal,
    appId,
    maxPages,
    cleanedCount: cleaning.reviews.length,
    warnings: collection.warnings
  });

  return {
    scope,
    collection: {
      appId: collection.appId,
      storefront: collection.storefront,
      source: collection.source,
      fetchedAt: collection.fetchedAt,
      pages: collection.pages,
      warnings: collection.warnings,
      rawCount: collection.reviews.length
    },
    cleaning: cleaning.report,
    metrics,
    reviews: cleaning.reviews,
    sampleReviews: pickSampleReviews(cleaning.reviews),
    nextSteps: [
      "将洞察、需求和测试用例串成 review_id 可追溯链路。",
      "补充 JSON/CSV 导入入口，支持离线评审和未知数据集。",
      "在 AI 主题基础上继续生成 PRD 和测试用例。"
    ]
  };
}

function buildScopeSummary(input: {
  goal: string;
  appId: string;
  maxPages: number;
  cleanedCount: number;
  warnings: string[];
}): ScopeSummary {
  const goal = input.goal.trim() || "综合分析用户评论中的主要问题和版本规划机会。";
  const focusAreas = inferFocusAreas(goal);
  const evidenceLevel = input.cleanedCount >= 150 ? "充足" : input.cleanedCount >= 50 ? "一般" : "不足";
  const notes = [
    "当前数据来自美国区 App Store customer reviews JSON 接口。",
    `本次最多采集 ${input.maxPages} 页，每页约 50 条评论。`,
    "基础统计由确定性代码生成；AI 主题分析由服务端模型调用生成并经过程序校验。",
    "当前稳定采集源不返回评论对应的 App 版本号，因此版本分析会先标记为数据限制。"
  ];

  if (input.warnings.length > 0) {
    notes.push("部分评论页采集失败，结果会保留失败页信息。");
  }

  return {
    goal,
    appId: input.appId,
    storefront: "us",
    maxPages: input.maxPages,
    focusAreas,
    evidenceLevel,
    notes
  };
}

function inferFocusAreas(goal: string): string[] {
  const normalizedGoal = goal.toLowerCase();
  const focusAreas: string[] = [];

  if (/低评|差评|low-rating|bad review|1 star|2 star/.test(normalizedGoal)) {
    focusAreas.push("低评分评论");
  }

  if (/订阅|付费|会员|转化|subscription|payment|paywall|conversion/.test(normalizedGoal)) {
    focusAreas.push("订阅转化");
  }

  if (/训练|健身|workout|exercise|usability|体验|易用/.test(normalizedGoal)) {
    focusAreas.push("训练体验");
  }

  if (/版本|version|release/.test(normalizedGoal)) {
    focusAreas.push("特定版本反馈");
  }

  return focusAreas.length ? focusAreas : ["综合评论问题"];
}

function pickSampleReviews(reviews: PipelineResult["reviews"]): PipelineResult["sampleReviews"] {
  return [...reviews]
    .sort((a, b) => {
      if (a.rating !== b.rating) {
        return a.rating - b.rating;
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, 8);
}
