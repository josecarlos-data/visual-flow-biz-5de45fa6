-- Ejecutar SOLO al reconstruir la base en un servidor propio (en Lovable Cloud el bucket se gestiona con la herramienta de almacenamiento).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ofertas-publicas', 'ofertas-publicas', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
