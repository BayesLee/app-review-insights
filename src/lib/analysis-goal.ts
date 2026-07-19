export const DEFAULT_ANALYSIS_GOAL =
  "识别低评分评论中的主要用户问题，并结合高评分评论检查冲突反馈。";

export const QUICK_ANALYSIS_GOALS = [
  {
    label: "综合问题分析",
    value: DEFAULT_ANALYSIS_GOAL
  },
  {
    label: "订阅与付费",
    value: "重点分析订阅、付费、试用、扣费和付费墙相关的用户问题。"
  },
  {
    label: "稳定性与性能",
    value: "重点分析崩溃、卡顿、加载失败、登录异常和训练过程中断等稳定性与性能问题。"
  },
  {
    label: "功能需求",
    value: "分析用户最希望新增或改进的功能，并区分真实需求和单点偏好。"
  }
] as const;

export function resolveAnalysisGoal(goal?: string | null): string {
  const normalizedGoal = goal?.trim();

  return normalizedGoal || DEFAULT_ANALYSIS_GOAL;
}
