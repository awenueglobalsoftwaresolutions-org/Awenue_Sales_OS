// AWENUE Global Software Solutions — Transactional Email Templates
// Mobile-responsive, cross-client compatible (Gmail, Outlook, Apple Mail), with full plain-text fallbacks.

export const BRAND = {
  name: 'AWENUE Global Software Solutions',
  shortName: 'AWENUE',
  website: 'https://www.awenueglobalsoftwaresolutions.in',
  logoUrl: 'https://www.awenueglobalsoftwaresolutions.in/brand/awenue-logo.webp',
  supportEmail: 'support@awenueglobalsoftwaresolutions.in',
  billingEmail: 'billing@awenueglobalsoftwaresolutions.in',
  address: 'AWENUE Global Software Solutions, Varanasi, Uttar Pradesh, India',
  primaryColor: '#0f172a',    // Deep slate 900
  accentColor: '#2563eb',     // Brand royal blue
  accentHover: '#1d4ed8',
  lightBg: '#f8fafc',
  borderColor: '#e2e8f0',
  textColor: '#334155',
  headingColor: '#0f172a',
}

/**
 * Escapes unsafe characters to prevent HTML injection in emails.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Formats multi-line text into safe paragraphs/linebreaks.
 */
function formatTextBody(text) {
  if (!text) return ''
  return escapeHtml(text).replace(/\n/g, '<br/>')
}

/**
 * Standard branded HTML shell
 */
function renderEmailShell({ previewText, headline, subheadline, contentHtml, ctaText, ctaUrl, senderType = 'support' }) {
  const isBilling = senderType === 'billing'
  const departmentName = isBilling ? 'Billing Department' : 'Client Support Team'
  const contactEmail = isBilling ? BRAND.billingEmail : BRAND.supportEmail

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(headline)}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .btn-primary { background-color: #2563eb; color: #ffffff !important; display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; text-align: center; }
    .btn-primary:hover { background-color: #1d4ed8; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; border-radius: 0 !important; border: none !important; }
      .content-cell { padding: 24px 20px !important; }
      .meta-cell { display: block !important; width: 100% !important; margin-bottom: 8px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9;">
  <!-- Preview Text Spacing Trick -->
  <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${escapeHtml(previewText)}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
          <!-- Brand Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 28px 36px; border-bottom: 3px solid #2563eb;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <div style="font-size: 20px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase;">
                      AWENUE
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 2px;">
                      Global Software Solutions
                    </div>
                  </td>
                  <td align="right">
                    <span style="display: inline-block; background-color: rgba(37,99,235,0.2); border: 1px solid rgba(59,130,246,0.3); color: #93c5fd; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${escapeHtml(departmentName)}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Greeting -->
          <tr>
            <td class="content-cell" style="padding: 36px 36px 20px 36px;">
              <h1 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                ${escapeHtml(headline)}
              </h1>
              ${subheadline ? `<p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.5;">${escapeHtml(subheadline)}</p>` : ''}
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td class="content-cell" style="padding: 0 36px 32px 36px; font-size: 15px; line-height: 1.6; color: #334155;">
              ${contentHtml}

              <!-- Primary CTA Button -->
              ${ctaText && ctaUrl ? `
                <div style="margin: 32px 0 20px 0; text-align: center;">
                  <a href="${escapeHtml(ctaUrl)}" class="btn-primary" target="_blank" style="background-color: #2563eb; color: #ffffff; display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                    ${escapeHtml(ctaText)} &rarr;
                  </a>
                </div>
                <div style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 8px;">
                  If button doesn't open, copy and paste this link in your browser:
                  <br />
                  <a href="${escapeHtml(ctaUrl)}" style="color: #2563eb; word-break: break-all;">${escapeHtml(ctaUrl)}</a>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 36px;">
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0;" />
            </td>
          </tr>

          <!-- Professional Footer -->
          <tr>
            <td style="padding: 28px 36px; background-color: #f8fafc; text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
              <p style="margin: 0 0 6px 0; font-weight: 600; color: #475569;">
                AWENUE Global Software Solutions
              </p>
              <p style="margin: 0 0 8px 0;">
                Official Web: <a href="${BRAND.website}" target="_blank" style="color: #2563eb; text-decoration: none;">www.awenueglobalsoftwaresolutions.in</a>
                &nbsp;|&nbsp; Direct Email: <a href="mailto:${escapeHtml(contactEmail)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(contactEmail)}</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This is an automated transactional message sent regarding your official AWENUE Sales OS account. Please do not reply with sensitive payment credentials.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Standard details table row helper
 */
function renderMetaTable(rows) {
  const content = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 38%;">${escapeHtml(label)}</td>
        <td style="padding: 10px 14px; font-size: 13px; font-weight: 500; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${value}</td>
      </tr>`
    )
    .join('')

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: separate; border-spacing: 0; background-color: #f8fafc; overflow: hidden;">
      ${content}
    </table>`
}

// ==========================================
// 1. SUPPORT TICKET TEMPLATES
// ==========================================

export function renderTicketCreatedEmail(data) {
  const {
    clientName = 'Client',
    ticketNumber,
    subject,
    description,
    category = 'General Query',
    priority = 'Medium',
    status = 'open',
    createdAt = new Date().toLocaleString(),
    portalUrl,
  } = data

  const subjectLine = `Support Ticket Created — #${ticketNumber}`
  const previewText = `We have received your support request #${ticketNumber}: ${subject}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>Thank you for reaching out to AWENUE Support. We have received your request and an engineer from our support team has been notified.</p>

    ${renderMetaTable([
      ['Ticket Number', `#${escapeHtml(ticketNumber)}`],
      ['Subject', escapeHtml(subject)],
      ['Category', escapeHtml(category.replace(/_/g, ' '))],
      ['Priority', `<span style="text-transform: capitalize; font-weight: 600; color: ${priority === 'urgent' || priority === 'high' ? '#dc2626' : '#2563eb'};">${escapeHtml(priority)}</span>`],
      ['Current Status', `<span style="background-color: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: capitalize;">${escapeHtml(status.replace(/_/g, ' '))}</span>`],
      ['Submitted At', escapeHtml(createdAt)],
    ])}

    <div style="margin: 20px 0; padding: 16px; background-color: #ffffff; border-left: 4px solid #2563eb; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-radius: 0 8px 8px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px;">Initial Description</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">${formatTextBody(description)}</div>
    </div>

    <p style="margin-top: 24px;">You can track updates, view agent replies, or upload supporting files directly through the AWENUE Client Support Portal.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: `Ticket Confirmation #${ticketNumber}`,
    subheadline: 'Your support ticket has been registered in AWENUE Sales OS.',
    contentHtml,
    ctaText: 'View Ticket Progress',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    senderType: 'support',
  })

  const text = `Dear ${clientName},

Thank you for reaching out to AWENUE Support. We have received your request and an engineer from our support team has been notified.

TICKET DETAILS:
- Ticket Number: #${ticketNumber}
- Subject: ${subject}
- Category: ${category}
- Priority: ${priority}
- Status: ${status}
- Submitted: ${createdAt}

DESCRIPTION:
${description}

You can track updates, view agent replies, or upload supporting files directly through the AWENUE Client Support Portal:
${portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`}

