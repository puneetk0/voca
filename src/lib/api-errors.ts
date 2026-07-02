// Shared error taxonomy for the responder API routes (converse / transcribe / tts / create-form).
// Client-safe: no server imports. Routes attach `code` alongside `error` in their JSON
// responses; the client maps codes to distinct UI treatments instead of one generic toast.

export type ApiErrorCode =
  | 'no_keys'        // form owner hasn't configured AI keys (fatal, creator must act)
  | 'no_fields'      // form has zero questions (fatal, creator must act)
  | 'form_closed'    // form is paused / inactive (fatal for respondent)
  | 'not_found'      // form doesn't exist (fatal)
  | 'rate_limited'   // slow down and retry shortly
  | 'upstream_down'  // LLM / STT / TTS provider failed (transient, retryable)
  | 'bad_request'    // malformed input (shouldn't happen in normal flow)

export type UiErrorTreatment = {
  title: string
  description: string
  /** true → user can retry (tap the orb / wait); false → retrying is pointless */
  retryable: boolean
  /** true → conversation cannot continue; render the full-screen blocked state */
  fatal: boolean
}

export function mapErrorToUi(code: ApiErrorCode | 'timeout' | undefined): UiErrorTreatment {
  switch (code) {
    case 'no_keys':
      return {
        title: "This form isn't ready yet",
        description: 'The form creator needs to finish setting up its AI before it can take responses.',
        retryable: false,
        fatal: true,
      }
    case 'no_fields':
      return {
        title: 'This form has no questions',
        description: 'The form creator needs to add at least one question.',
        retryable: false,
        fatal: true,
      }
    case 'form_closed':
      return {
        title: 'This form is closed',
        description: "It's not accepting new responses right now.",
        retryable: false,
        fatal: true,
      }
    case 'not_found':
      return {
        title: 'Form not found',
        description: 'This link may be broken or the form was deleted.',
        retryable: false,
        fatal: true,
      }
    case 'rate_limited':
      return {
        title: 'Going a bit fast',
        description: 'Give it a few seconds, then continue.',
        retryable: true,
        fatal: false,
      }
    case 'timeout':
      return {
        title: 'That took too long',
        description: 'The AI is slow right now. Tap the orb to retry, or type your answer below.',
        retryable: true,
        fatal: false,
      }
    case 'upstream_down':
    default:
      return {
        title: 'Hit a snag',
        description: 'A quick hiccup on our side. Tap the orb to retry, or type your answer below.',
        retryable: true,
        fatal: false,
      }
  }
}
