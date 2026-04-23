/** Source unique de vérité pour les capacités par plan (UI gating). */
export type Tier = "free" | "pro" | "business";

export const PLAN_CAPS: Record<Tier, {
  maxCommunes: number;
  forecastDays: number;
  historyDays: number;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  apiAccess: boolean;
}> = {
  free:     { maxCommunes: 1,   forecastDays: 0,  historyDays: 7,    smsEnabled: false, whatsappEnabled: false, apiAccess: false },
  pro:      { maxCommunes: 5,   forecastDays: 14, historyDays: 365,  smsEnabled: true,  whatsappEnabled: true,  apiAccess: false },
  business: { maxCommunes: 100, forecastDays: 14, historyDays: 1825, smsEnabled: true,  whatsappEnabled: true,  apiAccess: true  },
};

export function canSeeForecasts(tier: Tier): boolean {
  return PLAN_CAPS[tier].forecastDays > 0;
}