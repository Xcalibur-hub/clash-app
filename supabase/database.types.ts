export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      advertisers: {
        Row: {
          created_at: string
          created_by_profile_id: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["advertiser_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id: string
          id: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["advertiser_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["advertiser_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisers_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_daily_topics: {
        Row: {
          closes_at: string
          created_at: string
          description: string | null
          final_arguments_at: string
          hood: Database["public"]["Enums"]["hood_id"] | null
          id: string
          judging_at: string
          opens_at: string
          status: Database["public"]["Enums"]["arena_topic_status"]
          title: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          description?: string | null
          final_arguments_at: string
          hood?: Database["public"]["Enums"]["hood_id"] | null
          id: string
          judging_at: string
          opens_at?: string
          status?: Database["public"]["Enums"]["arena_topic_status"]
          title: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          description?: string | null
          final_arguments_at?: string
          hood?: Database["public"]["Enums"]["hood_id"] | null
          id?: string
          judging_at?: string
          opens_at?: string
          status?: Database["public"]["Enums"]["arena_topic_status"]
          title?: string
        }
        Relationships: []
      }
      arena_room_argument_votes: {
        Row: {
          created_at: string
          message_id: string
          profile_id: string
          room_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          profile_id: string
          room_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          profile_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_argument_votes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "arena_room_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_argument_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_argument_votes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "arena_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_room_evidence: {
        Row: {
          author_id: string
          created_at: string
          hidden_at: string | null
          id: string
          kind: Database["public"]["Enums"]["arena_evidence_kind"]
          media_object_id: string | null
          media_url: string | null
          message_id: string | null
          room_id: string
          source_url: string | null
          title: string
          topic_id: string
          useful_count: number
        }
        Insert: {
          author_id: string
          created_at?: string
          hidden_at?: string | null
          id: string
          kind: Database["public"]["Enums"]["arena_evidence_kind"]
          media_object_id?: string | null
          media_url?: string | null
          message_id?: string | null
          room_id: string
          source_url?: string | null
          title: string
          topic_id: string
          useful_count?: number
        }
        Update: {
          author_id?: string
          created_at?: string
          hidden_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["arena_evidence_kind"]
          media_object_id?: string | null
          media_url?: string | null
          message_id?: string | null
          room_id?: string
          source_url?: string | null
          title?: string
          topic_id?: string
          useful_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_evidence_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_evidence_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_evidence_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "arena_room_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_evidence_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "arena_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_evidence_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "arena_daily_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_room_evidence_marks: {
        Row: {
          created_at: string
          evidence_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          evidence_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          evidence_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_evidence_marks_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "arena_room_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_evidence_marks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_room_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          message_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "arena_room_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_message_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_room_messages: {
        Row: {
          author_id: string
          body: string
          created_at: string
          gif_external_id: string | null
          gif_provider: string | null
          hidden_at: string | null
          id: string
          kind: Database["public"]["Enums"]["arena_message_kind"]
          media_kind: Database["public"]["Enums"]["media_kind"] | null
          media_object_id: string | null
          media_url: string | null
          parent_message_id: string | null
          room_id: string
        }
        Insert: {
          author_id: string
          body?: string
          created_at?: string
          gif_external_id?: string | null
          gif_provider?: string | null
          hidden_at?: string | null
          id: string
          kind?: Database["public"]["Enums"]["arena_message_kind"]
          media_kind?: Database["public"]["Enums"]["media_kind"] | null
          media_object_id?: string | null
          media_url?: string | null
          parent_message_id?: string | null
          room_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          gif_external_id?: string | null
          gif_provider?: string | null
          hidden_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["arena_message_kind"]
          media_kind?: Database["public"]["Enums"]["media_kind"] | null
          media_object_id?: string | null
          media_url?: string | null
          parent_message_id?: string | null
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_messages_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "arena_room_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "arena_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_room_participants: {
        Row: {
          final_recorded_at: string | null
          final_stance: Database["public"]["Enums"]["take_stance"] | null
          initial_stance: Database["public"]["Enums"]["take_stance"] | null
          joined_at: string
          profile_id: string
          role: Database["public"]["Enums"]["arena_participant_role"]
          room_id: string
          topic_id: string
        }
        Insert: {
          final_recorded_at?: string | null
          final_stance?: Database["public"]["Enums"]["take_stance"] | null
          initial_stance?: Database["public"]["Enums"]["take_stance"] | null
          joined_at?: string
          profile_id: string
          role?: Database["public"]["Enums"]["arena_participant_role"]
          room_id: string
          topic_id: string
        }
        Update: {
          final_recorded_at?: string | null
          final_stance?: Database["public"]["Enums"]["take_stance"] | null
          initial_stance?: Database["public"]["Enums"]["take_stance"] | null
          joined_at?: string
          profile_id?: string
          role?: Database["public"]["Enums"]["arena_participant_role"]
          room_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "arena_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_participants_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "arena_daily_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_room_results: {
        Row: {
          agree_votes: number
          best_argument_author_id: string | null
          best_argument_message_id: string | null
          disagree_votes: number
          mindshift_changed_count: number
          mindshift_completed_count: number
          participant_count: number
          room_id: string
          settled_at: string
          winning_side: Database["public"]["Enums"]["arena_winning_side"]
        }
        Insert: {
          agree_votes?: number
          best_argument_author_id?: string | null
          best_argument_message_id?: string | null
          disagree_votes?: number
          mindshift_changed_count?: number
          mindshift_completed_count?: number
          participant_count?: number
          room_id: string
          settled_at?: string
          winning_side: Database["public"]["Enums"]["arena_winning_side"]
        }
        Update: {
          agree_votes?: number
          best_argument_author_id?: string | null
          best_argument_message_id?: string | null
          disagree_votes?: number
          mindshift_changed_count?: number
          mindshift_completed_count?: number
          participant_count?: number
          room_id?: string
          settled_at?: string
          winning_side?: Database["public"]["Enums"]["arena_winning_side"]
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_results_best_argument_author_id_fkey"
            columns: ["best_argument_author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_results_best_argument_message_id_fkey"
            columns: ["best_argument_message_id"]
            isOneToOne: false
            referencedRelation: "arena_room_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_results_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "arena_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_room_side_votes: {
        Row: {
          created_at: string
          profile_id: string
          room_id: string
          side: Database["public"]["Enums"]["arena_winning_side"]
        }
        Insert: {
          created_at?: string
          profile_id: string
          room_id: string
          side: Database["public"]["Enums"]["arena_winning_side"]
        }
        Update: {
          created_at?: string
          profile_id?: string
          room_id?: string
          side?: Database["public"]["Enums"]["arena_winning_side"]
        }
        Relationships: [
          {
            foreignKeyName: "arena_room_side_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arena_room_side_votes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "arena_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      arena_rooms: {
        Row: {
          capacity: number
          closes_at: string
          created_at: string
          id: string
          opens_at: string
          participant_count: number
          status: Database["public"]["Enums"]["arena_room_status"]
          topic_id: string
        }
        Insert: {
          capacity?: number
          closes_at: string
          created_at?: string
          id: string
          opens_at?: string
          participant_count?: number
          status?: Database["public"]["Enums"]["arena_room_status"]
          topic_id: string
        }
        Update: {
          capacity?: number
          closes_at?: string
          created_at?: string
          id?: string
          opens_at?: string
          participant_count?: number
          status?: Database["public"]["Enums"]["arena_room_status"]
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arena_rooms_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "arena_daily_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
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
      campaign_creators: {
        Row: {
          campaign_id: string
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          created_at: string
          creator_profile_id: string
          id: string
          status: Database["public"]["Enums"]["campaign_creator_status"]
        }
        Insert: {
          campaign_id: string
          commission_type?: Database["public"]["Enums"]["commission_type"]
          commission_value?: number
          created_at?: string
          creator_profile_id: string
          id: string
          status?: Database["public"]["Enums"]["campaign_creator_status"]
        }
        Update: {
          campaign_id?: string
          commission_type?: Database["public"]["Enums"]["commission_type"]
          commission_value?: number
          created_at?: string
          creator_profile_id?: string
          id?: string
          status?: Database["public"]["Enums"]["campaign_creator_status"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_creators_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_creators_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clashes: {
        Row: {
          challenger_comment_id: string | null
          challenger_id: string
          closes_at: string
          created_at: string
          id: string
          mode: Database["public"]["Enums"]["clash_mode"]
          opens_at: string
          settled_at: string | null
          status: Database["public"]["Enums"]["clash_status"]
          take_id: string
        }
        Insert: {
          challenger_comment_id?: string | null
          challenger_id: string
          closes_at: string
          created_at?: string
          id: string
          mode?: Database["public"]["Enums"]["clash_mode"]
          opens_at?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["clash_status"]
          take_id: string
        }
        Update: {
          challenger_comment_id?: string | null
          challenger_id?: string
          closes_at?: string
          created_at?: string
          id?: string
          mode?: Database["public"]["Enums"]["clash_mode"]
          opens_at?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["clash_status"]
          take_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clashes_challenger_comment_id_fkey"
            columns: ["challenger_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clashes_challenger_id_fkey"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clashes_take_id_fkey"
            columns: ["take_id"]
            isOneToOne: false
            referencedRelation: "takes"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_upvotes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_upvotes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_upvotes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          created_at: string
          gif_external_id: string | null
          gif_provider: string | null
          id: string
          is_pinned: boolean
          is_removed: boolean
          media_kind: Database["public"]["Enums"]["media_kind"] | null
          media_object_id: string | null
          media_url: string | null
          parent_comment_id: string | null
          take_id: string
          text: string
          upvotes_count: number
        }
        Insert: {
          author_id: string
          created_at?: string
          gif_external_id?: string | null
          gif_provider?: string | null
          id: string
          is_pinned?: boolean
          is_removed?: boolean
          media_kind?: Database["public"]["Enums"]["media_kind"] | null
          media_object_id?: string | null
          media_url?: string | null
          parent_comment_id?: string | null
          take_id: string
          text: string
          upvotes_count?: number
        }
        Update: {
          author_id?: string
          created_at?: string
          gif_external_id?: string | null
          gif_provider?: string | null
          id?: string
          is_pinned?: boolean
          is_removed?: boolean
          media_kind?: Database["public"]["Enums"]["media_kind"] | null
          media_object_id?: string | null
          media_url?: string | null
          parent_comment_id?: string | null
          take_id?: string
          text?: string
          upvotes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_take_id_fkey"
            columns: ["take_id"]
            isOneToOne: false
            referencedRelation: "takes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_attributions: {
        Row: {
          attributed_at: string
          attribution_method: Database["public"]["Enums"]["attribution_method"]
          campaign_id: string
          conversion_id: string
          coupon_code_id: string | null
          creator_profile_id: string | null
          referral_link_id: string | null
        }
        Insert: {
          attributed_at?: string
          attribution_method: Database["public"]["Enums"]["attribution_method"]
          campaign_id: string
          conversion_id: string
          coupon_code_id?: string | null
          creator_profile_id?: string | null
          referral_link_id?: string | null
        }
        Update: {
          attributed_at?: string
          attribution_method?: Database["public"]["Enums"]["attribution_method"]
          campaign_id?: string
          conversion_id?: string
          coupon_code_id?: string | null
          creator_profile_id?: string | null
          referral_link_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_attributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_attributions_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: true
            referencedRelation: "conversion_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_attributions_coupon_code_id_fkey"
            columns: ["coupon_code_id"]
            isOneToOne: false
            referencedRelation: "coupon_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_attributions_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_attributions_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_events: {
        Row: {
          advertiser_id: string
          campaign_id: string
          conversion_type: Database["public"]["Enums"]["sponsor_conversion_type"]
          created_at: string
          currency: string
          external_conversion_id: string
          gross_amount_minor: number
          id: string
          occurred_at: string
        }
        Insert: {
          advertiser_id: string
          campaign_id: string
          conversion_type: Database["public"]["Enums"]["sponsor_conversion_type"]
          created_at?: string
          currency?: string
          external_conversion_id: string
          gross_amount_minor: number
          id: string
          occurred_at?: string
        }
        Update: {
          advertiser_id?: string
          campaign_id?: string
          conversion_type?: Database["public"]["Enums"]["sponsor_conversion_type"]
          created_at?: string
          currency?: string
          external_conversion_id?: string
          gross_amount_minor?: number
          id?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_events_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      conversion_geo_buckets: {
        Row: {
          coarse_bucket: string
          conversion_id: string
          created_at: string
          distance_band: string | null
          region_code: string
          region_label: string
        }
        Insert: {
          coarse_bucket: string
          conversion_id: string
          created_at?: string
          distance_band?: string | null
          region_code: string
          region_label: string
        }
        Update: {
          coarse_bucket?: string
          conversion_id?: string
          created_at?: string
          distance_band?: string | null
          region_code?: string
          region_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversion_geo_buckets_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: true
            referencedRelation: "conversion_events"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_codes: {
        Row: {
          campaign_id: string
          code: string
          created_at: string
          creator_profile_id: string
          expires_at: string | null
          id: string
          max_redemptions: number | null
          redemption_count: number
          starts_at: string | null
          status: Database["public"]["Enums"]["coupon_code_status"]
        }
        Insert: {
          campaign_id: string
          code: string
          created_at?: string
          creator_profile_id: string
          expires_at?: string | null
          id: string
          max_redemptions?: number | null
          redemption_count?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["coupon_code_status"]
        }
        Update: {
          campaign_id?: string
          code?: string
          created_at?: string
          creator_profile_id?: string
          expires_at?: string | null
          id?: string
          max_redemptions?: number | null
          redemption_count?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["coupon_code_status"]
        }
        Relationships: [
          {
            foreignKeyName: "coupon_codes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_codes_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_commission_ledger: {
        Row: {
          advertiser_id: string
          amount_minor: number
          campaign_id: string
          conversion_id: string
          created_at: string
          creator_profile_id: string
          currency: string
          id: string
          status: Database["public"]["Enums"]["commission_ledger_status"]
        }
        Insert: {
          advertiser_id: string
          amount_minor: number
          campaign_id: string
          conversion_id: string
          created_at?: string
          creator_profile_id: string
          currency: string
          id: string
          status?: Database["public"]["Enums"]["commission_ledger_status"]
        }
        Update: {
          advertiser_id?: string
          amount_minor?: number
          campaign_id?: string
          conversion_id?: string
          created_at?: string
          creator_profile_id?: string
          currency?: string
          id?: string
          status?: Database["public"]["Enums"]["commission_ledger_status"]
        }
        Relationships: [
          {
            foreignKeyName: "creator_commission_ledger_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_commission_ledger_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_commission_ledger_conversion_id_fkey"
            columns: ["conversion_id"]
            isOneToOne: true
            referencedRelation: "conversion_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_commission_ledger_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_vaults: {
        Row: {
          created_at: string
          creator_id: string
          description: string
          id: string
          status: Database["public"]["Enums"]["vault_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string
          id: string
          status?: Database["public"]["Enums"]["vault_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          status?: Database["public"]["Enums"]["vault_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_vaults_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_challenge_entries: {
        Row: {
          caption: string | null
          challenge_id: string
          created_at: string
          id: string
          media_object_id: string
          profile_id: string
          reactions_count: number
          status: Database["public"]["Enums"]["explore_entry_status"]
        }
        Insert: {
          caption?: string | null
          challenge_id: string
          created_at?: string
          id?: string
          media_object_id: string
          profile_id: string
          reactions_count?: number
          status?: Database["public"]["Enums"]["explore_entry_status"]
        }
        Update: {
          caption?: string | null
          challenge_id?: string
          created_at?: string
          id?: string
          media_object_id?: string
          profile_id?: string
          reactions_count?: number
          status?: Database["public"]["Enums"]["explore_entry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "explore_challenge_entries_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "explore_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_challenge_entries_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_challenge_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_challenge_entry_reactions: {
        Row: {
          created_at: string
          entry_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "explore_challenge_entry_reactions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "explore_challenge_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_challenge_entry_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_challenge_participants: {
        Row: {
          challenge_id: string
          joined_at: string
          profile_id: string
        }
        Insert: {
          challenge_id: string
          joined_at?: string
          profile_id: string
        }
        Update: {
          challenge_id?: string
          joined_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "explore_challenge_participants_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "explore_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_challenge_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_challenge_results: {
        Row: {
          challenge_id: string
          metrics: Json
          settled_at: string
          winner_entry_id: string | null
          winner_profile_id: string | null
        }
        Insert: {
          challenge_id: string
          metrics?: Json
          settled_at?: string
          winner_entry_id?: string | null
          winner_profile_id?: string | null
        }
        Update: {
          challenge_id?: string
          metrics?: Json
          settled_at?: string
          winner_entry_id?: string | null
          winner_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "explore_challenge_results_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: true
            referencedRelation: "explore_challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_challenge_results_winner_entry_id_fkey"
            columns: ["winner_entry_id"]
            isOneToOne: false
            referencedRelation: "explore_challenge_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_challenge_results_winner_profile_id_fkey"
            columns: ["winner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_challenges: {
        Row: {
          challenge_type: Database["public"]["Enums"]["explore_challenge_type"]
          country_code: string | null
          cover_url: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          ends_at: string
          entry_count: number
          id: string
          reward_metadata: Json
          reward_type: Database["public"]["Enums"]["explore_reward_type"] | null
          starts_at: string
          status: Database["public"]["Enums"]["explore_challenge_status"]
          title: string
          visibility: string
        }
        Insert: {
          challenge_type: Database["public"]["Enums"]["explore_challenge_type"]
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          ends_at: string
          entry_count?: number
          id?: string
          reward_metadata?: Json
          reward_type?:
            | Database["public"]["Enums"]["explore_reward_type"]
            | null
          starts_at: string
          status?: Database["public"]["Enums"]["explore_challenge_status"]
          title: string
          visibility?: string
        }
        Update: {
          challenge_type?: Database["public"]["Enums"]["explore_challenge_type"]
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          ends_at?: string
          entry_count?: number
          id?: string
          reward_metadata?: Json
          reward_type?:
            | Database["public"]["Enums"]["explore_reward_type"]
            | null
          starts_at?: string
          status?: Database["public"]["Enums"]["explore_challenge_status"]
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "explore_challenges_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_treasure_clue_progress: {
        Row: {
          clue_id: string
          hunt_id: string
          profile_id: string
          solved_at: string
        }
        Insert: {
          clue_id: string
          hunt_id: string
          profile_id: string
          solved_at?: string
        }
        Update: {
          clue_id?: string
          hunt_id?: string
          profile_id?: string
          solved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "explore_treasure_clue_progress_clue_id_fkey"
            columns: ["clue_id"]
            isOneToOne: false
            referencedRelation: "explore_treasure_clues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_treasure_clue_progress_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "explore_treasure_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_treasure_clue_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_treasure_clues: {
        Row: {
          answer_digest: string | null
          choices: Json
          clue_type: Database["public"]["Enums"]["explore_clue_type"]
          content_target_id: string | null
          content_target_kind:
            | Database["public"]["Enums"]["explore_content_target"]
            | null
          created_at: string
          hunt_id: string
          id: string
          prompt: string
          sort_order: number
        }
        Insert: {
          answer_digest?: string | null
          choices?: Json
          clue_type: Database["public"]["Enums"]["explore_clue_type"]
          content_target_id?: string | null
          content_target_kind?:
            | Database["public"]["Enums"]["explore_content_target"]
            | null
          created_at?: string
          hunt_id: string
          id?: string
          prompt: string
          sort_order: number
        }
        Update: {
          answer_digest?: string | null
          choices?: Json
          clue_type?: Database["public"]["Enums"]["explore_clue_type"]
          content_target_id?: string | null
          content_target_kind?:
            | Database["public"]["Enums"]["explore_content_target"]
            | null
          created_at?: string
          hunt_id?: string
          id?: string
          prompt?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "explore_treasure_clues_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "explore_treasure_hunts"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_treasure_hunts: {
        Row: {
          clue: string
          clue_count: number
          country_code: string | null
          cover_url: string | null
          created_at: string
          creator_id: string | null
          description: string | null
          ends_at: string
          gifts_remaining: number | null
          hunt_type: Database["public"]["Enums"]["explore_treasure_type"]
          id: string
          reward_metadata: Json
          reward_type: Database["public"]["Enums"]["explore_reward_type"]
          starts_at: string
          status: Database["public"]["Enums"]["explore_treasure_status"]
          title: string
          visibility: string
        }
        Insert: {
          clue: string
          clue_count?: number
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          ends_at: string
          gifts_remaining?: number | null
          hunt_type?: Database["public"]["Enums"]["explore_treasure_type"]
          id?: string
          reward_metadata?: Json
          reward_type?: Database["public"]["Enums"]["explore_reward_type"]
          starts_at: string
          status?: Database["public"]["Enums"]["explore_treasure_status"]
          title: string
          visibility?: string
        }
        Update: {
          clue?: string
          clue_count?: number
          country_code?: string | null
          cover_url?: string | null
          created_at?: string
          creator_id?: string | null
          description?: string | null
          ends_at?: string
          gifts_remaining?: number | null
          hunt_type?: Database["public"]["Enums"]["explore_treasure_type"]
          id?: string
          reward_metadata?: Json
          reward_type?: Database["public"]["Enums"]["explore_reward_type"]
          starts_at?: string
          status?: Database["public"]["Enums"]["explore_treasure_status"]
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "explore_treasure_hunts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_treasure_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          hunt_id: string
          profile_id: string
          progress: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          hunt_id: string
          profile_id: string
          progress?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          hunt_id?: string
          profile_id?: string
          progress?: number
        }
        Relationships: [
          {
            foreignKeyName: "explore_treasure_progress_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "explore_treasure_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_treasure_progress_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      explore_treasure_reward_claims: {
        Row: {
          claimed_at: string
          hunt_id: string
          profile_id: string
          reward_metadata: Json
          reward_type: Database["public"]["Enums"]["explore_reward_type"]
        }
        Insert: {
          claimed_at?: string
          hunt_id: string
          profile_id: string
          reward_metadata?: Json
          reward_type: Database["public"]["Enums"]["explore_reward_type"]
        }
        Update: {
          claimed_at?: string
          hunt_id?: string
          profile_id?: string
          reward_metadata?: Json
          reward_type?: Database["public"]["Enums"]["explore_reward_type"]
        }
        Relationships: [
          {
            foreignKeyName: "explore_treasure_reward_claims_hunt_id_fkey"
            columns: ["hunt_id"]
            isOneToOne: false
            referencedRelation: "explore_treasure_hunts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "explore_treasure_reward_claims_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hood_game_entries: {
        Row: {
          created_at: string
          game_id: string
          option_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          option_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          option_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hood_game_entries_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "hood_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hood_game_entries_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "hood_game_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hood_game_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hood_game_options: {
        Row: {
          created_at: string
          game_id: string
          id: string
          label: string
          position: number
        }
        Insert: {
          created_at?: string
          game_id: string
          id: string
          label: string
          position: number
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "hood_game_options_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "hood_games"
            referencedColumns: ["id"]
          },
        ]
      }
      hood_games: {
        Row: {
          closes_at: string
          created_at: string
          creator_id: string
          game_type: Database["public"]["Enums"]["hood_game_type"]
          hood: Database["public"]["Enums"]["hood_id"]
          id: string
          opens_at: string
          question: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["hood_game_status"]
          winning_option_id: string | null
        }
        Insert: {
          closes_at: string
          created_at?: string
          creator_id: string
          game_type?: Database["public"]["Enums"]["hood_game_type"]
          hood: Database["public"]["Enums"]["hood_id"]
          id: string
          opens_at?: string
          question: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["hood_game_status"]
          winning_option_id?: string | null
        }
        Update: {
          closes_at?: string
          created_at?: string
          creator_id?: string
          game_type?: Database["public"]["Enums"]["hood_game_type"]
          hood?: Database["public"]["Enums"]["hood_id"]
          id?: string
          opens_at?: string
          question?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["hood_game_status"]
          winning_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hood_games_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hood_games_winning_option_fkey"
            columns: ["winning_option_id"]
            isOneToOne: false
            referencedRelation: "hood_game_options"
            referencedColumns: ["id"]
          },
        ]
      }
      hood_memberships: {
        Row: {
          created_at: string
          hood: Database["public"]["Enums"]["hood_id"]
          profile_id: string
        }
        Insert: {
          created_at?: string
          hood: Database["public"]["Enums"]["hood_id"]
          profile_id: string
        }
        Update: {
          created_at?: string
          hood?: Database["public"]["Enums"]["hood_id"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hood_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      judgements: {
        Row: {
          clash_id: string
          created_at: string
          juror_id: string
          side: Database["public"]["Enums"]["clash_side"]
        }
        Insert: {
          clash_id: string
          created_at?: string
          juror_id: string
          side: Database["public"]["Enums"]["clash_side"]
        }
        Update: {
          clash_id?: string
          created_at?: string
          juror_id?: string
          side?: Database["public"]["Enums"]["clash_side"]
        }
        Relationships: [
          {
            foreignKeyName: "judgements_clash_id_fkey"
            columns: ["clash_id"]
            isOneToOne: false
            referencedRelation: "clashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judgements_juror_id_fkey"
            columns: ["juror_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_objects: {
        Row: {
          bucket: string
          created_at: string
          deleted_at: string | null
          duration_ms: number | null
          height: number | null
          id: string
          media_kind: Database["public"]["Enums"]["media_kind"]
          mime_type: string
          owner_id: string
          ready_at: string | null
          size_bytes: number
          status: Database["public"]["Enums"]["media_status"]
          storage_path: string
          visibility: Database["public"]["Enums"]["media_visibility"]
          width: number | null
        }
        Insert: {
          bucket: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          height?: number | null
          id: string
          media_kind: Database["public"]["Enums"]["media_kind"]
          mime_type: string
          owner_id: string
          ready_at?: string | null
          size_bytes?: number
          status?: Database["public"]["Enums"]["media_status"]
          storage_path: string
          visibility?: Database["public"]["Enums"]["media_visibility"]
          width?: number | null
        }
        Update: {
          bucket?: string
          created_at?: string
          deleted_at?: string | null
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_kind?: Database["public"]["Enums"]["media_kind"]
          mime_type?: string
          owner_id?: string
          ready_at?: string | null
          size_bytes?: number
          status?: Database["public"]["Enums"]["media_status"]
          storage_path?: string
          visibility?: Database["public"]["Enums"]["media_visibility"]
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_objects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action"]
          created_at: string
          id: string
          moderator_id: string
          reason: string | null
          target_id: string
          target_kind: Database["public"]["Enums"]["report_target"]
        }
        Insert: {
          action: Database["public"]["Enums"]["moderation_action"]
          created_at?: string
          id: string
          moderator_id: string
          reason?: string | null
          target_id: string
          target_kind: Database["public"]["Enums"]["report_target"]
        }
        Update: {
          action?: Database["public"]["Enums"]["moderation_action"]
          created_at?: string
          id?: string
          moderator_id?: string
          reason?: string | null
          target_id?: string
          target_kind?: Database["public"]["Enums"]["report_target"]
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mutes: {
        Row: {
          created_at: string
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          muted_id?: string
          muter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutes_muted_id_fkey"
            columns: ["muted_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mutes_muter_id_fkey"
            columns: ["muter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["report_target"] | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["report_target"] | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["report_target"] | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          avatar_tint: string
          bio: string | null
          coins: number
          created_at: string
          handle: string
          home_hood: Database["public"]["Enums"]["hood_id"] | null
          id: string
          moderated_hoods: Database["public"]["Enums"]["hood_id"][]
          name: string
          public_country_code: string | null
          rank: Database["public"]["Enums"]["rank_name"]
          reputation: number
          role: Database["public"]["Enums"]["profile_role"]
          streak: number
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_tint?: string
          bio?: string | null
          coins?: number
          created_at?: string
          handle: string
          home_hood?: Database["public"]["Enums"]["hood_id"] | null
          id: string
          moderated_hoods?: Database["public"]["Enums"]["hood_id"][]
          name: string
          public_country_code?: string | null
          rank?: Database["public"]["Enums"]["rank_name"]
          reputation?: number
          role?: Database["public"]["Enums"]["profile_role"]
          streak?: number
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_tint?: string
          bio?: string | null
          coins?: number
          created_at?: string
          handle?: string
          home_hood?: Database["public"]["Enums"]["hood_id"] | null
          id?: string
          moderated_hoods?: Database["public"]["Enums"]["hood_id"][]
          name?: string
          public_country_code?: string | null
          rank?: Database["public"]["Enums"]["rank_name"]
          reputation?: number
          role?: Database["public"]["Enums"]["profile_role"]
          streak?: number
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          actor_id: string
          id: number
          occurred_at: string
        }
        Insert: {
          action: string
          actor_id: string
          id?: never
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_id?: string
          id?: never
          occurred_at?: string
        }
        Relationships: []
      }
      referral_clicks: {
        Row: {
          app_version: string | null
          coarse_region: string | null
          id: string
          occurred_at: string
          platform: string | null
          referral_link_id: string
          source: string | null
        }
        Insert: {
          app_version?: string | null
          coarse_region?: string | null
          id: string
          occurred_at?: string
          platform?: string | null
          referral_link_id: string
          source?: string | null
        }
        Update: {
          app_version?: string | null
          coarse_region?: string | null
          id?: string
          occurred_at?: string
          platform?: string | null
          referral_link_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_referral_link_id_fkey"
            columns: ["referral_link_id"]
            isOneToOne: false
            referencedRelation: "referral_links"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_links: {
        Row: {
          campaign_id: string
          created_at: string
          creator_profile_id: string
          expires_at: string | null
          id: string
          status: Database["public"]["Enums"]["referral_link_status"]
          token: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          creator_profile_id: string
          expires_at?: string | null
          id: string
          status?: Database["public"]["Enums"]["referral_link_status"]
          token: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          creator_profile_id?: string
          expires_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["referral_link_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sponsor_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_links_creator_profile_id_fkey"
            columns: ["creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: Database["public"]["Enums"]["report_target"]
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id: string
          target_kind: Database["public"]["Enums"]["report_target"]
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          target_id?: string
          target_kind?: Database["public"]["Enums"]["report_target"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reputation_events: {
        Row: {
          arena_room_id: string | null
          clash_id: string | null
          coins_delta: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["reputation_kind"]
          profile_id: string
          reputation_delta: number
        }
        Insert: {
          arena_room_id?: string | null
          clash_id?: string | null
          coins_delta?: number
          created_at?: string
          id: string
          kind: Database["public"]["Enums"]["reputation_kind"]
          profile_id: string
          reputation_delta: number
        }
        Update: {
          arena_room_id?: string | null
          clash_id?: string | null
          coins_delta?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["reputation_kind"]
          profile_id?: string
          reputation_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "reputation_events_arena_room_id_fkey"
            columns: ["arena_room_id"]
            isOneToOne: false
            referencedRelation: "arena_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reputation_events_clash_id_fkey"
            columns: ["clash_id"]
            isOneToOne: false
            referencedRelation: "clashes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reputation_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_campaigns: {
        Row: {
          advertiser_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at: string
        }
        Insert: {
          advertiser_id: string
          campaign_type?: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          id: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at?: string
        }
        Update: {
          advertiser_id?: string
          campaign_type?: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at?: string
          currency?: string
          description?: string
          ends_at?: string | null
          id?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["sponsor_campaign_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "advertisers"
            referencedColumns: ["id"]
          },
        ]
      }
      take_reactions: {
        Row: {
          created_at: string
          take_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          take_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          take_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "take_reactions_take_id_fkey"
            columns: ["take_id"]
            isOneToOne: false
            referencedRelation: "takes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "take_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      take_stances: {
        Row: {
          final_recorded_at: string | null
          final_stance: Database["public"]["Enums"]["take_stance"] | null
          initial_recorded_at: string
          initial_stance: Database["public"]["Enums"]["take_stance"]
          profile_id: string
          take_id: string
        }
        Insert: {
          final_recorded_at?: string | null
          final_stance?: Database["public"]["Enums"]["take_stance"] | null
          initial_recorded_at?: string
          initial_stance: Database["public"]["Enums"]["take_stance"]
          profile_id: string
          take_id: string
        }
        Update: {
          final_recorded_at?: string | null
          final_stance?: Database["public"]["Enums"]["take_stance"] | null
          initial_recorded_at?: string
          initial_stance?: Database["public"]["Enums"]["take_stance"]
          profile_id?: string
          take_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "take_stances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "take_stances_take_id_fkey"
            columns: ["take_id"]
            isOneToOne: false
            referencedRelation: "takes"
            referencedColumns: ["id"]
          },
        ]
      }
      takes: {
        Row: {
          author_id: string
          clashes_count: number
          created_at: string
          expires_at: string
          heat: number | null
          hood: Database["public"]["Enums"]["hood_id"]
          id: string
          media_caption: string | null
          media_colors: string[] | null
          media_duration: string | null
          media_kind: Database["public"]["Enums"]["media_kind"] | null
          media_object_id: string | null
          media_poster_url: string | null
          media_url: string | null
          reactions_count: number
          status: Database["public"]["Enums"]["take_status"]
          text: string
        }
        Insert: {
          author_id: string
          clashes_count?: number
          created_at?: string
          expires_at?: string
          heat?: number | null
          hood: Database["public"]["Enums"]["hood_id"]
          id: string
          media_caption?: string | null
          media_colors?: string[] | null
          media_duration?: string | null
          media_kind?: Database["public"]["Enums"]["media_kind"] | null
          media_object_id?: string | null
          media_poster_url?: string | null
          media_url?: string | null
          reactions_count?: number
          status?: Database["public"]["Enums"]["take_status"]
          text: string
        }
        Update: {
          author_id?: string
          clashes_count?: number
          created_at?: string
          expires_at?: string
          heat?: number | null
          hood?: Database["public"]["Enums"]["hood_id"]
          id?: string
          media_caption?: string | null
          media_colors?: string[] | null
          media_duration?: string | null
          media_kind?: Database["public"]["Enums"]["media_kind"] | null
          media_object_id?: string | null
          media_poster_url?: string | null
          media_url?: string | null
          reactions_count?: number
          status?: Database["public"]["Enums"]["take_status"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "takes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takes_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_collection_items: {
        Row: {
          added_at: string
          collection_id: string
          drop_id: string
          position: number
        }
        Insert: {
          added_at?: string
          collection_id: string
          drop_id: string
          position?: number
        }
        Update: {
          added_at?: string
          collection_id?: string
          drop_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "vault_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_collection_items_drop_id_fkey"
            columns: ["drop_id"]
            isOneToOne: false
            referencedRelation: "vault_drops"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_collections: {
        Row: {
          created_at: string
          creator_id: string
          description: string
          id: string
          title: string
          updated_at: string
          vault_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string
          id: string
          title: string
          updated_at?: string
          vault_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          title?: string
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_collections_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_collections_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "creator_vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_drops: {
        Row: {
          access_level: Database["public"]["Enums"]["vault_drop_access"]
          caption: string
          created_at: string
          creator_id: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          media_object_id: string | null
          public_preview_media_object_id: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["vault_drop_status"]
          vault_id: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["vault_drop_access"]
          caption: string
          created_at?: string
          creator_id: string
          deleted_at?: string | null
          expires_at?: string | null
          id: string
          media_object_id?: string | null
          public_preview_media_object_id?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["vault_drop_status"]
          vault_id: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["vault_drop_access"]
          caption?: string
          created_at?: string
          creator_id?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          media_object_id?: string | null
          public_preview_media_object_id?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["vault_drop_status"]
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_drops_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_drops_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_drops_public_preview_media_object_id_fkey"
            columns: ["public_preview_media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_drops_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "creator_vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          id: string
          source: Database["public"]["Enums"]["vault_subscription_source"]
          started_at: string
          status: Database["public"]["Enums"]["vault_subscription_status"]
          subscriber_id: string
          updated_at: string
          vault_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end: string
          id: string
          source?: Database["public"]["Enums"]["vault_subscription_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["vault_subscription_status"]
          subscriber_id: string
          updated_at?: string
          vault_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          id?: string
          source?: Database["public"]["Enums"]["vault_subscription_source"]
          started_at?: string
          status?: Database["public"]["Enums"]["vault_subscription_status"]
          subscriber_id?: string
          updated_at?: string
          vault_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_subscriptions_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_subscriptions_vault_id_fkey"
            columns: ["vault_id"]
            isOneToOne: false
            referencedRelation: "creator_vaults"
            referencedColumns: ["id"]
          },
        ]
      }
      verdicts: {
        Row: {
          agreement: number
          clash_id: string
          created_at: string
          jury_size: number
          margin: number
          side_a_score: number
          side_b_score: number
          verdict_label: string
          winner_side: Database["public"]["Enums"]["verdict_winner"]
        }
        Insert: {
          agreement: number
          clash_id: string
          created_at?: string
          jury_size: number
          margin: number
          side_a_score: number
          side_b_score: number
          verdict_label: string
          winner_side: Database["public"]["Enums"]["verdict_winner"]
        }
        Update: {
          agreement?: number
          clash_id?: string
          created_at?: string
          jury_size?: number
          margin?: number
          side_a_score?: number
          side_b_score?: number
          verdict_label?: string
          winner_side?: Database["public"]["Enums"]["verdict_winner"]
        }
        Relationships: [
          {
            foreignKeyName: "verdicts_clash_id_fkey"
            columns: ["clash_id"]
            isOneToOne: true
            referencedRelation: "clashes"
            referencedColumns: ["id"]
          },
        ]
      }
      world_drops: {
        Row: {
          approx_location: unknown
          author_id: string
          caption: string
          created_at: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          location_cell: string
          location_label: string | null
          media_object_id: string
          mission_id: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["world_drop_status"]
        }
        Insert: {
          approx_location: unknown
          author_id: string
          caption?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id: string
          location_cell: string
          location_label?: string | null
          media_object_id: string
          mission_id?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["world_drop_status"]
        }
        Update: {
          approx_location?: unknown
          author_id?: string
          caption?: string
          created_at?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          location_cell?: string
          location_label?: string | null
          media_object_id?: string
          mission_id?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["world_drop_status"]
        }
        Relationships: [
          {
            foreignKeyName: "world_drops_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_drops_media_object_id_fkey"
            columns: ["media_object_id"]
            isOneToOne: false
            referencedRelation: "media_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "world_drops_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "world_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      world_missions: {
        Row: {
          created_at: string
          description: string
          ends_at: string
          id: string
          prompt: string
          starts_at: string
          status: Database["public"]["Enums"]["world_mission_status"]
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          ends_at: string
          id: string
          prompt: string
          starts_at: string
          status?: Database["public"]["Enums"]["world_mission_status"]
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          ends_at?: string
          id?: string
          prompt?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["world_mission_status"]
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_advertiser: {
        Args: { p_advertiser_id: string }
        Returns: {
          created_at: string
          created_by_profile_id: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["advertiser_status"]
          updated_at: string
        }
      }
      add_drop_to_collection: {
        Args: { p_collection_id: string; p_drop_id: string }
        Returns: undefined
      }
      advertiser_campaign_creator_stats: {
        Args: { p_campaign_id: string }
        Returns: {
          assignment_status: Database["public"]["Enums"]["campaign_creator_status"]
          attributed_conversions: number
          clicks: number
          commission_accrued_minor: number
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          creator_handle: string
          creator_name: string
          creator_profile_id: string
        }[]
      }
      advertiser_campaign_geo_summary: {
        Args: { p_campaign_id: string }
        Returns: {
          coarse_bucket: string
          conversion_count: number
          gross_revenue_minor: number
          region_label: string
        }[]
      }
      advertiser_campaign_summary: {
        Args: { p_campaign_id: string }
        Returns: {
          attributed_conversions: number
          campaign_id: string
          clicks: number
          conversions: number
          creator_commission_minor: number
          gross_revenue_minor: number
        }[]
      }
      advertiser_studio_overview: {
        Args: { p_advertiser_id: string }
        Returns: {
          active_campaigns: number
          advertiser_id: string
          attributed_conversions: number
          clicks: number
          conversions: number
          creator_commission_minor: number
          gross_revenue_minor: number
          total_campaigns: number
        }[]
      }
      arena_actor_hidden: {
        Args: { p_author: string; p_viewer: string }
        Returns: boolean
      }
      arena_evidence_payload: {
        Args: {
          p_evidence: Database["public"]["Tables"]["arena_room_evidence"]["Row"]
          p_viewer: string
        }
        Returns: Json
      }
      arena_evidence_room: {
        Args: { p_evidence_id: string }
        Returns: string
      }
      arena_is_room_debater: {
        Args: { p_room_id: string }
        Returns: boolean
      }
      arena_is_room_member: {
        Args: { p_room_id: string }
        Returns: boolean
      }
      arena_message_payload: {
        Args: {
          p_message: Database["public"]["Tables"]["arena_room_messages"]["Row"]
          p_reveal_votes?: boolean
          p_viewer: string
        }
        Returns: Json
      }
      arena_message_room: {
        Args: { p_message_id: string }
        Returns: string
      }
      arena_profile_json: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      arena_result_payload: {
        Args: { p_room_id: string }
        Returns: Json
      }
      arena_room_mindshift_stats: {
        Args: { p_room_id: string }
        Returns: Json
      }
      arena_room_payload: {
        Args: {
          p_room: Database["public"]["Tables"]["arena_rooms"]["Row"]
          p_viewer: string
        }
        Returns: Json
      }
      arena_topic_payload: {
        Args: {
          p_topic: Database["public"]["Tables"]["arena_daily_topics"]["Row"]
          p_viewer: string
        }
        Returns: Json
      }
      arena_topic_phase: {
        Args: {
          p_closes_at: string
          p_final_arguments_at: string
          p_judging_at: string
          p_opens_at: string
          p_status: Database["public"]["Enums"]["arena_topic_status"]
        }
        Returns: string
      }
      assert_advertiser_owner: {
        Args: { p_advertiser_id: string }
        Returns: string
      }
      assert_campaign_owner: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at: string
        }
      }
      assert_play_host: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      assert_rate_limit: {
        Args: {
          p_action: string
          p_actor: string
          p_limit: number
          p_window: unknown
        }
        Returns: undefined
      }
      assign_creator_to_campaign: {
        Args: {
          p_campaign_id: string
          p_commission_type?: Database["public"]["Enums"]["commission_type"]
          p_commission_value?: number
          p_creator_profile_id: string
        }
        Returns: {
          campaign_id: string
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          created_at: string
          creator_profile_id: string
          id: string
          status: Database["public"]["Enums"]["campaign_creator_status"]
        }
      }
      block_meet_peer: {
        Args: { p_session_id: string }
        Returns: Json
      }
      block_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      can_access_vault_drop: {
        Args: { p_drop_id: string; p_viewer_profile_id: string }
        Returns: boolean
      }
      claim_treasure_reward: {
        Args: { p_hunt_id: string }
        Returns: Json
      }
      clash_identities_revealed_for: {
        Args: {
          p_author_id: string
          p_challenger_id: string
          p_clash_id: string
          p_mode: Database["public"]["Enums"]["clash_mode"]
          p_status: Database["public"]["Enums"]["clash_status"]
          p_viewer: string
        }
        Returns: boolean
      }
      clash_notify: {
        Args: {
          p_actor: string
          p_entity_id: string
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_recipient: string
        }
        Returns: undefined
      }
      clash_participant_json: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      clash_view: {
        Args: { p_clash_id: string }
        Returns: Json
      }
      clash_view_for_take: {
        Args: { p_take_id: string }
        Returns: Json
      }
      cleanup_rate_limits: {
        Args: { p_retention?: unknown }
        Returns: number
      }
      cleanup_stale_media: {
        Args: { p_limit?: number }
        Returns: Json
      }
      close_prediction_games: {
        Args: { p_limit?: number }
        Returns: number
      }
      complete_content_clue: {
        Args: { p_clue_id: string; p_content_id: string; p_hunt_id: string }
        Returns: Json
      }
      complete_media_upload: {
        Args: {
          p_duration_ms?: number
          p_height?: number
          p_media_id: string
          p_size_bytes: number
          p_width?: number
        }
        Returns: undefined
      }
      create_advertiser: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          created_at: string
          created_by_profile_id: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["advertiser_status"]
          updated_at: string
        }
      }
      create_arena_daily_topic: {
        Args: {
          p_closes_at?: string
          p_description?: string
          p_final_arguments_at?: string
          p_hood?: Database["public"]["Enums"]["hood_id"]
          p_judging_at?: string
          p_opens_at?: string
          p_status?: Database["public"]["Enums"]["arena_topic_status"]
          p_title: string
        }
        Returns: Json
      }
      create_campaign_coupon: {
        Args: {
          p_campaign_id: string
          p_code: string
          p_creator_profile_id: string
          p_expires_at?: string
          p_max_redemptions?: number
          p_starts_at?: string
        }
        Returns: {
          campaign_id: string
          code: string
          created_at: string
          creator_profile_id: string
          expires_at: string | null
          id: string
          max_redemptions: number | null
          redemption_count: number
          starts_at: string | null
          status: Database["public"]["Enums"]["coupon_code_status"]
        }
      }
      create_campaign_referral_link: {
        Args: {
          p_campaign_id: string
          p_creator_profile_id: string
          p_expires_at?: string
        }
        Returns: {
          campaign_id: string
          created_at: string
          creator_profile_id: string
          expires_at: string | null
          id: string
          status: Database["public"]["Enums"]["referral_link_status"]
          token: string
        }
      }
      create_collection: {
        Args: { p_description?: string; p_title: string; p_vault_id: string }
        Returns: {
          created_at: string
          creator_id: string
          description: string
          id: string
          title: string
          updated_at: string
          vault_id: string
        }
      }
      create_comment: {
        Args: {
          p_gif_external_id?: string
          p_gif_provider?: string
          p_media_object_id?: string
          p_media_url?: string
          p_parent_comment_id?: string
          p_take_id: string
          p_text: string
        }
        Returns: {
          author_id: string
          created_at: string
          gif_external_id: string | null
          gif_provider: string | null
          id: string
          is_pinned: boolean
          is_removed: boolean
          media_kind: Database["public"]["Enums"]["media_kind"] | null
          media_object_id: string | null
          media_url: string | null
          parent_comment_id: string | null
          take_id: string
          text: string
          upvotes_count: number
        }[]
      }
      create_media_upload: {
        Args: {
          p_media_kind: Database["public"]["Enums"]["media_kind"]
          p_mime_type: string
          p_visibility?: Database["public"]["Enums"]["media_visibility"]
        }
        Returns: Json
      }
      create_prediction_game: {
        Args: {
          p_closes_at: string
          p_hood: Database["public"]["Enums"]["hood_id"]
          p_options: string[]
          p_question: string
        }
        Returns: string
      }
      create_sponsor_campaign: {
        Args: {
          p_advertiser_id: string
          p_campaign_type?: Database["public"]["Enums"]["sponsor_campaign_type"]
          p_currency?: string
          p_description?: string
          p_ends_at?: string
          p_starts_at?: string
          p_title: string
        }
        Returns: {
          advertiser_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at: string
        }
      }
      create_take: {
        Args: {
          p_hood: Database["public"]["Enums"]["hood_id"]
          p_media_object_id?: string
          p_media_poster_url?: string
          p_media_url?: string
          p_text: string
        }
        Returns: {
          author_id: string
          clashes_count: number
          created_at: string
          expires_at: string
          heat: number | null
          hood: Database["public"]["Enums"]["hood_id"]
          id: string
          media_caption: string | null
          media_colors: string[] | null
          media_duration: string | null
          media_kind: Database["public"]["Enums"]["media_kind"] | null
          media_object_id: string | null
          media_poster_url: string | null
          media_url: string | null
          reactions_count: number
          status: Database["public"]["Enums"]["take_status"]
          text: string
        }[]
      }
      create_vault: {
        Args: { p_description?: string; p_title: string }
        Returns: {
          created_at: string
          creator_id: string
          description: string
          id: string
          status: Database["public"]["Enums"]["vault_status"]
          title: string
          updated_at: string
        }
      }
      create_vault_drop: {
        Args: {
          p_access_level: Database["public"]["Enums"]["vault_drop_access"]
          p_caption: string
          p_media_object_id?: string
          p_vault_id: string
        }
        Returns: {
          access_level: Database["public"]["Enums"]["vault_drop_access"]
          caption: string
          created_at: string
          creator_id: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          media_object_id: string | null
          public_preview_media_object_id: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["vault_drop_status"]
          vault_id: string
        }
      }
      create_world_drop: {
        Args: {
          p_caption: string
          p_latitude: number
          p_longitude: number
          p_media_object_id: string
          p_mission_id: string
        }
        Returns: string
      }
      create_world_mission: {
        Args: {
          p_description: string
          p_ends_at: string
          p_prompt: string
          p_starts_at: string
          p_status?: Database["public"]["Enums"]["world_mission_status"]
          p_title: string
        }
        Returns: string
      }
      creator_campaign_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          advertiser_name: string
          approved_commission_minor: number
          assignment_status: Database["public"]["Enums"]["campaign_creator_status"]
          attributed_conversions: number
          campaign_id: string
          campaign_status: Database["public"]["Enums"]["sponsor_campaign_status"]
          campaign_title: string
          clicks: number
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          currency: string
          ends_at: string
          pending_commission_minor: number
          rejected_commission_minor: number
          starts_at: string
          void_commission_minor: number
        }[]
      }
      creator_earnings_summary: {
        Args: Record<PropertyKey, never>
        Returns: {
          approved_commission_minor: number
          attributed_conversions: number
          campaign_count: number
          clicks: number
          currency: string
          pending_commission_minor: number
          rejected_commission_minor: number
          total_earned_minor: number
          void_commission_minor: number
        }[]
      }
      creator_my_coupons: {
        Args: { p_campaign_id?: string }
        Returns: {
          campaign_id: string
          code: string
          created_at: string
          id: string
          max_redemptions: number
          redemption_count: number
          status: Database["public"]["Enums"]["coupon_code_status"]
        }[]
      }
      creator_my_referral_links: {
        Args: { p_campaign_id?: string }
        Returns: {
          campaign_id: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["referral_link_status"]
          token: string
        }[]
      }
      delete_media: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      delete_vault_drop: {
        Args: { p_drop_id: string }
        Returns: undefined
      }
      expire_stale_takes: {
        Args: { p_limit?: number }
        Returns: number
      }
      expire_vault_drops: {
        Args: { p_limit?: number }
        Returns: number
      }
      expire_vault_subscriptions: {
        Args: { p_limit?: number }
        Returns: number
      }
      expire_world_drops: {
        Args: { p_limit?: number }
        Returns: number
      }
      explore_actor_hidden: {
        Args: { p_author: string; p_viewer: string }
        Returns: boolean
      }
      explore_answer_digest: {
        Args: { p_answer: string; p_clue_id: string }
        Returns: string
      }
      explore_country_activity_count: {
        Args: { p_code: string }
        Returns: number
      }
      explore_vault_preview_rows: {
        Args: { p_country_code?: string; p_limit?: number; p_viewer: string }
        Returns: {
          author_handle: string
          author_name: string
          author_tint: string
          country_code: string
          creator_id: string
          discovery_access: string
          drop_id: string
          media_kind: string
          public_media_path: string
          title: string
          vault_id: string
        }[]
      }
      fail_media_upload: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      follow_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      get_arena_room: {
        Args: { p_room_id: string }
        Returns: Json
      }
      get_arena_room_pulse: {
        Args: { p_room_id: string }
        Returns: Json
      }
      get_arena_topic: {
        Args: { p_topic_id: string }
        Returns: Json
      }
      get_challenge_detail: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
      get_explore_country: {
        Args: { p_country_code: string }
        Returns: Json
      }
      get_explore_for_you: {
        Args: { p_cursor?: number; p_limit?: number }
        Returns: Json
      }
      get_explore_live: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_explore_world_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_global_viral: {
        Args: { p_limit?: number }
        Returns: Json
      }
      get_meet_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      get_my_play: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_teleport_candidate: {
        Args: { p_exclude_ids?: string[] }
        Returns: Json
      }
      get_treasure_detail: {
        Args: { p_hunt_id: string }
        Returns: Json
      }
      hood_active_prediction: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: Json
      }
      hood_game_view: {
        Args: { p_game_id: string }
        Returns: Json
      }
      host_explore_challenge: {
        Args: {
          p_challenge_type: Database["public"]["Enums"]["explore_challenge_type"]
          p_country_code: string
          p_cover_url: string
          p_description: string
          p_ends_at: string
          p_reward_type?: Database["public"]["Enums"]["explore_reward_type"]
          p_starts_at: string
          p_title: string
        }
        Returns: Json
      }
      host_explore_treasure: {
        Args: {
          p_clues: Json
          p_country_code: string
          p_cover_url: string
          p_description: string
          p_ends_at: string
          p_gifts_remaining: number
          p_hunt_type: Database["public"]["Enums"]["explore_treasure_type"]
          p_reward_metadata: Json
          p_reward_type: Database["public"]["Enums"]["explore_reward_type"]
          p_starts_at: string
          p_teaser: string
          p_title: string
        }
        Returns: Json
      }
      is_advertiser_owner: {
        Args: { p_advertiser_id: string }
        Returns: boolean
      }
      is_allowed_http_url: {
        Args: { p_url: string }
        Returns: boolean
      }
      is_allowed_tenor_media_url: {
        Args: { p_url: string }
        Returns: boolean
      }
      is_assigned_campaign_creator: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      is_hood_moderator: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: boolean
      }
      is_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      join_arena_topic: {
        Args: {
          p_role?: Database["public"]["Enums"]["arena_participant_role"]
          p_stance?: Database["public"]["Enums"]["take_stance"]
          p_topic_id: string
        }
        Returns: Json
      }
      join_challenge: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
      join_hood: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: undefined
      }
      join_meet_queue: {
        Args: {
          p_country_code?: string
          p_hood?: Database["public"]["Enums"]["hood_id"]
          p_interests?: string[]
          p_mode: Database["public"]["Enums"]["meet_match_mode"]
        }
        Returns: Json
      }
      join_treasure_hunt: {
        Args: { p_hunt_id: string }
        Returns: Json
      }
      leave_hood: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: undefined
      }
      leave_meet_queue: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      leave_meet_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: Json
      }
      list_arena_room_evidence: {
        Args: { p_limit?: number; p_room_id: string }
        Returns: Json[]
      }
      list_arena_room_messages: {
        Args: {
          p_after?: string
          p_before?: string
          p_limit?: number
          p_room_id: string
        }
        Returns: Json[]
      }
      list_arena_room_presence: {
        Args: { p_limit?: number; p_room_id: string }
        Returns: Json
      }
      list_arena_topic_rooms: {
        Args: { p_topic_id: string }
        Returns: Json
      }
      list_campaign_coupons: {
        Args: { p_campaign_id: string }
        Returns: {
          campaign_id: string
          code: string
          created_at: string
          creator_profile_id: string
          expires_at: string | null
          id: string
          max_redemptions: number | null
          redemption_count: number
          starts_at: string | null
          status: Database["public"]["Enums"]["coupon_code_status"]
        }[]
      }
      list_campaign_referral_links: {
        Args: { p_campaign_id: string }
        Returns: {
          campaign_id: string
          created_at: string
          creator_profile_id: string
          expires_at: string | null
          id: string
          status: Database["public"]["Enums"]["referral_link_status"]
          token: string
        }[]
      }
      list_challenge_entries: {
        Args: {
          p_challenge_id: string
          p_cursor?: number
          p_limit?: number
          p_sort?: string
        }
        Returns: Json
      }
      list_explore_vault_previews: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_live_arena_topic_previews: {
        Args: { p_limit?: number; p_topic_id: string }
        Returns: Json
      }
      list_live_arena_topics: {
        Args: Record<PropertyKey, never>
        Returns: Json[]
      }
      list_my_sponsor_campaigns: {
        Args: { p_advertiser_id: string }
        Returns: {
          attributed_conversions: number
          campaign_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          clicks: number
          conversions: number
          creator_commission_minor: number
          currency: string
          ends_at: string
          gross_revenue_minor: number
          starts_at: string
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
        }[]
      }
      list_meet_messages: {
        Args: {
          p_before?: string
          p_limit?: number
          p_session_id: string
        }
        Returns: Json
      }
      list_play_home: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      mark_arena_evidence_useful: {
        Args: { p_evidence_id: string }
        Returns: Json
      }
      mindshift_stats: {
        Args: { p_take_id: string }
        Returns: Json
      }
      mute_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      my_profile_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      next_meet: {
        Args: {
          p_country_code?: string
          p_hood?: Database["public"]["Enums"]["hood_id"]
          p_interests?: string[]
          p_mode: Database["public"]["Enums"]["meet_match_mode"]
          p_session_id: string
        }
        Returns: Json
      }
      new_arena_id: {
        Args: { p_prefix: string }
        Returns: string
      }
      owns_campaign_via_advertiser: {
        Args: { p_campaign_id: string }
        Returns: boolean
      }
      owns_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      pause_sponsor_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at: string
        }
      }
      play_next_clue_payload: {
        Args: { p_hunt_id: string; p_progress: number }
        Returns: Json
      }
      play_notify: {
        Args: {
          p_actor: string
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_recipient: string
          p_target_id: string
        }
        Returns: undefined
      }
      poll_meet_queue: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      post_arena_room_message: {
        Args: {
          p_body: string
          p_gif_external_id?: string
          p_gif_provider?: string
          p_media_object_id?: string
          p_media_url?: string
          p_parent_message_id?: string
          p_room_id: string
        }
        Returns: {
          author_id: string
          body: string
          created_at: string
          gif_external_id: string | null
          gif_provider: string | null
          hidden_at: string | null
          id: string
          kind: Database["public"]["Enums"]["arena_message_kind"]
          media_kind: Database["public"]["Enums"]["media_kind"] | null
          media_object_id: string | null
          media_url: string | null
          parent_message_id: string | null
          room_id: string
        }[]
      }
      profile_clash_list: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      publish_vault_drop: {
        Args: { p_drop_id: string }
        Returns: {
          access_level: Database["public"]["Enums"]["vault_drop_access"]
          caption: string
          created_at: string
          creator_id: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          media_object_id: string | null
          public_preview_media_object_id: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["vault_drop_status"]
          vault_id: string
        }
      }
      rank_for_rep: {
        Args: { p_rep: number }
        Returns: Database["public"]["Enums"]["rank_name"]
      }
      react_arena_room_message: {
        Args: { p_emoji?: string; p_message_id: string }
        Returns: Json
      }
      record_arena_final_stance: {
        Args: {
          p_room_id: string
          p_stance: Database["public"]["Enums"]["take_stance"]
        }
        Returns: Json
      }
      record_final_stance: {
        Args: {
          p_stance: Database["public"]["Enums"]["take_stance"]
          p_take_id: string
        }
        Returns: Json
      }
      record_initial_stance: {
        Args: {
          p_stance: Database["public"]["Enums"]["take_stance"]
          p_take_id: string
        }
        Returns: Json
      }
      record_referral_click: {
        Args: {
          p_app_version?: string
          p_coarse_region?: string
          p_platform?: string
          p_source?: string
          p_token: string
        }
        Returns: {
          app_version: string | null
          coarse_region: string | null
          id: string
          occurred_at: string
          platform: string | null
          referral_link_id: string
          source: string | null
        }
      }
      record_sponsor_conversion: {
        Args: {
          p_campaign_id: string
          p_coarse_bucket?: string
          p_conversion_type: Database["public"]["Enums"]["sponsor_conversion_type"]
          p_coupon_code?: string
          p_currency?: string
          p_distance_band?: string
          p_external_conversion_id: string
          p_gross_amount_minor: number
          p_occurred_at?: string
          p_referral_token?: string
          p_region_code?: string
          p_region_label?: string
        }
        Returns: {
          advertiser_id: string
          campaign_id: string
          conversion_type: Database["public"]["Enums"]["sponsor_conversion_type"]
          created_at: string
          currency: string
          external_conversion_id: string
          gross_amount_minor: number
          id: string
          occurred_at: string
        }
      }
      remove_creator_from_campaign: {
        Args: { p_campaign_id: string; p_creator_profile_id: string }
        Returns: {
          campaign_id: string
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          created_at: string
          creator_profile_id: string
          id: string
          status: Database["public"]["Enums"]["campaign_creator_status"]
        }
      }
      remove_drop_from_collection: {
        Args: { p_collection_id: string; p_drop_id: string }
        Returns: undefined
      }
      remove_world_drop: {
        Args: { p_drop_id: string }
        Returns: undefined
      }
      report_meet_session: {
        Args: {
          p_detail?: string
          p_reason: Database["public"]["Enums"]["report_reason"]
          p_session_id: string
        }
        Returns: Json
      }
      resolve_prediction_game: {
        Args: { p_game_id: string; p_winning_option_id: string }
        Returns: Json
      }
      resume_sponsor_campaign: {
        Args: { p_campaign_id: string }
        Returns: {
          advertiser_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at: string
        }
      }
      run_maintenance: {
        Args: { p_limit?: number }
        Returns: Json
      }
      search_explore: {
        Args: { p_limit?: number; p_query: string }
        Returns: Json
      }
      send_meet_message: {
        Args: { p_body: string; p_session_id: string }
        Returns: Json
      }
      set_sponsor_campaign_status: {
        Args: {
          p_campaign_id: string
          p_status: Database["public"]["Enums"]["sponsor_campaign_status"]
        }
        Returns: {
          advertiser_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at: string
        }
      }
      settle_arena_room: {
        Args: { p_room_id: string }
        Returns: Json
      }
      settle_challenge: {
        Args: { p_challenge_id: string }
        Returns: Json
      }
      settle_clash: {
        Args: { p_clash_id: string }
        Returns: Json
      }
      settle_due_clashes: {
        Args: { p_limit?: number }
        Returns: number
      }
      sponsor_calc_commission_minor: {
        Args: {
          p_commission_type: Database["public"]["Enums"]["commission_type"]
          p_commission_value: number
          p_gross_minor: number
        }
        Returns: number
      }
      sponsor_campaign_is_live: {
        Args: {
          p_campaign: Database["public"]["Tables"]["sponsor_campaigns"]["Row"]
        }
        Returns: boolean
      }
      sponsor_min_geo_aggregate_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      sponsor_new_referral_token: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      sponsor_normalize_coupon_code: {
        Args: { p_code: string }
        Returns: string
      }
      start_clash: {
        Args: {
          p_comment_id?: string
          p_mode?: Database["public"]["Enums"]["clash_mode"]
          p_take_id: string
        }
        Returns: string
      }
      submit_arena_argument_vote: {
        Args: { p_message_id: string; p_room_id: string }
        Returns: Json
      }
      submit_arena_evidence: {
        Args: {
          p_kind: Database["public"]["Enums"]["arena_evidence_kind"]
          p_media_object_id?: string
          p_media_url?: string
          p_room_id: string
          p_source_url?: string
          p_title: string
        }
        Returns: Json
      }
      submit_arena_side_vote: {
        Args: {
          p_room_id: string
          p_side: Database["public"]["Enums"]["arena_winning_side"]
        }
        Returns: Json
      }
      submit_challenge_entry: {
        Args: {
          p_caption?: string
          p_challenge_id: string
          p_media_object_id: string
        }
        Returns: Json
      }
      submit_judgement: {
        Args: {
          p_clash_id: string
          p_side: Database["public"]["Enums"]["clash_side"]
        }
        Returns: undefined
      }
      submit_prediction: {
        Args: { p_game_id: string; p_option_id: string }
        Returns: Json
      }
      submit_report: {
        Args: {
          p_detail?: string
          p_reason: Database["public"]["Enums"]["report_reason"]
          p_target_id: string
          p_target_kind: Database["public"]["Enums"]["report_target"]
        }
        Returns: string
      }
      submit_treasure_answer: {
        Args: { p_answer: string; p_clue_id: string; p_hunt_id: string }
        Returns: Json
      }
      take_hood: {
        Args: { p_take_id: string }
        Returns: Database["public"]["Enums"]["hood_id"]
      }
      take_stance_payload: {
        Args: { p_row: Database["public"]["Tables"]["take_stances"]["Row"] }
        Returns: Json
      }
      toggle_challenge_entry_reaction: {
        Args: { p_entry_id: string }
        Returns: Json
      }
      toggle_comment_upvote: {
        Args: { p_comment_id: string; p_user_id: string }
        Returns: Json
      }
      toggle_take_reaction: {
        Args: { p_take_id: string }
        Returns: Json
      }
      transition_due_arena_rooms: {
        Args: { p_limit?: number }
        Returns: number
      }
      unblock_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      unfollow_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      unmute_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      update_creator_commission: {
        Args: {
          p_campaign_id: string
          p_commission_type: Database["public"]["Enums"]["commission_type"]
          p_commission_value: number
          p_creator_profile_id: string
        }
        Returns: {
          campaign_id: string
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          created_at: string
          creator_profile_id: string
          id: string
          status: Database["public"]["Enums"]["campaign_creator_status"]
        }
      }
      update_sponsor_campaign: {
        Args: {
          p_campaign_id: string
          p_clear_ends?: boolean
          p_clear_starts?: boolean
          p_description?: string
          p_ends_at?: string
          p_starts_at?: string
          p_title?: string
        }
        Returns: {
          advertiser_id: string
          campaign_type: Database["public"]["Enums"]["sponsor_campaign_type"]
          created_at: string
          currency: string
          description: string
          ends_at: string | null
          id: string
          starts_at: string | null
          status: Database["public"]["Enums"]["sponsor_campaign_status"]
          title: string
          updated_at: string
        }
      }
      update_vault: {
        Args: { p_description?: string; p_title: string; p_vault_id: string }
        Returns: {
          created_at: string
          creator_id: string
          description: string
          id: string
          status: Database["public"]["Enums"]["vault_status"]
          title: string
          updated_at: string
        }
      }
      upgrade_arena_spectator: {
        Args: {
          p_room_id: string
          p_stance: Database["public"]["Enums"]["take_stance"]
        }
        Returns: Json
      }
      vault_drop_card: {
        Args: { p_drop_id: string }
        Returns: Json
      }
      vault_drop_media_target: {
        Args: { p_drop_id: string }
        Returns: Json
      }
      vault_grant_test_subscription: {
        Args: { p_days?: number; p_subscriber_id?: string; p_vault_id: string }
        Returns: {
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          id: string
          source: Database["public"]["Enums"]["vault_subscription_source"]
          started_at: string
          status: Database["public"]["Enums"]["vault_subscription_status"]
          subscriber_id: string
          updated_at: string
          vault_id: string
        }
      }
      vault_notify: {
        Args: {
          p_actor: string
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["report_target"]
          p_kind: Database["public"]["Enums"]["notification_kind"]
          p_recipient: string
        }
        Returns: undefined
      }
      vault_revoke_subscription: {
        Args: { p_subscription_id: string }
        Returns: undefined
      }
      vault_storefront: {
        Args: { p_vault_id: string }
        Returns: Json
      }
      viewer_can_access_drop: {
        Args: { p_drop_id: string }
        Returns: boolean
      }
      watch_arena_room: {
        Args: { p_room_id: string }
        Returns: Json
      }
      world_active_missions: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      world_author_hidden: {
        Args: { p_author: string; p_viewer: string }
        Returns: boolean
      }
      world_distance_band: {
        Args: { p_meters: number }
        Returns: string
      }
      world_drop_card: {
        Args: {
          p_drop: Database["public"]["Tables"]["world_drops"]["Row"]
          p_meters?: number
        }
        Returns: Json
      }
      world_drop_view: {
        Args: { p_drop_id: string }
        Returns: Json
      }
      world_fuzz_location: {
        Args: { p_lat: number; p_lng: number }
        Returns: unknown
      }
      world_mission: {
        Args: { p_mission_id: string }
        Returns: Json
      }
      world_mission_drops: {
        Args: { p_limit?: number; p_mission_id: string }
        Returns: Json
      }
      world_my_drops: {
        Args: { p_limit?: number }
        Returns: Json
      }
      world_nearby: {
        Args: {
          p_latitude: number
          p_limit?: number
          p_longitude: number
          p_radius_km?: number
        }
        Returns: Json
      }
      world_recent: {
        Args: { p_limit?: number }
        Returns: Json
      }
    }
    Enums: {
      advertiser_status: "DRAFT" | "ACTIVE" | "PAUSED" | "SUSPENDED"
      arena_evidence_kind: "image" | "video" | "link"
      arena_message_kind: "text" | "media" | "gif" | "system"
      arena_participant_role: "debater" | "spectator"
      arena_room_status:
        | "OPEN"
        | "FINAL_ARGUMENTS"
        | "JUDGING"
        | "SETTLED"
        | "CANCELLED"
      arena_topic_status: "scheduled" | "live" | "closed"
      arena_winning_side: "AGREE" | "DISAGREE" | "DRAW"
      attribution_method: "REFERRAL" | "COUPON" | "UNATTRIBUTED"
      campaign_creator_status: "INVITED" | "ACTIVE" | "PAUSED" | "REMOVED"
      clash_mode: "STANDARD" | "BLIND"
      clash_side: "A" | "B"
      clash_status: "open" | "settled" | "cancelled"
      commission_ledger_status: "PENDING" | "APPROVED" | "REJECTED" | "VOID"
      commission_type: "FIXED_PER_CONVERSION" | "PERCENTAGE" | "NONE"
      coupon_code_status: "ACTIVE" | "PAUSED" | "EXPIRED" | "REVOKED"
      explore_challenge_status: "scheduled" | "active" | "ended" | "cancelled"
      explore_challenge_type: "GLOBAL" | "COUNTRY" | "CREATOR"
      explore_clue_type: "TEXT_ANSWER" | "CONTENT_FIND" | "MULTIPLE_CHOICE"
      explore_content_target: "take" | "vault_drop" | "challenge" | "creator"
      explore_entry_status: "visible" | "hidden" | "removed"
      explore_reward_type:
        | "badge"
        | "cosmetic"
        | "free_drop"
        | "creator_access"
        | "collectible"
        | "sponsor"
      explore_treasure_status: "scheduled" | "active" | "ended" | "cancelled"
      explore_treasure_type: "GLOBAL" | "COUNTRY" | "CREATOR"
      hood_game_status: "DRAFT" | "OPEN" | "CLOSED" | "RESOLVED" | "CANCELLED"
      hood_game_type: "PREDICTION"
      hood_id:
        | "techtakes"
        | "campushustle"
        | "goatalk"
        | "movies"
        | "gaming"
        | "startups"
        | "football"
      media_kind: "image" | "video" | "gif"
      media_status: "uploading" | "ready" | "failed" | "deleted"
      media_visibility: "public" | "private"
      meet_match_mode: "ANYWHERE" | "COUNTRY" | "INTERESTS" | "HOOD"
      meet_queue_status: "waiting" | "matched" | "cancelled"
      meet_session_status: "active" | "ended"
      moderation_action:
        | "warn"
        | "remove_content"
        | "restore_content"
        | "suspend_profile"
        | "unsuspend_profile"
      notification_kind:
        | "new_follower"
        | "comment"
        | "reply"
        | "clash_started"
        | "clash_result"
        | "reputation"
        | "hall_of_fame"
        | "vault_subscription"
        | "sponsor_activity"
        | "vault_drop"
        | "challenge_result"
        | "challenge_reaction"
        | "treasure_complete"
        | "treasure_reward"
      profile_role: "viewer" | "creator" | "moderator" | "admin"
      rank_name:
        | "Rookie"
        | "Instigator"
        | "Hot Take"
        | "Firestarter"
        | "Provocateur"
        | "Clash King"
        | "Legend"
      referral_link_status: "ACTIVE" | "PAUSED" | "EXPIRED" | "REVOKED"
      report_reason:
        | "spam"
        | "harassment"
        | "hate"
        | "sexual"
        | "violence"
        | "misinformation"
        | "impersonation"
        | "copyright"
        | "other"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
      report_target:
        | "profile"
        | "take"
        | "comment"
        | "clash"
        | "vault_drop"
        | "vault_subscription"
        | "arena_room_message"
        | "arena_room_evidence"
        | "challenge_entry"
        | "meet_session"
        | "meet_message"
      reputation_kind:
        | "clash_participation"
        | "clash_win"
        | "clash_dissent"
        | "arena_participation"
        | "arena_winning_side"
        | "arena_best_argument"
        | "arena_useful_evidence"
      sponsor_campaign_status:
        | "DRAFT"
        | "ACTIVE"
        | "PAUSED"
        | "ENDED"
        | "CANCELLED"
      sponsor_campaign_type:
        | "REFERRAL"
        | "COUPON"
        | "SPONSORED_CHALLENGE"
        | "CREATOR_PROMO"
      sponsor_conversion_type:
        | "PURCHASE"
        | "COUPON_REDEMPTION"
        | "LEAD"
        | "SIGNUP"
      take_stance: "AGREE" | "UNSURE" | "DISAGREE"
      take_status: "active" | "expired" | "removed"
      vault_drop_access: "free" | "subscriber"
      vault_drop_status: "draft" | "published" | "expired" | "removed"
      vault_status: "draft" | "active" | "suspended"
      vault_subscription_source: "test" | "admin" | "promo" | "payment"
      vault_subscription_status: "active" | "trial" | "cancelled" | "expired"
      verdict_winner: "A" | "B" | "DRAW"
      world_drop_status: "DRAFT" | "PUBLISHED" | "EXPIRED" | "REMOVED"
      world_mission_status: "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED"
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
      advertiser_status: ["DRAFT", "ACTIVE", "PAUSED", "SUSPENDED"],
      arena_evidence_kind: ["image", "video", "link"],
      arena_message_kind: ["text", "media", "gif", "system"],
      arena_participant_role: ["debater", "spectator"],
      arena_room_status: [
        "OPEN",
        "FINAL_ARGUMENTS",
        "JUDGING",
        "SETTLED",
        "CANCELLED",
      ],
      arena_topic_status: ["scheduled", "live", "closed"],
      arena_winning_side: ["AGREE", "DISAGREE", "DRAW"],
      attribution_method: ["REFERRAL", "COUPON", "UNATTRIBUTED"],
      campaign_creator_status: ["INVITED", "ACTIVE", "PAUSED", "REMOVED"],
      clash_mode: ["STANDARD", "BLIND"],
      clash_side: ["A", "B"],
      clash_status: ["open", "settled", "cancelled"],
      commission_ledger_status: ["PENDING", "APPROVED", "REJECTED", "VOID"],
      commission_type: ["FIXED_PER_CONVERSION", "PERCENTAGE", "NONE"],
      coupon_code_status: ["ACTIVE", "PAUSED", "EXPIRED", "REVOKED"],
      explore_challenge_status: ["scheduled", "active", "ended", "cancelled"],
      explore_challenge_type: ["GLOBAL", "COUNTRY", "CREATOR"],
      explore_clue_type: ["TEXT_ANSWER", "CONTENT_FIND", "MULTIPLE_CHOICE"],
      explore_content_target: ["take", "vault_drop", "challenge", "creator"],
      explore_entry_status: ["visible", "hidden", "removed"],
      explore_reward_type: [
        "badge",
        "cosmetic",
        "free_drop",
        "creator_access",
        "collectible",
        "sponsor",
      ],
      explore_treasure_status: ["scheduled", "active", "ended", "cancelled"],
      explore_treasure_type: ["GLOBAL", "COUNTRY", "CREATOR"],
      hood_game_status: ["DRAFT", "OPEN", "CLOSED", "RESOLVED", "CANCELLED"],
      hood_game_type: ["PREDICTION"],
      hood_id: [
        "techtakes",
        "campushustle",
        "goatalk",
        "movies",
        "gaming",
        "startups",
        "football",
      ],
      media_kind: ["image", "video", "gif"],
      media_status: ["uploading", "ready", "failed", "deleted"],
      media_visibility: ["public", "private"],
      meet_match_mode: ["ANYWHERE", "COUNTRY", "INTERESTS", "HOOD"],
      meet_queue_status: ["waiting", "matched", "cancelled"],
      meet_session_status: ["active", "ended"],
      moderation_action: [
        "warn",
        "remove_content",
        "restore_content",
        "suspend_profile",
        "unsuspend_profile",
      ],
      notification_kind: [
        "new_follower",
        "comment",
        "reply",
        "clash_started",
        "clash_result",
        "reputation",
        "hall_of_fame",
        "vault_subscription",
        "sponsor_activity",
        "vault_drop",
        "challenge_result",
        "challenge_reaction",
        "treasure_complete",
        "treasure_reward",
      ],
      profile_role: ["viewer", "creator", "moderator", "admin"],
      rank_name: [
        "Rookie",
        "Instigator",
        "Hot Take",
        "Firestarter",
        "Provocateur",
        "Clash King",
        "Legend",
      ],
      referral_link_status: ["ACTIVE", "PAUSED", "EXPIRED", "REVOKED"],
      report_reason: [
        "spam",
        "harassment",
        "hate",
        "sexual",
        "violence",
        "misinformation",
        "impersonation",
        "copyright",
        "other",
      ],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
      report_target: [
        "profile",
        "take",
        "comment",
        "clash",
        "vault_drop",
        "vault_subscription",
        "arena_room_message",
        "arena_room_evidence",
        "challenge_entry",
        "meet_session",
        "meet_message",
      ],
      reputation_kind: [
        "clash_participation",
        "clash_win",
        "clash_dissent",
        "arena_participation",
        "arena_winning_side",
        "arena_best_argument",
        "arena_useful_evidence",
      ],
      sponsor_campaign_status: [
        "DRAFT",
        "ACTIVE",
        "PAUSED",
        "ENDED",
        "CANCELLED",
      ],
      sponsor_campaign_type: [
        "REFERRAL",
        "COUPON",
        "SPONSORED_CHALLENGE",
        "CREATOR_PROMO",
      ],
      sponsor_conversion_type: [
        "PURCHASE",
        "COUPON_REDEMPTION",
        "LEAD",
        "SIGNUP",
      ],
      take_stance: ["AGREE", "UNSURE", "DISAGREE"],
      take_status: ["active", "expired", "removed"],
      vault_drop_access: ["free", "subscriber"],
      vault_drop_status: ["draft", "published", "expired", "removed"],
      vault_status: ["draft", "active", "suspended"],
      vault_subscription_source: ["test", "admin", "promo", "payment"],
      vault_subscription_status: ["active", "trial", "cancelled", "expired"],
      verdict_winner: ["A", "B", "DRAW"],
      world_drop_status: ["DRAFT", "PUBLISHED", "EXPIRED", "REMOVED"],
      world_mission_status: ["DRAFT", "ACTIVE", "ENDED", "CANCELLED"],
    },
  },
} as const

