import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "sonner";
import { Bell, Mail, MessageSquare, Phone, Lock, Clock, History, Droplet, DropletOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { PLAN_CAPS, type Tier } from "@/lib/subscription";

type Prefs = {
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

/** Validation E.164 simplifiée : + suivi de 8 à 15 chiffres. */
function isValidPhone(p: string): boolean {
  return /^\+\d{8,15}$/.test(p.trim());
}

export function NotificationPreferencesPanel({ tier }: { tier: Tier }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const caps = PLAN_CAPS[tier];

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

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    if (prefsQuery.data) setPrefs({ ...DEFAULT_PREFS, ...prefsQuery.data });
  }, [prefsQuery.data]);

  useEffect(() => {
    if (profile.data?.phone) setPhone(profile.data.phone);
  }, [profile.data]);

  async function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user!.id, ...next }, { onConflict: "user_id" });
    if (error) {
      toast.error("Erreur enregistrement : " + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["notification_preferences", user!.id] });
  }

  async function savePhone() {
    const trimmed = phone.trim();
    if (trimmed && !isValidPhone(trimmed)) {
      toast.error("Format invalide. Utilisez le format international, ex : +590690123456");
      return;
    }
    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user!.id, phone: trimmed || null }, { onConflict: "id" });
      if (error) throw error;
      toast.success("Numéro enregistré");
      qc.invalidateQueries({ queryKey: ["profile", user!.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setSavingPhone(false);
    }
  }

  const needsPhoneForActiveChannel = (prefs.sms_enabled || prefs.whatsapp_enabled) && !profile.data?.phone;

  // Logs des dernières notifications (RLS : own only)
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

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-5">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Notifications</h2>
      </div>

      {/* Téléphone : visible uniquement pour Pro / Business (canaux SMS / WhatsApp accessibles) */}
      {(caps.smsEnabled || caps.whatsappEnabled) && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <Label htmlFor="phone" className="text-xs flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" /> Numéro de téléphone (SMS / WhatsApp)
          </Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="phone"
              type="tel"
              placeholder="+590 690 12 34 56"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              className="flex-1"
            />
            <Button onClick={savePhone} disabled={savingPhone || phone.trim() === (profile.data?.phone ?? "")}>
              {savingPhone ? "…" : "Enregistrer"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Format international (ex : <code>+590690123456</code>). Utilisé uniquement pour vos alertes.
          </p>
          {needsPhoneForActiveChannel && (
            <p className="mt-2 text-[11px] text-warning-foreground bg-warning/10 border border-warning/30 rounded px-2 py-1">
              ⚠️ Renseignez un numéro pour recevoir vos alertes SMS / WhatsApp.
            </p>
          )}
        </div>
      )}

      {/* MATRICE événement × canal */}
      <NotifMatrix prefs={prefs} caps={caps} update={update} />

      {/* Délais préventifs (sous le tableau) */}
      {(caps.preventiveNotifications) && (prefs.notify_preventive || prefs.notify_preventive_water_back) && (
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
          {prefs.notify_preventive && (
            <DelayPicker
              icon={DropletOff}
              title="Délai avant une coupure"
              value={prefs.preventive_hours_before}
              options={[1, 2, 3, 6, 12, 24, 48]}
              onChange={(h) => update({ preventive_hours_before: h })}
              suffix="h avant"
              hint={`Vous serez prévenu(e) ${prefs.preventive_hours_before}h avant chaque coupure programmée.`}
            />
          )}
          {prefs.notify_preventive_water_back && (
            <DelayPicker
              icon={Droplet}
              title="Délai avant le retour de l'eau"
              value={prefs.preventive_water_back_hours_before}
              options={[1, 2, 3, 6]}
              onChange={(h) => update({ preventive_water_back_hours_before: h })}
              suffix="h avant"
              hint={`Vous serez prévenu(e) ${prefs.preventive_water_back_hours_before}h avant le retour estimé pour anticiper (remplir réservoirs, etc.).`}
            />
          )}
        </div>
      )}

      {/* Logs des dernières notifications */}
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
            {(logs.data ?? []).map((l: any) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/50 px-2.5 py-1.5 text-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                    {l.channel}
                  </span>
                  <span className="truncate text-foreground/80">{l.kind}</span>
                  {l.dry_run && (
                    <span className="rounded bg-warning/15 border border-warning/40 px-1 py-0.5 text-[9px] font-medium text-warning-foreground">
                      test
                    </span>
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
    </section>
  );
}

/** Matrice événement × canal. Le bloc préventif est verrouillé pour le plan gratuit. */
function NotifMatrix({
  prefs,
  caps,
  update,
}: {
  prefs: Prefs;
  caps: ReturnType<() => (typeof PLAN_CAPS)["free"]>;
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
  const channels = [
    { key: "email" as const, label: "Email", icon: Mail, enabledKey: "email_enabled" as keyof Prefs, locked: false, badge: "Inclus" },
    { key: "sms" as const, label: "SMS", icon: MessageSquare, enabledKey: "sms_enabled" as keyof Prefs, locked: !caps.smsEnabled, badge: "Pro" },
    { key: "whatsapp" as const, label: "WhatsApp", icon: MessageSquare, enabledKey: "whatsapp_enabled" as keyof Prefs, locked: !caps.whatsappEnabled, badge: "Pro" },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Choisissez quoi recevoir, et comment
      </p>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/40 text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Événement</th>
              {channels.map((c) => (
                <th key={c.key} className="px-2 py-2 font-medium text-center w-[68px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <c.icon className="h-3.5 w-3.5 text-primary" />
                    <span>{c.label}</span>
                    {c.locked ? (
                      <span className="inline-flex items-center gap-0.5 text-[9px] text-primary"><Lock className="h-2.5 w-2.5" />{c.badge}</span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground/70">{c.badge}</span>
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
                          <span className={`inline-block h-2 w-2 rounded-full ${cellActive ? "bg-primary" : "bg-border"}`} aria-hidden />
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
            {/* Ligne de toggles canaux globaux (pour activer/désactiver Email / SMS / WhatsApp d'un coup) */}
            <tr className="bg-muted/20">
              <td className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                Canaux actifs
              </td>
              {channels.map((c) => (
                <td key={c.key} className="text-center align-middle">
                  {c.locked ? (
                    <Link to="/abonnements" className="text-[10px] text-primary underline">débloquer</Link>
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
        Cochez d'abord les événements souhaités, puis les canaux à utiliser. Un événement n'est envoyé que si son canal est aussi actif.
      </p>
    </div>
  );
}

function DelayPicker({
  icon: Icon,
  title,
  value,
  options,
  onChange,
  suffix,
  hint,
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
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:border-primary/40"
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