Regards,
AWENUE Support Team
support@awenueglobalsoftwaresolutions.in
https://www.awenueglobalsoftwaresolutions.in/`

  return { subject: subjectLine, html, text }
}

export function renderTicketReplyEmail(data) {
  const {
    recipientName = 'Customer',
    ticketNumber,
    ticketSubject,
    agentName = 'Support Specialist',
    replyContent,
    status = 'in_progress',
    portalUrl,
  } = data

  const subjectLine = `New Reply on Ticket #${ticketNumber}: ${ticketSubject}`
  const previewText = `${agentName} replied to your support ticket #${ticketNumber}`

  const contentHtml = `
    <p>Dear ${escapeHtml(recipientName)},</p>
    <p>A new message has been posted regarding your ticket <strong>#${escapeHtml(ticketNumber)}</strong> (<em>${escapeHtml(ticketSubject)}</em>) by <strong>${escapeHtml(agentName)}</strong>:</p>

    <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border-left: 4px solid #2563eb; border-radius: 4px 8px 8px 4px; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
      <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 8px;">Message from ${escapeHtml(agentName)}:</div>
      <div style="font-size: 14px; line-height: 1.6; color: #1e293b;">${formatTextBody(replyContent)}</div>
    </div>

    ${renderMetaTable([
      ['Ticket Number', `#${escapeHtml(ticketNumber)}`],
      ['Current Status', `<span style="font-weight: 600; text-transform: capitalize;">${escapeHtml(status.replace(/_/g, ' '))}</span>`],
    ])}

    <p>To respond or provide additional information, please visit the support portal link below.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: `New Message on Ticket #${ticketNumber}`,
    subheadline: `${agentName} added a reply to your request.`,
    contentHtml,
    ctaText: 'Reply on Support Portal',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    senderType: 'support',
  })

  const text = `Dear ${recipientName},

A new message has been posted regarding your ticket #${ticketNumber} (${ticketSubject}) by ${agentName}:

MESSAGE:
${replyContent}

Current Status: ${status}

Please visit the support portal to reply or review the conversation history:
${portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`}

