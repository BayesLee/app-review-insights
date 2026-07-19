"use client";

import {
  Activity,
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

const stages = [
  {
    title: "分析范围规划",
    detail: "解析 App 链接，并将分析目标转化为可执行的数据范围。",
    icon: Network
  },
  {
    title: "评论采集",
    detail: "获取美国区 App Store 评论，并保留原始证据用于追溯。",
    icon: Activity
  },
  {
    title: "清洗去重",
    detail: "统一字段、去除重复数据，并保留确定性统计结果。",
    icon: Layers3
  },
  {
    title: "模型分析",
    detail: "动态发现主题、合并相似问题，并标记不确定性。",
    icon: Sparkles
  },
  {
    title: "PRD 与版本规划",
    detail: "将有证据支撑的洞察转化为需求、优先级和验收标准。",
    icon: FileText
  },
  {
    title: "测试用例设计",
    detail: "生成与需求和源评论相互关联的测试用例。",
    icon: FlaskConical
  },
  {
    title: "证据链校验",
    detail: "移除无证据结论，或将其明确标记为假设。",
    icon: ShieldCheck
  }
];

export default function Home() {
  return (
    <main className="shell">
      <div className="workspace">
        <aside className="sidebar">
          <div className="brand">
            <h1>App 评论洞察 Agent</h1>
            <p>把真实用户评论转化为可追溯的产品洞察、版本计划、PRD 和测试用例。</p>
          </div>

          <form className="form">
            <div className="field">
              <label htmlFor="appUrl">美国区 App Store 链接</label>
              <input
                id="appUrl"
                className="input"
                defaultValue="https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684"
              />
            </div>

            <div className="field">
              <label htmlFor="goal">分析目标</label>
              <textarea
                id="goal"
                className="textarea"
                defaultValue="重点分析低评分评论中的订阅转化阻力、训练体验问题和用户流失风险。"
              />
            </div>

            <button className="primary" type="button">
              开始分析
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="pipeline">
            <h2>执行流程</h2>
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <div className="stage" key={stage.title}>
                  <div className="stage-icon">
                    {index === 0 ? <Loader2 size={15} /> : <Icon size={15} />}
                  </div>
                  <div>
                    <strong>{stage.title}</strong>
                    <span>{stage.detail}</span>
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
                  当前已完成本地应用骨架，下一步接入评论采集、JSON/CSV 导入、模型分析、
                  PRD 生成和证据链校验。
                </p>
              </div>
              <div className="badge">
                <CheckCircle2 size={15} />
                本地骨架已就绪
              </div>
            </div>

            <div className="metric-grid">
              <div className="metric">
                <span>原始评论</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>清洗后评论</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>核心洞察</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>证据链</span>
                <strong>待运行</strong>
              </div>
            </div>
          </div>

          <div className="result-grid">
            <article className="result-panel">
              <h3>过程产物</h3>
              <ul>
                <li>带来源信息的原始评论表。</li>
                <li>包含重复、空值和异常数据统计的清洗报告。</li>
                <li>基于评论证据生成的动态问题聚类。</li>
              </ul>
            </article>

            <article className="result-panel">
              <h3>最终产物</h3>
              <ul>
                <li>按优先级、置信度和实现范围拆分的版本计划。</li>
                <li>包含验收标准的 PRD 需求清单。</li>
                <li>可追溯到需求和源评论的测试用例。</li>
              </ul>
            </article>

            <article className="result-panel">
              <h3>Agent 策略</h3>
              <p>
                确定性代码负责采集、字段归一、去重、统计和校验；模型负责主题发现、
                问题合并、需求草拟和测试用例生成。
              </p>
            </article>

            <article className="result-panel">
              <h3>证据链校验</h3>
              <div className="trace-row">
                <span>洞察证据</span>
                <strong>待运行</strong>
              </div>
              <div className="trace-row">
                <span>需求覆盖</span>
                <strong>待运行</strong>
              </div>
              <div className="trace-row">
                <span>测试关联</span>
                <strong>待运行</strong>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
