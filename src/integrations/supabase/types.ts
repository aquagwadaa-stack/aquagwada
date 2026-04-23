export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      communes: {
        Row: {
          created_at: string
          id: string
          insee_code: string | null
          latitude: number | null
          longitude: number | null
          name: string
          population: number | null
          region: string | null
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          insee_code?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          population?: number | null
          region?: string | null
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          insee_code?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          population?: number | null
          region?: string | null
          slug?: string
        }
        Relationships: []
      }
      forecasts: {
        Row: {
          basis: string | null
          commune_id: string
          confidence: number
          created_at: string
          day_of_week_signal: number
          expected_duration_minutes: number | null
          forecast_date: string
          id: string
          probability: number
          sample_size: number
          trend: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          basis?: string | null
          commune_id: string
          confidence?: number
          created_at?: string
          day_of_week_signal?: number
          expected_duration_minutes?: number | null
          forecast_date: string
          id?: string
          probability: number
          sample_size?: number
          trend?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          basis?: string | null
          commune_id?: string
          confidence?: number
          created_at?: string
          day_of_week_signal?: number
          expected_duration_minutes?: number | null
          forecast_date?: string
          id?: string
          probability?: number
          sample_size?: number
          trend?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forecasts_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          notify_outage_start: boolean
          notify_preventive: boolean
          notify_water_back: boolean
          preventive_hours_before: number
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          sms_enabled: boolean
          updated_at: string
          user_id: string
          whatsapp_enabled: boolean
        }
        Insert: {
          email_enabled?: boolean
          notify_outage_start?: boolean
          notify_preventive?: boolean
          notify_water_back?: boolean
          preventive_hours_before?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
          whatsapp_enabled?: boolean
        }
        Update: {
          email_enabled?: boolean
          notify_outage_start?: boolean
          notify_preventive?: boolean
          notify_water_back?: boolean
          preventive_hours_before?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      outage_history: {
        Row: {
          archived_at: string
          cause: string | null
          commune_id: string
          confidence_score: number
          description: string | null
          duration_minutes: number
          ends_at: string
          external_id: string | null
          id: string
          original_outage_id: string | null
          reliability_score: number
          sector: string | null
          source: Database["public"]["Enums"]["outage_source"]
          source_url: string | null
          starts_at: string
          time_precision: Database["public"]["Enums"]["time_precision"]
        }
        Insert: {
          archived_at?: string
          cause?: string | null
          commune_id: string
          confidence_score?: number
          description?: string | null
          duration_minutes: number
          ends_at: string
          external_id?: string | null
          id?: string
          original_outage_id?: string | null
          reliability_score?: number
          sector?: string | null
          source: Database["public"]["Enums"]["outage_source"]
          source_url?: string | null
          starts_at: string
          time_precision?: Database["public"]["Enums"]["time_precision"]
        }
        Update: {
          archived_at?: string
          cause?: string | null
          commune_id?: string
          confidence_score?: number
          description?: string | null
          duration_minutes?: number
          ends_at?: string
          external_id?: string | null
          id?: string
          original_outage_id?: string | null
          reliability_score?: number
          sector?: string | null
          source?: Database["public"]["Enums"]["outage_source"]
          source_url?: string | null
          starts_at?: string
          time_precision?: Database["public"]["Enums"]["time_precision"]
        }
        Relationships: []
      }
      outages: {
        Row: {
          cause: string | null
          commune_id: string
          confidence_score: number
          confidence_source_weight: number
          created_at: string
          description: string | null
          ends_at: string | null
          estimated_duration_minutes: number | null
          external_id: string | null
          id: string
          is_estimated: boolean
          reliability_score: number
          sector: string | null
          source: Database["public"]["Enums"]["outage_source"]
          source_url: string | null
          starts_at: string
          status: Database["public"]["Enums"]["outage_status"]
          time_precision: Database["public"]["Enums"]["time_precision"]
          updated_at: string
        }
        Insert: {
          cause?: string | null
          commune_id: string
          confidence_score?: number
          confidence_source_weight?: number
          created_at?: string
          description?: string | null
          ends_at?: string | null
          estimated_duration_minutes?: number | null
          external_id?: string | null
          id?: string
          is_estimated?: boolean
          reliability_score?: number
          sector?: string | null
          source?: Database["public"]["Enums"]["outage_source"]
          source_url?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["outage_status"]
          time_precision?: Database["public"]["Enums"]["time_precision"]
          updated_at?: string
        }
        Update: {
          cause?: string | null
          commune_id?: string
          confidence_score?: number
          confidence_source_weight?: number
          created_at?: string
          description?: string | null
          ends_at?: string | null
          estimated_duration_minutes?: number | null
          external_id?: string | null
          id?: string
          is_estimated?: boolean
          reliability_score?: number
          sector?: string | null
          source?: Database["public"]["Enums"]["outage_source"]
          source_url?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["outage_status"]
          time_precision?: Database["public"]["Enums"]["time_precision"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outages_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          comment: string | null
          commune_id: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          status: Database["public"]["Enums"]["report_status"]
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          commune_id: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          status: Database["public"]["Enums"]["report_status"]
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          commune_id?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          status?: Database["public"]["Enums"]["report_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          api_access: boolean
          features: Json
          forecast_days: number
          history_days: number
          id: string
          is_public: boolean
          max_communes: number
          name: string
          price_eur_monthly: number
          price_eur_yearly: number
          sms_enabled: boolean
          sort_order: number
          tier: Database["public"]["Enums"]["subscription_tier"]
          whatsapp_enabled: boolean
        }
        Insert: {
          api_access?: boolean
          features?: Json
          forecast_days?: number
          history_days?: number
          id?: string
          is_public?: boolean
          max_communes?: number
          name: string
          price_eur_monthly?: number
          price_eur_yearly?: number
          sms_enabled?: boolean
          sort_order?: number
          tier: Database["public"]["Enums"]["subscription_tier"]
          whatsapp_enabled?: boolean
        }
        Update: {
          api_access?: boolean
          features?: Json
          forecast_days?: number
          history_days?: number
          id?: string
          is_public?: boolean
          max_communes?: number
          name?: string
          price_eur_monthly?: number
          price_eur_yearly?: number
          sms_enabled?: boolean
          sort_order?: number
          tier?: Database["public"]["Enums"]["subscription_tier"]
          whatsapp_enabled?: boolean
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trial_email_reminders: {
        Row: {
          id: string
          kind: string
          sent_at: string
          subscription_id: string
          trial_ends_at: string
          user_id: string
        }
        Insert: {
          id?: string
          kind?: string
          sent_at?: string
          subscription_id: string
          trial_ends_at: string
          user_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          subscription_id?: string
          trial_ends_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_communes: {
        Row: {
          commune_id: string
          created_at: string
          id: string
          position: number
          user_id: string
        }
        Insert: {
          commune_id: string
          created_at?: string
          id?: string
          position?: number
          user_id: string
        }
        Update: {
          commune_id?: string
          created_at?: string
          id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_communes_commune_id_fkey"
            columns: ["commune_id"]
            isOneToOne: false
            referencedRelation: "communes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_overdue_trials: { Args: never; Returns: number }
      get_commune_status: {
        Args: { _commune_id: string }
        Returns: {
          confidence: number
          next_cut: string
          ongoing_count: number
          status: string
          water_back_at: string
        }[]
      }
      get_effective_subscription: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      start_pro_trial: { Args: { _days?: number }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      outage_source: "official" | "scraping" | "user_report" | "forecast"
      outage_status: "scheduled" | "ongoing" | "resolved" | "cancelled"
      report_status: "water_off" | "low_pressure" | "water_back" | "unknown"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "expired"
      subscription_tier: "free" | "pro" | "business"
      time_precision: "exact" | "approximate" | "day_only"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      outage_source: ["official", "scraping", "user_report", "forecast"],
      outage_status: ["scheduled", "ongoing", "resolved", "cancelled"],
      report_status: ["water_off", "low_pressure", "water_back", "unknown"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "expired",
      ],
      subscription_tier: ["free", "pro", "business"],
      time_precision: ["exact", "approximate", "day_only"],
    },
  },
} as const
