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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_outputs: {
        Row: {
          case_id: string
          citation_map: Json
          content: Json
          created_at: string
          guardrail_results: Json | null
          id: string
          input_source_ids: string[]
          model_id: string | null
          output_type: string
          prompt_version: string | null
          requires_review: boolean
          stale: boolean
          superseded_by_id: string | null
          unsupported_sentences_removed: number
          version: number
        }
        Insert: {
          case_id: string
          citation_map: Json
          content: Json
          created_at?: string
          guardrail_results?: Json | null
          id?: string
          input_source_ids?: string[]
          model_id?: string | null
          output_type: string
          prompt_version?: string | null
          requires_review?: boolean
          stale?: boolean
          superseded_by_id?: string | null
          unsupported_sentences_removed?: number
          version?: number
        }
        Update: {
          case_id?: string
          citation_map?: Json
          content?: Json
          created_at?: string
          guardrail_results?: Json | null
          id?: string
          input_source_ids?: string[]
          model_id?: string | null
          output_type?: string
          prompt_version?: string | null
          requires_review?: boolean
          stale?: boolean
          superseded_by_id?: string | null
          unsupported_sentences_removed?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_outputs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_outputs_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "ai_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      applicant_questions: {
        Row: {
          answer_text: string | null
          answered_at: string | null
          case_id: string
          created_at: string
          created_by: string
          id: string
          kind: string
          reference_code: string
          source_id: string | null
          source_kind: string
          status: string
          text: string
          updated_at: string
        }
        Insert: {
          answer_text?: string | null
          answered_at?: string | null
          case_id: string
          created_at?: string
          created_by: string
          id?: string
          kind: string
          reference_code: string
          source_id?: string | null
          source_kind: string
          status?: string
          text: string
          updated_at?: string
        }
        Update: {
          answer_text?: string | null
          answered_at?: string | null
          case_id?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          reference_code?: string
          source_id?: string | null
          source_kind?: string
          status?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applicant_questions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      attention_flags: {
        Row: {
          case_id: string
          category: string | null
          created_at: string
          detected_by: string | null
          id: string
          legal_conclusion: string | null
          observation: string | null
          reason_for_review: string | null
          reference_code: string
          rule_id: string | null
          status: string
          urgency: string | null
          visible_to_applicant: boolean
        }
        Insert: {
          case_id: string
          category?: string | null
          created_at?: string
          detected_by?: string | null
          id?: string
          legal_conclusion?: string | null
          observation?: string | null
          reason_for_review?: string | null
          reference_code: string
          rule_id?: string | null
          status?: string
          urgency?: string | null
          visible_to_applicant?: boolean
        }
        Update: {
          case_id?: string
          category?: string | null
          created_at?: string
          detected_by?: string | null
          id?: string
          legal_conclusion?: string | null
          observation?: string | null
          reason_for_review?: string | null
          reference_code?: string
          rule_id?: string | null
          status?: string
          urgency?: string | null
          visible_to_applicant?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "attention_flags_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          case_id: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          case_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          case_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          applicant_id: string
          created_at: string
          current_stage: string | null
          id: string
          jurisdiction: string
          preferred_language: string
          reference_code: string
          status: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          current_stage?: string | null
          id?: string
          jurisdiction?: string
          preferred_language?: string
          reference_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          current_stage?: string | null
          id?: string
          jurisdiction?: string
          preferred_language?: string
          reference_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_jurisdiction_fkey"
            columns: ["jurisdiction"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      clarification_items: {
        Row: {
          case_id: string
          category: string | null
          created_at: string
          detected_by: string | null
          id: string
          neutral_question: string | null
          observation: string | null
          probable_cause: string | null
          reference_code: string
          rule_id: string | null
          side_a_source_id: string | null
          side_b_source_id: string | null
          status: string
          urgency: string | null
          user_responded_at: string | null
          user_response: string | null
        }
        Insert: {
          case_id: string
          category?: string | null
          created_at?: string
          detected_by?: string | null
          id?: string
          neutral_question?: string | null
          observation?: string | null
          probable_cause?: string | null
          reference_code: string
          rule_id?: string | null
          side_a_source_id?: string | null
          side_b_source_id?: string | null
          status?: string
          urgency?: string | null
          user_responded_at?: string | null
          user_response?: string | null
        }
        Update: {
          case_id?: string
          category?: string | null
          created_at?: string
          detected_by?: string | null
          id?: string
          neutral_question?: string | null
          observation?: string | null
          probable_cause?: string | null
          reference_code?: string
          rule_id?: string | null
          side_a_source_id?: string | null
          side_b_source_id?: string | null
          status?: string
          urgency?: string | null
          user_responded_at?: string | null
          user_response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clarification_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarification_items_side_a_source_id_fkey"
            columns: ["side_a_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clarification_items_side_b_source_id_fkey"
            columns: ["side_b_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      community_blocks: {
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
        Relationships: []
      }
      community_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_dm_threads: {
        Row: {
          created_at: string
          id: string
          user_high: string
          user_low: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_high: string
          user_low: string
        }
        Update: {
          created_at?: string
          id?: string
          user_high?: string
          user_low?: string
        }
        Relationships: []
      }
      community_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          dm_thread_id: string | null
          hidden_at: string | null
          hidden_by: string | null
          id: string
          room_id: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          dm_thread_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          room_id?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          dm_thread_id?: string | null
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          room_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_dm_thread_id_fkey"
            columns: ["dm_thread_id"]
            isOneToOne: false
            referencedRelation: "community_dm_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "community_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          id: string
          image_url: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          image_url?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          id?: string
          image_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      community_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          handle: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      community_reports: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reporter_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      community_rooms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          applicant_id: string
          case_id: string
          consent_text_version: string
          consent_type: string
          created_at: string
          granted: boolean
          granted_at: string
          id: string
          ip_address: unknown
          revoked_at: string | null
          user_agent: string | null
        }
        Insert: {
          applicant_id: string
          case_id: string
          consent_text_version: string
          consent_type: string
          created_at?: string
          granted: boolean
          granted_at?: string
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          user_agent?: string | null
        }
        Update: {
          applicant_id?: string
          case_id?: string
          consent_text_version?: string
          consent_type?: string
          created_at?: string
          granted?: boolean
          granted_at?: string
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_slots: {
        Row: {
          created_at: string
          duration_minutes: number
          id: string
          mode: string
          professional_id: string
          starts_at: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          id?: string
          mode?: string
          professional_id: string
          starts_at: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          id?: string
          mode?: string
          professional_id?: string
          starts_at?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_slots_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "bookable_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_slots_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          applicant_display_name: string | null
          applicant_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          language: string | null
          professional_id: string
          slot_id: string
          status: string
          topic: string | null
        }
        Insert: {
          applicant_display_name?: string | null
          applicant_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          language?: string | null
          professional_id: string
          slot_id: string
          status?: string
          topic?: string | null
        }
        Update: {
          applicant_display_name?: string | null
          applicant_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          language?: string | null
          professional_id?: string
          slot_id?: string
          status?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "bookable_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "consultation_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          applicant_id: string
          cancelled_at: string | null
          case_id: string
          completed_at: string | null
          created_at: string
          id: string
          reason: string | null
          requested_at: string
          scheduled_for: string
          status: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          cancelled_at?: string | null
          case_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          cancelled_at?: string | null
          case_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          byte_size: number
          created_at: string
          document_id: string
          id: string
          is_original: boolean
          page_count: number | null
          sha256: string
          storage_path: string
          version: number
        }
        Insert: {
          byte_size: number
          created_at?: string
          document_id: string
          id?: string
          is_original?: boolean
          page_count?: number | null
          sha256: string
          storage_path: string
          version: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          document_id?: string
          id?: string
          is_original?: boolean
          page_count?: number | null
          sha256?: string
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string
          created_at: string
          declared_origin: string | null
          doc_type: string | null
          doc_type_confidence: number | null
          doc_type_user_confirmed: boolean
          document_date: string | null
          document_date_certainty: string | null
          duplicate_of_id: string | null
          id: string
          issuer_stated_on_document: string | null
          mime_type: string
          original_filename: string
          possible_missing_pages: boolean
          primary_language: string | null
          private_hold: boolean
          processing_status: string
          readability: string | null
          reference_code: string
          sha256: string
          size_bytes: number
          storage_path: string
          translation_status: string
          uploaded_by: string
        }
        Insert: {
          case_id: string
          created_at?: string
          declared_origin?: string | null
          doc_type?: string | null
          doc_type_confidence?: number | null
          doc_type_user_confirmed?: boolean
          document_date?: string | null
          document_date_certainty?: string | null
          duplicate_of_id?: string | null
          id?: string
          issuer_stated_on_document?: string | null
          mime_type: string
          original_filename: string
          possible_missing_pages?: boolean
          primary_language?: string | null
          private_hold?: boolean
          processing_status?: string
          readability?: string | null
          reference_code: string
          sha256: string
          size_bytes: number
          storage_path: string
          translation_status?: string
          uploaded_by: string
        }
        Update: {
          case_id?: string
          created_at?: string
          declared_origin?: string | null
          doc_type?: string | null
          doc_type_confidence?: number | null
          doc_type_user_confirmed?: boolean
          document_date?: string | null
          document_date_certainty?: string | null
          duplicate_of_id?: string | null
          id?: string
          issuer_stated_on_document?: string | null
          mime_type?: string
          original_filename?: string
          possible_missing_pages?: boolean
          primary_language?: string | null
          private_hold?: boolean
          processing_status?: string
          readability?: string | null
          reference_code?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          translation_status?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sources: {
        Row: {
          created_at: string
          event_id: string
          fact_id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          fact_id: string
          source_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          fact_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sources_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "timeline_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sources_fact_id_fkey"
            columns: ["fact_id"]
            isOneToOne: false
            referencedRelation: "extracted_facts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          case_id: string
          consequences: string | null
          created_at: string
          date_calendar: string
          date_certainty: string
          date_end: string | null
          date_start: string | null
          feared_future_event: boolean
          id: string
          location_name: string | null
          neutral_summary: string | null
          possible_divergence: boolean
          private_hold: boolean
          professional_review_status: string
          provenance: string
          reference_code: string
          section_key: string | null
          stale: boolean
          supersedes_id: string | null
          title: string
          unsupported: boolean
          updated_at: string
          user_confirmed: boolean
          user_description: string | null
          version: number
        }
        Insert: {
          case_id: string
          consequences?: string | null
          created_at?: string
          date_calendar?: string
          date_certainty?: string
          date_end?: string | null
          date_start?: string | null
          feared_future_event?: boolean
          id?: string
          location_name?: string | null
          neutral_summary?: string | null
          possible_divergence?: boolean
          private_hold?: boolean
          professional_review_status?: string
          provenance?: string
          reference_code: string
          section_key?: string | null
          stale?: boolean
          supersedes_id?: string | null
          title: string
          unsupported?: boolean
          updated_at?: string
          user_confirmed?: boolean
          user_description?: string | null
          version?: number
        }
        Update: {
          case_id?: string
          consequences?: string | null
          created_at?: string
          date_calendar?: string
          date_certainty?: string
          date_end?: string | null
          date_start?: string | null
          feared_future_event?: boolean
          id?: string
          location_name?: string | null
          neutral_summary?: string | null
          possible_divergence?: boolean
          private_hold?: boolean
          professional_review_status?: string
          provenance?: string
          reference_code?: string
          section_key?: string | null
          stale?: boolean
          supersedes_id?: string | null
          title?: string
          unsupported?: boolean
          updated_at?: string
          user_confirmed?: boolean
          user_description?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "timeline_view"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_event_links: {
        Row: {
          case_id: string
          confidence: number
          created_at: string
          created_by: string
          document_id: string
          event_id: string
          excerpt: string | null
          excerpt_source_id: string | null
          explanation: string
          id: string
          matched_features: Json
          model_id: string | null
          professional_confirmed: boolean
          prompt_version: string | null
          relationship: string
          requires_professional_review: boolean
          review_status: string
          stale: boolean
          user_confirmed: boolean
        }
        Insert: {
          case_id: string
          confidence: number
          created_at?: string
          created_by: string
          document_id: string
          event_id: string
          excerpt?: string | null
          excerpt_source_id?: string | null
          explanation: string
          id?: string
          matched_features: Json
          model_id?: string | null
          professional_confirmed?: boolean
          prompt_version?: string | null
          relationship: string
          requires_professional_review?: boolean
          review_status?: string
          stale?: boolean
          user_confirmed?: boolean
        }
        Update: {
          case_id?: string
          confidence?: number
          created_at?: string
          created_by?: string
          document_id?: string
          event_id?: string
          excerpt?: string | null
          excerpt_source_id?: string | null
          explanation?: string
          id?: string
          matched_features?: Json
          model_id?: string | null
          professional_confirmed?: boolean
          prompt_version?: string | null
          relationship?: string
          requires_professional_review?: boolean
          review_status?: string
          stale?: boolean
          user_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "evidence_event_links_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_event_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_event_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_event_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "timeline_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_event_links_excerpt_source_id_fkey"
            columns: ["excerpt_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      export_packages: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          exclusion_manifest: Json | null
          expires_at: string | null
          format: string
          id: string
          professional_approved_by: string
          recipient_id: string | null
          scopes: string[]
          sha256: string
          storage_path: string
          summary_output_id: string | null
          watermark_text: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          exclusion_manifest?: Json | null
          expires_at?: string | null
          format: string
          id?: string
          professional_approved_by: string
          recipient_id?: string | null
          scopes: string[]
          sha256: string
          storage_path: string
          summary_output_id?: string | null
          watermark_text?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          exclusion_manifest?: Json | null
          expires_at?: string | null
          format?: string
          id?: string
          professional_approved_by?: string
          recipient_id?: string | null
          scopes?: string[]
          sha256?: string
          storage_path?: string
          summary_output_id?: string | null
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_packages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_packages_professional_approved_by_fkey"
            columns: ["professional_approved_by"]
            isOneToOne: false
            referencedRelation: "bookable_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_packages_professional_approved_by_fkey"
            columns: ["professional_approved_by"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_packages_summary_output_id_fkey"
            columns: ["summary_output_id"]
            isOneToOne: false
            referencedRelation: "ai_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      extracted_facts: {
        Row: {
          case_id: string
          created_at: string
          extraction_confidence: number
          fact_type: string
          id: string
          model_id: string | null
          original_wording: string
          professional_review_status: string
          prompt_version: string | null
          provenance: string
          reference_code: string
          source_id: string
          stale: boolean
          superseded_by_id: string | null
          updated_at: string
          user_confirmed: boolean
          user_confirmed_at: string | null
          user_marked_unsure: boolean
          value_structured: Json | null
          value_text: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          extraction_confidence: number
          fact_type: string
          id?: string
          model_id?: string | null
          original_wording: string
          professional_review_status?: string
          prompt_version?: string | null
          provenance: string
          reference_code: string
          source_id: string
          stale?: boolean
          superseded_by_id?: string | null
          updated_at?: string
          user_confirmed?: boolean
          user_confirmed_at?: string | null
          user_marked_unsure?: boolean
          value_structured?: Json | null
          value_text?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          extraction_confidence?: number
          fact_type?: string
          id?: string
          model_id?: string | null
          original_wording?: string
          professional_review_status?: string
          prompt_version?: string | null
          provenance?: string
          reference_code?: string
          source_id?: string
          stale?: boolean
          superseded_by_id?: string | null
          updated_at?: string
          user_confirmed?: boolean
          user_confirmed_at?: string | null
          user_marked_unsure?: boolean
          value_structured?: Json | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_facts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_facts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_facts_superseded_by_id_fkey"
            columns: ["superseded_by_id"]
            isOneToOne: false
            referencedRelation: "extracted_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      jurisdictions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      missing_info_items: {
        Row: {
          case_id: string
          category: string | null
          created_at: string
          id: string
          observation: string | null
          reference_code: string
          related_document_id: string | null
          related_event_id: string | null
          rule_id: string
          status: string
          suggested_action: string | null
          user_explanation: string | null
        }
        Insert: {
          case_id: string
          category?: string | null
          created_at?: string
          id?: string
          observation?: string | null
          reference_code: string
          related_document_id?: string | null
          related_event_id?: string | null
          rule_id: string
          status?: string
          suggested_action?: string | null
          user_explanation?: string | null
        }
        Update: {
          case_id?: string
          category?: string | null
          created_at?: string
          id?: string
          observation?: string | null
          reference_code?: string
          related_document_id?: string | null
          related_event_id?: string | null
          rule_id?: string
          status?: string
          suggested_action?: string | null
          user_explanation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "missing_info_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missing_info_items_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missing_info_items_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "missing_info_items_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "timeline_view"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_outputs: {
        Row: {
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          document_version_id: string
          engine: string
          engine_version: string | null
          had_native_text_layer: boolean
          id: string
          mean_confidence: number | null
          page_number: number
          text: string | null
          user_corrected_text: string | null
          word_boxes: Json | null
        }
        Insert: {
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          document_version_id: string
          engine: string
          engine_version?: string | null
          had_native_text_layer?: boolean
          id?: string
          mean_confidence?: number | null
          page_number: number
          text?: string | null
          user_corrected_text?: string | null
          word_boxes?: Json | null
        }
        Update: {
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          document_version_id?: string
          engine?: string
          engine_version?: string | null
          had_native_text_layer?: boolean
          id?: string
          mean_confidence?: number | null
          page_number?: number
          text?: string | null
          user_corrected_text?: string | null
          word_boxes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_outputs_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          jurisdiction_code: string | null
          kind: string
          name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction_code?: string | null
          kind: string
          name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_code?: string | null
          kind?: string
          name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_jurisdiction_code_fkey"
            columns: ["jurisdiction_code"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      pro_notices_seen: {
        Row: {
          id: string
          notice_key: string
          professional_user_id: string
          seen_at: string
        }
        Insert: {
          id?: string
          notice_key: string
          professional_user_id: string
          seen_at?: string
        }
        Update: {
          id?: string
          notice_key?: string
          professional_user_id?: string
          seen_at?: string
        }
        Relationships: []
      }
      professional_notes: {
        Row: {
          author_id: string
          body: string
          case_id: string
          created_at: string
          id: string
          organization_id: string
          privileged: boolean
        }
        Insert: {
          author_id: string
          body: string
          case_id: string
          created_at?: string
          id?: string
          organization_id: string
          privileged?: boolean
        }
        Update: {
          author_id?: string
          body?: string
          case_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          privileged?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "professional_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "bookable_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_reviews: {
        Row: {
          case_id: string
          disposition: string
          edited_content: Json | null
          id: string
          reason: string | null
          reviewed_at: string
          reviewer_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          case_id: string
          disposition: string
          edited_content?: Json | null
          id?: string
          reason?: string | null
          reviewed_at?: string
          reviewer_id: string
          target_id: string
          target_type: string
        }
        Update: {
          case_id?: string
          disposition?: string
          edited_content?: Json | null
          id?: string
          reason?: string | null
          reviewed_at?: string
          reviewer_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_reviews_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "bookable_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          consultation_blurb: string | null
          created_at: string
          display_name: string | null
          id: string
          languages: string[]
          license_jurisdiction: string | null
          license_number: string | null
          organization_id: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          active?: boolean
          consultation_blurb?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          languages?: string[]
          license_jurisdiction?: string | null
          license_number?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          active?: boolean
          consultation_blurb?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          languages?: string[]
          license_jurisdiction?: string | null
          license_number?: string | null
          organization_id?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_license_jurisdiction_fkey"
            columns: ["license_jurisdiction"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "professionals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          orientation_completed_at: string | null
          preferred_language: string
          preferred_locale: string
          recovery_codes_saved_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          orientation_completed_at?: string | null
          preferred_language?: string
          preferred_locale?: string
          recovery_codes_saved_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          orientation_completed_at?: string | null
          preferred_language?: string
          preferred_locale?: string
          recovery_codes_saved_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      refusal_logs: {
        Row: {
          case_id: string | null
          category: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          case_id?: string | null
          category: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          case_id?: string | null
          category?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refusal_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      review_notices: {
        Row: {
          acknowledged_at: string | null
          case_id: string
          correction_id: string | null
          created_at: string
          id: string
          kind: string
          reviewer_id: string
          target_id: string
          target_type: string
        }
        Insert: {
          acknowledged_at?: string | null
          case_id: string
          correction_id?: string | null
          created_at?: string
          id?: string
          kind: string
          reviewer_id: string
          target_id: string
          target_type: string
        }
        Update: {
          acknowledged_at?: string | null
          case_id?: string
          correction_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          reviewer_id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_notices_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notices_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "user_corrections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notices_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "bookable_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notices_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      review_status: {
        Row: {
          case_id: string
          changed_at: string
          changed_by: string
          id: string
          previous_status: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          case_id: string
          changed_at?: string
          changed_by: string
          id?: string
          previous_status?: string | null
          status: string
          target_id: string
          target_type: string
        }
        Update: {
          case_id?: string
          changed_at?: string
          changed_by?: string
          id?: string
          previous_status?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_status_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      sharing_grants: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          professional_id: string
          purpose_note: string | null
          revoked_at: string | null
          scopes: string[]
          starts_at: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          professional_id: string
          purpose_note?: string | null
          revoked_at?: string | null
          scopes: string[]
          starts_at?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          professional_id?: string
          purpose_note?: string | null
          revoked_at?: string | null
          scopes?: string[]
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sharing_grants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sharing_grants_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "bookable_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sharing_grants_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          case_id: string
          created_at: string
          id: string
          reference_code: string | null
          reference_id: string
          source_type: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          reference_code?: string | null
          reference_id: string
          source_type: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          reference_code?: string | null
          reference_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      story_responses: {
        Row: {
          body_text: string | null
          case_id: string
          created_at: string
          id: string
          input_mode: string
          input_type: string
          is_skipped: boolean
          language: string
          private_hold: boolean
          prompt_code: string
          prompt_version: string
          reference_code: string
          section_key: string
          skip_reason: string | null
          supersedes_id: string | null
          value: Json
          version: number
        }
        Insert: {
          body_text?: string | null
          case_id: string
          created_at?: string
          id?: string
          input_mode?: string
          input_type?: string
          is_skipped?: boolean
          language?: string
          private_hold?: boolean
          prompt_code: string
          prompt_version?: string
          reference_code: string
          section_key?: string
          skip_reason?: string | null
          supersedes_id?: string | null
          value?: Json
          version?: number
        }
        Update: {
          body_text?: string | null
          case_id?: string
          created_at?: string
          id?: string
          input_mode?: string
          input_type?: string
          is_skipped?: boolean
          language?: string
          private_hold?: boolean
          prompt_code?: string
          prompt_version?: string
          reference_code?: string
          section_key?: string
          skip_reason?: string | null
          supersedes_id?: string | null
          value?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_responses_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_responses_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "story_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_responses_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "story_responses_latest"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          case_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          plain_language_body: string | null
          related_id: string | null
          related_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          plain_language_body?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          plain_language_body?: string | null
          related_id?: string | null
          related_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          certified: boolean
          created_at: string
          engine: string
          id: string
          source_id: string
          source_language: string
          target_language: string
          term_drift_flags: Json | null
          translated_text: string
        }
        Insert: {
          certified?: boolean
          created_at?: string
          engine: string
          id?: string
          source_id: string
          source_language: string
          target_language: string
          term_drift_flags?: Json | null
          translated_text: string
        }
        Update: {
          certified?: boolean
          created_at?: string
          engine?: string
          id?: string
          source_id?: string
          source_language?: string
          target_language?: string
          term_drift_flags?: Json | null
          translated_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "translations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      user_corrections: {
        Row: {
          affected_after_review: boolean
          case_id: string
          corrected_by: string
          corrected_value: Json
          correction_type: string
          created_at: string
          field_name: string
          id: string
          previous_value: Json | null
          target_id: string
          target_type: string
          triggered_recompute: boolean
          user_note: string | null
        }
        Insert: {
          affected_after_review?: boolean
          case_id: string
          corrected_by: string
          corrected_value: Json
          correction_type: string
          created_at?: string
          field_name: string
          id?: string
          previous_value?: Json | null
          target_id: string
          target_type: string
          triggered_recompute?: boolean
          user_note?: string | null
        }
        Update: {
          affected_after_review?: boolean
          case_id?: string
          corrected_by?: string
          corrected_value?: Json
          correction_type?: string
          created_at?: string
          field_name?: string
          id?: string
          previous_value?: Json | null
          target_id?: string
          target_type?: string
          triggered_recompute?: boolean
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_corrections_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
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
      bookable_professionals: {
        Row: {
          consultation_blurb: string | null
          display_name: string | null
          id: string | null
          languages: string[] | null
          license_jurisdiction: string | null
        }
        Insert: {
          consultation_blurb?: string | null
          display_name?: string | null
          id?: string | null
          languages?: string[] | null
          license_jurisdiction?: string | null
        }
        Update: {
          consultation_blurb?: string | null
          display_name?: string | null
          id?: string | null
          languages?: string[] | null
          license_jurisdiction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_license_jurisdiction_fkey"
            columns: ["license_jurisdiction"]
            isOneToOne: false
            referencedRelation: "jurisdictions"
            referencedColumns: ["code"]
          },
        ]
      }
      story_responses_latest: {
        Row: {
          body_text: string | null
          case_id: string | null
          created_at: string | null
          id: string | null
          input_type: string | null
          is_skipped: boolean | null
          language: string | null
          private_hold: boolean | null
          prompt_code: string | null
          prompt_version: string | null
          reference_code: string | null
          section_key: string | null
          skip_reason: string | null
          supersedes_id: string | null
          value: Json | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "story_responses_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_responses_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "story_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_responses_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "story_responses_latest"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_view: {
        Row: {
          case_id: string | null
          consequences: string | null
          created_at: string | null
          date_calendar: string | null
          date_certainty: string | null
          date_end: string | null
          date_start: string | null
          evidence_count: number | null
          feared_future_event: boolean | null
          id: string | null
          location_name: string | null
          neutral_summary: string | null
          possible_divergence: boolean | null
          private_hold: boolean | null
          professional_review_status: string | null
          provenance: string | null
          reference_code: string | null
          section_key: string | null
          source_count: number | null
          stale: boolean | null
          supersedes_id: string | null
          title: string | null
          unsupported: boolean | null
          user_confirmed: boolean | null
          user_description: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "timeline_view"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      applicant_has_grant_to_professional: {
        Args: { p_professional_id: string }
        Returns: boolean
      }
      cascade_stale_from_fact: {
        Args: { _correction_id?: string; _fact_id: string }
        Returns: Json
      }
      has_active_consent: {
        Args: { _consent_type: string; _user_id: string }
        Returns: boolean
      }
      has_case_access: {
        Args: { _case_id: string; _scope: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_blocked_pair: { Args: { _a: string; _b: string }; Returns: boolean }
      is_bookable_professional: {
        Args: { p_professional_id: string }
        Returns: boolean
      }
      is_own_professional: {
        Args: { p_professional_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "applicant" | "professional" | "platform_admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["applicant", "professional", "platform_admin"],
    },
  },
} as const
