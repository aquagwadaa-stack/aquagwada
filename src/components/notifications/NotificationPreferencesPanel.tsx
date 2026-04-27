import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, Mail, Lock, Clock, History, Droplet, DropletOff, Smartphone, CheckCircle2, AlertTriangle, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { PLAN_CAPS, type Tier } from "@/lib/subscription";
import { InstallAndPushDialog } from "@/components/notifications/InstallAndPushDialog";
import { getActivePushSubscription, getNotificationPermission, isPreviewContext, isPushSupported } from "@/lib/push-notifications";

type Prefs = {
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  notify_outage_start: boolean;
  notify_water_back: boolean;
  notify_preventive: boolean;
  notify_preventive_water_back: boolean;
  preventive_hours_before: number;
  preventive_water_back_hours_before: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

type NotificationLogRow = {
  id: string;
  channel: string;
  kind: string;
  sent_at: string;
  dry_run: boolean;
  payload: { note?: string } | null;
};

const DEFAULT_PREFS: Prefs = {
  push_enabled: true,
  email_enabled: false,
  sms_enabled: false,
  whatsapp_enabled: false,
  notify_outage_start: true,
  notify_water_back: true,
  notify_preventive: true,
  notify_preventive_water_back: false,
  preventive_hours_before: 24,
  preventive_water_back_hours_before: 1,
  quiet_hours_start: null,
  quiet_hours_end: null,
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function shallowEqualPrefs(a: Prefs, b: Prefs): boolean {
  return (Object.keys(a) as (keyof Prefs)[]).every((key) => a[key] === b[key]);
}

export function NotificationPreferencesPanel({ tier }: { tier: Tier }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const caps = PLAN_CAPS[tier];
  const [installed, setInstalled] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [draft, setDraft] = useState<Prefs>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    if (isPushSupported() && !isPreviewContext()) {
      getActivePushSubscription().then(async (sub) => {
        setPushSubscribed(!!sub);
        setPushPermission(await getNotificationPermission());
      });
    }
  }, [installDialogOpen]);

  const prefsQuery = useQuery({
    queryKey: ["notification_preferences", user!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Prefs | null;
    },
  });

  useEffect(() => {
    if (prefsQuery.data) {
      const merged = { ...DEFAULT_PREFS, ...prefsQuery.data };
      setSavedPrefs(merged);
      setDraft(merged);
    }
  }, [prefsQuery.data]);

  const isDirty = useMemo(() => !shallowEqualPrefs(draft, savedPrefs), [draft, savedPrefs]);

  function patch(p: Partial<Prefs>) {
    setDraft((current) => ({ ...current, ...p }));
  }

  async function persist(): Promise<boolean> {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: user!.id, ...draft }, { onConflict: "user_id" });
      if (error) {
        toast.error("Erreur enregistrement : " + error.message);
        return false;
      }
      setSavedPrefs(draft);
      qc.invalidateQueries({ queryKey: ["notification_preferences", user!.id] });
      toast.success("Preferences enregistrees");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function onClickSave() {
    const wantsPush = draft.push_enabled
      && (draft.notify_outage_start || draft.notify_water_back || draft.notify_preventive || draft.notify_preventive_water_back);
    const needsInstallFlow = wantsPush
      && !isPreviewContext()
      && (!installed || !pushSubscribed)
      && pushPermission !== "denied";

    if (needsInstallFlow) {
      setInstallDialogOpen(true);
      return;
    }
    await persist();
  }

  const logs = useQuery({
    queryKey: ["notification_logs", user!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_logs")
        .select("id, channel, kind, sent_at, dry_run, payload")
        .eq("user_id", user!.id)
        .order("sent_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as NotificationLogRow[];
    },
    staleTime: 30_000,
  });

  const status = (() => {
    if (isPreviewContext()) return { variant: "info" as const, icon: Sparkles, text: "Apercu Lovable - push activable sur le site publie" };
    if (!isPushSupported()) return { variant: "warn" as const, icon: AlertTriangle, text: "Notifications push non supportees sur cet appareil" };
    if (pushPermission === "denied") return { variant: "warn" as const, icon: AlertTriangle, text: "Notifications bloquees dans le navigateur" };
    if (installed && pushSubscribed) return { variant: "ok" as const, icon: CheckCircle2, text: "App installee + notifications push actives" };
    if (installed && !pushSubscribed) return { variant: "warn" as const, icon: Bell, text: "App installee - active les notifications push" };
    return { variant: "info" as const, icon: Smartphone, text: "Installe AquaGwada + active les push pour les alertes instantanees" };
  })();
  const statusColor = status.variant === "ok" ? "bg-success/10 border-success/40 text-success-foreground"
    : status.variant === "warn" ? "bg-warning/10 border-warning/40 text-warning-foreground"
      : "bg-primary/5 border-primary/30 text-primary";

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold">Notifications</h2>
        </div>
        {!installed && !isPreviewContext() && (
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setInstallDialogOpen(true)}>
            <Smartphone className="h-3.5 w-3.5" /> Installer l'app
          </Button>
        )}
      </div>

      <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2 text-xs ${statusColor}`}>
        <status.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{status.text}</span>
      </div>

      <NotifMatrix
        prefs={draft}
        preventiveEnabled={caps.preventiveNotifications}
        pushBlocked={pushPermission === "denied"}
        update={patch}
      />

      {caps.preventiveNotifications && (draft.notify_preventive || draft.notify_preventive_water_back) && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
          {draft.notify_preventive && (
            <DelayPicker
              icon={DropletOff}
              title="Delai avant une coupure"
              value={draft.preventive_hours_before}
              options={[1, 2, 3, 6, 12, 24, 48]}
              onChange={(h) => patch({ preventive_hours_before: h })}
              suffix="h avant"
              hint={`Vous serez prevenu(e) ${draft.preventive_hours_before}h avant chaque coupure programmee.`}
            />
          )}
          {draft.notify_preventive_water_back && (
            <DelayPicker
              icon={Droplet}
              title="Delai avant le retour de l'eau"
              value={draft.preventive_water_back_hours_before}
              options={[1, 2, 3, 6]}
              onChange={(h) => patch({ preventive_water_back_hours_before: h })}
              suffix="h avant"
              hint={`Vous serez prevenu(e) ${draft.preventive_water_back_hours_before}h avant le retour estime.`}
            />
          )}
        </div>
      )}

      <div className="sticky bottom-2 -mx-1 px-1 pt-2 z-10">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2.5 shadow-md">
          <p className="text-xs text-muted-foreground">{isDirty ? "Modifications non enregistrees" : "Tout est a jour"}</p>
          <Button size="sm" onClick={onClickSave} disabled={!isDirty || saving} className="gap-1.5 bg-gradient-ocean text-primary-foreground">
            <Save className="h-3.5 w-3.5" /> {saving ? "Enregistrement..." : "Sauvegarder"}
          </Button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <History className="h-3 w-3" /> Dernieres notifications
        </p>
        {logs.isLoading ? (
          <p className="text-xs text-muted-foreground">Chargement...</p>
        ) : (logs.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-3">
            Aucune notification declenchee pour l'instant. Vos preferences seront appliquees des la prochaine coupure pertinente.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(logs.data ?? []).map((log) => (
              <li key={log.id} className="rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">{log.channel}</span>
                    <span className="truncate text-foreground/80">{log.kind}</span>
                    {log.dry_run && <span className="rounded bg-warning/15 border border-warning/40 px-1 py-0.5 text-[9px] font-medium">non envoye</span>}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {new Date(log.sent_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {log.payload?.note && (
                  <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{log.payload.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <InstallAndPushDialog open={installDialogOpen} onOpenChange={setInstallDialogOpen} onContinue={() => { void persist(); }} />
    </section>
  );
}

function NotifMatrix({ prefs, preventiveEnabled, pushBlocked, update }: {
  prefs: Prefs;
  preventiveEnabled: boolean;
  pushBlocked: boolean;
  update: (patch: Partial<Prefs>) => void;
}) {
  const events = [
    { key: "notify_outage_start" as const, label: "Debut de coupure", icon: DropletOff, locked: false, desc: "Au moment ou l'eau est coupee." },
    { key: "notify_water_back" as const, label: "Retour de l'eau", icon: Droplet, locked: false, desc: "Quand l'eau revient." },
    { key: "notify_preventive" as const, label: "Preventif avant coupure", icon: Clock, locked: !preventiveEnabled, desc: "Pour anticiper les coupures programmees." },
    { key: "notify_preventive_water_back" as const, label: "Preventif avant retour", icon: Clock, locked: !preventiveEnabled, desc: "Avant le retour estime de l'eau." },
  ];
  const channels = [
    { key: "push_enabled" as const, label: "Push", icon: Bell, locked: pushBlocked, badge: "instantane" },
    { key: "email_enabled" as const, label: "Email", icon: Mail, locked: false, badge: "Resend" },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Choisis quoi recevoir, et comment</p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs min-w-[440px]">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Evenement</th>
              {channels.map((channel) => (
                <th key={channel.key} className="px-2 py-2 font-medium text-center w-[80px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <channel.icon className="h-3.5 w-3.5 text-primary" />
                    <span>{channel.label}</span>
                    <span className="text-[9px] text-muted-foreground">{channel.locked ? "bloque" : channel.badge}</span>
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 font-medium text-center w-[64px]">Actif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((event) => {
              const enabled = prefs[event.key];
              if (event.locked) {
                return (
                  <tr key={event.key} className="bg-muted/20">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <event.icon className="h-3.5 w-3.5" />
                        <span className="font-medium">{event.label}</span>
                      </div>
                    </td>
                    <td colSpan={channels.length + 1} className="px-2 py-2.5 text-center">
                      <Link to="/abonnements" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                        <Lock className="h-3 w-3" /> Reserve Pro
                      </Link>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={event.key}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <event.icon className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{event.label}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-5">{event.desc}</p>
                  </td>
                  {channels.map((channel) => {
                    const channelOn = prefs[channel.key];
                    const active = enabled && channelOn && !channel.locked;
                    return (
                      <td key={channel.key} className="text-center align-middle">
                        {channel.locked
                          ? <Lock className="h-3 w-3 text-muted-foreground/40 mx-auto" aria-label="Verrouille" />
                          : <span className={`inline-block h-2.5 w-2.5 rounded-full ${active ? "bg-primary ring-2 ring-primary/30" : "bg-border"}`} aria-hidden />}
                      </td>
                    );
                  })}
                  <td className="text-center align-middle px-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => update({ [event.key]: e.target.checked } as Partial<Prefs>)}
                      className="h-4 w-4 accent-primary cursor-pointer"
                      aria-label={`Activer ${event.label}`}
                    />
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/20">
              <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">Canaux actifs</td>
              {channels.map((channel) => (
                <td key={channel.key} className="text-center align-middle">
                  {channel.locked ? (
                    <span className="text-[9px] text-warning-foreground">bloque</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={prefs[channel.key]}
                      onChange={(e) => update({ [channel.key]: e.target.checked } as Partial<Prefs>)}
                      className="h-3.5 w-3.5 accent-primary cursor-pointer"
                      aria-label={`Activer le canal ${channel.label}`}
                    />
                  )}
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Les notifications Push sont instantanees. Les emails sont envoyes via Resend quand le canal Email est active.
        SMS et WhatsApp restent reserves au plan Business sur devis.
      </p>
    </div>
  );
}

function DelayPicker({ icon: Icon, title, value, options, onChange, suffix, hint }: {
  icon: typeof Mail;
  title: string;
  value: number;
  options: number[];
  onChange: (h: number) => void;
  suffix: string;
  hint: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3 w-3" /> {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((hour) => {
          const active = value === hour;
          return (
            <button
              key={hour}
              type="button"
              onClick={() => onChange(hour)}
              className={`px-2.5 py-1 rounded-full border text-xs transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"}`}
            >
              {hour}{suffix}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
