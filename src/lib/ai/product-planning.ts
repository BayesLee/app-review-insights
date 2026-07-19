import OpenAI from "openai";
import { z } from "zod";
import { resolveAnalysisGoal } from "../analysis-goal";
import type { IssueTheme, ReviewEvidence } from "./issue-discovery";

const priorities = ["high", "medium", "low"] as const;

const modelVersionPlanSchema = z.object({
  versionName: z.string().min(1),
  objective: z.string().min(1),
  priority: z.enum(priorities),
  includedIssueIds: z.array(z.string()).default([]),
  rationale: z.string().min(1)
});

const modelRequirementSchema = z.object({
  title: z.string().min(1),
  background: z.string().min(1),
  userProblem: z.string().min(1),
  productGoal: z.string().min(1),
  proposedSolution: z.string().min(1),
  inScope: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).optional().default([]),
  priority: z.enum(priorities),
  risks: z.array(z.string()).default([]),
  sourceIssueIds: z.array(z.string()).default([]),
  sourceReviewIds: z.array(z.string()).default([])
});

const modelResponseSchema = z.object({
  versionPlans: z.array(modelVersionPlanSchema).default([]),
  requirements: z.array(modelRequirementSchema).default([])
});

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ModelCaller = (input: { model: string; messages: ChatMessage[] }) => Promise<string>;

type ModelResponse = z.infer<typeof modelResponseSchema>;

export type ProductPriority = (typeof priorities)[number];

export type VersionPlan = {
  versionPlanId: string;
  versionName: string;
  objective: string;
  priority: ProductPriority;
  includedIssueIds: string[];
  rationale: string;
};

export type ProductRequirement = {
  requirementId: string;
  title: string;
  background: string;
  userProblem: string;
  productGoal: string;
  proposedSolution: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  priority: ProductPriority;
  risks: string[];
  sourceIssueIds: string[];
  sourceReviewIds: string[];
  sourceReviews: ReviewEvidence[];
  traceability: Array<{
    reviewId: string;
    issueId: string;
    requirementId: string;
  }>;
};

export type ProductPlanningResult = {
  status: "success" | "skipped" | "error";
  model: string | null;
  inputIssueCount: number;
  versionPlans: VersionPlan[];
  requirements: ProductRequirement[];
  warnings: string[];
  error?: string;
};

