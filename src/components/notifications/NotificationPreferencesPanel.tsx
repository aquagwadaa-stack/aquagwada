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

      {/* Téléphone */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <Label htmlFor="phone" className="text-xs flex items-center gap-1.5">
          <Phone className="h-3.5 w-3.5" /> Numéro de téléphone (pour SMS / WhatsApp)
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
          Format international requis (ex : <code>+590690123456</code>). Utilisé uniquement pour vos alertes.
        </p>
        {needsPhoneForActiveChannel && (
          <p className="mt-2 text-[11px] text-warning-foreground bg-warning/10 border border-warning/30 rounded px-2 py-1">
            ⚠️ Renseignez un numéro pour recevoir vos alertes SMS / WhatsApp.
          </p>
        )}
      </div>

      {/* Canaux */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Canaux</p>
        <div className="space-y-2">
          <ChannelToggle
            icon={Mail}
            label="Email"
            badge="Inclus"
            checked={prefs.email_enabled}
            onChange={(v) => update({ email_enabled: v })}
          />
          <ChannelToggle
            icon={MessageSquare}
            label="SMS"
            badge={caps.smsEnabled ? "Pro" : undefined}
            locked={!caps.smsEnabled}
            checked={prefs.sms_enabled}
            onChange={(v) => update({ sms_enabled: v })}
          />
          <ChannelToggle
            icon={MessageSquare}
            label="WhatsApp"
            badge={caps.whatsappEnabled ? "Pro" : undefined}
            locked={!caps.whatsappEnabled}
            checked={prefs.whatsapp_enabled}
            onChange={(v) => update({ whatsapp_enabled: v })}
          />
        </div>
      </div>

      {/* Événements */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Événements</p>
        <div className="space-y-2">
          <ChannelToggle
            label="Début de coupure"
            checked={prefs.notify_outage_start}
            onChange={(v) => update({ notify_outage_start: v })}
          />
          <ChannelToggle
            label="Retour de l'eau"
            checked={prefs.notify_water_back}
            onChange={(v) => update({ notify_water_back: v })}
          />
          <ChannelToggle
            icon={Shield}
            label="Notifications préventives (avant coupure)"
            badge={caps.preventiveNotifications ? "Pro" : undefined}
            locked={!caps.preventiveNotifications}
            checked={prefs.notify_preventive}
            onChange={(v) => update({ notify_preventive: v })}
          />
        </div>
      </div>

      {/* Heures silencieuses */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Heures silencieuses (optionnel)</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="qh-start" className="text-[11px]">Début</Label>
            <Input
              id="qh-start"
              type="time"
              value={prefs.quiet_hours_start ?? ""}
              onChange={(e) => update({ quiet_hours_start: e.target.value || null })}
            />
          </div>
          <div>
            <Label htmlFor="qh-end" className="text-[11px]">Fin</Label>
            <Input
              id="qh-end"
              type="time"
              value={prefs.quiet_hours_end ?? ""}
              onChange={(e) => update({ quiet_hours_end: e.target.value || null })}
            />
          </div>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Aucune notification non urgente ne sera envoyée sur cette plage.
        </p>
      </div>

      {/* Délai préventif */}
      {prefs.notify_preventive && caps.preventiveNotifications && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Délai préventif
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 6, 12, 24, 48].map((h) => {
              const active = prefs.preventive_hours_before === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => update({ preventive_hours_before: h })}
                  className={`px-2.5 py-1 rounded-full border text-xs transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  {h}h avant
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Vous serez prévenu(e) <strong>{prefs.preventive_hours_before}h</strong> avant chaque coupure programmée.
          </p>
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

function ChannelToggle({
  icon: Icon,
  label,
  badge,
  locked,
  checked,
  onChange,
}: {
  icon?: typeof Mail;
  label: string;
  badge?: string;
  locked?: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  if (locked) {
    return (
      <Link
        to="/abonnements"
        className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm hover:border-primary/40 transition"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
          <Lock className="h-3 w-3" /> {badge ?? "Pro"}
        </span>
      </Link>
    );
  }
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30 transition">
      <span className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {label}
        {badge && <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{badge}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-7 accent-primary cursor-pointer"
      />
    </label>
  );
}