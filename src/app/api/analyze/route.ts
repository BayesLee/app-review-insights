import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverIssueThemes } from "@/lib/ai/issue-discovery";
import { createSkippedProductPlanningResult, generateProductPlanning } from "@/lib/ai/product-planning";
import { runReviewPipeline } from "@/lib/reviews/pipeline";

export const runtime = "nodejs";

const requestSchema = z.object({
  appUrl: z.string().min(1, "请输入 App Store 链接"),
  goal: z.string().optional().default(""),
  maxPages: z.number().int().min(1).max(10).optional()
});

export async function POST(request: Request) {
  try {
    const payload = requestSchema.parse(await request.json());
    const result = await runReviewPipeline(payload);
    result.issueDiscovery = await discoverIssueThemes({
      reviews: result.reviews,
      goal: result.scope.goal,
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL
    });
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

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

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败，请稍后重试。";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
