/** Source unique de vérité pour les capacités par plan (UI gating). */
export type Tier = "free" | "pro" | "business";

export const PLAN_CAPS: Record<Tier, {
  maxCommunes: number;
  forecastDays: number;
  historyDays: number;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  preventiveNotifications: boolean;
  apiAccess: boolean;
}> = {
  free:     { maxCommunes: 1,   forecastDays: 0,  historyDays: 7,    smsEnabled: false, whatsappEnabled: false, preventiveNotifications: false, apiAccess: false },
  pro:      { maxCommunes: 5,   forecastDays: 14, historyDays: 365,  smsEnabled: true,  whatsappEnabled: true,  preventiveNotifications: true,  apiAccess: false },
  business: { maxCommunes: 100, forecastDays: 14, historyDays: 1825, smsEnabled: true,  whatsappEnabled: true,  preventiveNotifications: true,  apiAccess: true  },
};

export function canSeeForecasts(tier: Tier): boolean {
  return PLAN_CAPS[tier].forecastDays > 0;
}

/** Liste les features verrouillées pour un plan donné, prêtes à l'affichage UI. */
export function lockedFeaturesFor(tier: Tier): Array<{ key: string; label: string; requires: Tier }> {
  const locked: Array<{ key: string; label: string; requires: Tier }> = [];
  if (!PLAN_CAPS[tier].smsEnabled) locked.push({ key: "sms", label: "Alertes SMS", requires: "pro" });
  if (!PLAN_CAPS[tier].whatsappEnabled) locked.push({ key: "whatsapp", label: "Alertes WhatsApp", requires: "pro" });
  if (!PLAN_CAPS[tier].preventiveNotifications) locked.push({ key: "preventive", label: "Notifications préventives", requires: "pro" });
  if (PLAN_CAPS[tier].forecastDays === 0) locked.push({ key: "forecasts", label: "Prévisions à 14 jours", requires: "pro" });
  if (!PLAN_CAPS[tier].apiAccess) locked.push({ key: "api", label: "Accès API B2B", requires: "business" });
  return locked;
}