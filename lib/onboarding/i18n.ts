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
  'start.labelIndividual': { en: 'New individual · legal name', es: 'Persona nueva · nombre legal' },
  'start.placeholder': { en: 'Acme Store LLC', es: 'Acme Store LLC' },
  'start.placeholderIndividual': { en: 'Jane A. Doe', es: 'Juana A. Pérez' },
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
  'review.willSeedIndividual': {
    en: "I'll open their return for the tax year and start the Overseer's record. Add W-2s, 1099s, and Schedule C on the Income tab — you can change anything afterward.",
    es: 'Abriré su declaración para el año fiscal y comenzaré el registro del Overseer. Agrega W-2, 1099 y Schedule C en la pestaña Ingresos — puedes cambiar cualquier cosa después.',
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
  account_kind: '¿{name} es un negocio o una persona?',
  filing_status: '¿Cuál es el estado civil tributario de {name}?',
  occupation: '¿A qué se dedica {name}?',
  income_sources: '¿De dónde provienen los ingresos de {name}?',
  entity_type: '¿Qué tipo de entidad es {name}?',
  state: '¿Dónde está basada {name}?',
  formation_date: '¿Cuándo comenzó {name}?',
  owners: '¿Quién es dueño de {name}?',
  business_activity: '¿A qué se dedica {name}?',
  has_employees: '¿{name} tiene empleados?',
  accounting_basis: '¿Cómo debemos llevar los libros?',
  accounting_system: '¿Qué usan para la contabilidad hoy?',
  tax_year: '¿Qué año fiscal vamos a abrir para {name}?',
}

const HELP_ES: Record<string, string> = {
  account_kind: 'Un negocio tiene libros y catálogo de cuentas. Una persona es declarante del 1040 — W-2, 1099, Schedule C.',
  filing_status: 'Cómo presenta su 1040. Puedes cambiarlo después.',
  occupation: 'Su ocupación o actividad principal — opcional.',
  income_sources: 'Configura las secciones de ingresos correctas — ajústalas cuando quieras en la pestaña Ingresos.',
  state: 'Esto me indica qué agencias estatales y declaraciones aplican.',
  formation_date:
    'Fecha de constitución o del primer día de operaciones. Define los primeros períodos de declaración; déjalo en blanco si no estás seguro.',
  owners: 'Agrega cada propietario y su porcentaje. Puedes dejar el % en blanco si no estás seguro.',
  business_activity: 'Una breve descripción del negocio o su industria.',
  has_employees: 'Esto determina la nómina y las declaraciones patronales (EDD, IRS 941 / 940).',
  accounting_system: 'Opcional — me ayuda a planear la migración y el catálogo de cuentas.',
  tax_year: 'Puedes abrir más años después — cada año se trabaja y se cierra por separado.',
}

// Keyed by the canonical English label.
const OPT_ES: Record<string, string> = {
  Business: 'Negocio',
  Individual: 'Persona',
  Single: 'Soltero(a)',
  'Married filing jointly': 'Casado(a) declarando en conjunto',
  'Married filing separately': 'Casado(a) declarando por separado',
  'Head of household': 'Jefe(a) de familia',
  'Qualifying widow(er)': 'Viudo(a) calificado(a)',
  'Qualifying surviving spouse': 'Cónyuge sobreviviente calificado(a)',
  'W-2 employment': 'Empleo W-2',
  'Self-employment': 'Trabajo por cuenta propia',
  'Both W-2 and self-employment': 'W-2 y cuenta propia',
  'Other / not sure': 'Otro / no estoy seguro',
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
  'LLC, corporation, partnership — has its own books': 'LLC, corporación, sociedad — tiene sus propios libros',
  'A person / 1040 filer': 'Una persona / declarante del 1040',
  '1099 / Schedule C': '1099 / Schedule C',
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
    case 'account_kind':
      return value === 'individual' ? 'Persona' : 'Negocio'
    case 'filing_status': {
      const en = factSummary('filing_status', value)
      return en ? OPT_ES[en] ?? en : null
    }
    case 'occupation':
      return typeof value === 'string' && value ? value : null
    case 'income_sources': {
      const en = factSummary('income_sources', value)
      return en ? OPT_ES[en] ?? en : null
    }
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
    case 'tax_year':
      return typeof value === 'string' && value ? value : null
    default:
      return value == null ? null : String(value)
  }
}
