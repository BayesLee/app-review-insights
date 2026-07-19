import OpenAI from "openai";
import { z } from "zod";
import type { CleanedReview } from "@/lib/reviews/types";

const severities = ["high", "medium", "low"] as const;
const confidences = ["high", "medium", "low"] as const;

const modelThemeSchema = z.object({
  issueId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  severity: z.enum(severities),
  confidence: z.enum(confidences),
  supportingReviewIds: z.array(z.string()),
  conflictingReviewIds: z.array(z.string()).default([])
});

const modelResponseSchema = z.object({
  themes: z.array(modelThemeSchema)
});

export type ReviewEvidence = {
  reviewId: string;
  sourceReviewId: string;
  rating: number;
  title: string;
  body: string;
  version: string;
  updatedAt: string;
};

export type IssueTheme = {
  issueId: string;
  title: string;
  summary: string;
  severity: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  supportingReviewIds: string[];
  conflictingReviewIds: string[];
  supportCount: number;
  supportingReviews: ReviewEvidence[];
  conflictingReviews: ReviewEvidence[];
};

export type IssueDiscoveryResult = {
  status: "success" | "skipped" | "error";
  model: string | null;
  inputReviewCount: number;
  lowRatingReviewCount: number;
  conflictCandidateCount: number;
  themes: IssueTheme[];
  warnings: string[];
  error?: string;
};

