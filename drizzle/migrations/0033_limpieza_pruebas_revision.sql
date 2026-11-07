DO $$
DECLARE n int;
BEGIN
  -- 1. Mensajes de prueba: 7
  SELECT count(*) INTO n FROM public.visita_mensajes WHERE id IN (
    '80109dd0-8b05-4708-8b2c-fd1ef2ce5612','38aa83e5-cb9d-45c7-9972-7c6b111aed66','02ee9a74-2fcb-4854-a3b1-3a422620cf7d',
    'bb3c32da-5e3e-43f0-9400-af2cbe2feb40','fb9f193e-f1bc-4e57-8099-37b4a88a94c7','012d1de7-ba73-4d9a-83c0-64e82cdaef32',
    '91f2e859-e819-4b86-a7c8-8f25941c4e77') AND autor_id IS NOT NULL;
  IF n <> 7 THEN RAISE EXCEPTION 'Recuento mensajes: % (esperado 7)', n; END IF;

  -- 2. Bloques con nota de prueba (11 José Carlos + 2 Malaga)
  SELECT count(*) INTO n FROM public.visita_bloques WHERE nota_revision IS NOT NULL AND nota_revision <> '' AND id IN (
    '113036b4-a4ac-47b9-92af-f959e619fe8a','57865c2a-0733-47fb-b2df-7ae381b3b5e2','7efc4f3e-2339-4ee1-b32e-a421845db261',
    'b067a3d2-57d5-4470-ab0a-dc0f2be30c1c','cea9192e-15d9-4e76-9dd6-89e8dcedcec3','21954013-fbab-4aae-a7a6-b0254c52c8f6',
    'c7118b91-0684-4c24-8336-a5636b77329f','1b6e91fc-908f-42d2-8998-c2a7f6d44592','252a50c9-b795-4c4f-8494-186e3a3d458e',
    '98a757d1-e683-4309-9544-45714db9ea81','cedbece3-ff1c-4839-bc67-26d6b3315851',
    '2bc3edb7-a0cc-450d-9191-c1865e7c8a49','74b3f838-ae31-4880-b717-787ce9e022dc');
  IF n <> 13 THEN RAISE EXCEPTION 'Recuento notas de bloque: % (esperado 13)', n; END IF;

  -- 3. Visitas con nota de prueba (3 + 2 Malaga)
  SELECT count(*) INTO n FROM public.visitas WHERE nota_revision IS NOT NULL AND nota_revision <> '' AND id IN (
    'd861960d-4112-40fb-bb31-c9e4a72b918a','6cb353b5-b102-418c-a694-54ed0bfadfc3','9e91d838-9331-4841-84cf-010fc722b888',
    '24c556ba-775e-49b6-88f6-0564d2bce918','10fea99d-9fa7-4c09-b635-e4f7a7312823');
  IF n <> 5 THEN RAISE EXCEPTION 'Recuento notas de visita: % (esperado 5)', n; END IF;

  -- 4. Bloques revisados el 06/11 por José Carlos (10) y Malaga (2)
  SELECT count(*) INTO n FROM public.visita_bloques WHERE revisado_en::date = '2026-11-06' AND (
    (revisado_por = '28f5caa7-bae6-4137-872e-a044a06848b0' AND id IN (
      '7efc4f3e-2339-4ee1-b32e-a421845db261','efb8aa2a-02c5-4d80-bb1e-0e84289c9d20','b067a3d2-57d5-4470-ab0a-dc0f2be30c1c',
      '1b6e91fc-908f-42d2-8998-c2a7f6d44592','252a50c9-b795-4c4f-8494-186e3a3d458e','98a757d1-e683-4309-9544-45714db9ea81',
      'cedbece3-ff1c-4839-bc67-26d6b3315851','cea9192e-15d9-4e76-9dd6-89e8dcedcec3','21954013-fbab-4aae-a7a6-b0254c52c8f6',
      'c7118b91-0684-4c24-8336-a5636b77329f'))
    OR (revisado_por = 'a7e2e7b5-78cb-4e2d-b91e-1f51c79ae020' AND id IN (
      '2bc3edb7-a0cc-450d-9191-c1865e7c8a49','74b3f838-ae31-4880-b717-787ce9e022dc')));
  IF n <> 12 THEN RAISE EXCEPTION 'Recuento bloques revisados: % (esperado 12)', n; END IF;

  -- 5. Visitas con revisor directo a limpiar (9e91 José Carlos; 24c5 y 10fe Malaga)
  SELECT count(*) INTO n FROM public.visitas WHERE revisado_en::date = '2026-11-06' AND (
    (id = '9e91d838-9331-4841-84cf-010fc722b888' AND revisado_por = '28f5caa7-bae6-4137-872e-a044a06848b0')
    OR (id IN ('24c556ba-775e-49b6-88f6-0564d2bce918','10fea99d-9fa7-4c09-b635-e4f7a7312823') AND revisado_por = 'a7e2e7b5-78cb-4e2d-b91e-1f51c79ae020'));
  IF n <> 3 THEN RAISE EXCEPTION 'Recuento visitas revisadas: % (esperado 3)', n; END IF;

  -- 6. CALEROTRUCKS de Francisco Martinez: bloque Correcto y misma nota en bloque y visita
  SELECT count(*) INTO n FROM public.visita_bloques b JOIN public.visitas v ON v.id = b.visita_id
   WHERE b.id = '511c71ee-96e1-4d4e-bd09-60c739727142' AND v.id = '970ae290-140b-458c-bfb2-92bca8c1ec75'
     AND b.validacion = 'CORRECTO' AND b.revisado_por = '6503b07c-4944-452a-9d77-07eb2ca5b596'
     AND v.revisado_por = '6503b07c-4944-452a-9d77-07eb2ca5b596' AND b.nota_revision = v.nota_revision
     AND (SELECT count(*) FROM public.visita_bloques x WHERE x.visita_id = v.id) = 1;
  IF n <> 1 THEN RAISE EXCEPTION 'CALEROTRUCKS 970ae290 no cuadra con el plan'; END IF;
