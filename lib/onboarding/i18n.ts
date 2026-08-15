// ── Onboarding translations ──────────────────────────────────────────────────
// The interview is data (questions.ts stays the canonical English structure with
// language-independent keys/values that drive flow + compliance). Here we return
// LOCALIZED copies for display only — prompts, help, option labels — plus the UI
// chrome strings and a localized review summarizer. English falls through
// untouched, so nothing regresses.

import type { Locale } from '@/lib/i18n'
import { ENTITY_TYPE_LABELS } from '@/lib/types'
import {
  QUESTIONS,
  STAGES,
  factSummary,
  normalizeEntityType,
  type Question,
  type QOption,
  type Owner,
} from './questions'

// --- UI chrome (start / review / question controls / page) -------------------
const OB: Record<string, { en: string; es: string }> = {
  'start.label': { en: 'New account · legal name', es: 'Cuenta nueva · nombre legal' },
  'start.placeholder': { en: 'Acme Store LLC', es: 'Acme Store LLC' },
  'start.under': { en: 'Under', es: 'En' },
  'start.underWhich': { en: 'Under which firm', es: 'Bajo qué firma' },
  'start.continue': { en: 'Continue →', es: 'Continuar →' },
  'start.starting': { en: 'Starting…', es: 'Iniciando…' },
  'start.needName': { en: 'Enter the account name to begin.', es: 'Escribe el nombre de la cuenta para comenzar.' },
  'stage.review': { en: 'Review', es: 'Revisión' },
  'review.intro': { en: "Here's what I make of {name}.", es: 'Esto es lo que entiendo de {name}.' },
  'review.title': { en: 'Ready to create the account?', es: '¿Listo para crear la cuenta?' },
  'review.overseer': { en: 'The Overseer', es: 'El Overseer' },
  'review.reading': { en: 'Reading {name}…', es: 'Analizando {name}…' },
  'review.look': {
    en: "Does this look right? Tell me what to fix and I'll adjust.",
    es: '¿Se ve bien? Dime qué corregir y lo ajusto.',
  },
  'review.replyPh': {
    en: "e.g. It's actually an S-corp based in Texas",
    es: 'p. ej. En realidad es una corporación S basada en Texas',
  },
  'review.send': { en: 'Send →', es: 'Enviar →' },
  'review.thinking': { en: 'Overseer is thinking…', es: 'El Overseer está pensando…' },
  'review.willSeed': {
    en: "I'll seed the chart of accounts, prepare the compliance schedule this profile implies, and start the Overseer's record. You can change anything afterward.",
    es: 'Prepararé el catálogo de cuentas, el calendario de cumplimiento que implica este perfil y comenzaré el registro del Overseer. Puedes cambiar cualquier cosa después.',
  },
  'review.create': { en: 'Create account →', es: 'Crear cuenta →' },
  'review.creating': { en: 'Creating…', es: 'Creando…' },
  'review.back': { en: '← Back', es: '← Volver' },
  'q.more': { en: 'More options →', es: 'Más opciones →' },
  'q.somethingElse': { en: 'Something else →', es: 'Otra cosa →' },
  'q.typeAnswer': { en: 'Type your answer', es: 'Escribe tu respuesta' },
  'q.save': { en: 'Save →', es: 'Guardar →' },
  'q.continue': { en: 'Continue →', es: 'Continuar →' },
  'q.skip': { en: 'Skip', es: 'Omitir' },
  'owners.name': { en: 'Owner name', es: 'Nombre del propietario' },
  'owners.add': { en: 'Add owner', es: 'Agregar propietario' },
  'owners.addAnother': { en: '+ Add another owner', es: '+ Agregar otro propietario' },
  'owners.total': { en: 'Total {n}%', es: 'Total {n}%' },
  'owners.hint': {
    en: 'Percentages split evenly on their own — set one and the rest adjust. Override any as needed.',
    es: 'Los porcentajes se reparten solos — fija uno y el resto se ajusta. Cambia el que quieras.',
  },
  'owners.pctAria': { en: 'Ownership percentage', es: 'Porcentaje de propiedad' },
  'page.classic': { en: 'Classic form', es: 'Formulario clásico' },
  'page.cancel': { en: 'Cancel', es: 'Cancelar' },
  'created.ok': {
    en: 'Account created — the Overseer has started its record.',
    es: 'Cuenta creada — el Overseer ha iniciado su registro.',
  },
}

export function ob(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const entry = OB[key]
  let s = entry ? (locale === 'es' ? entry.es : entry.en) : key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
  return s
}

// --- Question content (Spanish) ----------------------------------------------
const STAGE_ES: Record<string, string> = {
  identity: 'Identidad',
  operations: 'Operaciones',
  accounting: 'Contabilidad',
}

