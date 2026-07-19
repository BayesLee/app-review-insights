import { NextResponse } from "next/server";
import { z } from "zod";
import { discoverIssueThemes } from "@/lib/ai/issue-discovery";
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

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败，请稍后重试。";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
