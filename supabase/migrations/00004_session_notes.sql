-- Per-session clinical notes (prontuário) with audio support
-- appointment_id is nullable: standalone notes can exist without a session
CREATE TABLE session_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  content TEXT,
  audio_url TEXT,
  transcription TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique: only one note per appointment (when linked)
CREATE UNIQUE INDEX session_notes_appointment_id_unique
  ON session_notes (appointment_id) WHERE appointment_id IS NOT NULL;

ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_notes_owner" ON session_notes
  FOR ALL USING (profile_id = auth.uid());

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON session_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
