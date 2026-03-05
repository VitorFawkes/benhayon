import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: 'public' },
    })

    // Check if table already exists
    const { data: existing } = await supabase
      .from('session_notes')
      .select('id')
      .limit(0)

    if (existing !== null) {
      return new Response(JSON.stringify({ message: 'Table session_notes already exists' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Table doesn't exist — use postgres connection to create it
    // Edge functions have access to DATABASE_URL
    const dbUrl = Deno.env.get('DATABASE_URL')
    if (!dbUrl) {
      // Fallback: try SUPABASE_DB_URL
      throw new Error('DATABASE_URL not available. Will need direct SQL execution.')
    }

    // Use Deno's postgres driver
    const { Client } = await import('https://deno.land/x/postgres@v0.19.3/mod.ts')
    const client = new Client(dbUrl)
    await client.connect()

    // Create table
    await client.queryArray(`
      CREATE TABLE IF NOT EXISTS session_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
        patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        content TEXT,
        audio_url TEXT,
        transcription TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(appointment_id)
      )
    `)

    // Enable RLS
    await client.queryArray(`ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY`)

    // Create policy
    await client.queryArray(`
      CREATE POLICY "session_notes_owner" ON session_notes
        FOR ALL USING (profile_id = auth.uid())
    `)

    // Create trigger (assumes set_updated_at function exists)
    await client.queryArray(`
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON session_notes
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `)

    await client.end()

    return new Response(JSON.stringify({ message: 'Migration applied successfully!' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Migration error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
