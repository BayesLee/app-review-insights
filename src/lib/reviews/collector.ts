import { get } from "node:https";
import type { CollectionPage, CollectionResult, RawReview } from "./types";

type UserReviewEntry = {
  userReviewId?: string;
  title?: string;
  body?: string;
  rating?: number;
  date?: string;
  name?: string;
  viewUsersUserReviewsUrl?: string;
};

type UserReviewsRowResponse = {
  userReviewList?: UserReviewEntry[];
};

export function parseAppStoreAppId(appUrl: string): string {
  const trimmed = appUrl.trim();
  const match = trimmed.match(/id(\d{6,})/);

  if (!match) {
    throw new Error("未能从 App Store 链接中解析出 app id，请确认链接包含 id 后面的数字。");
  }

  return match[1];
}

export function buildReviewFeedUrl(appId: string, page: number): string {
  const pageSize = 50;
  const startIndex = (page - 1) * pageSize;
  const endIndex = page * pageSize;

  return `https://itunes.apple.com/WebObjects/MZStore.woa/wa/userReviewsRow?id=${appId}&displayable-kind=11&startIndex=${startIndex}&endIndex=${endIndex}&sort=4`;
}

export async function collectAppStoreReviews(input: {
  appUrl: string;
  maxPages?: number;
}): Promise<CollectionResult> {
  const appId = parseAppStoreAppId(input.appUrl);
  const maxPages = Math.max(1, Math.min(input.maxPages ?? 4, 10));
  const pages: CollectionPage[] = [];
  const reviews: RawReview[] = [];
  const warnings: string[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = buildReviewFeedUrl(appId, page);

    try {
      const data = await fetchUserReviewsRow(url);
      const entries = data.userReviewList ?? [];
      const pageReviews = entries
        .map((entry, index) => normalizeReviewEntry(entry, { appId, page, index, url }))
        .filter((review): review is RawReview => review !== null);

      pages.push({ page, url, count: pageReviews.length, status: "success" });
      reviews.push(...pageReviews);

      if (pageReviews.length === 0) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      const warning = `第 ${page} 页采集失败：${message}`;
      pages.push({ page, url, count: 0, status: "failed", error: warning });
      warnings.push(warning);
    }
  }

  return {
    appId,
    storefront: "us",
    source: "Apple iTunes userReviewsRow JSON endpoint with U.S. storefront header",
    fetchedAt: new Date().toISOString(),
    pages,
    reviews,
    warnings
  };
}

function fetchUserReviewsRow(url: string): Promise<UserReviewsRowResponse> {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          Accept: "application/json,text/javascript,*/*;q=0.1",
          "x-apple-store-front": "143441-1,29",
          "User-Agent":
            "iTunes/12.12.10 (Windows; Microsoft Windows 10 x64) AppleWebKit/7610.400.1.1"
        },
        timeout: 15000
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`HTTP ${response.statusCode ?? "unknown"}`));
            return;
          }

          try {
            resolve(JSON.parse(body) as UserReviewsRowResponse);
          } catch {
            reject(new Error("Apple 评论接口返回内容不是合法 JSON。"));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("请求超时"));
    });
    request.on("error", reject);
  });
}

function normalizeReviewEntry(
  entry: UserReviewEntry,
  context: { appId: string; page: number; index: number; url: string }
): RawReview | null {
  const body = entry.body?.trim() ?? "";
  const title = entry.title?.trim() ?? "";
  const rating = Number(entry.rating);
  const updatedAt = entry.date?.trim() ?? "";

  if (!body && !title) {
    return null;
  }

  return {
    id: entry.userReviewId?.trim() || `${context.appId}-${context.page}-${context.index}`,
    title,
    body,
    rating,
    version: "unknown",
    updatedAt,
    author: entry.name?.trim() || "anonymous",
    country: "us",
    appId: context.appId,
    page: context.page,
    sourceUrl: entry.viewUsersUserReviewsUrl ?? context.url
  };
}
