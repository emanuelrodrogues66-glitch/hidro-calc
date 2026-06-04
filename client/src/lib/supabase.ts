import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string || 'https://nynoqixlyemicmnulbbc.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55bm9xaXhseWVtaWNtbnVsYmJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MjUwNTgsImV4cCI6MjA5NjAwMTA1OH0.I_L8o618Bt2VcwGn_OB362dDMl93O7YC3hfldgJCQIA'

export const supabase = createClient(url, key)
