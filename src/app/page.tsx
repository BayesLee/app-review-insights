"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileText,
  FileUp,
  FlaskConical,
  Layers3,
  Loader2,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { QUICK_ANALYSIS_GOALS } from "@/lib/analysis-goal";
import { buildJsonReport, buildMarkdownReport } from "@/lib/report/export";
import type { PipelineResult } from "@/lib/reviews/types";

const defaultAppUrl = "https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684";

const stages = [
  {
    key: "collection",
    title: "评论获取",
    detail: "从 App Store、JSON、CSV 或示例数据获取评论。",
    icon: Activity
  },
  {
    key: "cleaning",
    title: "数据清洗",
    detail: "统一字段、去除重复数据，并保留确定性统计结果。",
    icon: Layers3
  },
  {
    key: "model",
    title: "AI 主题分析",
    detail: "动态发现主题、合并相似问题，并标记不确定性。",
    icon: Sparkles
  },
  {
    key: "prd",
    title: "版本规划与 PRD",
    detail: "将有证据支撑的洞察转化为需求、优先级和验收标准。",
    icon: FileText
  },
  {
    key: "tests",
    title: "测试用例生成",
    detail: "生成与需求和源评论相互关联的测试用例。",
    icon: FlaskConical
  },
  {
    key: "audit",
    title: "证据链校验",
    detail: "移除无证据结论，或将其明确标记为假设。",
    icon: ShieldCheck
  },
  {
    key: "done",
    title: "完成",
    detail: "支持导出 JSON 和 Markdown 报告用于提交或演示。",
    icon: CheckCircle2
  }
] as const;

