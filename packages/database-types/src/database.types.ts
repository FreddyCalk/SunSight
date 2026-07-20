export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          config_key: string
          created_at: string
          description: string
          id: string
          updated_at: string
          value_json: Json
        }
        Insert: {
          config_key: string
          created_at?: string
          description: string
          id?: string
          updated_at?: string
          value_json: Json
        }
        Update: {
          config_key?: string
          created_at?: string
          description?: string
          id?: string
          updated_at?: string
          value_json?: Json
        }
        Relationships: []
      }
      blast_recipients: {
        Row: {
          blast_id: string
          created_at: string
          delivery_state: Database["public"]["Enums"]["recipient_delivery_state"]
          eligibility_reason: string
          eligibility_version: number
          first_opened_at: string | null
          id: string
          recipient_id: string
          updated_at: string
        }
        Insert: {
          blast_id: string
          created_at?: string
          delivery_state?: Database["public"]["Enums"]["recipient_delivery_state"]
          eligibility_reason: string
          eligibility_version: number
          first_opened_at?: string | null
          id?: string
          recipient_id: string
          updated_at?: string
        }
        Update: {
          blast_id?: string
          created_at?: string
          delivery_state?: Database["public"]["Enums"]["recipient_delivery_state"]
          eligibility_reason?: string
          eligibility_version?: number
          first_opened_at?: string | null
          id?: string
          recipient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blast_recipients_blast_id_fkey"
            columns: ["blast_id"]
            isOneToOne: false
            referencedRelation: "sunset_blasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blast_recipients_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_matches: {
        Row: {
          consented_at: string
          created_at: string
          expires_at: string
          hmac_version: number
          id: string
          matched_user_id: string
          owner_user_id: string
        }
        Insert: {
          consented_at: string
          created_at?: string
          expires_at: string
          hmac_version: number
          id?: string
          matched_user_id: string
          owner_user_id: string
        }
        Update: {
          consented_at?: string
          created_at?: string
          expires_at?: string
          hmac_version?: number
          id?: string
          matched_user_id?: string
          owner_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_matches_matched_user_id_fkey"
            columns: ["matched_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_matches_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string
          enabled: boolean
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          push_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          push_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          push_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_snapshots: {
        Row: {
          accuracy_m: number
          captured_at: string
          created_at: string
          expires_at: string
          id: string
          location: unknown
          source: Database["public"]["Enums"]["location_source"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_m: number
          captured_at: string
          created_at?: string
          expires_at: string
          id?: string
          location: unknown
          source: Database["public"]["Enums"]["location_source"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number
          captured_at?: string
          created_at?: string
          expires_at?: string
          id?: string
          location?: unknown
          source?: Database["public"]["Enums"]["location_source"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempt_count: number
          blast_recipient_id: string
          created_at: string
          device_id: string
          id: string
          last_attempted_at: string | null
          next_attempt_at: string | null
          provider_receipt_id: string | null
          state: Database["public"]["Enums"]["recipient_delivery_state"]
          terminal_error_code: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          blast_recipient_id: string
          created_at?: string
          device_id: string
          id?: string
          last_attempted_at?: string | null
          next_attempt_at?: string | null
          provider_receipt_id?: string | null
          state?: Database["public"]["Enums"]["recipient_delivery_state"]
          terminal_error_code?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          blast_recipient_id?: string
          created_at?: string
          device_id?: string
          id?: string
          last_attempted_at?: string | null
          next_attempt_at?: string | null
          provider_receipt_id?: string | null
          state?: Database["public"]["Enums"]["recipient_delivery_state"]
          terminal_error_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_blast_recipient_id_fkey"
            columns: ["blast_recipient_id"]
            isOneToOne: false
            referencedRelation: "blast_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempt_count: number
          available_at: string
          blast_recipient_id: string
          created_at: string
          event_type: string
          id: string
          last_error_code: string | null
          locked_at: string | null
          processed_at: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          blast_recipient_id: string
          created_at?: string
          event_type?: string
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          processed_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          blast_recipient_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error_code?: string | null
          locked_at?: string | null
          processed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_blast_recipient_id_fkey"
            columns: ["blast_recipient_id"]
            isOneToOne: true
            referencedRelation: "blast_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          blasts_enabled: boolean
          created_at: string
          id: string
          muted_until: string | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          blasts_enabled?: boolean
          created_at?: string
          id?: string
          muted_until?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          blasts_enabled?: boolean
          created_at?: string
          id?: string
          muted_until?: string | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          phone_hmac: string | null
          phone_hmac_version: number | null
          privacy_policy_accepted_at: string | null
          privacy_policy_version: string | null
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          phone_hmac?: string | null
          phone_hmac_version?: number | null
          privacy_policy_accepted_at?: string | null
          privacy_policy_version?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          phone_hmac?: string | null
          phone_hmac_version?: number | null
          privacy_policy_accepted_at?: string | null
          privacy_policy_version?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: []
      }
      sunset_blasts: {
        Row: {
          audience_selected_at: string | null
          capture_location: unknown
          captured_at: string | null
          created_at: string
          dispatched_at: string | null
          display_object_path: string | null
          expires_at: string
          failure_code: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["blast_kind"]
          original_object_path: string | null
          sender_id: string
          status: Database["public"]["Enums"]["blast_status"]
          thumbnail_object_path: string | null
          updated_at: string
        }
        Insert: {
          audience_selected_at?: string | null
          capture_location?: unknown
          captured_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          display_object_path?: string | null
          expires_at: string
          failure_code?: string | null
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["blast_kind"]
          original_object_path?: string | null
          sender_id: string
          status?: Database["public"]["Enums"]["blast_status"]
          thumbnail_object_path?: string | null
          updated_at?: string
        }
        Update: {
          audience_selected_at?: string | null
          capture_location?: unknown
          captured_at?: string | null
          created_at?: string
          dispatched_at?: string | null
          display_object_path?: string | null
          expires_at?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["blast_kind"]
          original_object_path?: string | null
          sender_id?: string
          status?: Database["public"]["Enums"]["blast_status"]
          thumbnail_object_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sunset_blasts_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_photo_upload_path: {
        Args: { p_blast_id: string; p_object_path: string }
        Returns: undefined
      }
      claim_notification_outbox: {
        Args: { p_limit: number }
        Returns: {
          attempt_count: number
          blast_id: string
          devices: Json
          kind: Database["public"]["Enums"]["blast_kind"]
          outbox_id: string
          recipient_id: string
          sender_display_name: string
        }[]
      }
      complete_photo_blast: {
        Args: {
          p_blast_id: string
          p_display_path: string
          p_original_path: string
          p_thumbnail_path: string
        }
        Returns: number
      }
      create_blast: {
        Args: {
          p_expires_at?: string
          p_idempotency_key: string
          p_kind: Database["public"]["Enums"]["blast_kind"]
          p_timezone: string
        }
        Returns: {
          audience_selected_at: string | null
          capture_location: unknown
          captured_at: string | null
          created_at: string
          dispatched_at: string | null
          display_object_path: string | null
          expires_at: string
          failure_code: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["blast_kind"]
          original_object_path: string | null
          sender_id: string
          status: Database["public"]["Enums"]["blast_status"]
          thumbnail_object_path: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "sunset_blasts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dispatch_blast: { Args: { p_blast_id: string }; Returns: number }
      finalize_verified_profile: {
        Args: { p_privacy_policy_version: string }
        Returns: undefined
      }
      finish_notification_outbox: {
        Args: {
          p_error_code?: string
          p_outbox_id: string
          p_results: Json
          p_retry: boolean
        }
        Returns: undefined
      }
      get_blast_access: {
        Args: { p_blast_id: string }
        Returns: {
          blast_id: string
          created_at: string
          display_object_path: string
          expires_at: string
          kind: Database["public"]["Enums"]["blast_kind"]
          sender_display_name: string
        }[]
      }
      register_device: {
        Args: {
          p_app_version?: string
          p_platform: Database["public"]["Enums"]["device_platform"]
          p_push_token: string
        }
        Returns: string
      }
      replace_contact_matches: {
        Args: {
          p_consented_at: string
          p_contact_hmac_hex: string[]
          p_hmac_version: number
        }
        Returns: undefined
      }
      select_and_persist_recipients: {
        Args: { p_blast_id: string }
        Returns: number
      }
      upsert_location_snapshot: {
        Args: {
          p_accuracy_m: number
          p_captured_at: string
          p_latitude: number
          p_longitude: number
          p_source?: Database["public"]["Enums"]["location_source"]
        }
        Returns: {
          accuracy_m: number
          captured_at: string
          created_at: string
          expires_at: string
          id: string
          location: unknown
          source: Database["public"]["Enums"]["location_source"]
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "location_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      blast_kind: "nudge" | "photo"
      blast_status:
        | "draft"
        | "uploading"
        | "ready"
        | "dispatching"
        | "dispatched"
        | "failed_invalid_input"
        | "failed_upload"
        | "failed_delivery"
      device_platform: "ios" | "android"
      location_source: "foreground" | "background"
      profile_status: "pending" | "active" | "suspended" | "deleted"
      recipient_delivery_state:
        | "pending"
        | "queued"
        | "accepted"
        | "delivered"
        | "failed"
        | "invalid_token"
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
      blast_kind: ["nudge", "photo"],
      blast_status: [
        "draft",
        "uploading",
        "ready",
        "dispatching",
        "dispatched",
        "failed_invalid_input",
        "failed_upload",
        "failed_delivery",
      ],
      device_platform: ["ios", "android"],
      location_source: ["foreground", "background"],
      profile_status: ["pending", "active", "suspended", "deleted"],
      recipient_delivery_state: [
        "pending",
        "queued",
        "accepted",
        "delivered",
        "failed",
        "invalid_token",
      ],
    },
  },
} as const

