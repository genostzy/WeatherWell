/**
 * GENERATED FILE — do not hand-edit.
 *
 * Produced by the Supabase MCP server's `generate_typescript_types` tool
 * against the live project schema. Regenerate this file (re-run that tool
 * and overwrite this file's contents below this header) whenever a
 * migration changes the schema — a renamed column, a new table, or a
 * changed foreign key/uniqueness constraint that affects join cardinality.
 */
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
      alerts: {
        Row: {
          confidence: string
          expired_automatically: boolean
          id: string
          is_active: boolean
          issued_at: string
          issued_by: string | null
          message: Json
          predicted_timing: Json | null
          severity: string
          source: string
          superseded_at: string | null
          superseded_severity: string | null
          verdict: string | null
          zone_id: string
        }
        Insert: {
          confidence?: string
          expired_automatically?: boolean
          id?: string
          is_active?: boolean
          issued_at?: string
          issued_by?: string | null
          message: Json
          predicted_timing?: Json | null
          severity: string
          source: string
          superseded_at?: string | null
          superseded_severity?: string | null
          verdict?: string | null
          zone_id: string
        }
        Update: {
          confidence?: string
          expired_automatically?: boolean
          id?: string
          is_active?: boolean
          issued_at?: string
          issued_by?: string | null
          message?: Json
          predicted_timing?: Json | null
          severity?: string
          source?: string
          superseded_at?: string | null
          superseded_severity?: string | null
          verdict?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      app_errors: {
        Row: {
          environment: string
          fingerprint: string
          id: number
          kind: string
          message: string
          occurred_at: string
          release: string | null
          route: string
          source: string
          stack: string | null
        }
        Insert: {
          environment: string
          fingerprint: string
          id?: never
          kind: string
          message: string
          occurred_at?: string
          release?: string | null
          route: string
          source: string
          stack?: string | null
        }
        Update: {
          environment?: string
          fingerprint?: string
          id?: never
          kind?: string
          message?: string
          occurred_at?: string
          release?: string | null
          route?: string
          source?: string
          stack?: string | null
        }
        Relationships: []
      }
      community_pins: {
        Row: {
          author_id: string
          caption: string
          created_at: string
          id: string
          lat: number
          lng: number
          photo_path: string | null
          removed: boolean
          removed_reason: string | null
          status_tag: string
          zone_id: string
        }
        Insert: {
          author_id: string
          caption: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          photo_path?: string | null
          removed?: boolean
          removed_reason?: string | null
          status_tag: string
          zone_id: string
        }
        Update: {
          author_id?: string
          caption?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          photo_path?: string | null
          removed?: boolean
          removed_reason?: string | null
          status_tag?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_pins_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      email_alert_subscriptions: {
        Row: {
          created_at: string
          unsubscribe_token: string
          user_id: string
          zone_id: string | null
        }
        Insert: {
          created_at?: string
          unsubscribe_token?: string
          user_id: string
          zone_id?: string | null
        }
        Update: {
          created_at?: string
          unsubscribe_token?: string
          user_id?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_alert_subscriptions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      evacuation_centers: {
        Row: {
          capacity: number
          current_occupancy: number | null
          id: string
          lat: number
          lng: number
          name: string
          status: string
          zone_id: string
        }
        Insert: {
          capacity: number
          current_occupancy?: number | null
          id: string
          lat: number
          lng: number
          name: string
          status?: string
          zone_id: string
        }
        Update: {
          capacity?: number
          current_occupancy?: number | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          status?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evacuation_centers_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: true
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      evacuation_check_ins: {
        Row: {
          checked_in_at: string
          id: string
          status: string
          user_id: string
          zone_id: string
        }
        Insert: {
          checked_in_at?: string
          id?: string
          status: string
          user_id: string
          zone_id: string
        }
        Update: {
          checked_in_at?: string
          id?: string
          status?: string
          user_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evacuation_check_ins_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      hazard_susceptibility: {
        Row: {
          hazard_type: string
          id: string
          risk_level: string
          zone_id: string
        }
        Insert: {
          hazard_type: string
          id: string
          risk_level: string
          zone_id: string
        }
        Update: {
          hazard_type?: string
          id?: string
          risk_level?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hazard_susceptibility_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_events: {
        Row: {
          created_at: string
          description: Json
          event_date: string
          hazard_type: string
          id: string
          severity: string
          source: string | null
          zone_id: string
        }
        Insert: {
          created_at?: string
          description?: Json
          event_date: string
          hazard_type: string
          id?: string
          severity: string
          source?: string | null
          zone_id: string
        }
        Update: {
          created_at?: string
          description?: Json
          event_date?: string
          hazard_type?: string
          id?: string
          severity?: string
          source?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_events_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      municipalities: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      official_actions: {
        Row: {
          action: string
          actor_area: string | null
          actor_id: string | null
          actor_name: string
          detail: Json
          id: number
          occurred_at: string
          target_id: string | null
          zone_id: string | null
        }
        Insert: {
          action: string
          actor_area?: string | null
          actor_id?: string | null
          actor_name: string
          detail?: Json
          id?: never
          occurred_at?: string
          target_id?: string | null
          zone_id?: string | null
        }
        Update: {
          action?: string
          actor_area?: string | null
          actor_id?: string | null
          actor_name?: string
          detail?: Json
          id?: never
          occurred_at?: string
          target_id?: string | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "official_actions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      official_markers: {
        Row: {
          caption: string
          id: string
          lat: number
          lng: number
          placed_at: string
          placed_by: string
          type: string
        }
        Insert: {
          caption?: string
          id?: string
          lat: number
          lng: number
          placed_at?: string
          placed_by: string
          type: string
        }
        Update: {
          caption?: string
          id?: string
          lat?: number
          lng?: number
          placed_at?: string
          placed_by?: string
          type?: string
        }
        Relationships: []
      }
      official_messages: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_name: string | null
          body: string
          created_at: string
          direction: string
          id: string
          kind: string
          sender_name: string
          town_code: string
          zone_id: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_name?: string | null
          body?: string
          created_at?: string
          direction: string
          id?: string
          kind: string
          sender_name: string
          town_code: string
          zone_id?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_name?: string | null
          body?: string
          created_at?: string
          direction?: string
          id?: string
          kind?: string
          sender_name?: string
          town_code?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "official_messages_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_votes: {
        Row: {
          direction: number
          pin_id: string
          voted_at: string
          voter_id: string
        }
        Insert: {
          direction: number
          pin_id: string
          voted_at?: string
          voter_id: string
        }
        Update: {
          direction?: number
          pin_id?: string
          voted_at?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_votes_pin_id_fkey"
            columns: ["pin_id"]
            isOneToOne: false
            referencedRelation: "community_pins"
            referencedColumns: ["id"]
          },
        ]
      }
      points_of_interest: {
        Row: {
          category: string
          id: string
          lat: number
          lng: number
          name: string
          zone_id: string
        }
        Insert: {
          category: string
          id: string
          lat: number
          lng: number
          name: string
          zone_id: string
        }
        Update: {
          category?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_of_interest_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          area_code: string | null
          created_at: string
          display_name: string | null
          id: string
          role: string
          zone_id: string | null
        }
        Insert: {
          area_code?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
          zone_id?: string | null
        }
        Update: {
          area_code?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
          zone_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
          zone_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      typhoon_tracks: {
        Row: {
          bulletin_number: number | null
          category: Json
          created_at: string
          fetched_at: string
          gustiness_kph: number | null
          headline: string | null
          id: string
          international_name: string | null
          is_active: boolean
          is_final: boolean
          issued_at: string | null
          max_winds_kph: number | null
          movement_direction: string | null
          movement_speed_kph: number | null
          name: string
          next_bulletin_at: string | null
          positions: Json
          pressure_hpa: number | null
          signals: Json
          source: string
          wind_signal: number
        }
        Insert: {
          bulletin_number?: number | null
          category?: Json
          created_at?: string
          fetched_at?: string
          gustiness_kph?: number | null
          headline?: string | null
          id?: string
          international_name?: string | null
          is_active?: boolean
          is_final?: boolean
          issued_at?: string | null
          max_winds_kph?: number | null
          movement_direction?: string | null
          movement_speed_kph?: number | null
          name: string
          next_bulletin_at?: string | null
          positions?: Json
          pressure_hpa?: number | null
          signals?: Json
          source?: string
          wind_signal?: number
        }
        Update: {
          bulletin_number?: number | null
          category?: Json
          created_at?: string
          fetched_at?: string
          gustiness_kph?: number | null
          headline?: string | null
          id?: string
          international_name?: string | null
          is_active?: boolean
          is_final?: boolean
          issued_at?: string | null
          max_winds_kph?: number | null
          movement_direction?: string | null
          movement_speed_kph?: number | null
          name?: string
          next_bulletin_at?: string | null
          positions?: Json
          pressure_hpa?: number | null
          signals?: Json
          source?: string
          wind_signal?: number
        }
        Relationships: []
      }
      water_level_reports: {
        Row: {
          depth_level: string
          id: string
          is_outlier: boolean
          lat: number | null
          lng: number | null
          received_at: string
          reported_at: string
          reporter_established: boolean
          reporter_id: string
          trust_weight: number
          zone_id: string
        }
        Insert: {
          depth_level: string
          id?: string
          is_outlier?: boolean
          lat?: number | null
          lng?: number | null
          received_at?: string
          reported_at?: string
          reporter_established?: boolean
          reporter_id: string
          trust_weight?: number
          zone_id: string
        }
        Update: {
          depth_level?: string
          id?: string
          is_outlier?: boolean
          lat?: number | null
          lng?: number | null
          received_at?: string
          reported_at?: string
          reporter_established?: boolean
          reporter_id?: string
          trust_weight?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "water_level_reports_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_readings: {
        Row: {
          created_at: string
          fetched_at: string
          humidity_pct: number
          id: string
          rainfall_mm: number
          temperature_c: number
          weather_code: number
          wind_kph: number
          zone_id: string
        }
        Insert: {
          created_at?: string
          fetched_at?: string
          humidity_pct?: number
          id?: string
          rainfall_mm?: number
          temperature_c?: number
          weather_code?: number
          wind_kph?: number
          zone_id: string
        }
        Update: {
          created_at?: string
          fetched_at?: string
          humidity_pct?: number
          id?: string
          rainfall_mm?: number
          temperature_c?: number
          weather_code?: number
          wind_kph?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weather_readings_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      zones: {
        Row: {
          downstream_zone_id: string | null
          evacuation_route_path: Json
          evacuation_route_text: Json
          hotline_number: string
          id: string
          lat: number
          lng: number
          municipality_name: string
          name: string
          province_name: string
          psgc_barangay_code: string
        }
        Insert: {
          downstream_zone_id?: string | null
          evacuation_route_path: Json
          evacuation_route_text: Json
          hotline_number: string
          id: string
          lat: number
          lng: number
          municipality_name?: string
          name: string
          province_name?: string
          psgc_barangay_code: string
        }
        Update: {
          downstream_zone_id?: string | null
          evacuation_route_path?: Json
          evacuation_route_text?: Json
          hotline_number?: string
          id?: string
          lat?: number
          lng?: number
          municipality_name?: string
          name?: string
          province_name?: string
          psgc_barangay_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "zones_downstream_zone_id_fkey"
            columns: ["downstream_zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acknowledge_official_message: {
        Args: { p_id: string }
        Returns: undefined
      }
      admin_appoint_official: {
        Args: { p_area: string; p_display_name: string; p_email: string }
        Returns: string
      }
      admin_authorize_password_reset: {
        Args: { p_email: string }
        Returns: string
      }
      admin_remove_official: { Args: { p_email: string }; Returns: string }
      check_and_trigger_alerts: {
        Args: never
        Returns: {
          report_count: number
          severity: string
          triggered: boolean
          zone_id: string
        }[]
      }
      cleanup_old_weather_readings: { Args: never; Returns: undefined }
      confirm_evacuation_center: {
        Args: {
          p_capacity: number
          p_lat: number
          p_lng: number
          p_name: string
          p_zone_id: string
        }
        Returns: undefined
      }
      email_alert_recipients: {
        Args: { p_user_ids?: string[]; p_zone_id?: string }
        Returns: {
          email: string
          unsubscribe_token: string
        }[]
      }
      my_recovery_questions: {
        Args: never
        Returns: {
          question_1: string
          question_2: string
        }[]
      }
      my_water_level_reports: {
        Args: never
        Returns: {
          depth_level: string
          id: string
          reported_at: string
          zone_id: string
        }[]
      }
      recent_app_error_count: {
        Args: { p_environment?: string }
        Returns: number
      }
      recovery_questions_for: {
        Args: { p_email: string }
        Returns: {
          question_1: string
          question_2: string
        }[]
      }
      reject_automatic_alert: {
        Args: { p_zone_id: string }
        Returns: undefined
      }
      report_app_error: {
        Args: {
          p_environment: string
          p_fingerprint: string
          p_kind: string
          p_message: string
          p_release: string
          p_route: string
          p_source: string
          p_stack: string
        }
        Returns: undefined
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
          p_zone_id: string
        }
        Returns: undefined
      }
      send_official_message: {
        Args: { p_body: string; p_kind: string }
        Returns: string
      }
      set_recovery_answers: {
        Args: {
          p_answer_1: string
          p_answer_2: string
          p_question_1: string
          p_question_2: string
        }
        Returns: undefined
      }
      set_zone_alert: {
        Args: {
          p_message: Json
          p_severity: string
          p_source?: string
          p_zone_id: string
        }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      subscribe_email_alerts: {
        Args: { p_zone_id: string }
        Returns: undefined
      }
      town_appoint_barangay_official: {
        Args: { p_display_name: string; p_email: string; p_zone_id: string }
        Returns: string
      }
      town_officials: {
        Args: never
        Returns: {
          area_code: string
          display_name: string
          user_id: string
        }[]
      }
      town_remove_barangay_official: {
        Args: { p_user_id: string }
        Returns: string
      }
      unsubscribe_email_alerts: { Args: { p_token: string }; Returns: boolean }
      verify_recovery_answers: {
        Args: { p_answer_1: string; p_answer_2: string; p_email: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
