import { resolveAnalysisGoal } from "../analysis-goal";
import { cleanReviews, buildReviewMetrics } from "./cleaner";
import { collectAppStoreReviews, parseAppStoreAppId } from "./collector";
import { collectImportedReviews, type ImportedReviewSource } from "./importer";
import type { CollectionResult, DataSourceSummary, PipelineResult, ScopeSummary } from "./types";

export async function runReviewPipeline(input: {
  appUrl?: string;
  goal: string;
  maxPages?: number;
  importSource?: ImportedReviewSource;
}): Promise<PipelineResult> {
  const maxPages = Math.max(1, Math.min(input.maxPages ?? Number(process.env.MAX_REVIEW_PAGES ?? 4), 10));
  const { collection, appId, dataSource } = await collectReviewsForInput({
    appUrl: input.appUrl,
    importSource: input.importSource,
    maxPages
  });
  const cleaning = cleanReviews(collection.reviews);
  const metrics = buildReviewMetrics(cleaning.reviews);
  const scope = buildScopeSummary({
    goal: resolveAnalysisGoal(input.goal),
    appId,
    maxPages,
    dataSource,
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
      "检查 AI 输出中的 warnings，并在必要时调整分析目标重新运行。",
      "导出 JSON 或 Markdown 报告，用于提交和现场讲解。",
      "如果现场网络或模型不可用，可以打开示例缓存结果进行兜底演示。"
    ]
  };
}

async function collectReviewsForInput(input: {
  appUrl?: string;
  importSource?: ImportedReviewSource;
  maxPages: number;
}): Promise<{
  collection: CollectionResult;
  appId: string;
  dataSource: DataSourceSummary;
}> {
  if (input.importSource) {
    const collection = collectImportedReviews(input.importSource);
    const dataSource = buildImportedDataSource(input.importSource);

    return {
      collection,
      appId: collection.appId,
      dataSource
    };
  }

  const appUrl = input.appUrl?.trim();

  if (!appUrl) {
    throw new Error("请输入 App Store 链接，或上传 JSON/CSV 评论文件。");
  }

  const appId = parseAppStoreAppId(appUrl);
  const collection = await collectAppStoreReviews({
    appUrl,
    maxPages: input.maxPages
  });

  return {
    collection,
    appId,
    dataSource: {
      type: "app-store",
      label: "App Store"
    }
  };
}

function buildScopeSummary(input: {
  goal: string;
  appId: string;
  maxPages: number;
  dataSource: DataSourceSummary;
  cleanedCount: number;
  warnings: string[];
}): ScopeSummary {
  const goal = resolveAnalysisGoal(input.goal);
  const focusAreas = inferFocusAreas(goal);
  const evidenceLevel = input.cleanedCount >= 150 ? "充足" : input.cleanedCount >= 50 ? "一般" : "不足";
  const notes = [
    input.dataSource.type === "app-store"
      ? "当前数据来自美国区 App Store customer reviews JSON 接口。"
      : `当前数据来自${input.dataSource.label}，已复用同一套清洗、AI 分析和追溯校验流程。`,
    input.dataSource.type === "app-store"
      ? `本次最多采集 ${input.maxPages} 页，每页约 50 条评论。`
      : "导入数据按单页本地数据集处理，缺失 id 会由代码生成稳定来源 ID。",
    "基础统计由确定性代码生成；AI 主题分析由服务端模型调用生成并经过程序校验。",
    input.dataSource.type === "app-store"
      ? "当前稳定采集源不返回评论对应的 App 版本号，因此版本分析会先标记为数据限制。"
      : "导入文件中的 version 字段会参与版本反馈统计；缺失版本会标记为 unknown。"
  ];

  if (input.warnings.length > 0) {
    notes.push("部分评论页采集失败，结果会保留失败页信息。");
  }

  return {
    goal,
    appId: input.appId,
    storefront: "us",
    maxPages: input.maxPages,
    dataSource: input.dataSource,
    focusAreas,
    evidenceLevel,
    notes
  };
}

function buildImportedDataSource(source: ImportedReviewSource): DataSourceSummary {
  if (source.type === "json-file") {
    return {
      type: "json-file",
      label: "JSON 文件",
      fileName: source.fileName
    };
  }

  if (source.type === "csv-file") {
    return {
      type: "csv-file",
      label: "CSV 文件",
      fileName: source.fileName
    };
  }

  return {
    type: "sample-data",
    label: "示例数据",
    fileName: source.fileName ?? "sample_data/reviews.json"
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
