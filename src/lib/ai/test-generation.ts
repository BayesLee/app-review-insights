import OpenAI from "openai";
import { z } from "zod";
import { resolveAnalysisGoal } from "../analysis-goal";
import type { ProductPriority, ProductRequirement } from "./product-planning";

const priorities = ["high", "medium", "low"] as const;
const testTypes = ["functional", "boundary", "exception", "usability"] as const;

const modelTestCaseSchema = z.object({
  title: z.string().min(1),
  requirementId: z.string().min(1),
  sourceIssueIds: z.array(z.string()).default([]),
  sourceReviewIds: z.array(z.string()).default([]),
  priority: z.enum(priorities),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(z.string()).default([]),
  expectedResult: z.string().min(1),
  testType: z.enum(testTypes)
});

const modelResponseSchema = z.object({
  testCases: z.array(modelTestCaseSchema).default([])
});

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ModelCaller = (input: { model: string; messages: ChatMessage[] }) => Promise<string>;
type ModelResponse = z.infer<typeof modelResponseSchema>;
type TestType = (typeof testTypes)[number];

export type GeneratedTestCase = {
  testCaseId: string;
  title: string;
  requirementId: string;
  sourceIssueIds: string[];
  sourceReviewIds: string[];
  priority: ProductPriority;
  preconditions: string[];
  steps: string[];
  expectedResult: string;
  testType: TestType;
  status: "generated";
};

export type TestGenerationResult = {
  status: "success" | "skipped" | "error";
  model: string | null;
  inputRequirementCount: number;
  testCases: GeneratedTestCase[];
  warnings: string[];
  error?: string;
};