export async function generateProductPlanning(input: {
  themes: IssueTheme[];
  goal: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  callModel?: ModelCaller;
}): Promise<ProductPlanningResult> {
  const model = input.model?.trim() || "gpt-4o-mini";

  if (input.themes.length === 0) {
    return createSkippedProductPlanningResult({
      model,
      inputIssueCount: 0,
      reason: "没有可用于生成版本规划和 PRD 的有效 AI 主题。"
    });
  }

  if (!input.apiKey?.trim()) {
    return {
      status: "error",
      model,
      inputIssueCount: input.themes.length,
      versionPlans: [],
      requirements: [],
      warnings: [],
      error: "未配置 OPENAI_API_KEY，无法生成版本规划和 PRD。请在 .env.local 中配置后重启服务。"
    };
  }

  try {
    const messages = buildProductPlanningMessages({
      goal: input.goal,
      themes: input.themes
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
    const validated = validateProductPlanning(parsed, input.themes);

    if (validated.requirements.length === 0) {
      validated.warnings.push("证据不足，暂不生成需求。");
    }

    return {
      status: "success",
      model,
      inputIssueCount: input.themes.length,
      ...validated
    };
  } catch (error) {
    return {
      status: "error",
      model,
      inputIssueCount: input.themes.length,
      versionPlans: [],
      requirements: [],
      warnings: [],
      error: error instanceof Error ? error.message : "版本规划和 PRD 生成失败。"
    };
  }
}

export function createSkippedProductPlanningResult(input: {
  model?: string | null;
  inputIssueCount?: number;
  reason: string;
}): ProductPlanningResult {
  return {
    status: "skipped",
    model: input.model ?? null,
    inputIssueCount: input.inputIssueCount ?? 0,
    versionPlans: [],
    requirements: [],
    warnings: [input.reason]
  };
}

export function buildProductPlanningMessages(input: { goal: string; themes: IssueTheme[] }): ChatMessage[] {
  const analysisGoal = resolveAnalysisGoal(input.goal);
  const payload = {
    analysisGoal,
    themes: input.themes.map(compactTheme)
  };

  return [
    {
      role: "system",
      content:
        "你是严谨的产品规划 Agent。请只基于已经由程序校验过的用户问题主题生成版本规划和 PRD，不要生成测试用例，不要编造 issueId 或 reviewId，必须返回严格 JSON。"
    },
    {
      role: "user",
      content: `请基于以下已校验的 AI 用户问题主题，生成版本规划和结构化 PRD。\n\n本次分析目标：${analysisGoal}\n\n要求：\n1. 版本规划和 PRD 必须围绕“本次分析目标”展开，但不能为了贴合目标而虚构没有证据的问题。\n2. sourceIssueIds 只能引用输入 themes 中存在的 issueId。\n3. sourceReviewIds 只能引用所选 sourceIssueIds 对应 supportingReviews 中存在的 reviewId，不能引用冲突评论作为需求证据。\n4. requirementId 和 versionPlanId 不要由模型生成，代码会统一编号。\n5. 验收标准 acceptanceCriteria 必须是非空数组，且每条标准可验证。\n6. 如果证据不足，versionPlans 或 requirements 可以返回空数组。\n7. 不要生成测试用例。\n8. 严格返回 JSON，不要 Markdown，不要额外解释。\n\nJSON 结构必须为：\n{"versionPlans":[{"versionName":"V1.1","objective":"版本目标","priority":"high | medium | low","includedIssueIds":["F-001"],"rationale":"为什么放入该版本"}],"requirements":[{"title":"需求标题","background":"背景","userProblem":"用户问题","productGoal":"产品目标","proposedSolution":"解决方案","inScope":["范围内事项"],"outOfScope":["非范围事项"],"acceptanceCriteria":["可验收标准"],"priority":"high | medium | low","risks":["风险"],"sourceIssueIds":["F-001"],"sourceReviewIds":["R-001"]}]}\n\n输入数据：\n${JSON.stringify(payload)}`
    }
  ];
}

export function validateProductPlanning(
  modelOutput: ModelResponse,
  themes: IssueTheme[]
): Pick<ProductPlanningResult, "versionPlans" | "requirements" | "warnings"> {
  const issueById = new Map(themes.map((theme) => [theme.issueId, theme]));
  const reviewById = new Map(
    themes.flatMap((theme) => theme.supportingReviews.map((review) => [review.reviewId, review] as const))
  );
  const warnings: string[] = [];
  const versionPlans: VersionPlan[] = [];
  const requirements: ProductRequirement[] = [];
  const plannedIssueIds = new Set<string>();
  const requiredIssueIds = new Set<string>();

  modelOutput.versionPlans.slice(0, 4).forEach((plan) => {
    const includedIssueIds = unique(plan.includedIssueIds).filter((issueId) => {
      if (!issueById.has(issueId)) {
        warnings.push(`版本规划引用了不存在的问题 ${issueId}，已移除。`);
        return false;
      }

      if (plannedIssueIds.has(issueId)) {
        warnings.push(`问题 ${issueId} 被多个版本规划重复引用，已从后续版本移除。`);
        return false;
      }

      return true;
    });

    if (includedIssueIds.length === 0) {
      warnings.push(`版本规划“${plan.versionName}”没有有效问题证据，已过滤。`);
      return;
    }

    includedIssueIds.forEach((issueId) => plannedIssueIds.add(issueId));
    versionPlans.push({
      versionPlanId: `VP-${String(versionPlans.length + 1).padStart(3, "0")}`,
      versionName: plan.versionName.trim(),
      objective: plan.objective.trim(),
      priority: plan.priority,
      includedIssueIds,
      rationale: plan.rationale.trim()
    });
  });

  modelOutput.requirements.slice(0, 12).forEach((requirement) => {
    const sourceIssueIds = unique(requirement.sourceIssueIds).filter((issueId) => {
      if (!issueById.has(issueId)) {
        warnings.push(`需求“${requirement.title}”引用了不存在的问题 ${issueId}，已移除。`);
        return false;
      }

      if (requiredIssueIds.has(issueId)) {
        warnings.push(`问题 ${issueId} 被多个需求重复引用，已从后续需求移除。`);
        return false;
      }

      return true;
    });

    if (sourceIssueIds.length === 0) {
      warnings.push(`需求“${requirement.title}”没有有效问题证据，已过滤。`);
      return;
    }

    const validReviewIdsByIssue = new Map(
      sourceIssueIds.map((issueId) => [issueId, new Set(issueById.get(issueId)?.supportingReviewIds ?? [])])
    );
    const allowedReviewIds = new Set([...validReviewIdsByIssue.values()].flatMap((ids) => [...ids]));
    const sourceReviewIds = unique(requirement.sourceReviewIds).filter((reviewId) => {
      if (allowedReviewIds.has(reviewId)) {
        return true;
      }

      if (!reviewById.has(reviewId)) {
        warnings.push(`需求“${requirement.title}”引用了不存在的评论 ${reviewId}，已移除。`);
      } else {
        warnings.push(`需求“${requirement.title}”引用的评论 ${reviewId} 不属于对应问题的有效支持评论，已移除。`);
      }

      return false;
    });

    if (sourceReviewIds.length === 0) {
      warnings.push(`需求“${requirement.title}”没有有效来源评论，已过滤。`);
      return;
    }

    const acceptanceCriteria = unique(requirement.acceptanceCriteria);

    if (acceptanceCriteria.length === 0) {
      warnings.push(`需求“${requirement.title}”缺少有效验收标准，已过滤。`);
      return;
    }

    const requirementId = `REQ-${String(requirements.length + 1).padStart(3, "0")}`;
    sourceIssueIds.forEach((issueId) => requiredIssueIds.add(issueId));

    requirements.push({
      requirementId,
      title: requirement.title.trim(),
      background: requirement.background.trim(),
      userProblem: requirement.userProblem.trim(),
      productGoal: requirement.productGoal.trim(),
      proposedSolution: requirement.proposedSolution.trim(),
      inScope: unique(requirement.inScope),
      outOfScope: unique(requirement.outOfScope),
      acceptanceCriteria,
      priority: requirement.priority,
      risks: unique(requirement.risks),
      sourceIssueIds,
      sourceReviewIds,
      sourceReviews: sourceReviewIds.map((reviewId) => reviewById.get(reviewId)).filter(isReviewEvidence),
      traceability: buildTraceabilityRows({
        requirementId,
        sourceIssueIds,
        sourceReviewIds,
        validReviewIdsByIssue
      })
    });
  });

  return {
    versionPlans,
    requirements,
    warnings
  };
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

function parseModelJson(rawContent: string): ModelResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("模型返回非法 JSON，无法解析版本规划和 PRD 结果。");
  }

  const result = modelResponseSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error("模型返回 JSON 不符合版本规划和 PRD 结构。");
  }

  return result.data;
}

