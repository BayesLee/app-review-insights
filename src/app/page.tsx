"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  FlaskConical,
  Layers3,
  Loader2,
  Network,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { QUICK_ANALYSIS_GOALS } from "@/lib/analysis-goal";
import type { PipelineResult } from "@/lib/reviews/types";

const defaultAppUrl = "https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684";

const stages = [
  {
    key: "scope",
    title: "分析范围规划",
    detail: "解析 App 链接，并将分析目标转化为可执行的数据范围。",
    icon: Network
  },
  {
    key: "collection",
    title: "评论采集",
    detail: "获取美国区 App Store 评论，并保留原始证据用于追溯。",
    icon: Activity
  },
  {
    key: "cleaning",
    title: "清洗去重",
    detail: "统一字段、去除重复数据，并保留确定性统计结果。",
    icon: Layers3
  },
  {
    key: "model",
    title: "模型分析",
    detail: "动态发现主题、合并相似问题，并标记不确定性。",
    icon: Sparkles
  },
  {
    key: "prd",
    title: "PRD 与版本规划",
    detail: "将有证据支撑的洞察转化为需求、优先级和验收标准。",
    icon: FileText
  },
  {
    key: "tests",
    title: "测试用例设计",
    detail: "生成与需求和源评论相互关联的测试用例。",
    icon: FlaskConical
  },
  {
    key: "audit",
    title: "证据链校验",
    detail: "移除无证据结论，或将其明确标记为假设。",
    icon: ShieldCheck
  }
] as const;

type StageStatus = "done" | "running" | "pending" | "planned" | "skipped" | "error";

const statusText: Record<StageStatus, string> = {
  done: "完成",
  running: "运行中",
  pending: "待运行",
  planned: "待接入",
  skipped: "跳过",
  error: "异常"
};

