import { supabase } from "@/integrations/supabase/client";

export type Commune = {
  id: string;
  name: string;
  slug: string;
  latitude: number | null;
  longitude: number | null;
};

export async function fetchCommunes(): Promise<Commune[]> {
  const { data, error } = await supabase
    .from("communes")
    .select("id, name, slug, latitude, longitude")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Commune[];
}