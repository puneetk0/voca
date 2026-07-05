// Deterministic branching for decision-tree forms.
//
// A choice (mcq) field may carry logic_rules — per-option routing that decides
// which question comes next. The LLM narrates transitions but NEVER decides
// routing: everything here is pure and runs identically on client and server,
// with the server authoritative.
//
// Rule shape (stored in fields.logic_rules jsonb):
//   [ { "option": "Yes", "goto": null },        // default: next by order
//     { "option": "No",  "goto": "<field-id>" } // jump forward
//     { "option": "N/A", "goto": "end" } ]      // finish the form early
//
// The special option "*" means "whatever the answer, after this field go to".
// It's the only rule kind allowed on non-mcq fields, and it's what lets a
// branch END with a free-text question instead of leaking into the next
// branch's questions (e.g. Yes-path ends on a textarea, No-path lives below).
// On mcq fields "*" acts as the fallback for options without an exact rule.
//
// Targets are forward-only (target index > source index). That invariant is
// enforced at save time; at resolve time a corrupt rule degrades to the
// default next field instead of failing or looping.

export type LogicRule = { option: string; goto: string | 'end' | null }

export const ANY_OPTION = '*'

export type BranchField = {
  id: string
  field_type: string
  options?: string[] | null
  logic_rules?: LogicRule[] | null
}

/** Answers keyed by field id, as kept in the conversation store. */
export type AnswerMap = Record<string, string | undefined>

function ruleFor(field: BranchField, value: string): LogicRule | null {
  if (!Array.isArray(field.logic_rules)) return null
  const rules = field.logic_rules.filter(r => typeof r?.option === 'string')
  if (field.field_type === 'mcq') {
    const v = value.trim().toLowerCase()
    const exact = rules.find(r => r.option.trim().toLowerCase() === v)
    if (exact) return exact
  }
  // "*" = answer-independent routing; the only rule kind for non-mcq fields
  return rules.find(r => r.option === ANY_OPTION) ?? null
}

/**
 * Index of the field that follows `index` once it's answered with `value`.
 * Returns fields.length to mean "form ends here".
 */
export function resolveNext(fields: BranchField[], index: number, value: string): number {
  const field = fields[index]
  if (!field) return Math.min(index + 1, fields.length)

  const rule = ruleFor(field, value)
  if (!rule || rule.goto === null) return index + 1
  if (rule.goto === 'end') return fields.length

  const target = fields.findIndex(f => f.id === rule.goto)
  // Forward-only safety net: dangling or backward targets fall back to linear.
  return target > index ? target : index + 1
}

/**
 * Walk the tree from the top using the answers given so far.
 * - visited: indexes on the taken path, in order (answered + the frontier)
 * - frontier: first on-path field without an answer; fields.length = complete
 */
export function computePath(fields: BranchField[], answers: AnswerMap): { visited: number[]; frontier: number } {
  const visited: number[] = []
  let i = 0
  // The forward-only invariant bounds this loop, but guard anyway.
  while (i < fields.length && visited.length <= fields.length) {
    visited.push(i)
    const value = answers[fields[i].id]
    if (value === undefined || value === null || value === '') {
      return { visited, frontier: i }
    }
    i = resolveNext(fields, i, value)
  }
  return { visited, frontier: fields.length }
}

/**
 * Best-known total question count for "Question X of Y". Walks the whole path,
 * following known answers and assuming linear flow past unanswered branches.
 * The total legitimately shrinks/grows as branch answers come in.
 */
export function projectedTotal(fields: BranchField[], answers: AnswerMap): number {
  let count = 0
  let i = 0
  while (i < fields.length && count <= fields.length) {
    count++
    const value = answers[fields[i].id]
    i = value === undefined || value === null || value === ''
      ? i + 1
      : resolveNext(fields, i, value)
  }
  return count
}

/**
 * Ids of every field on the path implied by the given answers, treating
 * unanswered fields as pass-through (linear next). Used to filter submitted
 * answers server-side: off-path answers (orphaned by a corrected branch
 * choice) are dropped, while answers past a skipped optional field survive.
 */
export function onPathFieldIds(fields: BranchField[], answers: AnswerMap): Set<string> {
  const ids = new Set<string>()
  let i = 0
  while (i < fields.length && ids.size <= fields.length) {
    ids.add(fields[i].id)
    const value = answers[fields[i].id]
    i = value === undefined || value === null || value === ''
      ? i + 1
      : resolveNext(fields, i, value)
  }
  return ids
}

/** True if any field carries at least one routing rule. */
export function hasBranching(fields: BranchField[]): boolean {
  return fields.some(f => Array.isArray(f.logic_rules) && f.logic_rules.some(r => r?.goto != null))
}

/**
 * Validate rules across a whole form (used at save time in the editor and
 * after AI generation). Returns human-readable errors; empty array = valid.
 */
export function validateLogicRules(fields: BranchField[]): string[] {
  const errors: string[] = []
  fields.forEach((field, index) => {
    if (!Array.isArray(field.logic_rules) || field.logic_rules.length === 0) return
    const isMcq = field.field_type === 'mcq'
    if (!isMcq && field.logic_rules.some(r => r?.option !== ANY_OPTION)) {
      errors.push(`"${labelOf(field, index)}" is not a choice question — it can only have an "after this question" rule.`)
    }
    const options = (field.options ?? []).map(o => o.trim().toLowerCase())
    field.logic_rules.forEach(rule => {
      if (typeof rule?.option !== 'string') {
        errors.push(`"${labelOf(field, index)}" has a rule without an option.`)
        return
      }
      if (isMcq && rule.option !== ANY_OPTION && !options.includes(rule.option.trim().toLowerCase())) {
        errors.push(`"${labelOf(field, index)}" has a rule for unknown option "${rule.option}".`)
      }
      if (rule.goto === null || rule.goto === 'end') return
      const target = fields.findIndex(f => f.id === rule.goto)
      if (target === -1) {
        errors.push(`"${labelOf(field, index)}" option "${rule.option}" points to a deleted question.`)
      } else if (target <= index) {
        errors.push(`"${labelOf(field, index)}" option "${rule.option}" must point to a LATER question.`)
      }
    })
  })
  return errors
}

function labelOf(field: BranchField & { label?: string }, index: number): string {
  return (field as any).label ?? `Question ${index + 1}`
}
