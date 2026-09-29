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
          id: string
          is_pinned: boolean
          is_removed: boolean
          parent_comment_id: string | null
          take_id: string
          text: string
          upvotes_count: number
        }
        Insert: {
          author_id: string
          created_at?: string
          id: string
          is_pinned?: boolean
          is_removed?: boolean
          parent_comment_id?: string | null
          take_id: string
          text: string
          upvotes_count?: number
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          is_removed?: boolean
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
          clash_id: string | null
          coins_delta: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["reputation_kind"]
          profile_id: string
          reputation_delta: number
        }
        Insert: {
          clash_id?: string | null
          coins_delta?: number
          created_at?: string
          id: string
          kind: Database["public"]["Enums"]["reputation_kind"]
          profile_id: string
          reputation_delta: number
        }
        Update: {
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
      add_drop_to_collection: {
        Args: { p_collection_id: string; p_drop_id: string }
        Returns: undefined
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
      block_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      can_access_vault_drop: {
        Args: { p_drop_id: string; p_viewer_profile_id: string }
        Returns: boolean
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
      create_take: {
        Args: {
          p_hood: Database["public"]["Enums"]["hood_id"]
          p_media_object_id?: string
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
      fail_media_upload: {
        Args: { p_media_id: string }
        Returns: undefined
      }
      follow_profile: {
        Args: { p_target_id: string }
        Returns: undefined
      }
      hood_active_prediction: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: Json
      }
      hood_game_view: {
        Args: { p_game_id: string }
        Returns: Json
      }
      is_hood_moderator: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: boolean
      }
      is_staff: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      join_hood: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: undefined
      }
      leave_hood: {
        Args: { p_hood: Database["public"]["Enums"]["hood_id"] }
        Returns: undefined
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
      owns_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
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
          published_at: string | null
          status: Database["public"]["Enums"]["vault_drop_status"]
          vault_id: string
        }
      }
      rank_for_rep: {
        Args: { p_rep: number }
        Returns: Database["public"]["Enums"]["rank_name"]
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
      remove_drop_from_collection: {
        Args: { p_collection_id: string; p_drop_id: string }
        Returns: undefined
      }
      remove_world_drop: {
        Args: { p_drop_id: string }
        Returns: undefined
      }
      resolve_prediction_game: {
        Args: { p_game_id: string; p_winning_option_id: string }
        Returns: Json
      }
      run_maintenance: {
        Args: { p_limit?: number }
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
      start_clash: {
        Args: {
          p_comment_id?: string
          p_mode?: Database["public"]["Enums"]["clash_mode"]
          p_take_id: string
        }
        Returns: string
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
      take_hood: {
        Args: { p_take_id: string }
        Returns: Database["public"]["Enums"]["hood_id"]
      }
      take_stance_payload: {
        Args: { p_row: Database["public"]["Tables"]["take_stances"]["Row"] }
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
      clash_mode: "STANDARD" | "BLIND"
      clash_side: "A" | "B"
      clash_status: "open" | "settled" | "cancelled"
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
      media_kind: "image" | "video"
      media_status: "uploading" | "ready" | "failed" | "deleted"
      media_visibility: "public" | "private"
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
      profile_role: "viewer" | "creator" | "moderator" | "admin"
      rank_name:
        | "Rookie"
        | "Instigator"
        | "Hot Take"
        | "Firestarter"
        | "Provocateur"
        | "Clash King"
        | "Legend"
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
      reputation_kind: "clash_participation" | "clash_win" | "clash_dissent"
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
      clash_mode: ["STANDARD", "BLIND"],
      clash_side: ["A", "B"],
      clash_status: ["open", "settled", "cancelled"],
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
      media_kind: ["image", "video"],
      media_status: ["uploading", "ready", "failed", "deleted"],
      media_visibility: ["public", "private"],
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
      ],
      reputation_kind: ["clash_participation", "clash_win", "clash_dissent"],
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

