# LaienTech iOS App Review Analysis and Version Planning Assessment

## Local Development

This project is implemented as a local Next.js + TypeScript web application.

On this machine, a portable Node.js runtime is available at:

```text
D:\A项目\Laien\.tools\node
```

Recommended workflow with Codex:

```powershell
cd D:\A项目\Laien\app-review-insights-main
$env:PATH = "D:\A项目\Laien\.tools\node;$env:PATH"
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:3000
```

Environment variables should be copied from `.env.example` into `.env.local`.
Do not commit API keys or other secrets.

Example `.env.local`:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-4o-mini
MAX_REVIEW_PAGES=4
```

`OPENAI_BASE_URL` is optional. Set it only when using an OpenAI-compatible provider or proxy.

## Current Implementation

- The UI can submit an App Store link and analysis goal to `/api/analyze`.
- The analysis goal supports free-form input, an empty-input default, and quick goal buttons.
- The backend parses the app id, requests U.S. storefront review rows, normalizes reviews, removes empty/malformed/duplicate items, and returns basic metrics.
- The UI displays collection status, cleaned counts, rating distribution, low-rating ratio, data-source limitations, and low-rating review samples.
- The backend performs model-driven issue discovery on cleaned reviews when `OPENAI_API_KEY` is configured.
- The UI clearly separates deterministic statistics from AI model analysis results.

## Data Collection Method

The current collector uses Apple's public iTunes `userReviewsRow` JSON endpoint with the U.S. storefront header:

```text
x-apple-store-front: 143441-1,29
```

Each request fetches a 50-review page sorted by most recent reviews. The implementation caps online collection to at most 10 pages to avoid abnormal request volume.

Known limitation: this stable endpoint does not return the app version for each review, so version-level analysis is currently marked as a data limitation instead of being inferred or fabricated. A later step should add cached sample data and JSON/CSV import so reviewers can evaluate the app when Apple's external endpoint is unavailable.

## Analysis Goal Control

The analysis goal input controls the model's semantic scope. If the user leaves it empty, the backend uses:

```text
识别低评分评论中的主要用户问题，并结合高评分评论检查冲突反馈。
```

The UI provides quick goal buttons:

- 综合问题分析
- 订阅与付费
- 稳定性与性能
- 功能需求

The resolved goal is returned in the response as `scope.goal` and shown in the result area as "本次分析目标".

The goal is inserted into the model prompt in two places: as a visible instruction line and as the `analysisGoal` field in the JSON input payload. The prompt explicitly says the model must stay within the user's goal, but must not invent a theme when the current review evidence does not support that goal.

## AI Issue Discovery

The current AI step only discovers user problem themes. It does not generate PRDs or test cases yet.

Workflow:

1. The server assigns stable run-local review ids such as `R-001`, `R-002`, and `R-003` to all cleaned reviews.
2. The server sends all 1-2 star reviews to the model as issue evidence.
3. The server also sends at most 20 recent 4-5 star reviews as conflict candidates.
4. The prompt asks the model to dynamically create theme titles from the current review set. The implementation does not use fixed keyword maps or a predefined issue taxonomy as the core classifier.
5. The model must return strict JSON:

```json
{
  "themes": [
    {
      "issueId": "F-001",
      "title": "问题标题",
      "summary": "问题总结",
      "severity": "high",
      "confidence": "high",
      "supportingReviewIds": ["R-001"],
      "conflictingReviewIds": ["R-010"]
    }
  ]
}
```

Hallucination controls:

- Model output is parsed as JSON and rejected if it is invalid.
- `supportingReviewIds` must match valid 1-2 star review ids from the current cleaned dataset.
- `conflictingReviewIds` must match valid selected 4-5 star review ids from the current cleaned dataset.
- Any fabricated review id is removed before display.
- `supportCount` is computed by code after validation, never trusted from the model.
- Themes with no valid supporting reviews are removed.
- Missing API keys, model API failures, invalid JSON, and skipped low-rating analysis are shown in the UI instead of fabricating results.

## Background

This assessment uses the following real iOS app as the primary development and demonstration example:

https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684

If you have access to an overseas network environment, use the U.S. App Store link above. If not, and the U.S. link cannot be opened or redirects, use the China App Store link only to open the app detail page:

https://apps.apple.com/cn/app/workout-for-women-home-gym/id839285684

Regardless of which link is used to open the page, the review data used in this assessment must come from the U.S. App Store storefront.

You are expected to complete a full product analysis workflow around App Store user reviews, covering data collection, review cleaning, review classification, issue analysis, version planning, PRD writing, and test case design. The final results should be presented through a runnable UI.

This assessment focuses on the candidate's vibe coding ability. Candidates should use vibe coding to complete the full process: collecting data, cleaning and analyzing reviews, abstracting product requirements, planning versions, designing test cases, and productizing the analysis workflow into an interactive experience.

## Objective

Build a runnable tool or web application. In the UI, the user should be able to enter a valid U.S. App Store app link. Use the following link as the primary example:

```text
https://apps.apple.com/us/app/workout-for-women-home-gym/id839285684
```

The user should also be able to provide an analysis goal or constraint, such as focusing on subscription conversion, workout usability, a specific app version, or low-rating reviews. The system must not depend on app-specific hard-coded categories, findings, requirements, or test cases.

After the user clicks "Start", the system should automatically complete the following workflow and display the results in the UI:

1. Determine the analysis scope based on the user's goal and the available data.
2. Collect review data for the app.
3. Clean, deduplicate, and structure the review data.
4. Dynamically classify and analyze the reviews, rather than relying only on fixed keyword mappings or a predefined issue taxonomy.
5. Evaluate whether the available evidence is sufficient, and identify conflicting feedback, uncertainty, and data limitations.
6. Create an update plan based on the analysis, produce a PRD, and split the scope into multiple versions when necessary.
7. Generate test cases based on the PRD, with each test case linked to its requirement and source user reviews.
8. Validate the traceability chain from reviews to findings, requirements, and test cases. Unsupported conclusions must be removed, revised, or explicitly marked as assumptions.
9. Display the execution progress in the UI, including the stages, intermediate results, validation results, errors, and revisions.
10. Display the interim and final deliverables, including raw reviews, cleaned data, classification results, findings, PRD drafts, and test case drafts.

## AI Requirements

- At least one core semantic task must be model-driven. Suitable tasks include dynamic topic discovery, issue consolidation, evidence-grounded analysis, requirement generation, or test case generation. Implementing all semantic analysis only through fixed keywords, regular expressions, lookup tables, or manually predefined mappings does not meet this requirement.
- Deterministic rules are encouraged where they are appropriate, including data collection, deduplication, field normalization, validation, and safety checks. The submission should explain why rules, statistical methods, or language models were chosen for each stage.
- Every major finding must include its source review IDs or excerpts, supporting sample count, confidence or uncertainty, and any material conflicting evidence. Model-generated conclusions must remain distinguishable from deterministic statistics.
- The submission must document the model and provider used, the main prompts or tool definitions, model configuration, failure-handling strategy, and measures used to reduce hallucinations and unsupported conclusions.
- Hosted APIs, local models, or other model runtimes may be used. Secrets must be supplied through environment configuration and must not be committed to the repository.

## Deliverables

Submit a GitHub project link and ensure the project can run locally.

The GitHub project should include complete source code, dependency configuration, running instructions, an explanation of the data collection method, and any necessary sample output or cached data so that interviewers can review the results even when external network access is unavailable. Cached results must be clearly labeled and must not replace the ability to process a previously unseen input when the required network and model configuration are available.

The application must also support importing review data from a documented JSON or CSV format. During evaluation, interviewers may provide a different valid App Store link, a previously unseen compatible review dataset, or a new analysis goal. The submission will be evaluated on whether it can produce grounded results without app-specific hard coding.

The GitHub project should preserve a complete commit history to show the candidate's implementation process, iteration process, and use of vibe coding.

## Technical Requirements and Notes

- There is no restriction on the tech stack.
- You may use frontend frameworks, backend frameworks, data analysis libraries, visualization libraries, natural language processing models, or large language model APIs.
- You may use public APIs or third-party data collection libraries, but you must clearly explain the data source and its limitations.
- Pay attention to request rate limits and avoid placing abnormal load on the target site.
- Provide a sample environment file or equivalent configuration instructions, but do not include API keys or other secrets.
- A non-runnable document-only submission is not acceptable.

## Evaluation Criteria

This assessment focuses on whether the candidate can turn real user reviews into an executable product plan. The evaluation will mainly consider:

- Whether the data is authentic and reproducible, with a clear explanation of its source and limitations.
- Whether review cleaning, classification, and analysis are reasonable, and whether they surface concrete user problems.
- Whether model-driven semantic analysis adds capability beyond fixed rules and generalizes to previously unseen reviews, apps, and analysis goals.
- Whether findings distinguish evidence, deterministic statistics, model-generated conclusions, uncertainty, and conflicting feedback.
- Whether the PRD is grounded in user problems, with clear requirement boundaries, priorities, and version planning.
- Whether the test cases cover the PRD and can be traced back to the corresponding user reviews.
- Whether the UI clearly presents the workflow and results, and whether the project can run locally with clear delivery instructions.

## Important Notes

- This is not merely a web scraping task, nor is it merely a UI presentation task.
- The core challenge is to identify problems from real user reviews and turn them into executable product requirements and test plans.
- Review data should not be collected by scraping only the visible content of the page. There are more appropriate ways to retrieve App Store review data; candidates are expected to explore them independently and explain their implementation.
- Requirements in the PRD must be traceable to specific user reviews.
- Test cases must be able to verify whether the corresponding requirements solve the problems raised in those reviews.
- The use of an AI coding assistant during implementation does not by itself satisfy the AI requirements. The submitted application must demonstrate model-driven semantic analysis at runtime.
- Interviewers may test the application with previously unseen data, mixed languages, duplicate or conflicting reviews, insufficient evidence, or temporary collection/model failures.
- If the amount of available data is limited or data collection is constrained, state this transparently in the results. Do not fabricate data.
