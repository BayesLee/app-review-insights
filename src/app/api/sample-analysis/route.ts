import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const content = await readFile(path.join(process.cwd(), "sample_outputs", "example-analysis.json"), "utf-8");

    return NextResponse.json(JSON.parse(content));
  } catch {
    return NextResponse.json({ error: "示例分析结果读取失败，请确认 sample_outputs/example-analysis.json 存在。" }, { status: 500 });
  }
}
