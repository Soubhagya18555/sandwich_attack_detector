import type { SandwichPattern } from "../detector/pattern_matcher.js";
import type { RiskScore } from "../scoring/risk_scorer.js";
import type { VictimProfile } from "../profiler/victim_profiler.js";

export type AlertSeverity = "info" | "warning" | "critical";

export interface SandwichAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  pattern: SandwichPattern;
  risk: RiskScore;
  victimProfile: VictimProfile | null;
  timestamp: number;
  slot: number;
}

export interface AlertSink {
  name: string;
  emit(alert: SandwichAlert): void | Promise<void>;
}

export interface AlertConfig {
  minSeverity: AlertSeverity;
  minRiskScore: number;
  minVictimLoss: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  minSeverity: "warning",
  minRiskScore: 50,
  minVictimLoss: 100,
};

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export class ConsoleAlertSink implements AlertSink {
  name = "console";

  emit(alert: SandwichAlert): void {
    const prefix = `[${alert.severity.toUpperCase()}]`;
    console.log(`${prefix} ${alert.title}`);
    console.log(`  ${alert.message}`);
    console.log(`  Risk: ${alert.risk.overall} (${alert.risk.label})`);
    if (alert.victimProfile) {
      console.log(`  Victim: ${alert.victimProfile.address.slice(0, 12)}... (${alert.victimProfile.label})`);
    }
  }
}

export class CollectingAlertSink implements AlertSink {
  name = "collector";
  alerts: SandwichAlert[] = [];

  emit(alert: SandwichAlert): void {
    this.alerts.push(alert);
  }

  clear(): void {
    this.alerts = [];
  }
}

let alertCounter = 0;

function nextAlertId(): string {
  alertCounter += 1;
  return `alert_${alertCounter}`;
}

export function createAlert(
  pattern: SandwichPattern,
  risk: RiskScore,
  victimProfile: VictimProfile | null,
  slot: number,
): SandwichAlert {
  const severity: AlertSeverity =
    risk.label === "critical" ? "critical" : risk.label === "high" ? "warning" : "info";

  return {
    id: nextAlertId(),
    severity,
    title: `Sandwich attack detected on pool ${pattern.poolId.slice(0, 8)}...`,
    message: `Victim swap ${pattern.victim.amountIn} with est. loss ${pattern.estimatedVictimLoss.toFixed(2)}, attacker profit ${pattern.estimatedAttackerProfit.toFixed(2)}`,
    pattern,
    risk,
    victimProfile,
    timestamp: Date.now(),
    slot,
  };
}

export function filterAlerts(alerts: SandwichAlert[], config: AlertConfig = DEFAULT_ALERT_CONFIG): SandwichAlert[] {
  const minLevel = SEVERITY_ORDER[config.minSeverity];
  return alerts.filter(
    (a) =>
      SEVERITY_ORDER[a.severity] >= minLevel &&
      a.risk.overall >= config.minRiskScore &&
      a.pattern.estimatedVictimLoss >= config.minVictimLoss,
  );
}

export async function dispatchAlerts(alerts: SandwichAlert[], sinks: AlertSink[]): Promise<void> {
  for (const alert of alerts) {
    for (const sink of sinks) {
      await sink.emit(alert);
    }
  }
}

export function formatAlertJson(alert: SandwichAlert): string {
  return JSON.stringify(
    {
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      risk: alert.risk,
      poolId: alert.pattern.poolId,
      victimAmount: alert.pattern.victim.amountIn,
      estimatedLoss: alert.pattern.estimatedVictimLoss,
      estimatedProfit: alert.pattern.estimatedAttackerProfit,
      slot: alert.slot,
      timestamp: alert.timestamp,
    },
    null,
    2,
  );
}

export function summarizeAlerts(alerts: SandwichAlert[]): {
  total: number;
  critical: number;
  warning: number;
  info: number;
  totalEstimatedLoss: number;
} {
  let critical = 0;
  let warning = 0;
  let info = 0;
  let totalLoss = 0;

  for (const a of alerts) {
    if (a.severity === "critical") critical++;
    else if (a.severity === "warning") warning++;
    else info++;
    totalLoss += a.pattern.estimatedVictimLoss;
  }

  return { total: alerts.length, critical, warning, info, totalEstimatedLoss: totalLoss };
}
