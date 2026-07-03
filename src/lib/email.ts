import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const FROM = () => process.env.EMAIL_FROM || 'Voca <onboarding@resend.dev>'

/**
 * Brand-styled welcome for new waitlist members. Warm cream canvas, serif
 * headline, amber CTA. The CTA links to a Voca-made onboarding form
 * (WAITLIST_FORM_URL) — omitted gracefully when the env isn't set.
 */
export async function sendWaitlistWelcome(toEmail: string) {
  if (!resend) {
    console.warn('[Email] RESEND_API_KEY not set — skipping waitlist welcome')
    return
  }

  const formUrl = process.env.WAITLIST_FORM_URL || null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://voca.app'

  const favorHtml = formUrl
    ? `
      <p style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3a33;">
        One small favor: we put together a tiny set of questions, and answering them is the fastest
        way to shape what Voca becomes. It takes about a minute, and yes, you can just talk.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td style="border-radius:999px;background:#c96a00;">
            <a href="${formUrl}" style="display:inline-block;padding:13px 30px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
              Help shape Voca &rarr;
            </a>
          </td>
        </tr>
      </table>`
    : ''

  const favorText = formUrl
    ? `\nOne small favor: answer a few quick questions (you can just talk):\n${formUrl}\n`
    : ''

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f2ee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ee;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:0 8px 28px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;color:#111111;">Voca</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid rgba(17,17,17,0.07);border-radius:20px;padding:44px 40px;">
              <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:600;color:#111111;">
                Welcome to Voca.
              </h1>
              <p style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3a33;">
                Thank you for joining the waitlist. Voca replaces cold, silent forms with a warm AI
                voice that actually interviews people, in English or Hinglish, and hands you clean,
                structured answers.
              </p>
              <p style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.65;color:#3d3a33;">
                We're letting people in gradually, and you're on the list. You'll hear from us
                personally when your access is ready. A real note, not a newsletter.
              </p>
              ${favorHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:26px 8px 0;">
              <p style="margin:0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a836f;">
                It's not a form. It's a conversation.<br/>
                <a href="${appUrl}" style="color:#c96a00;text-decoration:none;">voca</a> &middot; built in India
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  await resend.emails.send({
    from: FROM(),
    to: [toEmail],
    subject: 'Welcome to Voca — you’re on the list',
    html,
    text: [
      'Welcome to Voca.',
      '',
      'Thank you for joining the waitlist. Voca replaces cold, silent forms with a warm AI voice that interviews people, in English or Hinglish, and hands you clean, structured answers.',
      '',
      "We're letting people in gradually, and you're on the list. You'll hear from us personally when your access is ready.",
      favorText,
      '— Voca',
    ].join('\n'),
  })
}

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
