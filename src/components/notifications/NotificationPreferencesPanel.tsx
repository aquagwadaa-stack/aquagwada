import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";
import {
  Bell, Mail, MessageSquare, Phone, Lock, Clock, History, Droplet, DropletOff,
  Smartphone, CheckCircle2, AlertTriangle, Save, Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { PLAN_CAPS, type Tier } from "@/lib/subscription";
import { InstallAndPushDialog } from "@/components/notifications/InstallAndPushDialog";
import { isPushSupported, isPreviewContext, getNotificationPermission } from "@/lib/push-notifications";

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

const DEFAULT_PREFS: Prefs = {
  push_enabled: true,
  email_enabled: true,
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

function isValidPhone(p: string): boolean {
  return /^\+\d{8,15}$/.test(p.trim());
}

function shallowEqualPrefs(a: Prefs, b: Prefs): boolean {
  return (Object.keys(a) as (keyof Prefs)[]).every((k) => a[k] === b[k]);
}

export function NotificationPreferencesPanel({ tier }: { tier: Tier }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const caps = PLAN_CAPS[tier];

  // ---- Etat installation / push (pour le badge en haut + colonne Push) ----
  const [installed, setInstalled] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    if (isPushSupported() && !isPreviewContext()) {
      navigator.serviceWorker.getRegistration().then(async (reg) => {
        const sub = await reg?.pushManager.getSubscription();
        setPushSubscribed(!!sub);
        setPushPermission(await getNotificationPermission());
      });
    }
  }, [installDialogOpen]);

  const profile = useQuery({
    queryKey: ["profile", user!.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("phone, full_name").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

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

  // Buffered state : la sauvegarde n'a lieu QU'AU clic "Sauvegarder"
  const [savedPrefs, setSavedPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [draft, setDraft] = useState<Prefs>(DEFAULT_PREFS);
  const [phone, setPhone] = useState("");
  const [savedPhone, setSavedPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (prefsQuery.data) {
      const merged = { ...DEFAULT_PREFS, ...prefsQuery.data };
      setSavedPrefs(merged);
      setDraft(merged);
    }
  }, [prefsQuery.data]);

  useEffect(() => {
    const p = profile.data?.phone ?? "";
    setPhone(p);
    setSavedPhone(p);
  }, [profile.data]);

  const isDirty = useMemo(
    () => !shallowEqualPrefs(draft, savedPrefs) || phone.trim() !== savedPhone.trim(),
    [draft, savedPrefs, phone, savedPhone],
  );

  function patch(p: Partial<Prefs>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function persist(): Promise<boolean> {
    setSaving(true);
    try {
      // Phone (si modifié)
      if (phone.trim() !== savedPhone.trim()) {
        const trimmed = phone.trim();
        if (trimmed && !isValidPhone(trimmed)) {
          toast.error("Format téléphone invalide. Ex : +590690123456");
          return false;
        }
        const { error: pe } = await supabase
          .from("profiles")
          .upsert({ id: user!.id, phone: trimmed || null }, { onConflict: "id" });
        if (pe) { toast.error("Erreur téléphone : " + pe.message); return false; }
        setSavedPhone(trimmed);
      }
      // Préférences
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({ user_id: user!.id, ...draft }, { onConflict: "user_id" });
      if (error) { toast.error("Erreur enregistrement : " + error.message); return false; }
      setSavedPrefs(draft);
      qc.invalidateQueries({ queryKey: ["notification_preferences", user!.id] });
      qc.invalidateQueries({ queryKey: ["profile", user!.id] });
      toast.success("Préférences enregistrées ✓");
      return true;
    } finally {
      setSaving(false);
    }
  }

  /**
   * Logique du bouton "Sauvegarder" :
   *  - Si l'utilisateur a activé "push" pour au moins 1 événement,
   *    et qu'il n'est PAS dans la PWA installée, ET que push n'est pas souscrit
   *    → on ouvre la modale d'install/push avant de sauver
   *  - Sinon : on sauve direct
   */
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

  const needsPhoneForActiveChannel = (draft.sms_enabled || draft.whatsapp_enabled) && !profile.data?.phone;

  // Logs des dernières notifications
  const logs = useQuery({
    queryKey: ["notification_logs", user!.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_logs")
        .select("id, channel, kind, sent_at, dry_run")
        .eq("user_id", user!.id)
        .order("sent_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  // Badge d'état push/install
  const status = (() => {
    if (isPreviewContext()) return { variant: "info" as const, icon: Sparkles, text: "Aperçu Lovable — push activable sur le site publié" };
    if (!isPushSupported()) return { variant: "warn" as const, icon: AlertTriangle, text: "Notifications push non supportées sur cet appareil" };
    if (pushPermission === "denied") return { variant: "warn" as const, icon: AlertTriangle, text: "Notifications bloquées — réautorise dans les réglages du navigateur" };
    if (installed && pushSubscribed) return { variant: "ok" as const, icon: CheckCircle2, text: "App installée + notifications actives" };
    if (installed && !pushSubscribed) return { variant: "warn" as const, icon: Bell, text: "App installée — pense à activer les notifications" };
    if (!installed && pushSubscribed) return { variant: "warn" as const, icon: Smartphone, text: "Notifications actives, mais l'app n'est pas installée (recommandé)" };
    return { variant: "info" as const, icon: Smartphone, text: "Installe AquaGwada + active les notifs pour les alertes en temps réel" };
  })();
  const statusColor =
    status.variant === "ok" ? "bg-success/10 border-success/40 text-success-foreground"
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

      {/* Badge d'état */}
      <div className={`rounded-xl border px-3 py-2.5 flex items-center gap-2 text-xs ${statusColor}`}>
        <status.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{status.text}</span>
      </div>

      {/* Téléphone : visible uniquement Pro / Business */}
      {(caps.smsEnabled || caps.whatsappEnabled) && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <Label htmlFor="phone" className="text-xs flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" /> Numéro de téléphone (SMS / WhatsApp)
          </Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+590 690 12 34 56"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            className="mt-2"
          />
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Format international (ex : <code>+590690123456</code>). Utilisé uniquement pour vos alertes.
          </p>
          {needsPhoneForActiveChannel && (
            <p className="mt-2 text-[11px] bg-warning/10 border border-warning/30 rounded px-2 py-1">
              ⚠️ Renseignez un numéro pour recevoir vos alertes SMS / WhatsApp.
            </p>
          )}
        </div>
      )}

      {/* MATRICE événement × canal (push inclus) */}
      <NotifMatrix prefs={draft} caps={caps} pushPermission={pushPermission} update={patch} />

      {/* Délais préventifs */}
      {(caps.preventiveNotifications) && (draft.notify_preventive || draft.notify_preventive_water_back) && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
          {draft.notify_preventive && (
            <DelayPicker
              icon={DropletOff}
              title="Délai avant une coupure"
              value={draft.preventive_hours_before}
              options={[1, 2, 3, 6, 12, 24, 48]}
              onChange={(h) => patch({ preventive_hours_before: h })}
              suffix="h avant"
              hint={`Vous serez prévenu(e) ${draft.preventive_hours_before}h avant chaque coupure programmée.`}
            />
          )}
          {draft.notify_preventive_water_back && (
            <DelayPicker
              icon={Droplet}
              title="Délai avant le retour de l'eau"
              value={draft.preventive_water_back_hours_before}
              options={[1, 2, 3, 6]}
              onChange={(h) => patch({ preventive_water_back_hours_before: h })}
              suffix="h avant"
              hint={`Vous serez prévenu(e) ${draft.preventive_water_back_hours_before}h avant le retour estimé.`}
            />
          )}
        </div>
      )}

      {/* Bouton Sauvegarder — sticky en bas */}
      <div className="sticky bottom-2 -mx-1 px-1 pt-2 z-10">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2.5 shadow-md">
          <p className="text-xs text-muted-foreground">
            {isDirty ? "Modifications non enregistrées" : "Tout est à jour"}
          </p>
          <Button
            size="sm"
            onClick={onClickSave}
            disabled={!isDirty || saving}
            className="gap-1.5 bg-gradient-ocean text-primary-foreground"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Enregistrement…" : "Sauvegarder mes préférences"}
          </Button>
        </div>
      </div>

      {/* Logs */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <History className="h-3 w-3" /> Dernières notifications
        </p>
        {logs.isLoading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : (logs.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-3">
            Aucune notification déclenchée pour l'instant. Vos préférences seront appliquées dès la prochaine coupure pertinente.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {(logs.data ?? []).map((l: { id: string; channel: string; kind: string; sent_at: string; dry_run: boolean }) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">{l.channel}</span>
                  <span className="truncate text-foreground/80">{l.kind}</span>
                  {l.dry_run && (
                    <span className="rounded bg-warning/15 border border-warning/40 px-1 py-0.5 text-[9px] font-medium">test</span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {new Date(l.sent_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <InstallAndPushDialog
        open={installDialogOpen}
        onOpenChange={setInstallDialogOpen}
        onContinue={() => { void persist(); }}
      />
    </section>
  );
}

function NotifMatrix({
  prefs, caps, pushPermission, update,
}: {
  prefs: Prefs;
  caps: ReturnType<() => (typeof PLAN_CAPS)["free"]>;
  pushPermission: NotificationPermission;
  update: (patch: Partial<Prefs>) => void;
}) {
  type EventDef = {
    key: "outage_start" | "water_back" | "preventive" | "preventive_water_back";
    label: string;
    icon: typeof Mail;
    enabledKey: keyof Prefs;
    locked?: boolean;
    badge?: string;
    desc?: string;
  };
  const events: EventDef[] = [
    { key: "outage_start", label: "Début de coupure", icon: DropletOff, enabledKey: "notify_outage_start", desc: "Au moment où l'eau est coupée." },
    { key: "water_back", label: "Retour de l'eau", icon: Droplet, enabledKey: "notify_water_back", desc: "Quand l'eau revient." },
    { key: "preventive", label: "Préventif (avant coupure)", icon: Clock, enabledKey: "notify_preventive", locked: !caps.preventiveNotifications, badge: "Pro", desc: "Anticipez en remplissant des réserves." },
    { key: "preventive_water_back", label: "Préventif (avant retour)", icon: Clock, enabledKey: "notify_preventive_water_back", locked: !caps.preventiveNotifications, badge: "Pro", desc: "Soyez prêt(e) avant que l'eau revienne." },
  ];
  const pushBlocked = pushPermission === "denied";
  const channels = [
    { key: "push" as const, label: "Push", icon: Bell, enabledKey: "push_enabled" as keyof Prefs, locked: pushBlocked, badge: "★ Recommandé", hint: "Gratuit, instantané" },
    { key: "email" as const, label: "Email", icon: Mail, enabledKey: "email_enabled" as keyof Prefs, locked: false, badge: "Inclus", hint: "" },
    { key: "sms" as const, label: "SMS", icon: MessageSquare, enabledKey: "sms_enabled" as keyof Prefs, locked: !caps.smsEnabled, badge: "Business", hint: "" },
    { key: "whatsapp" as const, label: "WhatsApp", icon: MessageSquare, enabledKey: "whatsapp_enabled" as keyof Prefs, locked: !caps.whatsappEnabled, badge: "Business", hint: "" },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Choisis quoi recevoir, et comment
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs min-w-[520px]">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Événement</th>
              {channels.map((c) => (
                <th key={c.key} className="px-2 py-2 font-medium text-center w-[72px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <c.icon className={`h-3.5 w-3.5 ${c.key === "push" ? "text-primary" : "text-foreground/70"}`} />
                    <span>{c.label}</span>
                    {c.locked ? (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-primary"><Lock className="h-2.5 w-2.5" />{c.badge}</span>
                    ) : (
                      <span className={`text-[9px] ${c.key === "push" ? "text-primary font-semibold" : "text-muted-foreground/70"}`}>{c.badge}</span>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 font-medium text-center w-[64px]">Activé</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((ev) => {
              const enabled = prefs[ev.enabledKey] as boolean;
              if (ev.locked) {
                return (
                  <tr key={ev.key} className="bg-muted/20">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ev.icon className="h-3.5 w-3.5" />
                        <span className="font-medium">{ev.label}</span>
                      </div>
                      {ev.desc && <p className="text-[10px] text-muted-foreground/70 mt-0.5 ml-5">{ev.desc}</p>}
                    </td>
                    <td colSpan={channels.length + 1} className="px-2 py-2.5 text-center">
                      <Link to="/abonnements" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                        <Lock className="h-3 w-3" /> Réservé Pro — débloquer
                      </Link>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={ev.key}>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <ev.icon className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium">{ev.label}</span>
                    </div>
                    {ev.desc && <p className="text-[10px] text-muted-foreground mt-0.5 ml-5">{ev.desc}</p>}
                  </td>
                  {channels.map((c) => {
                    const channelOn = prefs[c.enabledKey] as boolean;
                    const cellActive = enabled && channelOn && !c.locked;
                    return (
                      <td key={c.key} className="text-center align-middle">
                        {c.locked ? (
                          <Lock className="h-3 w-3 text-muted-foreground/40 mx-auto" aria-label="Verrouillé" />
                        ) : (
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${cellActive ? (c.key === "push" ? "bg-primary ring-2 ring-primary/30" : "bg-primary") : "bg-border"}`} aria-hidden />
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center align-middle px-2">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => update({ [ev.enabledKey]: e.target.checked } as Partial<Prefs>)}
                      className="h-4 w-4 accent-primary cursor-pointer"
                      aria-label={`Activer ${ev.label}`}
                    />
                  </td>
                </tr>
              );
            })}
            {/* Toggles globaux par canal */}
            <tr className="bg-muted/20">
              <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Canaux actifs
              </td>
              {channels.map((c) => (
                <td key={c.key} className="text-center align-middle">
                  {c.locked ? (
                    c.key === "push" ? (
                      <span className="text-[9px] text-warning-foreground" title="Réautorise les notifs dans le navigateur">bloqué</span>
                    ) : (
                      <Link to="/abonnements" className="text-[10px] text-primary underline">débloquer</Link>
                    )
                  ) : (
                    <input
                      type="checkbox"
                      checked={prefs[c.enabledKey] as boolean}
                      onChange={(e) => update({ [c.enabledKey]: e.target.checked } as Partial<Prefs>)}
                      className="h-3.5 w-3.5 accent-primary cursor-pointer"
                      aria-label={`Activer le canal ${c.label}`}
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
        Coche d'abord les <strong>événements</strong>, puis les <strong>canaux</strong>. Un événement n'est envoyé que si son canal est aussi actif.
        Les notifications <strong>Push</strong> sont gratuites, illimitées et instantanées (recommandé).
      </p>
    </div>
  );
}

function DelayPicker({
  icon: Icon, title, value, options, onChange, suffix, hint,
}: {
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
        {options.map((h) => {
          const active = value === h;
          return (
            <button
              key={h}
              type="button"
              onClick={() => onChange(h)}
              className={`px-2.5 py-1 rounded-full border text-xs transition ${
                active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              {h}{suffix}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
