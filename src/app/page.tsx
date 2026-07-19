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
    title: "Scope planning",
    detail: "Parse the app link and convert the analysis goal into a constrained review scope.",
    icon: Network
  },
  {
    title: "Review collection",
    detail: "Fetch U.S. App Store review pages and preserve raw evidence for audit.",
    icon: Activity
  },
  {
    title: "Cleaning",
    detail: "Normalize fields, remove duplicates, and keep deterministic statistics separate.",
    icon: Layers3
  },
  {
    title: "Model analysis",
    detail: "Discover dynamic topics, consolidate issues, and mark uncertainty.",
    icon: Sparkles
  },
  {
    title: "PRD planning",
    detail: "Turn grounded findings into versioned requirements and acceptance criteria.",
    icon: FileText
  },
  {
    title: "Test design",
    detail: "Generate requirement-linked test cases with source review references.",
    icon: FlaskConical
  },
  {
    title: "Traceability audit",
    detail: "Reject unsupported conclusions or label them as assumptions.",
    icon: ShieldCheck
  }
];

export default function Home() {
  return (
    <main className="shell">
      <div className="workspace">
        <aside className="sidebar">
          <div className="brand">
            <h1>App Review Insight Agent</h1>
            <p>Convert real App Store reviews into evidence-backed product plans, PRDs, and test cases.</p>
          </div>

          <form className="form">
            <div className="field">
              <label htmlFor="appUrl">U.S. App Store link</label>
              <input
                id="appUrl"
                className="input"
                defaultValue="https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684"
              />
            </div>

            <div className="field">
              <label htmlFor="goal">Analysis goal</label>
              <textarea
                id="goal"
                className="textarea"
                defaultValue="Focus on low-rating reviews, subscription conversion friction, and workout usability problems."
              />
            </div>

            <button className="primary" type="button">
              Start analysis
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="pipeline">
            <h2>Workflow</h2>
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
                <h2>Review-to-roadmap workspace</h2>
                <p>
                  This scaffold is ready for the homework implementation: online review collection,
                  JSON/CSV import, model-driven analysis, PRD generation, and traceability validation.
                </p>
              </div>
              <div className="badge">
                <CheckCircle2 size={15} />
                Local demo shell
              </div>
            </div>

            <div className="metric-grid">
              <div className="metric">
                <span>Raw reviews</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>Cleaned reviews</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>Findings</span>
                <strong>0</strong>
              </div>
              <div className="metric">
                <span>Traceability</span>
                <strong>Ready</strong>
              </div>
            </div>
          </div>

          <div className="result-grid">
            <article className="result-panel">
              <h3>Interim deliverables</h3>
              <ul>
                <li>Raw review table with App Store source metadata.</li>
                <li>Cleaning report with duplicate, empty, and malformed review counts.</li>
                <li>Dynamic issue clusters generated from review evidence.</li>
              </ul>
            </article>

            <article className="result-panel">
              <h3>Final deliverables</h3>
              <ul>
                <li>Version plan split by priority, confidence, and implementation scope.</li>
                <li>PRD requirements with review-backed acceptance criteria.</li>
                <li>Test cases linked to requirements and source reviews.</li>
              </ul>
            </article>

            <article className="result-panel">
              <h3>Agent strategy</h3>
              <p>
                Deterministic code handles collection, normalization, validation, and metrics. Model
                calls handle topic discovery, issue consolidation, requirement drafting, and test design.
              </p>
            </article>

            <article className="result-panel">
              <h3>Traceability audit</h3>
              <div className="trace-row">
                <span>Finding evidence</span>
                <strong>Pending</strong>
              </div>
              <div className="trace-row">
                <span>Requirement coverage</span>
                <strong>Pending</strong>
              </div>
              <div className="trace-row">
                <span>Test case links</span>
                <strong>Pending</strong>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