type ImportSourcePayload = {
  type: "json-file" | "csv-file" | "sample-data";
  fileName?: string;
  content: string;
};

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
  const [importSource, setImportSource] = useState<ImportSourcePayload | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSampleOutput, setIsLoadingSampleOutput] = useState(false);
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
          appUrl: importSource ? undefined : appUrl,
          importSource: importSource ?? undefined,
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

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    const type = lowerName.endsWith(".json") ? "json-file" : lowerName.endsWith(".csv") ? "csv-file" : null;

    if (!type) {
      setError("仅支持 JSON 或 CSV 评论文件。");
      event.target.value = "";
      return;
    }

    const content = await file.text();
    setImportSource({ type, fileName: file.name, content });
    setAppUrl("");
    setResult(null);
    setError(null);
  }

  function handleAppUrlChange(value: string) {
    setAppUrl(value);

    if (value.trim()) {
      setImportSource(null);
    }
  }

  function handleLoadSampleData() {
    setImportSource({
      type: "sample-data",
      fileName: "sample_data/reviews.json",
      content: ""
    });
    setAppUrl("");
    setResult(null);
    setError(null);
  }

  function handleClearImportSource() {
    setImportSource(null);
    setAppUrl(defaultAppUrl);
  }

  async function handleLoadSampleOutput() {
    setIsLoadingSampleOutput(true);
    setError(null);

    try {
      const response = await fetch("/api/sample-analysis");
      const data = (await response.json()) as PipelineResult | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "示例分析结果读取失败。");
      }

      setResult(data as PipelineResult);
    } catch (sampleError) {
      setError(sampleError instanceof Error ? sampleError.message : "示例分析结果读取失败。");
    } finally {
      setIsLoadingSampleOutput(false);
    }
  }

  function handleExport(format: "json" | "markdown") {
    if (!result) {
      return;
    }

    const content =
      format === "json" ? JSON.stringify(buildJsonReport(result), null, 2) : buildMarkdownReport(result);
    const blob = new Blob([content], {
      type: format === "json" ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `app-review-insights-${format === "json" ? "report.json" : "report.md"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function getStageStatus(index: number): StageStatus {
    if (error) {
      return index === 0 ? "error" : "pending";
    }

    if (isLoading) {
      return index <= 5 ? "running" : "pending";
    }

    if (result) {
      if (index <= 1) {
        return "done";
      }

      if (index === 2) {
        if (result.issueDiscovery?.status === "success") {
          return "done";
        }

        if (result.issueDiscovery?.status === "skipped") {
          return "skipped";
        }

        return "error";
      }

      if (index === 3) {
        if (result.productPlanning?.status === "success") {
          return "done";
        }

        if (result.productPlanning?.status === "skipped") {
          return "skipped";
        }

        return "error";
      }

      if (index === 4) {
        if (result.testGeneration?.status === "success") {
          return "done";
        }

        if (result.testGeneration?.status === "skipped") {
          return "skipped";
        }

        return "error";
      }

      if (index === 5) {
        return result.traceability?.status === "complete" ? "done" : "skipped";
      }

      return "done";
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
                disabled={Boolean(importSource)}
                onChange={(event) => handleAppUrlChange(event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="reviewFile">JSON / CSV 评论文件</label>
              <div className="file-actions">
                <label className="secondary-action" htmlFor="reviewFile">
                  <FileUp size={16} />
                  上传文件
                </label>
                <input
                  id="reviewFile"
                  className="sr-only"
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  onChange={handleFileChange}
                />
                <button className="secondary-action" type="button" onClick={handleLoadSampleData}>
                  <Database size={16} />
                  加载示例数据
                </button>
              </div>
              <div className="source-chip">
                <span>当前数据来源</span>
                <strong>{describeCurrentSource(importSource)}</strong>
                {importSource ? (
                  <button type="button" onClick={handleClearImportSource}>
                    清除
                  </button>
                ) : null}
              </div>
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
                    ? `已采集 ${result.collection.rawCount} 条原始评论，清洗出 ${result.cleaning.cleanedCount} 条有效评论，并返回服务端 AI 主题、PRD、测试用例和追溯审计状态。`
                    : "当前阶段已接入真实评论采集、JSON/CSV 导入、清洗去重、基础统计、AI 主题发现、版本规划、PRD、测试用例、追溯审计和报告导出。"}
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
                <button className="inline-button" type="button" onClick={handleLoadSampleOutput} disabled={isLoadingSampleOutput}>
                  查看示例分析结果
                </button>
              </div>
            ) : null}

            {result?.isSampleOutput ? (
              <div className="sample-banner">
                <AlertCircle size={18} />
                <span>{result.sampleNotice ?? "示例缓存结果，不是本次实时模型输出。"}</span>
              </div>
            ) : null}

            {result && hasRealtimeModelFailure(result) ? (
              <div className="sample-banner">
                <AlertCircle size={18} />
                <span>实时模型链路未完整成功，可以查看缓存示例了解最终报告形态。</span>
                <button className="inline-button" type="button" onClick={handleLoadSampleOutput} disabled={isLoadingSampleOutput}>
                  查看示例分析结果
                </button>
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
              <div className="metric">
                <span>数据来源</span>
                <strong>{result?.scope.dataSource.label ?? "待选择"}</strong>
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
                      <dt>数据来源</dt>
                      <dd>
                        {result.scope.dataSource.label}
                        {result.scope.dataSource.fileName ? ` · ${result.scope.dataSource.fileName}` : ""}
                      </dd>
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
                  {result.scope.notes.length > 0 ? (
                    <div className="scope-notes">
                      {result.scope.notes.map((note) => (
                        <span key={note}>{note}</span>
                      ))}
                    </div>
                  ) : null}
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
              <h3>版本规划</h3>
              {result?.productPlanning ? (
                <VersionPlanningPanel
                  issueDiscovery={result.issueDiscovery}
                  result={result.productPlanning}
                />
              ) : (
                <p className="empty-state">AI 主题发现成功后，这里会展示基于有效问题证据生成的版本规划。</p>
              )}
            </article>

            <article className="result-panel wide">
              <h3>PRD</h3>
              {result?.productPlanning ? (
                <ProductRequirementsPanel result={result.productPlanning} />
              ) : (
                <p className="empty-state">AI 主题发现成功后，这里会展示结构化产品需求和来源评论证据。</p>
              )}
            </article>

            <article className="result-panel wide">
              <h3>测试用例</h3>
              {result?.testGeneration ? (
                <TestGenerationPanel result={result.testGeneration} />
              ) : (
                <p className="empty-state">PRD 需求生成成功后，这里会展示可追溯到需求和评论的结构化测试用例。</p>
              )}
            </article>

            <article className="result-panel wide">
              <h3>追溯关系</h3>
              {result?.traceability ? (
                <TraceabilityPanel result={result.traceability} />
              ) : (
                <p className="empty-state">测试用例生成后，这里会展示评论、问题、需求和测试用例之间的完整映射。</p>
              )}
            </article>

            <article className="result-panel wide">
              <h3>导出报告</h3>
              {result ? (
                <ExportPanel onExport={handleExport} />
              ) : (
                <p className="empty-state">分析完成后可以导出完整 JSON 报告或 Markdown 报告。</p>
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
                问题合并、版本规划、需求草拟和测试设计。
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
                  <li>最后补齐测试用例生成和更完整的证据链校验结果。</li>
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

function describeCurrentSource(importSource: ImportSourcePayload | null): string {
  if (!importSource) {
    return "App Store";
  }

  if (importSource.type === "json-file") {
    return `JSON 文件${importSource.fileName ? ` · ${importSource.fileName}` : ""}`;
  }

  if (importSource.type === "csv-file") {
    return `CSV 文件${importSource.fileName ? ` · ${importSource.fileName}` : ""}`;
  }

  return "示例数据 · sample_data/reviews.json";
}

function hasRealtimeModelFailure(result: PipelineResult): boolean {
  if (result.isSampleOutput) {
    return false;
  }

  return [result.issueDiscovery?.status, result.productPlanning?.status, result.testGeneration?.status].some(
    (status) => status === "error"
  );
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

function VersionPlanningPanel({
  result,
  issueDiscovery
}: {
  result: NonNullable<PipelineResult["productPlanning"]>;
  issueDiscovery?: PipelineResult["issueDiscovery"];
}) {
  const issueById = new Map(issueDiscovery?.themes.map((theme) => [theme.issueId, theme]) ?? []);

  return (
    <div className="planning-panel">
      <ProductPlanningStatus result={result} />

      {result.status === "success" && result.versionPlans.length === 0 ? (
        <p className="empty-state">当前没有通过证据校验的版本规划。</p>
      ) : null}

      {result.versionPlans.length > 0 ? (
        <div className="plan-list">
          {result.versionPlans.map((plan) => (
            <article className="plan-card" key={plan.versionPlanId}>
              <div className="plan-head">
                <div>
                  <span className="issue-id">{plan.versionPlanId}</span>
                  <h4>{plan.versionName}</h4>
                </div>
                <span className={`tag severity-${plan.priority}`}>优先级：{translateLevel(plan.priority)}</span>
              </div>
              <p>{plan.objective}</p>
              <div className="planning-block">
                <h5>包含的问题</h5>
                <div className="tag-row">
                  {plan.includedIssueIds.map((issueId) => {
                    const issue = issueById.get(issueId);
                    return (
                      <span className="tag" key={issueId}>
                        {issueId}
                        {issue ? ` · ${issue.title}` : ""}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="planning-block">
                <h5>规划理由</h5>
                <p>{plan.rationale}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductRequirementsPanel({ result }: { result: NonNullable<PipelineResult["productPlanning"]> }) {
  return (
    <div className="planning-panel">
      <ProductPlanningStatus result={result} />

      {result.status === "success" && result.requirements.length === 0 ? (
        <p className="empty-state">证据不足，暂不生成需求。</p>
      ) : null}

      {result.requirements.length > 0 ? (
        <div className="requirement-list">
          {result.requirements.map((requirement) => (
            <article className="requirement-card" key={requirement.requirementId}>
              <div className="theme-head">
                <div>
                  <span className="issue-id">{requirement.requirementId}</span>
                  <h4>{requirement.title}</h4>
                </div>
                <span className={`tag severity-${requirement.priority}`}>优先级：{translateLevel(requirement.priority)}</span>
              </div>

              <div className="prd-grid">
                <div>
                  <h5>用户问题</h5>
                  <p>{requirement.userProblem}</p>
                </div>
                <div>
                  <h5>解决方案</h5>
                  <p>{requirement.proposedSolution}</p>
                </div>
                <div>
                  <h5>产品目标</h5>
                  <p>{requirement.productGoal}</p>
                </div>
                <div>
                  <h5>背景</h5>
                  <p>{requirement.background}</p>
                </div>
              </div>

              <div className="scope-grid">
                <ListBlock title="范围内" values={requirement.inScope} />
                <ListBlock title="非范围" values={requirement.outOfScope} />
              </div>

              <div className="scope-grid">
                <ListBlock title="验收标准" values={requirement.acceptanceCriteria} />
                <ListBlock title="风险" values={requirement.risks} emptyText="暂无明显风险。" />
              </div>

              <div className="planning-block">
                <h5>来源问题 ID</h5>
                <div className="tag-row">
                  {requirement.sourceIssueIds.map((issueId) => (
                    <span className="tag" key={issueId}>
                      {issueId}
                    </span>
                  ))}
                </div>
              </div>

              <div className="planning-block">
                <h5>追溯关系</h5>
                {requirement.traceability.map((trace) => (
                  <div className="trace-row" key={`${trace.requirementId}-${trace.issueId}-${trace.reviewId}`}>
                    <strong>评论 {trace.reviewId}</strong>
                    <span>→</span>
                    <strong>问题 {trace.issueId}</strong>
                    <span>→</span>
                    <strong>需求 {trace.requirementId}</strong>
                  </div>
                ))}
              </div>

              <div className="planning-block">
                <h5>来源评论原文</h5>
                <div className="review-list compact-review-list">
                  {requirement.sourceReviews.map((review) => (
                    <ReviewEvidenceBlock key={review.reviewId} review={review} />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProductPlanningStatus({ result }: { result: NonNullable<PipelineResult["productPlanning"]> }) {
  return (
    <>
      <div className="ai-meta-grid">
        <div>
          <span>实际模型</span>
          <strong>{result.model ?? "未配置"}</strong>
        </div>
        <div>
          <span>输入问题主题</span>
          <strong>{result.inputIssueCount}</strong>
        </div>
        <div>
          <span>版本规划</span>
          <strong>{result.versionPlans.length}</strong>
        </div>
        <div>
          <span>PRD 需求</span>
          <strong>{result.requirements.length}</strong>
        </div>
      </div>

      {result.status === "error" ? (
        <div className="error-box inline-error">
          <AlertCircle size={18} />
          <span>{result.error}</span>
        </div>
      ) : null}

      {result.status === "skipped" ? (
        <p className="source-line">{result.warnings[0] ?? "版本规划和 PRD 生成已跳过。"}</p>
      ) : null}

      {result.warnings.length > 0 && result.status !== "skipped" ? (
        <div className="warning-list">
          {result.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function TestGenerationPanel({ result }: { result: NonNullable<PipelineResult["testGeneration"]> }) {
  return (
    <div className="planning-panel">
      <div className="ai-meta-grid">
        <div>
          <span>实际模型</span>
          <strong>{result.model ?? "未配置"}</strong>
        </div>
        <div>
          <span>输入需求</span>
          <strong>{result.inputRequirementCount}</strong>
        </div>
        <div>
          <span>测试用例</span>
          <strong>{result.testCases.length}</strong>
        </div>
        <div>
          <span>生成状态</span>
          <strong>{translateStatus(result.status)}</strong>
        </div>
      </div>

      {result.status === "error" ? (
        <div className="error-box inline-error">
          <AlertCircle size={18} />
          <span>{result.error}</span>
        </div>
      ) : null}

      {result.status === "skipped" ? (
        <p className="source-line">{result.warnings[0] ?? "测试用例生成已跳过。"}</p>
      ) : null}

      {result.warnings.length > 0 && result.status !== "skipped" ? (
        <div className="warning-list">
          {result.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}

      {result.status === "success" && result.testCases.length === 0 ? (
        <p className="empty-state">没有通过证据校验的测试用例。</p>
      ) : null}

      {result.testCases.length > 0 ? (
        <div className="testcase-list">
          {result.testCases.map((testCase) => (
            <article className="testcase-card" key={testCase.testCaseId}>
              <div className="theme-head">
                <div>
                  <span className="issue-id">{testCase.testCaseId}</span>
                  <h4>{testCase.title}</h4>
                </div>
                <div className="tag-row compact-tags">
                  <span className={`tag severity-${testCase.priority}`}>优先级：{translateLevel(testCase.priority)}</span>
                  <span className="tag">{translateTestType(testCase.testType)}</span>
                  <span className="tag">需求 {testCase.requirementId}</span>
                </div>
              </div>

              <div className="scope-grid">
                <ListBlock title="前置条件" values={testCase.preconditions} emptyText="无特殊前置条件。" />
                <div className="list-block">
                  <h5>预期结果</h5>
                  <p>{testCase.expectedResult}</p>
                </div>
              </div>

              <ListBlock title="测试步骤" values={testCase.steps} />

              <div className="tag-row">
                {testCase.sourceIssueIds.map((issueId) => (
                  <span className="tag" key={issueId}>
                    {issueId}
                  </span>
                ))}
                {testCase.sourceReviewIds.map((reviewId) => (
                  <span className="tag" key={reviewId}>
                    {reviewId}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TraceabilityPanel({ result }: { result: NonNullable<PipelineResult["traceability"]> }) {
  return (
    <div className="planning-panel">
      <div className="trace-metrics">
        <div>
          <span>有效评论数量</span>
          <strong>{result.metrics.validReviewCount}</strong>
        </div>
        <div>
          <span>问题主题数量</span>
          <strong>{result.metrics.issueThemeCount}</strong>
        </div>
        <div>
          <span>产品需求数量</span>
          <strong>{result.metrics.requirementCount}</strong>
        </div>
        <div>
          <span>测试用例数量</span>
          <strong>{result.metrics.testCaseCount}</strong>
        </div>
        <div>
          <span>追溯完整率</span>
          <strong>{Math.round(result.metrics.traceabilityRate * 100)}%</strong>
        </div>
      </div>

      {result.warnings.length > 0 ? (
        <div className="warning-list">
          {result.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}

      {result.requirements.length > 0 ? (
        <div className="trace-list">
          {result.requirements.map((requirement) => (
            <details className="trace-card" key={requirement.requirementId} open>
              <summary>
                <span>
                  {requirement.requirementId} · {requirement.requirementTitle}
                </span>
                <strong>{requirement.isComplete ? "证据链完整" : "证据链不完整"}</strong>
              </summary>

              {requirement.warnings.length > 0 ? (
                <div className="warning-list compact-warning">
                  {requirement.warnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  ))}
                </div>
              ) : null}

              {requirement.paths.length > 0 ? (
                <div className="trace-path-list">
                  {requirement.paths.map((path) => (
                    <div
                      className="trace-path"
                      key={`${path.reviewId}-${path.issueId}-${path.requirementId}-${path.testCaseId}`}
                    >
                      <div className="trace-chain">
                        <strong>评论 {path.reviewId}</strong>
                        <span>→</span>
                        <strong>问题 {path.issueId}</strong>
                        <span>→</span>
                        <strong>需求 {path.requirementId}</strong>
                        <span>→</span>
                        <strong>测试用例 {path.testCaseId}</strong>
                      </div>
                      <p className="review-body">{path.reviewBody}</p>
                      <div className="review-meta">
                        <span>{path.issueTitle}</span>
                        <span>{path.testCaseTitle}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-state">当前需求没有完整的评论 → 问题 → 需求 → 测试用例映射。</p>
              )}
            </details>
          ))}
        </div>
      ) : (
        <p className="empty-state">暂无产品需求，因此没有可计算的完整追溯链。</p>
      )}
    </div>
  );
}

function ExportPanel({ onExport }: { onExport: (format: "json" | "markdown") => void }) {
  return (
    <div className="export-panel">
      <button className="secondary-action strong-action" type="button" onClick={() => onExport("json")}>
        <Download size={16} />
        导出 JSON 报告
      </button>
      <button className="secondary-action strong-action" type="button" onClick={() => onExport("markdown")}>
        <Download size={16} />
        导出 Markdown 报告
      </button>
      <p className="source-line">导出内容只来自当前页面结果，不包含 API Key 或环境变量。</p>
    </div>
  );
}

function ListBlock({
  title,
  values,
  emptyText = "暂无。"
}: {
  title: string;
  values: string[];
  emptyText?: string;
}) {
  return (
    <div className="list-block">
      <h5>{title}</h5>
      {values.length > 0 ? (
        <ul>
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">{emptyText}</p>
      )}
    </div>
  );
}

function ReviewEvidenceBlock({
  review
}: {
  review: {
    reviewId: string;
    rating: number;
    updatedAt: string;
    title: string;
    body: string;
  };
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

function translateStatus(status: "success" | "skipped" | "error"): string {
  const map = {
    success: "成功",
    skipped: "跳过",
    error: "异常"
  };

  return map[status];
}

function translateTestType(type: "functional" | "boundary" | "exception" | "usability"): string {
  const map = {
    functional: "正常流程",
    boundary: "边界场景",
    exception: "异常场景",
    usability: "易用性"
  };

  return map[type];
}