export async function generateTestCases(input: {
  requirements: ProductRequirement[];
  goal: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  callModel?: ModelCaller;
}): Promise<TestGenerationResult> {
  const model = input.model?.trim() || "gpt-4o-mini";

  if (input.requirements.length === 0) {
    return createSkippedTestGenerationResult({
      model,
      inputRequirementCount: 0,
      reason: "没有可用于生成测试用例的有效 PRD 需求。"
    });
  }

  if (!input.apiKey?.trim()) {
    return {
      status: "error",
      model,
      inputRequirementCount: input.requirements.length,
      testCases: [],
      warnings: [],
      error: "未配置 OPENAI_API_KEY，无法生成测试用例。请在 .env.local 中配置后重启服务。"
    };
  }

  try {
    const messages = buildTestGenerationMessages({
      goal: input.goal,
      requirements: input.requirements
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
    const validated = validateGeneratedTestCases(parsed, input.requirements);

    ensureHighPriorityCoverage({
      requirements: input.requirements,
      testCases: validated.testCases,
      warnings: validated.warnings
    });

    if (validated.testCases.length === 0) {
      validated.warnings.push("没有通过证据校验的测试用例。");
    }

    return {
      status: "success",
      model,
      inputRequirementCount: input.requirements.length,
      ...validated
    };
  } catch (error) {
    return {
      status: "error",
      model,
      inputRequirementCount: input.requirements.length,
      testCases: [],
      warnings: [],
      error: error instanceof Error ? error.message : "测试用例生成失败。"
    };
  }
}

export function createSkippedTestGenerationResult(input: {
  model?: string | null;
  inputRequirementCount?: number;
  reason: string;
}): TestGenerationResult {
  return {
    status: "skipped",
    model: input.model ?? null,
    inputRequirementCount: input.inputRequirementCount ?? 0,
    testCases: [],
    warnings: [input.reason]
  };
}

export function buildTestGenerationMessages(input: {
  goal: string;
  requirements: ProductRequirement[];
}): ChatMessage[] {
  const analysisGoal = resolveAnalysisGoal(input.goal);
  const payload = {
    analysisGoal,
    requirements: input.requirements.map(compactRequirement)
  };

  return [
    {
      role: "system",
      content:
        "你是严谨的 QA 测试设计 Agent。请只基于已校验 PRD 需求生成结构化测试用例，不要编造 requirementId、issueId 或 reviewId，必须返回严格 JSON。"
    },
    {
      role: "user",
      content: `请基于以下已校验的 PRD 需求生成测试用例。\n\n本次分析目标：${analysisGoal}\n\n要求：\n1. 测试用例必须针对具体需求和验收标准，禁止输出“进入页面、验证功能是否正常”这类空泛模板。\n2. requirementId 只能来自输入 requirements。\n3. sourceIssueIds 只能来自对应 requirement 的 sourceIssueIds。\n4. sourceReviewIds 只能来自对应 requirement 的 sourceReviewIds。\n5. testCaseId 不要由模型生成，代码会统一编号。\n6. steps 必须是非空字符串数组，expectedResult 必须非空。\n7. 每个 high 优先级需求至少生成 1 条 functional 正常流程用例，以及 1 条 exception 或 boundary 用例。\n8. 如果需求证据不足，可以少生成，不要猜测不存在的功能。\n9. 严格返回 JSON，不要 Markdown，不要额外解释。\n\nJSON 结构必须为：\n{"testCases":[{"title":"用例标题","requirementId":"REQ-001","sourceIssueIds":["F-001"],"sourceReviewIds":["R-001"],"priority":"high | medium | low","preconditions":["前置条件"],"steps":["具体步骤"],"expectedResult":"预期结果","testType":"functional | boundary | exception | usability"}]}\n\n输入数据：\n${JSON.stringify(payload)}`
    }
  ];
}

export function validateGeneratedTestCases(
  modelOutput: ModelResponse,
  requirements: ProductRequirement[]
): Pick<TestGenerationResult, "testCases" | "warnings"> {
  const requirementById = new Map(requirements.map((requirement) => [requirement.requirementId, requirement]));
  const warnings: string[] = [];
  const testCases: GeneratedTestCase[] = [];

  modelOutput.testCases.slice(0, 30).forEach((testCase) => {
    const requirement = requirementById.get(testCase.requirementId);

    if (!requirement) {
      warnings.push(`测试用例“${testCase.title}”引用了不存在的需求 ${testCase.requirementId}，已过滤。`);
      return;
    }

    const sourceIssueIds = unique(testCase.sourceIssueIds).filter((issueId) => {
      if (requirement.sourceIssueIds.includes(issueId)) {
        return true;
      }

      warnings.push(`测试用例“${testCase.title}”引用的问题 ${issueId} 不属于需求 ${requirement.requirementId}，已移除。`);
      return false;
    });
    const sourceReviewIds = unique(testCase.sourceReviewIds).filter((reviewId) => {
      if (requirement.sourceReviewIds.includes(reviewId)) {
        return true;
      }

      warnings.push(`测试用例“${testCase.title}”引用的评论 ${reviewId} 不属于需求 ${requirement.requirementId}，已移除。`);
      return false;
    });

    if (sourceIssueIds.length === 0 || sourceReviewIds.length === 0) {
      warnings.push(`测试用例“${testCase.title}”缺少有效需求证据，已过滤。`);
      return;
    }

    const steps = unique(testCase.steps);
    const expectedResult = testCase.expectedResult.trim();

    if (steps.length === 0 || expectedResult.length === 0) {
      warnings.push(`测试用例“${testCase.title}”缺少有效步骤或预期结果，已过滤。`);
      return;
    }

    if (isGenericTemplate(testCase.title, steps, expectedResult)) {
      warnings.push(`测试用例“${testCase.title}”过于空泛，已过滤。`);
      return;
    }

    testCases.push({
      testCaseId: `TC-${String(testCases.length + 1).padStart(3, "0")}`,
      title: testCase.title.trim(),
      requirementId: requirement.requirementId,
      sourceIssueIds,
      sourceReviewIds,
      priority: testCase.priority,
      preconditions: unique(testCase.preconditions),
      steps,
      expectedResult,
      testType: testCase.testType,
      status: "generated"
    });
  });

  return { testCases, warnings };
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
    throw new Error("模型返回非法 JSON，无法解析测试用例结果。");
  }

  const result = modelResponseSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error("模型返回 JSON 不符合测试用例结构。");
  }

  return result.data;
}