Regards,
AWENUE Support Team
support@awenueglobalsoftwaresolutions.in`

  return { subject: subjectLine, html, text }
}

export function renderTicketStatusEmail(data) {
  const {
    clientName = 'Client',
    ticketNumber,
    ticketSubject,
    oldStatus,
    newStatus,
    note,
    portalUrl,
  } = data

  const subjectLine = `Ticket Status Updated — #${ticketNumber} is now ${newStatus.replace(/_/g, ' ').toUpperCase()}`
  const previewText = `Ticket #${ticketNumber} status changed from ${oldStatus} to ${newStatus}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>The status of your support ticket <strong>#${escapeHtml(ticketNumber)}</strong> has been updated.</p>

    ${renderMetaTable([
      ['Ticket Number', `#${escapeHtml(ticketNumber)}`],
      ['Subject', escapeHtml(ticketSubject)],
      ['Previous Status', escapeHtml(oldStatus?.replace(/_/g, ' ') || '—')],
      ['New Status', `<span style="font-weight: 700; color: #2563eb; text-transform: capitalize;">${escapeHtml(newStatus.replace(/_/g, ' '))}</span>`],
    ])}

    ${note ? `
      <div style="margin: 16px 0; padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
        <strong>Note from Support Team:</strong><br />
        ${formatTextBody(note)}
      </div>
    ` : ''}

    <p>You can check the full ticket history and updates at any time via the link below.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: `Ticket #${ticketNumber} Status Update`,
    subheadline: `Status changed to ${newStatus.replace(/_/g, ' ')}.`,
    contentHtml,
    ctaText: 'View Ticket',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    senderType: 'support',
  })

  const text = `Dear ${clientName},

The status of your support ticket #${ticketNumber} (${ticketSubject}) has been updated.

Previous Status: ${oldStatus || '—'}
New Status: ${newStatus}
${note ? `Note: ${note}\n` : ''}
View ticket progress:
${portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`}

Regards,
AWENUE Support Team
support@awenueglobalsoftwaresolutions.in`

  return { subject: subjectLine, html, text }
}

export function renderTicketResolvedEmail(data) {
  const {
    clientName = 'Client',
    ticketNumber,
    ticketSubject,
    resolution,
    resolvedBy = 'AWENUE Support',
    portalUrl,
  } = data

  const subjectLine = `Ticket Resolved — #${ticketNumber}: ${ticketSubject}`
  const previewText = `Your support ticket #${ticketNumber} has been resolved.`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>We are pleased to inform you that your support ticket <strong>#${escapeHtml(ticketNumber)}</strong> has been resolved by <strong>${escapeHtml(resolvedBy)}</strong>.</p>

    <div style="margin: 20px 0; padding: 18px; background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px 8px 8px 4px; border-top: 1px solid #bbf7d0; border-right: 1px solid #bbf7d0; border-bottom: 1px solid #bbf7d0;">
      <div style="font-size: 12px; font-weight: 700; color: #166534; text-transform: uppercase; margin-bottom: 6px;">Resolution Summary</div>
      <div style="font-size: 14px; line-height: 1.6; color: #14532d;">${formatTextBody(resolution || 'The requested issue has been investigated and resolved.')}</div>
    </div>

    <p>If you feel this issue is not fully addressed or requires further attention, you can easily reopen the ticket by visiting the support portal link below.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: `Ticket #${ticketNumber} Resolved`,
    subheadline: 'Our support team has completed work on your ticket.',
    contentHtml,
    ctaText: 'Confirm or Review Ticket',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    senderType: 'support',
  })

  const text = `Dear ${clientName},

We are pleased to inform you that your support ticket #${ticketNumber} (${ticketSubject}) has been resolved by ${resolvedBy}.

RESOLUTION:
${resolution || 'The requested issue has been investigated and resolved.'}

If you feel this issue is not fully addressed, you may reopen the ticket on the support portal:
${portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`}