type PreparedIssueInput = {
  allReviews: ReviewEvidence[];
  lowRatingReviews: ReviewEvidence[];
  conflictCandidateReviews: ReviewEvidence[];
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ModelCaller = (input: { model: string; messages: ChatMessage[] }) => Promise<string>;

export async function discoverIssueThemes(input: {
  reviews: CleanedReview[];
  goal: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  callModel?: ModelCaller;
}): Promise<IssueDiscoveryResult> {
  const model = input.model?.trim() || "gpt-4o-mini";
  const prepared = prepareIssueDiscoveryInput(input.reviews);

  if (prepared.lowRatingReviews.length === 0) {
    return {
      status: "skipped",
      model,
      inputReviewCount: 0,
      lowRatingReviewCount: 0,
      conflictCandidateCount: prepared.conflictCandidateReviews.length,
      themes: [],
      warnings: ["本次清洗后的评论中没有 1-2 星评论，因此跳过用户问题主题发现。"]
    };
  }

  if (!input.apiKey?.trim()) {
    return {
      status: "error",
      model,
      inputReviewCount: prepared.lowRatingReviews.length + prepared.conflictCandidateReviews.length,
      lowRatingReviewCount: prepared.lowRatingReviews.length,
      conflictCandidateCount: prepared.conflictCandidateReviews.length,
      themes: [],
      warnings: [],
      error: "未配置 OPENAI_API_KEY，无法执行 AI 主题分析。请在 .env.local 中配置后重启服务。"
    };
  }

  try {
    const messages = buildIssueDiscoveryMessages({
      goal: input.goal,
      lowRatingReviews: prepared.lowRatingReviews,
      conflictCandidateReviews: prepared.conflictCandidateReviews
    });
    const rawContent = input.callModel
      ? await input.callModel({ model, messages })
      : await callOpenAICompatibleModel({
          apiKey: input.apiKey,
          baseUrl: input.baseUrl,
          model,
          messages
        });
    const parsed = parseModelJson(rawContent);
    const { themes, warnings } = validateModelThemes(parsed.themes, prepared);

    return {
      status: "success",
      model,
      inputReviewCount: prepared.lowRatingReviews.length + prepared.conflictCandidateReviews.length,
      lowRatingReviewCount: prepared.lowRatingReviews.length,
      conflictCandidateCount: prepared.conflictCandidateReviews.length,
      themes,
      warnings
    };
  } catch (error) {
    return {
      status: "error",
      model,
      inputReviewCount: prepared.lowRatingReviews.length + prepared.conflictCandidateReviews.length,
      lowRatingReviewCount: prepared.lowRatingReviews.length,
      conflictCandidateCount: prepared.conflictCandidateReviews.length,
      themes: [],
      warnings: [],
      error: error instanceof Error ? error.message : "AI 主题分析失败。"
    };
  }
}

export function prepareIssueDiscoveryInput(reviews: CleanedReview[]): PreparedIssueInput {
  const allReviews = reviews.map(toReviewEvidence);
  const lowRatingReviews = allReviews.filter((review) => review.rating <= 2);
  const conflictCandidateReviews = allReviews.filter((review) => review.rating >= 4).slice(0, 20);

  return {
    allReviews,
    lowRatingReviews,
    conflictCandidateReviews
  };
}

export function validateModelThemes(
  modelThemes: Array<z.infer<typeof modelThemeSchema>>,
  prepared: PreparedIssueInput
): { themes: IssueTheme[]; warnings: string[] } {
  const lowRatingById = new Map(prepared.lowRatingReviews.map((review) => [review.reviewId, review]));
  const conflictById = new Map(prepared.conflictCandidateReviews.map((review) => [review.reviewId, review]));
  const allIds = new Set(prepared.allReviews.map((review) => review.reviewId));
  const warnings: string[] = [];
  const themes: IssueTheme[] = [];

  modelThemes.slice(0, 8).forEach((theme, index) => {
    const supportingReviewIds = unique(theme.supportingReviewIds).filter((reviewId) => {
      if (lowRatingById.has(reviewId)) {
        return true;
      }

      if (!allIds.has(reviewId)) {
        warnings.push(`${theme.issueId} 引用了不存在的支持评论 ${reviewId}，已移除。`);
      } else {
        warnings.push(`${theme.issueId} 的支持评论 ${reviewId} 不是 1-2 星评论，已移除。`);
      }

      return false;
    });
    const conflictingReviewIds = unique(theme.conflictingReviewIds).filter((reviewId) => {
      if (conflictById.has(reviewId)) {
        return true;
      }

      if (!allIds.has(reviewId)) {
        warnings.push(`${theme.issueId} 引用了不存在的冲突评论 ${reviewId}，已移除。`);
      } else {
        warnings.push(`${theme.issueId} 的冲突评论 ${reviewId} 不是本次选取的 4-5 星候选评论，已移除。`);
      }

      return false;
    });

    if (supportingReviewIds.length === 0) {
      warnings.push(`${theme.issueId} 没有有效支持评论，主题已过滤。`);
      return;
    }

    themes.push({
      issueId: normalizeIssueId(theme.issueId, index),
      title: theme.title.trim(),
      summary: theme.summary.trim(),
      severity: theme.severity,
      confidence: theme.confidence,
      supportingReviewIds,
      conflictingReviewIds,
      supportCount: supportingReviewIds.length,
      supportingReviews: supportingReviewIds.map((reviewId) => lowRatingById.get(reviewId)).filter(isReviewEvidence),
      conflictingReviews: conflictingReviewIds.map((reviewId) => conflictById.get(reviewId)).filter(isReviewEvidence)
    });
  });

  return { themes, warnings };
}

function buildIssueDiscoveryMessages(input: {
  goal: string;
  lowRatingReviews: ReviewEvidence[];
  conflictCandidateReviews: ReviewEvidence[];
}): ChatMessage[] {
  const payload = {
    analysisGoal: input.goal || "发现 1-2 星评论中反复出现的真实用户问题。",
    lowRatingReviews: input.lowRatingReviews.map(compactReview),
    conflictCandidateReviews: input.conflictCandidateReviews.map(compactReview)
  };

  return [
    {
      role: "system",
      content:
        "你是严谨的产品分析 Agent。请只根据输入评论动态发现用户问题主题，不要使用预设分类，不要编造评论 ID，不要生成 PRD 或测试用例。必须返回严格 JSON。"
    },
    {
      role: "user",
      content: `请分析以下 App Store 评论。\n\n要求：\n1. 主题必须从 1-2 星评论中归纳，主题名称由当前评论动态生成。\n2. supportingReviewIds 只能引用 lowRatingReviews 中的 reviewId。\n3. conflictingReviewIds 只能引用 conflictCandidateReviews 中表达相反体验的 reviewId。\n4. 如果证据不足，请少输出主题，不要猜测。\n5. 严格返回 JSON，不要 Markdown，不要额外解释。\n\nJSON 结构必须为：\n{"themes":[{"issueId":"F-001","title":"问题标题","summary":"问题总结","severity":"high | medium | low","confidence":"high | medium | low","supportingReviewIds":["R-001"],"conflictingReviewIds":["R-010"]}]}\n\n输入数据：\n${JSON.stringify(payload)}`
    }
  ];
}

async function callOpenAICompatibleModel(input: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  messages: ChatMessage[];
}): Promise<string> {
  const client = new OpenAI({
    apiKey: input.apiKey,
    baseURL: input.baseUrl?.trim() || undefined
  });
  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: input.messages
  });
  const content = completion.choices[0]?.message?.content;

  if (!content) {
    throw new Error("模型接口未返回可解析内容。");
  }

  return content;
}

function parseModelJson(rawContent: string): z.infer<typeof modelResponseSchema> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("模型返回非法 JSON，无法解析 AI 主题分析结果。");
  }

  const result = modelResponseSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error("模型返回 JSON 不符合主题分析结构。");
  }

  return result.data;
}

function toReviewEvidence(review: CleanedReview, index: number): ReviewEvidence {
  return {
    reviewId: `R-${String(index + 1).padStart(3, "0")}`,
    sourceReviewId: review.id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    version: review.version,
    updatedAt: review.updatedAt
  };
}

function compactReview(review: ReviewEvidence) {
  return {
    reviewId: review.reviewId,
    rating: review.rating,
    title: review.title,
    body: review.body,
    updatedAt: review.updatedAt
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeIssueId(issueId: string, index: number): string {
  return issueId.trim() || `F-${String(index + 1).padStart(3, "0")}`;
}

function isReviewEvidence(review: ReviewEvidence | undefined): review is ReviewEvidence {
  return Boolean(review);
}
