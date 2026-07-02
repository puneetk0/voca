import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export async function sendResponseNotification({
  toEmail,
  formTitle,
  formId,
  fields,
  answers,
}: {
  toEmail: string
  formTitle: string
  formId: string
  fields: { id: string; label: string }[]
  answers: Record<string, string>
}) {
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — skipping notification')
    return
  }

  const answerLines = fields
    .filter(f => answers[f.id])
    .map(f => {
      const v = answers[f.id]
      const isUrl = v.startsWith('http')
      return `${f.label}: ${isUrl ? '[Uploaded file]' : v}`
    })
    .join('\n')

  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://voca.app'}/admin/forms/${formId}`

  // Custom from-addresses need a verified domain in Resend; the resend.dev
  // default works out-of-box for testing.
  const from = process.env.EMAIL_FROM || 'Voca <onboarding@resend.dev>'

  await resend.emails.send({
    from,
    to: [toEmail],
    subject: `New response to "${formTitle}"`,
    text: [
      `Someone just filled out your form "${formTitle}".`,
      '',
      '─── Answers ───',
      answerLines || '(No answers recorded)',
      '',
      `View full response: ${dashboardUrl}`,
      '',
      '— Voca',
    ].join('\n'),
  })
}