Regards,
AWENUE Support Team
support@awenueglobalsoftwaresolutions.in`

  return { subject: subjectLine, html, text }
}

// ==========================================
// 2. BILLING & INVOICE TEMPLATES
// ==========================================

export function renderInvoiceGeneratedEmail(data) {
  const {
    clientName = 'Client',
    invoiceNumber,
    invoiceDate = new Date().toISOString().slice(0, 10),
    dueDate,
    amount,
    currency = 'INR',
    taxTotal = 0,
    paymentStatus = 'unpaid',
    paymentInstructions,
    invoiceUrl,
    pdfDownloadUrl,
  } = data

  const subjectLine = `Invoice #${invoiceNumber} — AWENUE Global Software Solutions`
  const previewText = `New invoice #${invoiceNumber} from AWENUE Global Software Solutions for ${currency} ${amount}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>Please find attached your invoice <strong>#${escapeHtml(invoiceNumber)}</strong> issued by AWENUE Global Software Solutions.</p>

    ${renderMetaTable([
      ['Invoice Number', `<strong>#${escapeHtml(invoiceNumber)}</strong>`],
      ['Issue Date', escapeHtml(invoiceDate)],
      ['Due Date', `<span style="font-weight: 700; color: #dc2626;">${escapeHtml(dueDate || 'Due upon receipt')}</span>`],
      ['Total Amount', `<span style="font-size: 16px; font-weight: 700; color: #0f172a;">${escapeHtml(currency)} ${Number(amount).toLocaleString()}</span>`],
      ...(taxTotal ? [['Tax Amount', `${escapeHtml(currency)} ${Number(taxTotal).toLocaleString()}`]] : []),
      ['Payment Status', `<span style="background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: capitalize;">${escapeHtml(paymentStatus)}</span>`],
    ])}

    ${paymentInstructions ? `
      <div style="margin: 20px 0; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 6px;">Payment Instructions</div>
        <div style="font-size: 13px; line-height: 1.6; color: #334155;">${formatTextBody(paymentInstructions)}</div>
      </div>
    ` : ''}

    <p>The official invoice PDF has also been generated and attached directly to this email for your convenience.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: `Invoice #${invoiceNumber}`,
    subheadline: `Amount due: ${currency} ${Number(amount).toLocaleString()}`,
    contentHtml,
    ctaText: 'View & Pay Invoice Online',
    ctaUrl: invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    senderType: 'billing',
  })

  const text = `Dear ${clientName},

Please find attached your invoice #${invoiceNumber} issued by AWENUE Global Software Solutions.

INVOICE DETAILS:
- Invoice Number: #${invoiceNumber}
- Issue Date: ${invoiceDate}
- Due Date: ${dueDate || 'Due upon receipt'}
- Total Amount: ${currency} ${Number(amount).toLocaleString()}
${taxTotal ? `- Tax: ${currency} ${Number(taxTotal).toLocaleString()}\n` : ''}- Status: ${paymentStatus}

${paymentInstructions ? `PAYMENT INSTRUCTIONS:\n${paymentInstructions}\n\n` : ''}View or pay online:
${invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`}

PDF invoice is attached with this email.

Regards,
AWENUE Billing Department
billing@awenueglobalsoftwaresolutions.in
https://www.awenueglobalsoftwaresolutions.in/`

  return { subject: subjectLine, html, text }
}

