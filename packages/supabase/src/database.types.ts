// Hand-authored to match migrations; regenerate with
// `pnpm --filter @workout/supabase db:types` against a running DB.
//
// Mirrors supabase/migrations/20260101000000_init.sql. Keep these types and the
// SQL in lockstep: every Tables.<t>.Row field maps to a column, Insert marks
// db-defaulted / nullable columns optional, and Update makes everything
// optional. Enums mirror the Postgres enum types one-to-one.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          default_unit: Database['public']['Enums']['weight_unit']
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          default_unit?: Database['public']['Enums']['weight_unit']
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          default_unit?: Database['public']['Enums']['weight_unit']
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      exercises: {
        Row: {
          id: string
          name: string
          primary_muscle: Database['public']['Enums']['muscle_group']
          secondary_muscles: Database['public']['Enums']['muscle_group'][]
          equipment: Database['public']['Enums']['equipment']
          category: Database['public']['Enums']['exercise_category']
          owner_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          primary_muscle: Database['public']['Enums']['muscle_group']
          secondary_muscles?: Database['public']['Enums']['muscle_group'][]
          equipment: Database['public']['Enums']['equipment']
          category?: Database['public']['Enums']['exercise_category']
          owner_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          primary_muscle?: Database['public']['Enums']['muscle_group']
          secondary_muscles?: Database['public']['Enums']['muscle_group'][]
          equipment?: Database['public']['Enums']['equipment']
          category?: Database['public']['Enums']['exercise_category']
          owner_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'exercises_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      workouts: {
        Row: {
          id: string
          user_id: string
          title: string | null
          started_at: string
          ended_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          started_at?: string
          ended_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          started_at?: string
          ended_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workouts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      workout_exercises: {
        Row: {
          id: string
          workout_id: string
          exercise_id: string
          position: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workout_id: string
          exercise_id: string
          position?: number
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workout_id?: string
          exercise_id?: string
          position?: number
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workout_exercises_workout_id_fkey'
            columns: ['workout_id']
            isOneToOne: false
            referencedRelation: 'workouts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'workout_exercises_exercise_id_fkey'
            columns: ['exercise_id']
            isOneToOne: false
            referencedRelation: 'exercises'
            referencedColumns: ['id']
          },
        ]
      }
      sets: {
        Row: {
          id: string
          workout_exercise_id: string
          set_index: number
          weight: number
          reps: number
          unit: Database['public']['Enums']['weight_unit']
          type: Database['public']['Enums']['set_type']
          rpe: number | null
          completed: boolean
          created_at: string
        }
        Insert: {
          id?: string
          workout_exercise_id: string
          set_index?: number
          weight?: number
          reps?: number
          unit?: Database['public']['Enums']['weight_unit']
          type?: Database['public']['Enums']['set_type']
          rpe?: number | null
          completed?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          workout_exercise_id?: string
          set_index?: number
          weight?: number
          reps?: number
          unit?: Database['public']['Enums']['weight_unit']
          type?: Database['public']['Enums']['set_type']
          rpe?: number | null
          completed?: boolean
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sets_workout_exercise_id_fkey'
            columns: ['workout_exercise_id']
            isOneToOne: false
            referencedRelation: 'workout_exercises'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      weight_unit: 'kg' | 'lb'
      set_type: 'normal' | 'warmup' | 'dropset' | 'failure'
      muscle_group:
        | 'chest'
        | 'back'
        | 'shoulders'
        | 'biceps'
        | 'triceps'
        | 'quads'
        | 'hamstrings'
        | 'glutes'
        | 'calves'
        | 'core'
        | 'forearms'
        | 'full_body'
      equipment:
        | 'barbell'
        | 'dumbbell'
        | 'machine'
        | 'cable'
        | 'bodyweight'
        | 'kettlebell'
        | 'band'
        | 'other'
      exercise_category: 'compound' | 'isolation'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