export default function Home() {
  const [appUrl, setAppUrl] = useState(defaultAppUrl);
  const [goal, setGoal] = useState("");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxRatingCount = useMemo(() => {
    if (!result) {
      return 1;
    }

    return Math.max(...Object.values(result.metrics.ratingDistribution), 1);
  }, [result]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          appUrl,
          goal,
          maxPages: 4
        })
      });
      const data = (await response.json()) as PipelineResult | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "分析失败，请稍后重试。");
      }

      setResult(data as PipelineResult);
    } catch (requestError) {
      setResult(null);
      setError(requestError instanceof Error ? requestError.message : "分析失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  function getStageStatus(index: number): StageStatus {
    if (error && index <= 2) {
      return index === 1 ? "error" : "pending";
    }

    if (isLoading) {
      return index <= 3 ? "running" : "pending";
    }

    if (result) {
      if (index <= 2) {
        return "done";
      }

      if (index === 3) {
        if (result.issueDiscovery?.status === "success") {
          return "done";
        }

        if (result.issueDiscovery?.status === "skipped") {
          return "skipped";
        }

        return "error";
      }

      return "planned";
    }

    return "pending";
  }

  return (
    <main className="shell">
      <div className="workspace">
        <aside className="sidebar">
          <div className="brand">
            <h1>App 评论洞察 Agent</h1>
            <p>把真实用户评论转化为可追溯的产品洞察、版本计划、PRD 和测试用例。</p>
          </div>

          <form className="form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="appUrl">美国区 App Store 链接</label>
              <input
                id="appUrl"
                className="input"
                value={appUrl}
                onChange={(event) => setAppUrl(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="goal">分析目标</label>
              <textarea
                id="goal"
                className="textarea"
                value={goal}
                placeholder={"例如：\n识别当前最严重的用户体验问题\n重点分析订阅和付费问题\n分析用户最希望新增的功能"}
                onChange={(event) => setGoal(event.target.value)}
              />
              <p className="field-hint">留空时将使用默认目标，并在结果区展示实际采用的目标。</p>
              <div className="quick-goals" aria-label="快捷分析目标">
                {QUICK_ANALYSIS_GOALS.map((quickGoal) => (
                  <button
                    key={quickGoal.label}
                    className="quick-goal"
                    type="button"
                    onClick={() => setGoal(quickGoal.value)}
                  >
                    {quickGoal.label}
                  </button>
                ))}
              </div>
            </div>

            <button className="primary" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="spinner" size={18} />
                  分析中
                </>
              ) : (
                <>
                  开始分析
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="pipeline">
            <h2>执行流程</h2>
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const status = getStageStatus(index);
              return (
                <div className={`stage ${status}`} key={stage.key}>
                  <div className="stage-icon">
                    {status === "running" ? (
                      <Loader2 className="spinner" size={15} />
                    ) : status === "done" ? (
                      <CheckCircle2 size={15} />
                    ) : status === "error" ? (
                      <AlertCircle size={15} />
                    ) : (
                      <Icon size={15} />
                    )}
                  </div>
                  <div>
                    <strong>{stage.title}</strong>
                    <span>{stage.detail}</span>
                    <em className="stage-status">{statusText[status]}</em>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="main">
          <div className="main-panel">
            <div className="topline">
              <div>
                <h2>评论到路线图工作台</h2>
                <p>
                  {result
                    ? `已采集 ${result.collection.rawCount} 条原始评论，清洗出 ${result.cleaning.cleanedCount} 条有效评论，并返回服务端 AI 主题分析状态。`
                    : "当前阶段已接入真实评论采集、清洗去重和基础统计。模型分析、PRD 生成和证据链校验将在后续阶段继续接入。"}
                </p>
              </div>
              <div className="badge">
                <CheckCircle2 size={15} />
                {result ? "数据链已跑通" : "本地骨架已就绪"}
              </div>
            </div>

            {error ? (
              <div className="error-box">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            ) : null}

            <h3 className="panel-subtitle">基础统计结果</h3>
            <div className="metric-grid">
              <div className="metric">
                <span>原始评论</span>
                <strong>{result?.collection.rawCount ?? 0}</strong>
              </div>
              <div className="metric">
                <span>清洗后评论</span>
                <strong>{result?.cleaning.cleanedCount ?? 0}</strong>
              </div>
              <div className="metric">
                <span>平均评分</span>
                <strong>{result?.metrics.averageRating ?? "-"}</strong>
              </div>
              <div className="metric">
                <span>证据充分度</span>
                <strong>{result?.scope.evidenceLevel ?? "待运行"}</strong>
              </div>
            </div>
          </div>

          <div className="result-grid">
            <article className="result-panel">
              <h3>分析范围</h3>
              {result ? (
                <>
                  <dl className="kv-list">
                    <div className="goal-summary">
                      <dt>本次分析目标</dt>
                      <dd>{result.scope.goal}</dd>
                    </div>
                    <div>
                      <dt>App ID</dt>
                      <dd>{result.scope.appId}</dd>
                    </div>
                    <div>
                      <dt>评论区服</dt>
                      <dd>美国区</dd>
                    </div>
                    <div>
                      <dt>采集页数</dt>
                      <dd>{result.collection.pages.filter((page) => page.status === "success").length}</dd>
                    </div>
                    <div>
                      <dt>采集时间</dt>
                      <dd>{formatDate(result.collection.fetchedAt)}</dd>
                    </div>
                  </dl>
                  <div className="tag-row">
                    {result.scope.focusAreas.map((area) => (
                      <span className="tag" key={area}>
                        {area}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty-state">点击“开始分析”后，这里会展示本次评论分析的范围和目标。</p>
              )}
            </article>

            <article className="result-panel">
              <h3>清洗报告</h3>
              {result ? (
                <div className="compact-grid">
                  <div>
                    <span>原始条数</span>
                    <strong>{result.cleaning.rawCount}</strong>
                  </div>
                  <div>
                    <span>有效条数</span>
                    <strong>{result.cleaning.cleanedCount}</strong>
                  </div>
                  <div>
                    <span>重复评论</span>
                    <strong>{result.cleaning.duplicateCount}</strong>
                  </div>
                  <div>
                    <span>异常评论</span>
                    <strong>{result.cleaning.emptyCount + result.cleaning.malformedCount}</strong>
                  </div>
                </div>
              ) : (
                <p className="empty-state">清洗阶段会过滤空内容、异常评分和重复评论。</p>
              )}
            </article>

            <article className="result-panel">
              <h3>评分分布</h3>
              {result ? (
                <div className="rating-list">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const count = result.metrics.ratingDistribution[rating as 1 | 2 | 3 | 4 | 5];
                    const width = `${Math.max((count / maxRatingCount) * 100, count > 0 ? 4 : 0)}%`;
                    return (
                      <div className="rating-row" key={rating}>
                        <span className="rating-label">{rating} 星</span>
                        <div className="rating-bar">
                          <span className="rating-fill" style={{ width }} />
                        </div>
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-state">分析完成后会展示 1-5 星评论分布。</p>
              )}
            </article>

            <article className="result-panel">
              <h3>版本反馈</h3>
              {result ? (
                <>
                  <p>
                    低评分评论 {result.metrics.lowRatingCount} 条，占比{" "}
                    {Math.round(result.metrics.lowRatingRatio * 100)}%。
                  </p>
                  {hasKnownVersions(result) ? (
                    <div className="tag-row">
                      {result.metrics.topVersions.map((item) => (
                        <span className="tag" key={item.version}>
                          v{item.version} · {item.count}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="source-line">当前采集接口未返回版本号，版本维度先标记为数据限制。</p>
                  )}
                </>
              ) : (
                <p className="empty-state">这里会展示评论最多的版本和低评分比例。</p>
              )}
            </article>

            <article className="result-panel wide">
              <h3>AI 模型分析结果</h3>
              {result?.issueDiscovery ? (
                <IssueDiscoveryPanel result={result.issueDiscovery} />
              ) : (
                <p className="empty-state">
                  点击“开始分析”后，服务端会调用 OpenAI-compatible API，从低评分评论中动态发现用户问题主题。
                </p>
              )}
            </article>

            <article className="result-panel wide">
              <h3>评论样例</h3>
              {result ? (
                <div className="review-list">
                  {result.sampleReviews.map((review) => (
                    <div className="review-row" key={review.id}>
                      <div className="review-meta">
                        <strong>{review.rating} 星</strong>
                        <span>v{review.version}</span>
                        <span>{formatDate(review.updatedAt)}</span>
                        <span>ID: {shortId(review.id)}</span>
                      </div>
                      <h4>{review.title || "无标题评论"}</h4>
                      <p className="review-body">{truncate(review.body, 280)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">优先展示低评分和较新的评论样例，后续会作为 AI 洞察的证据来源。</p>
              )}
            </article>

            <article className="result-panel">
              <h3>Agent 策略</h3>
              <p>
                确定性代码负责采集、字段归一、去重、统计和校验；模型负责主题发现、
                问题合并、需求草拟和测试用例生成。
              </p>
            </article>

            <article className="result-panel">
              <h3>下一步</h3>
              {result ? (
                <ul>
                  {result.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              ) : (
                <ul>
                  <li>先跑通真实评论采集和清洗。</li>
                  <li>再接入模型驱动的动态主题发现。</li>
                  <li>最后生成 PRD、测试用例和证据链校验结果。</li>
                </ul>
              )}
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}...`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 18)}...` : value;
}

function hasKnownVersions(result: PipelineResult): boolean {
  return result.metrics.topVersions.some((item) => item.version !== "unknown");
}

function IssueDiscoveryPanel({ result }: { result: NonNullable<PipelineResult["issueDiscovery"]> }) {
  return (
    <div className="ai-panel">
      <div className="ai-meta-grid">
        <div>
          <span>实际模型</span>
          <strong>{result.model ?? "未配置"}</strong>
        </div>
        <div>
          <span>发送给模型的评论</span>
          <strong>{result.inputReviewCount}</strong>
        </div>
        <div>
          <span>1-2 星评论</span>
          <strong>{result.lowRatingReviewCount}</strong>
        </div>
        <div>
          <span>冲突候选评论</span>
          <strong>{result.conflictCandidateCount}</strong>
        </div>
      </div>

      {result.status === "error" ? (
        <div className="error-box inline-error">
          <AlertCircle size={18} />
          <span>{result.error}</span>
        </div>
      ) : null}

      {result.status === "skipped" ? (
        <p className="source-line">{result.warnings[0] ?? "AI 主题分析已跳过。"}</p>
      ) : null}

      {result.warnings.length > 0 && result.status !== "skipped" ? (
        <div className="warning-list">
          {result.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}

      {result.status === "success" && result.themes.length === 0 ? (
        <p className="empty-state">模型没有输出具备有效证据的主题，或所有主题都因缺少有效评论 ID 被过滤。</p>
      ) : null}

      {result.themes.length > 0 ? (
        <div className="theme-list">
          {result.themes.map((theme) => (
            <article className="theme-card" key={theme.issueId}>
              <div className="theme-head">
                <div>
                  <span className="issue-id">{theme.issueId}</span>
                  <h4>{theme.title}</h4>
                </div>
                <div className="tag-row compact-tags">
                  <span className={`tag severity-${theme.severity}`}>严重程度：{translateLevel(theme.severity)}</span>
                  <span className={`tag confidence-${theme.confidence}`}>置信度：{translateLevel(theme.confidence)}</span>
                  <span className="tag">有效支持 {theme.supportCount} 条</span>
                </div>
              </div>
              <p>{theme.summary}</p>

              <div className="evidence-columns">
                <div>
                  <h5>支持评论原文</h5>
                  {theme.supportingReviews.map((review) => (
                    <ReviewEvidenceBlock key={review.reviewId} review={review} />
                  ))}
                </div>
                <div>
                  <h5>冲突评论原文</h5>
                  {theme.conflictingReviews.length > 0 ? (
                    theme.conflictingReviews.map((review) => (
                      <ReviewEvidenceBlock key={review.reviewId} review={review} />
                    ))
                  ) : (
                    <p className="empty-state">本主题未找到有效冲突评论。</p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReviewEvidenceBlock({
  review
}: {
  review: NonNullable<PipelineResult["issueDiscovery"]>["themes"][number]["supportingReviews"][number];
}) {
  return (
    <div className="evidence-block">
      <div className="review-meta">
        <strong>{review.reviewId}</strong>
        <span>{review.rating} 星</span>
        <span>{formatDate(review.updatedAt)}</span>
      </div>
      <h6>{review.title || "无标题评论"}</h6>
      <p>{truncate(review.body, 360)}</p>
    </div>
  );
}

function translateLevel(level: "high" | "medium" | "low"): string {
  const map = {
    high: "高",
    medium: "中",
    low: "低"
  };

  return map[level];
}
