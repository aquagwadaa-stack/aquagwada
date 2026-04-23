import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone, Droplet, DropletOff, AlertTriangle, HelpCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";

type ReportStatus = "water_off" | "low_pressure" | "water_back" | "unknown";

const OPTIONS: Array<{ value: ReportStatus; label: string; icon: typeof Droplet; tone: string; desc: string }> = [
  { value: "water_off",   label: "Eau coupée",        icon: DropletOff,     tone: "border-destructive/40 bg-destructive/5 hover:border-destructive",  desc: "Plus d'eau au robinet" },
  { value: "water_back",  label: "Eau revenue",       icon: Droplet,        tone: "border-success/40 bg-success/5 hover:border-success",              desc: "Le débit est revenu" },
  { value: "low_pressure",label: "Pression faible",   icon: AlertTriangle,  tone: "border-warning/40 bg-warning/5 hover:border-warning",              desc: "Filet d'eau / faible débit" },
  { value: "unknown",     label: "Travaux / autre",   icon: HelpCircle,     tone: "border-border bg-muted/30 hover:border-primary",                   desc: "Autre situation à signaler" },
];

/**
 * Dialog de signalement d'incident sur une commune.
 * Connecté à la table `reports`. Auth requise.
 */
export function ReportDialog({
  communeId,
  communeName,
  triggerVariant = "outline",
  triggerLabel = "Signaler",
}: {
  communeId: string;
  communeName?: string;
  triggerVariant?: "outline" | "default" | "ghost";
  triggerLabel?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ReportStatus | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user) {
      toast.error("Connectez-vous pour signaler un incident.");
      return;
    }
    if (!status) {
      toast.error("Choisissez le type de signalement.");
      return;
    }
    if (comment.length > 500) {
      toast.error("Commentaire trop long (500 caractères max).");
      return;
    }
    setBusy(true);
    try {
      // Géoloc best-effort (non bloquante)
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error("no-geo"));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000, maximumAge: 60_000 });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch { /* ignore */ }

      const { error } = await supabase.from("reports").insert({
        user_id: user.id,
        commune_id: communeId,
        status,
        comment: comment.trim() || null,
        latitude,
        longitude,
      });
      if (error) throw error;
      toast.success("Merci pour votre signalement 💧");
      qc.invalidateQueries({ queryKey: ["reports"] });
      setOpen(false);
      setStatus(null);
      setComment("");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur lors de l'envoi");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <Button asChild variant={triggerVariant} size="sm">
        <Link to="/connexion">
          <Megaphone className="h-4 w-4 mr-1.5" />
          {triggerLabel}
        </Link>
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size="sm">
          <Megaphone className="h-4 w-4 mr-1.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Signaler un incident</DialogTitle>
          <DialogDescription>
            {communeName
              ? <>Aidez les habitants de <strong>{communeName}</strong> en partageant la situation.</>
              : <>Aidez la communauté en partageant la situation chez vous.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = status === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`text-left rounded-lg border-2 p-3 transition ${opt.tone} ${active ? "ring-2 ring-primary" : ""}`}
              >
                <Icon className="h-5 w-5 mb-1" />
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
        <div>
          <Label htmlFor="report-comment" className="text-xs">Précisions (optionnel)</Label>
          <Textarea
            id="report-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 500))}
            placeholder="Ex : quartier touché, depuis combien de temps…"
            className="mt-1 min-h-[80px]"
            maxLength={500}
          />
          <p className="mt-1 text-[10px] text-muted-foreground text-right">{comment.length}/500</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy || !status} className="bg-gradient-ocean text-primary-foreground">
            {busy ? "Envoi…" : "Envoyer le signalement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}