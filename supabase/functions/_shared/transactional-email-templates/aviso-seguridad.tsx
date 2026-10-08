import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Linea {
  texto?: string
  cuando?: string
  ip?: string | null
}

interface Props {
  asunto?: string
  titulo?: string
  recuento?: number
  lineas?: Linea[]
  restantes?: number
  enlace?: string
}

const AvisoSeguridad = ({ asunto, titulo, recuento = 0, lineas = [], restantes = 0, enlace }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>{asunto ?? 'Aviso de seguridad del CRM'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={marca}>CRM Rimosa · Aviso de seguridad</Text>
        <Heading style={h1}>{titulo ?? 'Aviso de seguridad'}</Heading>
        <Text style={texto}>
          {recuento === 1 ? 'Se ha registrado 1 evento' : `Se han registrado ${recuento} eventos`} que requieren tu atención.
        </Text>
        <Section style={caja}>
          {lineas.map((l, i) => (
            <Text key={i} style={linea}>
              <strong>{l.cuando ?? ''}</strong> · {l.texto ?? ''}
              {l.ip ? ` · IP ${l.ip}` : ''}
            </Text>
          ))}
          {restantes > 0 && <Text style={linea}>… y {restantes} más.</Text>}
        </Section>
        {enlace && (
          <Button href={enlace} style={boton}>Abrir Auditoría</Button>
        )}
        <Hr style={hr} />
        <Text style={pie}>Este aviso lo genera automáticamente el CRM. Nunca incluye contraseñas ni códigos.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AvisoSeguridad,
  subject: (d: Record<string, any>) => d.asunto ?? '[CRM Rimosa] Aviso de seguridad',
  displayName: 'Aviso de seguridad',
  previewData: {
    asunto: '[CRM Rimosa] 2 suspensiones automáticas (1 cuenta sospechosa)',
    titulo: 'Suspensiones automáticas',
    recuento: 2,
    lineas: [
      { cuando: '08/10 03:12', texto: 'Ana Pérez (ana) suspendida, ciclo 2 — CUENTA SOSPECHOSA', ip: '203.0.113.5' },
      { cuando: '08/10 03:40', texto: 'Luis Gómez (lgomez) suspendida, ciclo 1', ip: '203.0.113.5' },
    ],
    enlace: 'https://crmrimosa.josecarlossobrino.com/admin/auditoria',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const marca = { color: '#0f9488', fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', margin: '0 0 8px' }
const h1 = { color: '#1f2937', fontSize: '20px', margin: '0 0 12px' }
const texto = { color: '#374151', fontSize: '14px', lineHeight: '20px' }
const caja = { backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '8px 14px', margin: '12px 0 20px' }
const linea = { color: '#1f2937', fontSize: '13px', lineHeight: '19px', margin: '6px 0' }
const boton = { backgroundColor: '#0f9488', color: '#ffffff', borderRadius: '6px', padding: '10px 18px', fontSize: '14px', textDecoration: 'none' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0 12px' }
const pie = { color: '#6b7280', fontSize: '12px' }
