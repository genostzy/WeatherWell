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
          zone_id: string
        }
        Insert: {
          confidence?: string
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
          zone_id: string
        }
        Update: {
          confidence?: string
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
      water_level_reports: {
        Row: {
          depth_level: string
          id: string
          is_outlier: boolean
          reported_at: string
          reporter_id: string
          trust_weight: number
          zone_id: string
        }
        Insert: {
          depth_level: string
          id?: string
          is_outlier?: boolean
          reported_at?: string
          reporter_id: string
          trust_weight?: number
          zone_id: string
        }
        Update: {
          depth_level?: string
          id?: string
          is_outlier?: boolean
          reported_at?: string
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
      zones: {
        Row: {
          downstream_zone_id: string | null
          evacuation_route_path: Json
          evacuation_route_text: Json
          hotline_number: string
          id: string
          lat: number
          lng: number
          name: string
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
          name: string
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
          name?: string
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
      recent_app_error_count: { Args: never; Returns: number }
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
      set_zone_alert: {
        Args: {
          p_message: Json
          p_severity: string
          p_source?: string
          p_zone_id: string
        }
        Returns: undefined
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
