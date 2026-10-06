export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          credit_limit: number;
          credits_used: number;
          credits_reserved: number;
          role: 'user' | 'admin';
          status: 'active' | 'suspended';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          credit_limit?: number;
          credits_used?: number;
          credits_reserved?: number;
          role?: 'user' | 'admin';
          status?: 'active' | 'suspended';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          credit_limit?: number;
          credits_used?: number;
          credits_reserved?: number;
          role?: 'user' | 'admin';
          status?: 'active' | 'suspended';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          prompt: string | null;
          framework: string;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          prompt?: string | null;
          framework?: string;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          prompt?: string | null;
          framework?: string;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_files: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          path: string;
          content: string;
          language: string;
          is_folder: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          path: string;
          content?: string;
          language?: string;
          is_folder?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          path?: string;
          content?: string;
          language?: string;
          is_folder?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      generation_history: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          prompt: string;
          model: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          prompt: string;
          model?: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          prompt?: string;
          model?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      project_dependencies: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          version: string;
          created_at?: string;
        };
        Update: { id?: string; project_id?: string; name?: string; version?: string };
        Relationships: [];
      };
      product_plans: {
        Row: {
          id: string;
          project_id: string;
          vision: Json;
          personas: Json;
          mvp: Json;
          features: Json;
          roadmap: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          vision?: Json;
          personas?: Json;
          mvp?: Json;
          features?: Json;
          roadmap?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          vision?: Json;
          personas?: Json;
          mvp?: Json;
          features?: Json;
          roadmap?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_tasks: {
        Row: {
          id: string;
          project_id: string;
          product_plan_id: string | null;
          title: string;
          description: string;
          type: string;
          priority: string;
          status: string;
          requirements: string | null;
          acceptance_criteria: Json;
          technical_plan: Json;
          affected_files: Json;
          dependencies: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          product_plan_id?: string | null;
          title: string;
          description: string;
          type?: string;
          priority?: string;
          status?: string;
          requirements?: string | null;
          acceptance_criteria?: Json;
          technical_plan?: Json;
          affected_files?: Json;
          dependencies?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          product_plan_id?: string | null;
          title?: string;
          description?: string;
          type?: string;
          priority?: string;
          status?: string;
          requirements?: string | null;
          acceptance_criteria?: Json;
          technical_plan?: Json;
          affected_files?: Json;
          dependencies?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          project_id: string;
          task_id: string | null;
          agent_type: string;
          status: string;
          current_step: string | null;
          input: Json;
          output: Json;
          error: string | null;
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          task_id?: string | null;
          agent_type: string;
          status?: string;
          current_step?: string | null;
          input?: Json;
          output?: Json;
          error?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          task_id?: string | null;
          agent_type?: string;
          status?: string;
          current_step?: string | null;
          input?: Json;
          output?: Json;
          error?: string | null;
          started_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      project_embeddings: {
        Row: {
          id: string;
          project_id: string;
          file_id: string | null;
          chunk_index: number;
          content: string;
          embedding: Json;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          file_id?: string | null;
          chunk_index?: number;
          content: string;
          embedding?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          file_id?: string | null;
          chunk_index?: number;
          content?: string;
          embedding?: Json;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_ai_keys: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          model: string;
          encrypted_key: string;
          key_hint: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider?: string;
          model?: string;
          encrypted_key: string;
          key_hint?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          model?: string;
          encrypted_key?: string;
          key_hint?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ai_token_usage: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          provider: string;
          model: string;
          operation: string;
          input_tokens: number;
          output_tokens: number;
          total_tokens: number;
          key_source: string;
          success: boolean;
          credit_used: number;
          latency_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          provider: string;
          model: string;
          operation: string;
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          key_source?: string;
          success?: boolean;
          credit_used?: number;
          latency_ms?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_id?: string | null;
          provider?: string;
          model?: string;
          operation?: string;
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          key_source?: string;
          success?: boolean;
          credit_used?: number;
          latency_ms?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_audit_logs: {
        Row: {
          id: string;
          admin_user_id: string | null;
          admin_email: string;
          action: string;
          target_type: string;
          target_id: string | null;
          details: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_user_id?: string | null;
          admin_email: string;
          action: string;
          target_type: string;
          target_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_user_id?: string | null;
          admin_email?: string;
          action?: string;
          target_type?: string;
          target_id?: string | null;
          details?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      system_errors: {
        Row: {
          id: string;
          severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
          category: string;
          provider: string | null;
          status_code: number | null;
          message: string;
          project_id: string | null;
          user_id: string | null;
          user_email: string | null;
          metadata: Json;
          occurrence_count: number;
          first_seen_at: string;
          last_seen_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
          category: string;
          provider?: string | null;
          status_code?: number | null;
          message: string;
          project_id?: string | null;
          user_id?: string | null;
          user_email?: string | null;
          metadata?: Json;
          occurrence_count?: number;
          first_seen_at?: string;
          last_seen_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          severity?: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
          category?: string;
          provider?: string | null;
          status_code?: number | null;
          message?: string;
          project_id?: string | null;
          user_id?: string | null;
          user_email?: string | null;
          metadata?: Json;
          occurrence_count?: number;
          first_seen_at?: string;
          last_seen_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      provider_health_events: {
        Row: {
          id: string;
          provider: string;
          model: string | null;
          status: string;
          event_type: string;
          status_code: number | null;
          latency_ms: number | null;
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          model?: string | null;
          status: string;
          event_type: string;
          status_code?: number | null;
          latency_ms?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          model?: string | null;
          status?: string;
          event_type?: string;
          status_code?: number | null;
          latency_ms?: number | null;
          message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_settings: {
        Row: {
          id: string;
          primary_provider: string;
          fallback_provider: string;
          auto_fallback_enabled: boolean;
          maintenance_mode: boolean;
          new_registrations_enabled: boolean;
          default_credit_limit: number;
          system_announcement: string | null;
          razorpay_key_id: string | null;
          razorpay_secret_set: boolean;
          razorpay_webhook_secret_set: boolean;
          razorpay_enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          primary_provider?: string;
          fallback_provider?: string;
          auto_fallback_enabled?: boolean;
          maintenance_mode?: boolean;
          new_registrations_enabled?: boolean;
          default_credit_limit?: number;
          system_announcement?: string | null;
          razorpay_key_id?: string | null;
          razorpay_secret_set?: boolean;
          razorpay_webhook_secret_set?: boolean;
          razorpay_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          primary_provider?: string;
          fallback_provider?: string;
          auto_fallback_enabled?: boolean;
          maintenance_mode?: boolean;
          new_registrations_enabled?: boolean;
          default_credit_limit?: number;
          system_announcement?: string | null;
          razorpay_key_id?: string | null;
          razorpay_secret_set?: boolean;
          razorpay_webhook_secret_set?: boolean;
          razorpay_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      subscription_plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          price_inr: number;
          billing_interval: string;
          credits: number;
          features: Json;
          badge: string | null;
          razorpay_plan_id: string | null;
          is_active: boolean;
          is_published: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          price_inr?: number;
          billing_interval?: string;
          credits?: number;
          features?: Json;
          badge?: string | null;
          razorpay_plan_id?: string | null;
          is_active?: boolean;
          is_published?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          price_inr?: number;
          billing_interval?: string;
          credits?: number;
          features?: Json;
          badge?: string | null;
          razorpay_plan_id?: string | null;
          is_active?: boolean;
          is_published?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          description: string | null;
          discount_type: 'percent' | 'fixed';
          discount_value: number;
          max_redemptions: number | null;
          redemptions_count: number;
          per_user_limit: number;
          min_plan_amount: number;
          applicable_plans: Json;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          description?: string | null;
          discount_type?: 'percent' | 'fixed';
          discount_value: number;
          max_redemptions?: number | null;
          redemptions_count?: number;
          per_user_limit?: number;
          min_plan_amount?: number;
          applicable_plans?: Json;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          description?: string | null;
          discount_type?: 'percent' | 'fixed';
          discount_value?: number;
          max_redemptions?: number | null;
          redemptions_count?: number;
          per_user_limit?: number;
          min_plan_amount?: number;
          applicable_plans?: Json;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      coupon_redemptions: {
        Row: {
          id: string;
          coupon_id: string;
          coupon_code: string;
          user_id: string;
          user_email: string | null;
          plan_id: string;
          discount_applied: number;
          final_price: number;
          redeemed_at: string;
        };
        Insert: {
          id?: string;
          coupon_id: string;
          coupon_code: string;
          user_id: string;
          user_email?: string | null;
          plan_id: string;
          discount_applied?: number;
          final_price?: number;
          redeemed_at?: string;
        };
        Update: {
          id?: string;
          coupon_id?: string;
          coupon_code?: string;
          user_id?: string;
          user_email?: string | null;
          plan_id?: string;
          discount_applied?: number;
          final_price?: number;
          redeemed_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_ai_generation: {
        Args: { p_project_id: string; p_operations: Json; p_dependencies?: Json };
        Returns: undefined;
      };
      reserve_user_credit: {
        Args: { p_user_id: string; p_amount?: number; p_limit?: number };
        Returns: boolean;
      };
      finalize_user_credit: {
        Args: { p_user_id: string; p_success: boolean; p_amount?: number };
        Returns: undefined;
      };
      release_user_credit: {
        Args: { p_user_id: string; p_amount?: number };
        Returns: undefined;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
export type ProjectFile = Database['public']['Tables']['project_files']['Row'];
export type GenerationHistory = Database['public']['Tables']['generation_history']['Row'];
export type ProjectDependency = Database['public']['Tables']['project_dependencies']['Row'];
export type DbProductPlan = Database['public']['Tables']['product_plans']['Row'];
export type DbProductTask = Database['public']['Tables']['product_tasks']['Row'];
export type DbAgentRun = Database['public']['Tables']['agent_runs']['Row'];
export type DbProjectEmbedding = Database['public']['Tables']['project_embeddings']['Row'];
export type DbUserAiKey = Database['public']['Tables']['user_ai_keys']['Row'];
export type DbAiTokenUsage = Database['public']['Tables']['ai_token_usage']['Row'];
export type AdminAuditLog = Database['public']['Tables']['admin_audit_logs']['Row'];
export type SystemErrorRecord = Database['public']['Tables']['system_errors']['Row'];
export type ProviderHealthEvent = Database['public']['Tables']['provider_health_events']['Row'];
export type AdminSettings = Database['public']['Tables']['admin_settings']['Row'];
export type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row'];
export type DbCoupon = Database['public']['Tables']['coupons']['Row'];
export type DbCouponRedemption = Database['public']['Tables']['coupon_redemptions']['Row'];