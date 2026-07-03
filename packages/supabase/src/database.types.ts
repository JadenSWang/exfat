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
          weight: number | null
          height_cm: number | null
          sex: Database['public']['Enums']['biological_sex'] | null
          birth_year: number | null
          birth_month: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          default_unit?: Database['public']['Enums']['weight_unit']
          weight?: number | null
          height_cm?: number | null
          sex?: Database['public']['Enums']['biological_sex'] | null
          birth_year?: number | null
          birth_month?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          default_unit?: Database['public']['Enums']['weight_unit']
          weight?: number | null
          height_cm?: number | null
          sex?: Database['public']['Enums']['biological_sex'] | null
          birth_year?: number | null
          birth_month?: number | null
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
      foods: {
        Row: {
          id: string
          name: string
          brand: string | null
          source: Database['public']['Enums']['food_source']
          barcode: string | null
          serving_qty: number
          serving_unit: Database['public']['Enums']['food_unit']
          calories: number
          protein: number
          carbs: number
          fat: number
          owner_id: string | null
          verified: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          brand?: string | null
          source?: Database['public']['Enums']['food_source']
          barcode?: string | null
          serving_qty?: number
          serving_unit?: Database['public']['Enums']['food_unit']
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          owner_id?: string | null
          verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          brand?: string | null
          source?: Database['public']['Enums']['food_source']
          barcode?: string | null
          serving_qty?: number
          serving_unit?: Database['public']['Enums']['food_unit']
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          owner_id?: string | null
          verified?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'foods_owner_id_fkey'
            columns: ['owner_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      diary_entries: {
        Row: {
          id: string
          user_id: string
          entry_date: string
          meal: Database['public']['Enums']['meal_type']
          description: string
          quantity: number
          unit: Database['public']['Enums']['food_unit']
          calories: number
          protein: number
          carbs: number
          fat: number
          source: Database['public']['Enums']['food_source']
          is_estimate: boolean
          food_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          entry_date?: string
          meal?: Database['public']['Enums']['meal_type']
          description: string
          quantity?: number
          unit?: Database['public']['Enums']['food_unit']
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          source?: Database['public']['Enums']['food_source']
          is_estimate?: boolean
          food_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          entry_date?: string
          meal?: Database['public']['Enums']['meal_type']
          description?: string
          quantity?: number
          unit?: Database['public']['Enums']['food_unit']
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          source?: Database['public']['Enums']['food_source']
          is_estimate?: boolean
          food_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'diary_entries_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'diary_entries_food_id_fkey'
            columns: ['food_id']
            isOneToOne: false
            referencedRelation: 'foods'
            referencedColumns: ['id']
          },
        ]
      }
      barcode_submissions: {
        Row: {
          id: string
          user_id: string
          barcode: string
          name: string
          brand: string | null
          serving_qty: number
          serving_unit: Database['public']['Enums']['food_unit']
          calories: number
          protein: number
          carbs: number
          fat: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          barcode: string
          name: string
          brand?: string | null
          serving_qty?: number
          serving_unit?: Database['public']['Enums']['food_unit']
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          barcode?: string
          name?: string
          brand?: string | null
          serving_qty?: number
          serving_unit?: Database['public']['Enums']['food_unit']
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'barcode_submissions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      nutrition_goals: {
        Row: {
          user_id: string
          calories: number
          protein: number
          carbs: number
          fat: number
          updated_at: string
        }
        Insert: {
          user_id: string
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          updated_at?: string
        }
        Update: {
          user_id?: string
          calories?: number
          protein?: number
          carbs?: number
          fat?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'nutrition_goals_user_id_fkey'
            columns: ['user_id']
            isOneToOne: true
            referencedRelation: 'users'
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
      biological_sex: 'male' | 'female'
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
      meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
      food_source: 'ai_estimate' | 'barcode' | 'database' | 'manual'
      food_unit: 'g' | 'oz' | 'ml' | 'tbsp' | 'tsp' | 'cup' | 'piece' | 'serving'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
