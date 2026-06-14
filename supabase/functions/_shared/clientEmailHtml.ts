/** Valide un token portail projet (UUID v4). */
export function isValidProjectToken(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const EMAIL_STYLES = `
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; border-collapse:collapse; }
  img { border:0; height:auto; line-height:100%; outline:none; text-decoration:none; display:block; }
  body { margin:0 !important; padding:0 !important; width:100% !important; background-color:#ECEAE4; }
  @media screen and (max-width:600px) {
    .email-wrapper { width:100% !important; border-radius:0 !important; }
    .hero-td { padding:40px 24px 36px !important; }
    .body-td { padding:36px 24px !important; }
    .footer-td { padding:20px 24px 28px !important; }
    .h1 { font-size:30px !important; letter-spacing:-1px !important; }
    .cta-link { padding:16px 28px !important; font-size:15px !important; border-radius:50px !important; }
    .footer-right { text-align:left !important; padding-top:8px !important; }
  }
`

function emailShell(heroTag: string, heroTitle: string, heroSubtitle: string, bodyContent: string, ctaUrl: string, ctaLabel: string, footerNote: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>${EMAIL_STYLES}</style>
</head>
<body style="margin:0;padding:0;background-color:#ECEAE4;">
<table width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:32px 16px;">
<table class="email-wrapper" width="580" cellpadding="0" cellspacing="0" border="0" style="background:#FDFCF9;border-radius:28px;overflow:hidden;box-shadow:0 24px 64px rgba(13,15,20,0.13),0 2px 8px rgba(13,15,20,0.05);">
<tr>
<td class="hero-td" style="background:#0C0E13;padding:52px 48px 44px;">
<table width="100%">
<tr><td style="padding-bottom:40px;">
<table><tr>
<td style="padding-right:10px;">
<table><tr><td style="width:36px;height:36px;background:linear-gradient(135deg,#5B6EF5 0%,#7B8FFF 100%);border-radius:10px;text-align:center;">
<span style="font-family:'Syne',Arial,sans-serif;font-weight:800;font-size:18px;color:#fff;line-height:36px;">F</span>
</td></tr></table>
</td>
<td><span style="font-family:'Syne',Arial,sans-serif;font-weight:700;font-size:20px;color:#FDFCF9;">Freli</span></td>
</tr></table>
</td></tr>
<tr><td style="padding-bottom:14px;">
<span style="background:rgba(91,110,245,0.15);border:1px solid rgba(91,110,245,0.35);border-radius:100px;padding:5px 14px;font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;color:#8B9BFF;">${heroTag}</span>
</td></tr>
<tr><td style="padding-bottom:14px;">
<h1 class="h1" style="font-family:'Syne',Arial,sans-serif;font-weight:800;font-size:36px;color:#FDFCF9;margin:0;line-height:1.15;">${heroTitle}</h1>
</td></tr>
<tr><td>
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:rgba(253,252,249,0.6);line-height:1.7;margin:0;">${heroSubtitle}</p>
</td></tr>
</table>
</td>
</tr>
<tr>
<td class="body-td" style="padding:48px 48px 40px;">
${bodyContent}
<table width="100%" style="margin-top:40px;"><tr><td align="center">
<a class="cta-link" href="${ctaUrl}" style="display:inline-block;background:#0C0E13;color:#fff;text-decoration:none;padding:17px 44px;border-radius:100px;font-family:'DM Sans',Arial,sans-serif;font-weight:600;font-size:15px;">${ctaLabel}</a>
</td></tr>
<tr><td align="center" style="padding-top:14px;">
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#B0ACA3;margin:0;">${footerNote}</p>
</td></tr></table>
</td>
</tr>
<tr>
<td class="footer-td" style="padding:20px 48px;border-top:1px solid #EDEAE3;">
<table width="100%"><tr>
<td><span style="font-family:'Syne',Arial,sans-serif;font-size:12px;color:#C8C5BC;">© Freli</span></td>
<td align="right" class="footer-right"><p style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;color:#C8C5BC;margin:0;">Si vous n'êtes pas concerné, ignorez cet email.</p></td>
</tr></table>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

const CLIENT_FEATURES_BLOCK = `
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#B0ACA3;margin:0 0 14px;">Ce qui vous attend</p>
<table width="100%" style="background:#F5F4F0;border-radius:20px;border:1px solid #E8E6DF;">
<tr><td style="padding:16px 20px;font-family:'DM Sans',Arial,sans-serif;">
<p style="margin:0;font-weight:600;color:#1C1F2A;">📋 Checklist personnalisée</p>
<p style="margin:4px 0 0;font-size:12px;color:#9DA3B4;">Complétez les étapes préparées pour vous</p>
</td></tr>
<tr><td style="height:1px;background:#EDEAE3;"></td></tr>
<tr><td style="padding:16px 20px;font-family:'DM Sans',Arial,sans-serif;">
<p style="margin:0;font-weight:600;color:#1C1F2A;">📎 Documents &amp; signatures</p>
<p style="margin:4px 0 0;font-size:12px;color:#9DA3B4;">Déposez vos fichiers et signez en ligne</p>
</td></tr>
<tr><td style="height:1px;background:#EDEAE3;"></td></tr>
<tr><td style="padding:16px 20px;font-family:'DM Sans',Arial,sans-serif;">
<p style="margin:0;font-weight:600;color:#1C1F2A;">🤝 Suivi par votre agence</p>
<p style="margin:4px 0 0;font-size:12px;color:#9DA3B4;">Votre prestataire suit votre avancement</p>
</td></tr>
</table>`

/** Email client : invitation ou relance onboarding (flux B / C). */
export function buildClientOnboardingEmail(params: {
  mode: 'invite' | 'reminder'
  clientName: string
  agencyName: string
  portalUrl: string
}): string {
  const name = escapeHtml(params.clientName)
  const agency = escapeHtml(params.agencyName)
  const url = escapeHtml(params.portalUrl)

  if (params.mode === 'reminder') {
    const body = `
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#4A4D5C;line-height:1.85;margin:0 0 36px;">
Bonjour <strong style="color:#1C1F2A;">${name}</strong>,<br><br>
Petit rappel : votre espace d'onboarding avec <strong style="color:#1C1F2A;">${agency}</strong> est toujours en attente. Il ne reste que quelques informations à compléter.
</p>
${CLIENT_FEATURES_BLOCK}`
    return emailShell(
      '✦ Rappel',
      'Finalisez votre<br>onboarding',
      `${agency} vous attend pour terminer votre dossier.`,
      body,
      url,
      '✦ Compléter mon onboarding',
      'Ce lien est personnel — ne le partagez pas',
    )
  }

  const body = `
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#4A4D5C;line-height:1.85;margin:0 0 36px;">
Bonjour <strong style="color:#1C1F2A;">${name}</strong>,<br><br>
<strong style="color:#1C1F2A;">${agency}</strong> vous a préparé un espace d'onboarding. Cliquez ci-dessous pour accéder à votre checklist et compléter les informations demandées.
</p>
${CLIENT_FEATURES_BLOCK}`

  return emailShell(
    '✦ Invitation',
    "Votre espace d'onboarding<br>vous attend",
    `${agency} a configuré votre parcours — accédez-y en un clic.`,
    body,
    url,
    '✦ Accéder à mon espace',
    'Ce lien est personnel — ne le partagez pas',
  )
}

/** Email client : lien de paiement après onboarding. */
export function buildClientPaymentEmail(params: {
  clientName: string
  agencyName: string
  checkoutUrl: string
  amountLabel: string
}): string {
  const name = escapeHtml(params.clientName)
  const agency = escapeHtml(params.agencyName)
  const url = escapeHtml(params.checkoutUrl)
  const amount = escapeHtml(params.amountLabel)

  const body = `
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#4A4D5C;line-height:1.85;margin:0 0 28px;">
Bonjour <strong style="color:#1C1F2A;">${name}</strong>,<br><br>
Votre onboarding avec <strong style="color:#1C1F2A;">${agency}</strong> est terminé. Il ne reste plus qu'à régler le montant de <strong style="color:#1C1F2A;">${amount}</strong> pour finaliser.
</p>
<table width="100%" style="background:#F5F4F0;border-radius:20px;border:1px solid #E8E6DF;">
<tr><td style="padding:18px 20px;font-family:'DM Sans',Arial,sans-serif;text-align:center;">
<p style="margin:0;font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:#B0ACA3;">Montant à régler</p>
<p style="margin:6px 0 0;font-family:'Syne',Arial,sans-serif;font-weight:800;font-size:28px;color:#1C1F2A;">${amount}</p>
</td></tr>
</table>`

  return emailShell(
    '✦ Paiement',
    'Finalisez votre<br>paiement',
    `${agency} vous remercie — dernière étape pour démarrer.`,
    body,
    url,
    '✦ Procéder au paiement',
    'Paiement sécurisé via Stripe',
  )
}

/** Email agence : client a terminé son onboarding. */
export function buildAgencyCompletedEmail(params: {
  clientName: string
  checklistHtml: string
  projectUrl: string
}): string {
  const name = escapeHtml(params.clientName)
  const url = escapeHtml(params.projectUrl)

  const body = `
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#4A4D5C;line-height:1.85;margin:0 0 24px;">
<strong style="color:#1C1F2A;">${name}</strong> a terminé son onboarding. Voici le récapitulatif de la checklist :
</p>
<ul style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#4A4D5C;line-height:1.8;padding-left:20px;margin:0 0 28px;">
${params.checklistHtml}
</ul>`

  return emailShell(
    '✦ Projet terminé',
    'Onboarding<br>complété',
    `${name} a finalisé toutes les étapes.`,
    body,
    url,
    '✦ Voir le projet',
    'Notification automatique Freli',
  )
}

export function buildPasswordResetEmail(params: { resetUrl: string }): string {
  const url = escapeHtml(params.resetUrl)

  const body = `
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:15px;color:#4A4D5C;line-height:1.85;margin:0 0 24px;">
Vous avez demandé à réinitialiser votre mot de passe Freli. Cliquez sur le bouton ci-dessous pour en choisir un nouveau.
</p>
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#8A8D9C;line-height:1.7;margin:0;">
Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
</p>`

  return emailShell(
    '✦ Sécurité',
    'Réinitialiser<br>votre mot de passe',
    'Lien valide pendant une durée limitée.',
    body,
    url,
    '✦ Choisir un nouveau mot de passe',
    'Email automatique Freli — ne pas répondre',
  )
}