export function renderPaymentConfirmationEmail(data) {
  const {
    clientName = 'Client',
    invoiceNumber,
    paymentRef = 'N/A',
    amountPaid,
    paymentDate = new Date().toISOString().slice(0, 10),
    paymentMethod = 'Bank Transfer',
    remainingBalance = 0,
    currency = 'INR',
    receiptUrl,
  } = data

  const subjectLine = `Payment Received — Invoice #${invoiceNumber}`
  const previewText = `Payment of ${currency} ${amountPaid} confirmed for invoice #${invoiceNumber}`

  const isFullyPaid = Number(remainingBalance) <= 0

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>We gratefully acknowledge receipt of your payment for invoice <strong>#${escapeHtml(invoiceNumber)}</strong>. Your payment has been verified and applied to your account.</p>

    <div style="margin: 20px 0; padding: 18px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; text-align: center;">
      <div style="font-size: 13px; font-weight: 600; color: #166534; text-transform: uppercase;">Amount Paid</div>
      <div style="font-size: 26px; font-weight: 800; color: #15803d; margin: 4px 0;">${escapeHtml(currency)} ${Number(amountPaid).toLocaleString()}</div>
      <div style="font-size: 12px; color: #166534;">Transaction Ref: ${escapeHtml(paymentRef)}</div>
    </div>

    ${renderMetaTable([
      ['Invoice Number', `#${escapeHtml(invoiceNumber)}`],
      ['Payment Date', escapeHtml(paymentDate)],
      ['Payment Method', escapeHtml(paymentMethod.replace(/_/g, ' '))],
      ['Remaining Balance', `<strong style="color: ${isFullyPaid ? '#15803d' : '#d97706'};">${escapeHtml(currency)} ${Number(remainingBalance).toLocaleString()}</strong>`],
      ['Account Status', isFullyPaid ? '<span style="color: #15803d; font-weight: 700;">Paid in Full</span>' : '<span style="color: #d97706; font-weight: 600;">Partially Paid</span>'],
    ])}

    <p>Thank you for partnering with AWENUE Global Software Solutions.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: 'Payment Confirmation',
    subheadline: `Payment of ${currency} ${Number(amountPaid).toLocaleString()} recorded.`,
    contentHtml,
    ctaText: 'View Receipt & Invoice',
    ctaUrl: receiptUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    senderType: 'billing',
  })

  const text = `Dear ${clientName},

We gratefully acknowledge receipt of your payment for invoice #${invoiceNumber}.

PAYMENT DETAILS:
- Amount Paid: ${currency} ${Number(amountPaid).toLocaleString()}
- Transaction Reference: ${paymentRef}
- Payment Date: ${paymentDate}
- Method: ${paymentMethod}
- Remaining Balance: ${currency} ${Number(remainingBalance).toLocaleString()}
- Status: ${isFullyPaid ? 'Paid in Full' : 'Partially Paid'}

View updated invoice:
${receiptUrl || `${BRAND.website}/invoices/${invoiceNumber}`}

Thank you for your business!

AWENUE Billing Department
billing@awenueglobalsoftwaresolutions.in`

  return { subject: subjectLine, html, text }
}

export function renderInvoiceReminderEmail(data) {
  const {
    clientName = 'Client',
    invoiceNumber,
    dueDate,
    balance,
    currency = 'INR',
    daysLabel = 'upcoming',
    paymentInstructions,
    invoiceUrl,
  } = data

  const isToday = daysLabel === 'due_today'
  const subjectLine = isToday
    ? `Urgent: Invoice #${invoiceNumber} is Due Today`
    : `Reminder: Invoice #${invoiceNumber} is Due Soon (${dueDate})`

  const previewText = `Reminder: Payment for invoice #${invoiceNumber} (${currency} ${balance}) is ${isToday ? 'due today' : `due on ${dueDate}`}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>This is a friendly reminder regarding invoice <strong>#${escapeHtml(invoiceNumber)}</strong>, which is scheduled for payment on <strong>${escapeHtml(dueDate)}</strong>.</p>

    ${renderMetaTable([
      ['Invoice Number', `#${escapeHtml(invoiceNumber)}`],
      ['Due Date', `<strong style="color: ${isToday ? '#dc2626' : '#0f172a'};">${escapeHtml(dueDate)}</strong>`],
      ['Outstanding Balance', `<span style="font-size: 16px; font-weight: 700; color: #dc2626;">${escapeHtml(currency)} ${Number(balance).toLocaleString()}</span>`],
    ])}

    ${paymentInstructions ? `
      <div style="margin: 16px 0; padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
        <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px;">Payment Instructions</div>
        <div style="font-size: 13px; line-height: 1.6; color: #334155;">${formatTextBody(paymentInstructions)}</div>
      </div>
    ` : ''}

    <p>If payment has already been sent, please disregard this notice.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: isToday ? `Invoice #${invoiceNumber} Due Today` : `Upcoming Payment Reminder`,
    subheadline: `Balance due: ${currency} ${Number(balance).toLocaleString()}`,
    contentHtml,
    ctaText: 'Review and Pay Invoice',
    ctaUrl: invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    senderType: 'billing',
  })

  const text = `Dear ${clientName},

This is a reminder regarding invoice #${invoiceNumber}, which is due on ${dueDate}.

Balance Due: ${currency} ${Number(balance).toLocaleString()}

Please review and make payment via:
${invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`}