const PROMPT_ES: Record<string, string> = {
  entity_type: '¿Qué tipo de entidad es {name}?',
  state: '¿Dónde está basada {name}?',
  formation_date: '¿Cuándo comenzó {name}?',
  owners: '¿Quién es dueño de {name}?',
  business_activity: '¿A qué se dedica {name}?',
  has_employees: '¿{name} tiene empleados?',
  accounting_basis: '¿Cómo debemos llevar los libros?',
  accounting_system: '¿Qué usan para la contabilidad hoy?',
}

const HELP_ES: Record<string, string> = {
  state: 'Esto me indica qué agencias estatales y declaraciones aplican.',
  formation_date:
    'Fecha de constitución o del primer día de operaciones. Define los primeros períodos de declaración; déjalo en blanco si no estás seguro.',
  owners: 'Agrega cada propietario y su porcentaje. Puedes dejar el % en blanco si no estás seguro.',
  business_activity: 'Una breve descripción del negocio o su industria.',
  has_employees: 'Esto determina la nómina y las declaraciones patronales (EDD, IRS 941 / 940).',
  accounting_system: 'Opcional — me ayuda a planear la migración y el catálogo de cuentas.',
}

// Keyed by the canonical English label.
const OPT_ES: Record<string, string> = {
  'Sole Proprietor': 'Propietario único',
  Partnership: 'Sociedad',
  LLC: 'LLC',
  'S-Corporation': 'Corporación S',
  'C-Corporation': 'Corporación C',
  Nonprofit: 'Sin fines de lucro',
  'General Partnership (GP)': 'Sociedad general (GP)',
  'Limited Partnership (LP)': 'Sociedad limitada (LP)',
  'Limited Liability Partnership (LLP)': 'Sociedad de responsabilidad limitada (LLP)',
  'Trust / Estate': 'Fideicomiso / Sucesión',
  Cooperative: 'Cooperativa',
  'Government / Public Entity': 'Gobierno / Entidad pública',
  Other: 'Otro',
  California: 'California',
  Nevada: 'Nevada',
  Arizona: 'Arizona',
  Texas: 'Texas',
  Yes: 'Sí',
  No: 'No',
  'Not yet': 'Todavía no',
  'Not sure': 'No estoy seguro',
  Cash: 'Efectivo',
  Accrual: 'Devengo',
  'QuickBooks Online': 'QuickBooks Online',
  Xero: 'Xero',
  Spreadsheets: 'Hojas de cálculo',
  'Nothing yet': 'Nada aún',
}

const HINT_ES: Record<string, string> = {
  'Counted when money moves — recommended for most': 'Se cuenta cuando el dinero se mueve — recomendado para la mayoría',
  'Counted when earned / incurred': 'Se cuenta cuando se gana / se incurre',
}

export function stageLabel(locale: Locale, stage: string): string {
  if (locale === 'es') return STAGE_ES[stage] ?? stage
  return STAGES.find((s) => s.key === stage)?.label ?? stage
}

export function localizeStages(locale: Locale) {
  return STAGES.map((s) => ({ key: s.key, label: stageLabel(locale, s.key) }))
}

export function localizeQuestions(locale: Locale): Question[] {
  if (locale !== 'es') return QUESTIONS
  const tOpt = (o: QOption): QOption => ({
    ...o,
    label: OPT_ES[o.label] ?? o.label,
    hint: o.hint ? HINT_ES[o.hint] ?? o.hint : o.hint,
  })
  return QUESTIONS.map((q) => ({
    ...q,
    prompt: PROMPT_ES[q.key] ?? q.prompt,
    help: q.help ? HELP_ES[q.key] ?? q.help : q.help,
    options: q.options?.map(tOpt),
    moreOptions: q.moreOptions?.map(tOpt),
  }))
}

// Localized one-line summary for the review screen.
export function localizeSummary(locale: Locale, key: string, value: unknown): string | null {
  if (locale !== 'es') return factSummary(key, value)
  switch (key) {
    case 'entity_type': {
      const t = normalizeEntityType(value)
      const en = t ? ENTITY_TYPE_LABELS[t] : String(value)
      return OPT_ES[en] ?? en
    }
    case 'entity_subtype':
      return typeof value === 'string' && value ? OPT_ES[value] ?? value : null
    case 'state':
      return typeof value === 'string' ? value : null
    case 'formation_date':
      return typeof value === 'string' && value ? value : null
    case 'owners': {
      const os = (value as Owner[]) ?? []
      return os.length ? os.map((o) => (o.pct != null ? `${o.name} (${o.pct}%)` : o.name)).join(', ') : null
    }
    case 'business_activity':
      return typeof value === 'string' ? value : null
    case 'has_employees':
      return value === 'yes'
        ? 'Tiene empleados'
        : value === 'no'
          ? 'Sin empleados'
          : value === 'not_yet'
            ? 'Aún sin empleados'
            : 'Empleados: no seguro'
    case 'accounting_basis':
      return value === 'accrual' ? 'Base devengo' : 'Base efectivo'
    case 'accounting_system': {
      const v = typeof value === 'string' ? value : null
      return v ? OPT_ES[v] ?? v : null
    }
    default:
      return value == null ? null : String(value)
  }
}