END $$;

-- A. Borrar los 7 mensajes de prueba
DELETE FROM public.visita_mensajes WHERE id IN (
  '80109dd0-8b05-4708-8b2c-fd1ef2ce5612','38aa83e5-cb9d-45c7-9972-7c6b111aed66','02ee9a74-2fcb-4854-a3b1-3a422620cf7d',
  'bb3c32da-5e3e-43f0-9400-af2cbe2feb40','fb9f193e-f1bc-4e57-8099-37b4a88a94c7','012d1de7-ba73-4d9a-83c0-64e82cdaef32',
  '91f2e859-e819-4b86-a7c8-8f25941c4e77');

-- B+C. Bloques: validaciones del 06/11 a pendiente y sin revisor; notas vacías
UPDATE public.visita_bloques SET validacion = 'pendiente', revisado_por = NULL, revisado_en = NULL, nota_revision = NULL
WHERE id IN (
  '7efc4f3e-2339-4ee1-b32e-a421845db261','efb8aa2a-02c5-4d80-bb1e-0e84289c9d20','b067a3d2-57d5-4470-ab0a-dc0f2be30c1c',
  '1b6e91fc-908f-42d2-8998-c2a7f6d44592','252a50c9-b795-4c4f-8494-186e3a3d458e','98a757d1-e683-4309-9544-45714db9ea81',
  'cedbece3-ff1c-4839-bc67-26d6b3315851','cea9192e-15d9-4e76-9dd6-89e8dcedcec3','21954013-fbab-4aae-a7a6-b0254c52c8f6',
  'c7118b91-0684-4c24-8336-a5636b77329f','2bc3edb7-a0cc-450d-9191-c1865e7c8a49','74b3f838-ae31-4880-b717-787ce9e022dc');

-- Notas de octubre: solo la nota (validación intacta)
UPDATE public.visita_bloques SET nota_revision = NULL
WHERE id IN ('113036b4-a4ac-47b9-92af-f959e619fe8a','57865c2a-0733-47fb-b2df-7ae381b3b5e2');
UPDATE public.visitas SET nota_revision = NULL
WHERE id IN ('d861960d-4112-40fb-bb31-c9e4a72b918a','6cb353b5-b102-418c-a694-54ed0bfadfc3');

-- Visitas con revisor directo del 06/11
UPDATE public.visitas SET validacion = 'pendiente', revisado_por = NULL, revisado_en = NULL, nota_revision = NULL
WHERE id IN ('9e91d838-9331-4841-84cf-010fc722b888','24c556ba-775e-49b6-88f6-0564d2bce918','10fea99d-9fa7-4c09-b635-e4f7a7312823');

-- D. CALEROTRUCKS 970ae290: nota de Fran pasa a mensaje suyo
INSERT INTO public.visita_mensajes (visita_id, bloque_id, autor_id, autor_nombre, texto, created_at)
SELECT b.visita_id, b.id, b.revisado_por, 'Francisco Martinez', b.nota_revision, b.revisado_en
FROM public.visita_bloques b WHERE b.id = '511c71ee-96e1-4d4e-bd09-60c739727142';

UPDATE public.visita_bloques SET nota_revision = NULL WHERE id = '511c71ee-96e1-4d4e-bd09-60c739727142';
UPDATE public.visitas SET validacion = 'CORRECTO', nota_revision = NULL WHERE id = '970ae290-140b-458c-bfb2-92bca8c1ec75';

-- Rafael no lo ha visto: su lectura queda anterior al mensaje
UPDATE public.visita_lecturas SET leido_en = '2026-11-06 11:21:27+00'
WHERE visita_id = '970ae290-140b-458c-bfb2-92bca8c1ec75' AND user_id = 'cffc9b49-1882-4a65-b102-3d4492a33473';