If you have already made this payment, please disregard this reminder.

AWENUE Billing Department
billing@awenueglobalsoftwaresolutions.in`

  return { subject: subjectLine, html, text }
}

export function renderPaymentOverdueEmail(data) {
  const {
    clientName = 'Client',
    invoiceNumber,
    dueDate,
    balance,
    daysOverdue = 1,
    currency = 'INR',
    paymentInstructions,
    invoiceUrl,
  } = data

  const subjectLine = `OVERDUE NOTICE: Invoice #${invoiceNumber} (${daysOverdue} days past due)`
  const previewText = `Action required: Invoice #${invoiceNumber} is ${daysOverdue} days overdue. Total balance: ${currency} ${balance}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p style="color: #b91c1c; font-weight: 600;">Our records indicate that we have not yet received payment for invoice #${escapeHtml(invoiceNumber)}, which fell due on ${escapeHtml(dueDate)}.</p>

    <div style="margin: 20px 0; padding: 18px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
      <div style="font-size: 13px; font-weight: 700; color: #991b1b; text-transform: uppercase;">Overdue Balance</div>
      <div style="font-size: 26px; font-weight: 800; color: #dc2626; margin: 4px 0;">${escapeHtml(currency)} ${Number(balance).toLocaleString()}</div>
      <div style="font-size: 13px; color: #7f1d1d;">Currently ${escapeHtml(daysOverdue)} day(s) past due date (${escapeHtml(dueDate)})</div>
    </div>

    ${paymentInstructions ? `
      <div style="margin: 16px 0; padding: 14px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
        <div style="font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px;">Payment Remittance Details</div>
        <div style="font-size: 13px; line-height: 1.6; color: #334155;">${formatTextBody(paymentInstructions)}</div>
      </div>
    ` : ''}

    <p>Please remit payment promptly or contact our billing team if you require assistance or have already initiated the transfer.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: `Overdue Notice: Invoice #${invoiceNumber}`,
    subheadline: `Payment was due on ${dueDate}.`,
    contentHtml,
    ctaText: 'Pay Outstanding Balance Now',
    ctaUrl: invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    senderType: 'billing',
  })

  const text = `Dear ${clientName},

OVERDUE NOTICE:
Our records indicate that payment for invoice #${invoiceNumber} has not been received.
Due Date: ${dueDate} (${daysOverdue} days past due)
Outstanding Balance: ${currency} ${Number(balance).toLocaleString()}

Please arrange immediate payment via:
${invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`}

AWENUE Billing Department
billing@awenueglobalsoftwaresolutions.in`

  return { subject: subjectLine, html, text }
}

export function renderInvoiceCancelledEmail(data) {
  const {
    clientName = 'Client',
    invoiceNumber,
    reason,
    cancelledDate = new Date().toISOString().slice(0, 10),
  } = data

  const subjectLine = `Invoice #${invoiceNumber} Has Been Cancelled`
  const previewText = `Notice: Invoice #${invoiceNumber} has been officially cancelled.`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>This message confirms that invoice <strong>#${escapeHtml(invoiceNumber)}</strong> has been officially cancelled in our system on ${escapeHtml(cancelledDate)}.</p>

    ${renderMetaTable([
      ['Invoice Number', `#${escapeHtml(invoiceNumber)}`],
      ['Cancellation Date', escapeHtml(cancelledDate)],
      ['Reason', escapeHtml(reason || 'Administrative adjustment')],
      ['Status', '<strong style="color: #64748b;">Cancelled (Void)</strong>'],
    ])}

    <p>No payment is required for this cancelled invoice. If a replacement invoice is issued, you will receive a separate notification.</p>
  `

  const html = renderEmailShell({
    previewText,
    headline: `Invoice #${invoiceNumber} Cancelled`,
    subheadline: 'This invoice has been voided.',
    contentHtml,
    senderType: 'billing',
  })

  const text = `Dear ${clientName},

Notice: Invoice #${invoiceNumber} has been officially cancelled on ${cancelledDate}.

Reason: ${reason || 'Administrative adjustment'}
Status: Cancelled (Void)

No payment is required for this invoice.

AWENUE Billing Department
billing@awenueglobalsoftwaresolutions.in`

  return { subject: subjectLine, html, text }
}
