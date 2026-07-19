import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverIssueThemes } from "@/lib/ai/issue-discovery";
import { createSkippedProductPlanningResult, generateProductPlanning } from "@/lib/ai/product-planning";
import { createSkippedTestGenerationResult, generateTestCases } from "@/lib/ai/test-generation";
import { runReviewPipeline } from "@/lib/reviews/pipeline";
import { buildTraceabilityAudit } from "@/lib/traceability";

export const runtime = "nodejs";

const importSourceSchema = z.object({
  type: z.enum(["json-file", "csv-file", "sample-data"]),
  fileName: z.string().optional(),
  content: z.string().optional().default("")
});

const requestSchema = z.object({
  appUrl: z.string().optional().default(""),
  goal: z.string().optional().default(""),
  maxPages: z.number().int().min(1).max(10).optional(),
  importSource: importSourceSchema.optional()
}).superRefine((payload, context) => {
  const hasAppUrl = Boolean(payload.appUrl.trim());
  const hasImportSource = Boolean(payload.importSource);

  if (hasAppUrl === hasImportSource) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "请在 App Store 链接和 JSON/CSV 文件上传中二选一。"
    });
  }
});

export async function POST(request: Request) {
  try {
    const payload = await resolveRequestPayload(requestSchema.parse(await request.json()));
    const result = await runReviewPipeline(payload);
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

    result.issueDiscovery = await discoverIssueThemes({
      reviews: result.reviews,
      goal: result.scope.goal,
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model
    });

    if (result.issueDiscovery.status === "success") {
      result.productPlanning = await generateProductPlanning({
        themes: result.issueDiscovery.themes,
        goal: result.scope.goal,
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        model
      });
    } else {
      result.productPlanning = createSkippedProductPlanningResult({
        model,
        inputIssueCount: result.issueDiscovery.themes.length,
        reason: "AI 主题发现未成功，已跳过版本规划和 PRD 生成。"
      });
    }

    if (result.productPlanning.status === "success" && result.productPlanning.requirements.length > 0) {
      result.testGeneration = await generateTestCases({
        requirements: result.productPlanning.requirements,
        goal: result.scope.goal,
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        model
      });
    } else {
      result.testGeneration = createSkippedTestGenerationResult({
        model,
        inputRequirementCount: result.productPlanning.requirements.length,
        reason: "版本规划和 PRD 未生成有效需求，已跳过测试用例生成。"
      });
    }

    result.traceability = buildTraceabilityAudit({
      issueDiscovery: result.issueDiscovery,
      productPlanning: result.productPlanning,
      testGeneration: result.testGeneration
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败，请稍后重试。";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function resolveRequestPayload(payload: z.infer<typeof requestSchema>) {
  if (payload.importSource?.type !== "sample-data") {
    return payload;
  }

  const content =
    payload.importSource.content.trim() ||
    (await readFile(path.join(process.cwd(), "sample_data", "reviews.json"), "utf-8"));

  return {
    ...payload,
    importSource: {
      ...payload.importSource,
      fileName: payload.importSource.fileName ?? "sample_data/reviews.json",
      content
    }
  };
}
