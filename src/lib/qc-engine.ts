import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { QcRule } from "@/db/schema";

export interface QcInput {
  expectedQuantity: number;
  actualQuantity: number;
  damageLevel?: number;
  specDeviation?: number;
  labelMismatch?: boolean;
  batchInvalid?: boolean;
}

export interface QcResult {
  pass: boolean;
  hitRule: QcRule | null;
  reason: string;
  subType: string | null;
  severity: string | null;
}

export async function evaluateQc(input: QcInput): Promise<QcResult> {
  const db = getDb();
  const rules = await db.query.qcRules.findMany({
    where: eq(schema.qcRules.enabled, true),
  });

  rules.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return (
      (severityOrder[b.severity as keyof typeof severityOrder] || 0) -
      (severityOrder[a.severity as keyof typeof severityOrder] || 0)
    );
  });

  for (const rule of rules) {
    const hit = checkRule(rule, input);
    if (hit) {
      return {
        pass: false,
        hitRule: rule,
        reason: hit,
        subType: rule.subType,
        severity: rule.severity,
      };
    }
  }

  return { pass: true, hitRule: null, reason: "品控检测通过", subType: null, severity: null };
}

function checkRule(rule: QcRule, input: QcInput): string | null {
  switch (rule.conditionType) {
    case "quantity_diff_pct": {
      if (input.expectedQuantity <= 0) return null;
      const diffPct =
        (Math.abs(input.actualQuantity - input.expectedQuantity) / input.expectedQuantity) * 100;
      if (diffPct >= rule.threshold) {
        return `数量差异 ${diffPct.toFixed(1)}% 超过阈值 ${rule.threshold}%`;
      }
      return null;
    }
    case "damage_level": {
      if ((input.damageLevel || 0) >= rule.threshold) {
        return `破损等级 ${input.damageLevel} 达到阈值 ${rule.threshold}`;
      }
      return null;
    }
    case "spec_deviation": {
      if ((input.specDeviation || 0) >= rule.threshold) {
        return `规格偏差 ${input.specDeviation}% 超过阈值 ${rule.threshold}%`;
      }
      return null;
    }
    case "label_mismatch": {
      if (input.labelMismatch && rule.threshold >= 1) {
        return "标签信息与系统记录不匹配";
      }
      return null;
    }
    case "batch_invalid": {
      if (input.batchInvalid && rule.threshold >= 1) {
        return "批次号校验失败";
      }
      return null;
    }
    default:
      return null;
  }
}