function ensureHighPriorityCoverage(input: {
  requirements: ProductRequirement[];
  testCases: GeneratedTestCase[];
  warnings: string[];
}) {
  input.requirements
    .filter((requirement) => requirement.priority === "high")
    .forEach((requirement) => {
      if (
        requirement.sourceIssueIds.length === 0 ||
        requirement.sourceReviewIds.length === 0 ||
        requirement.acceptanceCriteria.length === 0
      ) {
        input.warnings.push(`高优先级需求 ${requirement.requirementId} 缺少有效证据或验收标准，未补足测试用例。`);
        return;
      }

      const testsForRequirement = input.testCases.filter((testCase) => testCase.requirementId === requirement.requirementId);
      const hasFunctional = testsForRequirement.some((testCase) => testCase.testType === "functional");
      const hasBoundaryOrException = testsForRequirement.some(
        (testCase) => testCase.testType === "boundary" || testCase.testType === "exception"
      );

      if (!hasFunctional) {
        input.testCases.push(buildFallbackTestCase(requirement, input.testCases.length, "functional"));
        input.warnings.push(`高优先级需求 ${requirement.requirementId} 缺少正常流程用例，已根据验收标准补足。`);
      }

      if (!hasBoundaryOrException) {
        input.testCases.push(buildFallbackTestCase(requirement, input.testCases.length, "exception"));
        input.warnings.push(`高优先级需求 ${requirement.requirementId} 缺少异常或边界用例，已根据风险和用户问题补足。`);
      }
    });
}

function buildFallbackTestCase(
  requirement: ProductRequirement,
  index: number,
  testType: Extract<TestType, "functional" | "exception">
): GeneratedTestCase {
  const firstCriterion = requirement.acceptanceCriteria[0];
  const firstRisk = requirement.risks[0] ?? requirement.userProblem;

  if (testType === "functional") {
    return {
      testCaseId: `TC-${String(index + 1).padStart(3, "0")}`,
      title: `${requirement.title} - 正常流程验证`,
      requirementId: requirement.requirementId,
      sourceIssueIds: requirement.sourceIssueIds,
      sourceReviewIds: requirement.sourceReviewIds,
      priority: requirement.priority,
      preconditions: [`存在可复现用户问题“${requirement.userProblem}”的测试账号或数据状态。`],
      steps: [
        `准备满足需求 ${requirement.requirementId} 范围内的用户场景：${requirement.inScope[0] ?? requirement.title}。`,
        `执行解决方案中的关键动作：${requirement.proposedSolution}。`,
        `对照验收标准检查结果：${firstCriterion}。`
      ],
      expectedResult: `${requirement.productGoal}，且来源评论中的核心问题不再复现。`,
      testType: "functional",
      status: "generated"
    };
  }

  return {
    testCaseId: `TC-${String(index + 1).padStart(3, "0")}`,
    title: `${requirement.title} - 异常场景验证`,
    requirementId: requirement.requirementId,
    sourceIssueIds: requirement.sourceIssueIds,
    sourceReviewIds: requirement.sourceReviewIds,
    priority: requirement.priority,
    preconditions: [`构造与风险“${firstRisk}”相关的异常或边界条件。`],
    steps: [
      `在需求 ${requirement.requirementId} 的目标场景中触发异常条件：${firstRisk}。`,
      `执行解决方案中的恢复或提示路径：${requirement.proposedSolution}。`,
      `检查用户是否得到明确反馈，并确认不会回到用户问题：${requirement.userProblem}。`
    ],
    expectedResult: `异常或边界条件被清楚处理，并且不破坏验收标准：${firstCriterion}。`,
    testType: "exception",
    status: "generated"
  };
}

function compactRequirement(requirement: ProductRequirement) {
  return {
    requirementId: requirement.requirementId,
    title: requirement.title,
    userProblem: requirement.userProblem,
    productGoal: requirement.productGoal,
    proposedSolution: requirement.proposedSolution,
    inScope: requirement.inScope,
    outOfScope: requirement.outOfScope,
    acceptanceCriteria: requirement.acceptanceCriteria,
    priority: requirement.priority,
    risks: requirement.risks,
    sourceIssueIds: requirement.sourceIssueIds,
    sourceReviewIds: requirement.sourceReviewIds,
    sourceReviews: requirement.sourceReviews.map((review) => ({
      reviewId: review.reviewId,
      rating: review.rating,
      title: review.title,
      body: truncate(review.body, 500)
    }))
  };
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

function isGenericTemplate(title: string, steps: string[], expectedResult: string): boolean {
  const text = [title, ...steps, expectedResult].join(" ").toLowerCase();
  const genericPatterns = [
    /验证功能是否正常/,
    /功能是否正常/,
    /进入页面.*正常/,
    /test (the )?function/,
    /check.*works normally/,
    /verify.*works normally/
  ];

  return genericPatterns.some((pattern) => pattern.test(text));
}