function compactTheme(theme: IssueTheme) {
  return {
    issueId: theme.issueId,
    title: theme.title,
    summary: theme.summary,
    severity: theme.severity,
    confidence: theme.confidence,
    supportCount: theme.supportCount,
    supportingReviews: theme.supportingReviews.map(compactReview),
    conflictingReviews: theme.conflictingReviews.map(compactReview)
  };
}

function compactReview(review: ReviewEvidence) {
  return {
    reviewId: review.reviewId,
    rating: review.rating,
    title: review.title,
    body: truncate(review.body, 700),
    updatedAt: review.updatedAt
  };
}

function buildTraceabilityRows(input: {
  requirementId: string;
  sourceIssueIds: string[];
  sourceReviewIds: string[];
  validReviewIdsByIssue: Map<string, Set<string>>;
}): ProductRequirement["traceability"] {
  return input.sourceIssueIds.flatMap((issueId) => {
    const issueReviewIds = input.validReviewIdsByIssue.get(issueId) ?? new Set<string>();

    return input.sourceReviewIds
      .filter((reviewId) => issueReviewIds.has(reviewId))
      .map((reviewId) => ({
        reviewId,
        issueId,
        requirementId: input.requirementId
      }));
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function isReviewEvidence(review: ReviewEvidence | undefined): review is ReviewEvidence {
  return Boolean(review);
}
