-- =============================================
-- Migration: Nota Fiscal por Invoice
-- Adiciona suporte a upload de nota fiscal (imagem/PDF)
-- que é enviada junto com a cobrança via WhatsApp
-- =============================================

-- 1. Colunas na tabela invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS nota_fiscal_url TEXT,
  ADD COLUMN IF NOT EXISTS nota_fiscal_type TEXT CHECK (nota_fiscal_type IN ('image', 'pdf')),
  ADD COLUMN IF NOT EXISTS nota_fiscal_name TEXT,
  ADD COLUMN IF NOT EXISTS nota_fiscal_uploaded_at TIMESTAMPTZ;

-- 2. Bucket de storage (público para Evolution API acessar)
INSERT INTO storage.buckets (id, name, public)
VALUES ('notas-fiscais', 'notas-fiscais', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Políticas RLS para o bucket
CREATE POLICY "Upload notas fiscais"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'notas-fiscais' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Read notas fiscais"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notas-fiscais');

CREATE POLICY "Update notas fiscais"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'notas-fiscais' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Delete notas fiscais"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'notas-fiscais' AND auth.uid()::text = (storage.foldername(name))[1]);
