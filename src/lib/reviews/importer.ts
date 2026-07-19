import Papa from "papaparse";
import type { CollectionResult, RawReview } from "./types";

export type ImportedReviewSource = {
  type: "json-file" | "csv-file" | "sample-data";
  fileName?: string;
  content: string;
};

type ImportedReviewRow = {
  id?: unknown;
  rating?: unknown;
  title?: unknown;
  content?: unknown;
  body?: unknown;
  author?: unknown;
  date?: unknown;
  updatedAt?: unknown;
  version?: unknown;
};

export function collectImportedReviews(source: ImportedReviewSource): CollectionResult {
  const rows = parseRows(source);
  const warnings: string[] = [];
  const reviews = rows.map((row, index) => toRawReview(row, index, source, warnings));

  return {
    appId: "imported-reviews",
    storefront: "us",
    source: source.fileName ?? source.type,
    fetchedAt: new Date().toISOString(),
    pages: [
      {
        page: 1,
        url: source.fileName ?? source.type,
        count: reviews.length,
        status: "success"
      }
    ],
    reviews,
    warnings
  };
}

function parseRows(source: ImportedReviewSource): ImportedReviewRow[] {
  if (source.type === "json-file" || source.type === "sample-data") {
    return parseJsonRows(source.content);
  }

  return parseCsvRows(source.content);
}

function parseJsonRows(content: string): ImportedReviewRow[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("JSON 文件格式错误，无法解析评论数据。");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("JSON 文件必须是评论数组。");
  }

  return parsed as ImportedReviewRow[];
}

function parseCsvRows(content: string): ImportedReviewRow[] {
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    throw new Error(`CSV 文件格式错误：${parsed.errors[0].message}`);
  }

  if (!Array.isArray(parsed.data) || parsed.data.length === 0) {
    throw new Error("CSV 文件没有可读取的评论数据。");
  }

  return parsed.data;
}

function toRawReview(
  row: ImportedReviewRow,
  index: number,
  source: ImportedReviewSource,
  warnings: string[]
): RawReview {
  const rating = Number(row.rating);
  const body = stringify(row.content ?? row.body);
  const id = stringify(row.id) || `imported-${String(index + 1).padStart(3, "0")}`;
  const updatedAt = normalizeDate(stringify(row.date ?? row.updatedAt), index);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    warnings.push(`第 ${index + 1} 条评论 rating 必须为 1-5，已在清洗阶段过滤。`);
  }

  if (!body.trim()) {
    warnings.push(`第 ${index + 1} 条评论 content 为空，已在清洗阶段过滤。`);
  }

  return {
    id,
    title: stringify(row.title),
    body,
    rating: Number.isFinite(rating) ? rating : 0,
    version: stringify(row.version) || "unknown",
    updatedAt,
    author: stringify(row.author) || "anonymous",
    country: "us",
    appId: "imported-reviews",
    page: 1,
    sourceUrl: source.fileName ?? source.type
  };
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function normalizeDate(value: string, index: number): string {
  if (!value) {
    return new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString();
  }

  return date.toISOString();
}
