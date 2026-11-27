// AWENUE Global Software Solutions — Transactional Email Templates
// Dedicated professional email designs for Support Desk vs Billing & Accounts.
// Mobile-responsive, cross-client compatible (Gmail, Outlook 365, Apple Mail), with full plain-text fallbacks.

export const BRAND = {
  name: 'AWENUE Global Software Solutions',
  shortName: 'AWENUE',
  website: 'https://www.awenueglobalsoftwaresolutions.in',
  appUrl: 'https://awenuesalesos.vercel.app',
  logoUrl: 'https://awenuesalesos.vercel.app/brand/apple-touch-icon.png',
  invoiceLogoUrl: 'https://awenuesalesos.vercel.app/brand/awenue-invoice-logo.jpg',
  supportEmail: 'support@awenueglobalsoftwaresolutions.in',
  billingEmail: 'billing@awenueglobalsoftwaresolutions.in',
  address: 'AWENUE Global Software Solutions, Varanasi, Uttar Pradesh, India',
  supportColor: '#2563eb',    // Royal Blue for Support
  billingColor: '#059669',    // Financial Emerald for Billing
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
 * Status and Priority Badge Color Helpers
 */
function getStatusBadge(status) {
  const s = String(status || '').toLowerCase().replace(/_/g, ' ')
  if (s.includes('resolved') || s.includes('paid')) {
    return `<span style="display: inline-block; background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">● ${escapeHtml(s)}</span>`
  }
  if (s.includes('progress') || s.includes('assigned')) {
    return `<span style="display: inline-block; background-color: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">● ${escapeHtml(s)}</span>`
  }
  if (s.includes('overdue') || s.includes('urgent') || s.includes('escalated')) {
    return `<span style="display: inline-block; background-color: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">● ${escapeHtml(s)}</span>`
  }
  if (s.includes('unpaid') || s.includes('open') || s.includes('pending')) {
    return `<span style="display: inline-block; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">● ${escapeHtml(s)}</span>`
  }
  return `<span style="display: inline-block; background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(s)}</span>`
}

function getPriorityBadge(priority) {
  const p = String(priority || '').toLowerCase()
  if (p === 'urgent' || p === 'high') {
    return `<span style="display: inline-block; background-color: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;">${escapeHtml(p)}</span>`
  }
  if (p === 'medium') {
    return `<span style="display: inline-block; background-color: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Medium</span>`
  }
  return `<span style="display: inline-block; background-color: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase;">${escapeHtml(p || 'Normal')}</span>`
}

/**
 * Standard details table row helper
 */
function renderMetaTable(rows) {
  const content = rows
    .map(
      ([label, value], idx) => `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
        <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #64748b; border-bottom: 1px solid #e2e8f0; width: 36%; vertical-align: middle;">${escapeHtml(label)}</td>
        <td style="padding: 12px 16px; font-size: 13px; font-weight: 500; color: #0f172a; border-bottom: 1px solid #e2e8f0; vertical-align: middle;">${value}</td>
      </tr>`
    )
    .join('')

  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 8px; border-collapse: separate; border-spacing: 0; background-color: #ffffff; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
      ${content}
    </table>`
}

// ============================================================================
// DEDICATED SUPPORT EMAIL SHELL (CLIENT SUPPORT DESK)
// ============================================================================

function renderSupportEmailShell({ previewText, headline, subheadline, contentHtml, ctaText, ctaUrl, ticketNumber }) {
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
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06); }
    .btn-support { background-color: #2563eb; color: #ffffff !important; display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25); }
    .btn-support:hover { background-color: #1d4ed8; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; border-radius: 0 !important; border: none !important; }
      .content-cell { padding: 24px 20px !important; }
      .header-cell { padding: 20px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9;">
  <!-- Hidden preview text for email client inbox list -->
  <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${escapeHtml(previewText)}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
          
          <!-- Top Accent Bar: Support Royal Blue -->
          <tr>
            <td style="background-color: #2563eb; height: 5px; line-height: 5px; font-size: 1px;">&nbsp;</td>
          </tr>

          <!-- Support Brand Header -->
          <tr>
            <td class="header-cell" style="background-color: #0b1329; padding: 24px 32px; border-bottom: 1px solid #1e293b;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align: middle;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px;">
                          <!-- Official Brand Logo -->
                          <img src="${BRAND.logoUrl}" width="42" height="42" alt="AWENUE" style="display: block; width: 42px; height: 42px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-size: 19px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            AWENUE
                          </div>
                          <div style="font-size: 10px; color: #94a3b8; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 2px;">
                            Global Software Solutions
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(37, 99, 235, 0.25); border: 1px solid rgba(96, 165, 250, 0.4); color: #bfdbfe; font-size: 11px; font-weight: 700; padding: 5px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.75px;">
                      🎧 Support Desk
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Support Sub-banner -->
          <tr>
            <td style="background-color: #1e293b; padding: 8px 32px; font-size: 11px; color: #cbd5e1; letter-spacing: 0.5px; border-bottom: 1px solid #334155;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span>Support Ticket Tracking &amp; Resolution System</span>
                  </td>
                  ${ticketNumber ? `
                    <td align="right" style="font-weight: 700; color: #60a5fa;">
                      #${escapeHtml(ticketNumber)}
                    </td>
                  ` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Greeting -->
          <tr>
            <td class="content-cell" style="padding: 32px 32px 16px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 21px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                ${escapeHtml(headline)}
              </h1>
              ${subheadline ? `<p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">${escapeHtml(subheadline)}</p>` : ''}
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td class="content-cell" style="padding: 0 32px 32px 32px; font-size: 15px; line-height: 1.6; color: #334155;">
              ${contentHtml}

              <!-- Primary Support CTA Button -->
              ${ctaText && ctaUrl ? `
                <div style="margin: 32px 0 20px 0; text-align: center;">
                  <a href="${escapeHtml(ctaUrl)}" class="btn-support" target="_blank" style="background-color: #2563eb; color: #ffffff; display: inline-block; padding: 14px 34px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);">
                    ${escapeHtml(ctaText)} &rarr;
                  </a>
                </div>
                <div style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 8px;">
                  If the button does not open, visit:
                  <br />
                  <a href="${escapeHtml(ctaUrl)}" style="color: #2563eb; word-break: break-all;">${escapeHtml(ctaUrl)}</a>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0;" />
            </td>
          </tr>

          <!-- Dedicated Support Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; font-size: 12px; color: #64748b; line-height: 1.6;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align: top; padding-bottom: 12px;">
                    <strong style="color: #0f172a; font-size: 13px;">AWENUE Client Support Team</strong><br />
                    <span>24/7 Monitored Support &bull; Standard SLA: &lt; 2 hrs for high-priority items</span><br />
                    <span>Help Center: <a href="${BRAND.website}" target="_blank" style="color: #2563eb; text-decoration: none;">www.awenueglobalsoftwaresolutions.in</a></span> &bull; 
                    <span>Direct: <a href="mailto:${BRAND.supportEmail}" style="color: #2563eb; text-decoration: none;">${BRAND.supportEmail}</a></span>
                  </td>
                </tr>
                <tr>
                  <td style="border-top: 1px dashed #cbd5e1; padding-top: 12px; font-size: 11px; color: #94a3b8;">
                    This is an official transactional message sent from AWENUE Support regarding ticket activities. You may reply directly to this email to add notes to your ticket.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ============================================================================
// DEDICATED BILLING & INVOICE EMAIL SHELL (BILLING & ACCOUNTS)
// ============================================================================

function renderBillingEmailShell({ previewText, headline, subheadline, contentHtml, ctaText, ctaUrl, invoiceNumber }) {
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
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06); }
    .btn-billing { background-color: #059669; color: #ffffff !important; display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.25); }
    .btn-billing:hover { background-color: #047857; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; border-radius: 0 !important; border: none !important; }
      .content-cell { padding: 24px 20px !important; }
      .header-cell { padding: 20px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9;">
  <!-- Hidden preview text for email client inbox list -->
  <div style="display: none; font-size: 1px; color: #f1f5f9; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${escapeHtml(previewText)}
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding: 12px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
          
          <!-- Top Accent Bar: Financial Emerald -->
          <tr>
            <td style="background-color: #059669; height: 5px; line-height: 5px; font-size: 1px;">&nbsp;</td>
          </tr>

          <!-- Billing Brand Header -->
          <tr>
            <td class="header-cell" style="background-color: #090d16; padding: 24px 32px; border-bottom: 1px solid #1e293b;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align: middle;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px;">
                          <!-- Official Brand Logo -->
                          <img src="${BRAND.logoUrl}" width="42" height="42" alt="AWENUE" style="display: block; width: 42px; height: 42px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);" />
                        </td>
                        <td style="vertical-align: middle;">
                          <div style="font-size: 19px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff; text-transform: uppercase; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                            AWENUE
                          </div>
                          <div style="font-size: 10px; color: #10b981; letter-spacing: 1.2px; text-transform: uppercase; margin-top: 2px; font-weight: 600;">
                            Billing &amp; Finance Department
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(16, 185, 129, 0.2); border: 1px solid rgba(52, 211, 153, 0.4); color: #a7f3d0; font-size: 11px; font-weight: 700; padding: 5px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.75px;">
                      💼 Accounts &amp; Billing
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Billing Sub-banner -->
          <tr>
            <td style="background-color: #111827; padding: 8px 32px; font-size: 11px; color: #9ca3af; letter-spacing: 0.5px; border-bottom: 1px solid #1f2937;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span>Official Electronic Tax Invoice &amp; Remittance Notice</span>
                  </td>
                  ${invoiceNumber ? `
                    <td align="right" style="font-weight: 700; color: #34d399;">
                      #${escapeHtml(invoiceNumber)}
                    </td>
                  ` : ''}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Greeting -->
          <tr>
            <td class="content-cell" style="padding: 32px 32px 16px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 21px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                ${escapeHtml(headline)}
              </h1>
              ${subheadline ? `<p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">${escapeHtml(subheadline)}</p>` : ''}
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td class="content-cell" style="padding: 0 32px 32px 32px; font-size: 15px; line-height: 1.6; color: #334155;">
              ${contentHtml}

              <!-- Primary Billing CTA Button -->
              ${ctaText && ctaUrl ? `
                <div style="margin: 32px 0 20px 0; text-align: center;">
                  <a href="${escapeHtml(ctaUrl)}" class="btn-billing" target="_blank" style="background-color: #059669; color: #ffffff; display: inline-block; padding: 14px 34px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.25);">
                    ${escapeHtml(ctaText)} &rarr;
                  </a>
                </div>
                <div style="font-size: 12px; color: #94a3b8; text-align: center; margin-bottom: 8px;">
                  If the button does not open, visit:
                  <br />
                  <a href="${escapeHtml(ctaUrl)}" style="color: #059669; word-break: break-all;">${escapeHtml(ctaUrl)}</a>
                </div>
              ` : ''}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 0;" />
            </td>
          </tr>

          <!-- Dedicated Billing Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; font-size: 12px; color: #64748b; line-height: 1.6;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="vertical-align: top; padding-bottom: 12px;">
                    <strong style="color: #0f172a; font-size: 13px;">AWENUE Billing &amp; Finance Department</strong><br />
                    <span>Official Tax Invoice &amp; Financial Communication &bull; Registered for GST &amp; Software Services</span><br />
                    <span>Website: <a href="${BRAND.website}" target="_blank" style="color: #059669; text-decoration: none;">www.awenueglobalsoftwaresolutions.in</a></span> &bull; 
                    <span>Direct: <a href="mailto:${BRAND.billingEmail}" style="color: #059669; text-decoration: none;">${BRAND.billingEmail}</a></span>
                  </td>
                </tr>
                <tr>
                  <td style="border-top: 1px dashed #cbd5e1; padding-top: 12px; font-size: 11px; color: #94a3b8;">
                    This is an official computer-generated financial communication. For wire transfers, please verify banking credentials through your authenticated client portal.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// Backward compatibility helper
function renderEmailShell(opts) {
  if (opts.senderType === 'billing') {
    return renderBillingEmailShell(opts)
  }
  return renderSupportEmailShell(opts)
}

// ============================================================================
// 1. SUPPORT TICKET TEMPLATES
// ============================================================================

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
    <p>Thank you for reaching out to the AWENUE Client Support Team. Your request has been logged in our priority queue and assigned ticket <strong>#${escapeHtml(ticketNumber)}</strong>.</p>

    ${renderMetaTable([
      ['Ticket Number', `<strong>#${escapeHtml(ticketNumber)}</strong>`],
      ['Subject', escapeHtml(subject)],
      ['Category', escapeHtml(category.replace(/_/g, ' '))],
      ['Priority', getPriorityBadge(priority)],
      ['Current Status', getStatusBadge(status)],
      ['Submitted At', escapeHtml(createdAt)],
    ])}

    <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border-left: 4px solid #2563eb; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-radius: 0 8px 8px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Initial Issue Description</div>
      <div style="font-size: 14px; color: #334155; line-height: 1.6;">${formatTextBody(description)}</div>
    </div>

    <p style="margin-top: 24px; font-size: 14px; color: #64748b;">
      You can track updates, view agent replies, or upload supporting files directly through the AWENUE Client Support Portal.
    </p>
  `

  const html = renderSupportEmailShell({
    previewText,
    headline: `Support Ticket Registered #${ticketNumber}`,
    subheadline: 'Your request has been received by our dedicated engineering team.',
    contentHtml,
    ctaText: 'View Ticket Progress',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    ticketNumber,
  })

  const text = `Dear ${clientName},

Thank you for reaching out to AWENUE Support. We have received your request and an engineer from our support team has been notified.

TICKET DETAILS:
- Ticket Number: #${ticketNumber}
- Subject: ${subject}
- Category: ${category.replace(/_/g, ' ')}
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
    <p>A new message has been posted regarding your support ticket <strong>#${escapeHtml(ticketNumber)}</strong> (<em>${escapeHtml(ticketSubject)}</em>) by <strong>${escapeHtml(agentName)}</strong>:</p>

    <!-- Support Agent Message Box -->
    <div style="margin: 22px 0; background-color: #ffffff; border: 1px solid #bfdbfe; border-left: 5px solid #2563eb; border-radius: 4px 10px 10px 4px; box-shadow: 0 2px 6px rgba(37,99,235,0.06); overflow: hidden;">
      <div style="background-color: #eff6ff; padding: 10px 16px; border-bottom: 1px solid #dbeafe;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td>
              <strong style="color: #1e40af; font-size: 13px;">👨‍💻 Response from ${escapeHtml(agentName)}</strong>
            </td>
            <td align="right" style="font-size: 11px; color: #64748b;">
              AWENUE Support Team
            </td>
          </tr>
        </table>
      </div>
      <div style="padding: 18px 20px; font-size: 14px; line-height: 1.7; color: #1e293b;">
        ${formatTextBody(replyContent)}
      </div>
    </div>

    ${renderMetaTable([
      ['Ticket Number', `<strong>#${escapeHtml(ticketNumber)}</strong>`],
      ['Current Status', getStatusBadge(status)],
    ])}

    <p style="font-size: 14px; color: #64748b;">
      To respond or provide additional information, please click the button below or reply directly to this email.
    </p>
  `

  const html = renderSupportEmailShell({
    previewText,
    headline: `New Reply on Ticket #${ticketNumber}`,
    subheadline: `${agentName} has provided an update on your support request.`,
    contentHtml,
    ctaText: 'Reply on Support Portal',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    ticketNumber,
  })

  const text = `Dear ${recipientName},

A new message has been posted regarding your ticket #${ticketNumber} (${ticketSubject}) by ${agentName}:

MESSAGE FROM ${agentName.toUpperCase()}:
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
    <p>The status of your support ticket <strong>#${escapeHtml(ticketNumber)}</strong> has been updated in our system.</p>

    ${renderMetaTable([
      ['Ticket Number', `<strong>#${escapeHtml(ticketNumber)}</strong>`],
      ['Subject', escapeHtml(ticketSubject)],
      ['Previous Status', escapeHtml(oldStatus?.replace(/_/g, ' ') || '—')],
      ['New Status', getStatusBadge(newStatus)],
    ])}

    ${note ? `
      <div style="margin: 20px 0; padding: 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; border-radius: 4px 8px 8px 4px;">
        <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Note from Support Engineer</div>
        <div style="font-size: 13px; line-height: 1.6; color: #334155;">${formatTextBody(note)}</div>
      </div>
    ` : ''}

    <p style="font-size: 14px; color: #64748b;">
      You can track the full progress and comment history at any time on your client support dashboard.
    </p>
  `

  const html = renderSupportEmailShell({
    previewText,
    headline: `Ticket #${ticketNumber} Status Update`,
    subheadline: `Current status is now ${newStatus.replace(/_/g, ' ')}.`,
    contentHtml,
    ctaText: 'View Ticket Progress',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    ticketNumber,
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
    <p>We are pleased to inform you that your support ticket <strong>#${escapeHtml(ticketNumber)}</strong> has been successfully resolved by <strong>${escapeHtml(resolvedBy)}</strong>.</p>

    <!-- Resolution Showcase Card -->
    <div style="margin: 22px 0; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 5px solid #16a34a; border-radius: 4px 10px 10px 4px; padding: 20px; box-shadow: 0 2px 6px rgba(22,163,74,0.06);">
      <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
        ✅ Resolution Summary
      </div>
      <div style="font-size: 14px; line-height: 1.7; color: #14532d;">
        ${formatTextBody(resolution || 'The requested issue has been investigated and resolved.')}
      </div>
    </div>

    ${renderMetaTable([
      ['Ticket Number', `<strong>#${escapeHtml(ticketNumber)}</strong>`],
      ['Resolution Status', getStatusBadge('resolved')],
      ['Resolved By', escapeHtml(resolvedBy)],
    ])}

    <p style="font-size: 14px; color: #64748b;">
      If you feel this issue is not fully addressed or requires further investigation, you can reopen this ticket directly through the support portal link below.
    </p>
  `

  const html = renderSupportEmailShell({
    previewText,
    headline: `Ticket #${ticketNumber} Resolved`,
    subheadline: 'Our engineering team has completed resolution work on your ticket.',
    contentHtml,
    ctaText: 'Review or Reopen Ticket',
    ctaUrl: portalUrl || `${BRAND.website}/support/tickets/${ticketNumber}`,
    ticketNumber,
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

// ============================================================================
// 2. BILLING & INVOICE TEMPLATES
// ============================================================================

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
  } = data

  const subjectLine = data.subject || `Invoice #${invoiceNumber} from AWENUE Global Software Solutions`
  const previewText = `New invoice #${invoiceNumber} from AWENUE Global Software Solutions for ${currency} ${Number(amount).toLocaleString()}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>Please find attached your invoice <strong>#${escapeHtml(invoiceNumber)}</strong> from AWENUE Global Software Solutions.</p>

    <!-- Prominent Financial Hero Card -->
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-top: 4px solid #059669; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b;">TOTAL AMOUNT DUE</div>
      <div style="font-size: 32px; font-weight: 800; color: #0f172a; margin: 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${escapeHtml(currency)} ${Number(amount).toLocaleString()}
      </div>
      <div style="display: inline-block; background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 9999px; text-transform: uppercase;">
        Payment Due: ${escapeHtml(dueDate || 'Due upon receipt')}
      </div>
    </div>

    ${renderMetaTable([
      ['Invoice Number', `<strong>#${escapeHtml(invoiceNumber)}</strong>`],
      ['Invoice Date', escapeHtml(invoiceDate)],
      ['Due Date', `<span style="font-weight: 700; color: #dc2626;">${escapeHtml(dueDate || 'Due upon receipt')}</span>`],
      ['Total Amount', `<span style="font-size: 15px; font-weight: 700; color: #0f172a;">${escapeHtml(currency)} ${Number(amount).toLocaleString()}</span>`],
      ...(taxTotal ? [['Tax Breakdown', `${escapeHtml(currency)} ${Number(taxTotal).toLocaleString()}`]] : []),
      ['Payment Status', getStatusBadge(paymentStatus)],
    ])}

    <!-- Official PDF Attached Notice -->
    <div style="margin: 20px 0; padding: 14px 18px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="width: 32px; vertical-align: middle;">
            <span style="font-size: 24px;">📎</span>
          </td>
          <td style="vertical-align: middle; padding-left: 8px;">
            <div style="font-size: 13px; font-weight: 700; color: #166534;">Official Invoice PDF Attached</div>
            <div style="font-size: 12px; color: #15803d;">Your computer-generated tax invoice PDF is attached directly to this email.</div>
          </td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #334155;">
      Please review the attached invoice and complete payment by the due date.
    </p>

    ${paymentInstructions ? `
      <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #059669; border-radius: 4px 8px 8px 4px;">
        <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Remittance &amp; Payment Instructions</div>
        <div style="font-size: 13px; line-height: 1.6; color: #334155;">${formatTextBody(paymentInstructions)}</div>
      </div>
    ` : ''}

    <p style="font-size: 14px; color: #64748b;">
      For billing-related queries, please contact <a href="mailto:${BRAND.billingEmail}" style="color: #059669; font-weight: 600;">${BRAND.billingEmail}</a>.
    </p>
  `

  const html = renderBillingEmailShell({
    previewText,
    headline: `Invoice #${invoiceNumber}`,
    subheadline: `Amount due: ${currency} ${Number(amount).toLocaleString()}`,
    contentHtml,
    ctaText: 'View & Pay Invoice Online',
    ctaUrl: invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    invoiceNumber,
  })

  const text = `Dear ${clientName},

Please find attached your invoice #${invoiceNumber} from AWENUE Global Software Solutions.

Invoice Details:
- Invoice Number: #${invoiceNumber}
- Invoice Date: ${invoiceDate}
- Due Date: ${dueDate || 'Due upon receipt'}
- Total Amount: ${currency} ${Number(amount).toLocaleString()}
${taxTotal ? `- Tax: ${currency} ${Number(taxTotal).toLocaleString()}\n` : ''}- Payment Status: ${paymentStatus}

Please review the attached invoice and complete payment by the due date.

${paymentInstructions ? `PAYMENT INSTRUCTIONS:\n${paymentInstructions}\n\n` : ''}View Invoice online:
${invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`}

For billing-related queries, please contact:
${BRAND.billingEmail}

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
  const previewText = `Payment of ${currency} ${Number(amountPaid).toLocaleString()} confirmed for invoice #${invoiceNumber}`

  const isFullyPaid = Number(remainingBalance) <= 0

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>We gratefully acknowledge receipt of your payment for invoice <strong>#${escapeHtml(invoiceNumber)}</strong>. Your payment has been verified by our accounts department and applied to your balance.</p>

    <!-- Payment Received Hero Banner -->
    <div style="margin: 24px 0; padding: 24px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-top: 4px solid #16a34a; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(22,163,74,0.06);">
      <div style="font-size: 11px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 1px;">AMOUNT PAID &amp; CONFIRMED</div>
      <div style="font-size: 32px; font-weight: 800; color: #15803d; margin: 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${escapeHtml(currency)} ${Number(amountPaid).toLocaleString()}
      </div>
      <div style="font-size: 12px; color: #166534; font-weight: 600;">
        Transaction Reference: <span style="font-family: monospace; background: #dcfce7; padding: 2px 6px; border-radius: 4px;">${escapeHtml(paymentRef)}</span>
      </div>
    </div>

    ${renderMetaTable([
      ['Invoice Number', `<strong>#${escapeHtml(invoiceNumber)}</strong>`],
      ['Payment Date', escapeHtml(paymentDate)],
      ['Payment Method', escapeHtml(paymentMethod.replace(/_/g, ' '))],
      ['Remaining Balance', `<strong style="font-size: 14px; color: ${isFullyPaid ? '#15803d' : '#d97706'};">${escapeHtml(currency)} ${Number(remainingBalance).toLocaleString()}</strong>`],
      ['Account Status', isFullyPaid ? '<span style="display: inline-block; background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700;">● Paid in Full</span>' : '<span style="display: inline-block; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 700;">● Partially Paid</span>'],
    ])}

    <p style="font-size: 14px; color: #64748b;">
      Thank you for your prompt payment and continued partnership with AWENUE Global Software Solutions.
    </p>
  `

  const html = renderBillingEmailShell({
    previewText,
    headline: 'Payment Received & Verified',
    subheadline: `Payment of ${currency} ${Number(amountPaid).toLocaleString()} recorded successfully.`,
    contentHtml,
    ctaText: 'View Receipt & Invoice',
    ctaUrl: receiptUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    invoiceNumber,
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

  const previewText = `Reminder: Payment for invoice #${invoiceNumber} (${currency} ${Number(balance).toLocaleString()}) is ${isToday ? 'due today' : `due on ${dueDate}`}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p>This is a friendly reminder from our accounts team regarding invoice <strong>#${escapeHtml(invoiceNumber)}</strong>, which is scheduled for payment on <strong>${escapeHtml(dueDate)}</strong>.</p>

    <!-- Reminder Amount Card -->
    <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-top: 4px solid #f59e0b; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
      <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #92400e;">
        ${isToday ? 'PAYMENT DUE TODAY' : 'UPCOMING OUTSTANDING BALANCE'}
      </div>
      <div style="font-size: 32px; font-weight: 800; color: #b45309; margin: 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${escapeHtml(currency)} ${Number(balance).toLocaleString()}
      </div>
      <div style="font-size: 12px; color: #78350f; font-weight: 600;">
        Due Date: ${escapeHtml(dueDate)}
      </div>
    </div>

    ${renderMetaTable([
      ['Invoice Number', `<strong>#${escapeHtml(invoiceNumber)}</strong>`],
      ['Due Date', `<strong style="color: ${isToday ? '#dc2626' : '#0f172a'};">${escapeHtml(dueDate)}</strong>`],
      ['Outstanding Balance', `<span style="font-size: 15px; font-weight: 700; color: #dc2626;">${escapeHtml(currency)} ${Number(balance).toLocaleString()}</span>`],
    ])}

    ${paymentInstructions ? `
      <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; border-radius: 4px 8px 8px 4px;">
        <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Payment Remittance Details</div>
        <div style="font-size: 13px; line-height: 1.6; color: #334155;">${formatTextBody(paymentInstructions)}</div>
      </div>
    ` : ''}

    <p style="font-size: 14px; color: #64748b;">
      If you have already processed this payment, please disregard this reminder.
    </p>
  `

  const html = renderBillingEmailShell({
    previewText,
    headline: isToday ? `Invoice #${invoiceNumber} Due Today` : `Upcoming Payment Reminder`,
    subheadline: `Balance due: ${currency} ${Number(balance).toLocaleString()}`,
    contentHtml,
    ctaText: 'Review & Pay Invoice Online',
    ctaUrl: invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    invoiceNumber,
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
  const previewText = `Action required: Invoice #${invoiceNumber} is ${daysOverdue} days overdue. Total balance: ${currency} ${Number(balance).toLocaleString()}`

  const contentHtml = `
    <p>Dear ${escapeHtml(clientName)},</p>
    <p style="color: #b91c1c; font-weight: 600;">
      Our records indicate that we have not yet received payment for invoice #${escapeHtml(invoiceNumber)}, which fell due on ${escapeHtml(dueDate)}.
    </p>

    <!-- Urgent Overdue Hero Banner -->
    <div style="margin: 24px 0; padding: 24px; background-color: #fef2f2; border: 1px solid #fecaca; border-top: 4px solid #dc2626; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(220,38,38,0.06);">
      <div style="font-size: 11px; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 1px;">OVERDUE BALANCE REQUIRING ATTENTION</div>
      <div style="font-size: 32px; font-weight: 800; color: #dc2626; margin: 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        ${escapeHtml(currency)} ${Number(balance).toLocaleString()}
      </div>
      <div style="display: inline-block; background-color: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 9999px;">
        ⚠️ ${escapeHtml(daysOverdue)} Day(s) Past Due (${escapeHtml(dueDate)})
      </div>
    </div>

    ${renderMetaTable([
      ['Invoice Number', `<strong>#${escapeHtml(invoiceNumber)}</strong>`],
      ['Original Due Date', escapeHtml(dueDate)],
      ['Days Past Due', `<strong style="color: #dc2626;">${escapeHtml(daysOverdue)} day(s)</strong>`],
      ['Total Overdue', `<span style="font-size: 15px; font-weight: 700; color: #dc2626;">${escapeHtml(currency)} ${Number(balance).toLocaleString()}</span>`],
    ])}

    ${paymentInstructions ? `
      <div style="margin: 20px 0; padding: 18px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #dc2626; border-radius: 4px 8px 8px 4px;">
        <div style="font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 4px;">Immediate Settlement Instructions</div>
        <div style="font-size: 13px; line-height: 1.6; color: #334155;">${formatTextBody(paymentInstructions)}</div>
      </div>
    ` : ''}

    <p style="font-size: 14px; color: #64748b;">
      Please remit payment promptly or contact our billing team at <a href="mailto:${BRAND.billingEmail}" style="color: #059669;">${BRAND.billingEmail}</a> if you have already initiated the wire transfer.
    </p>
  `

  const html = renderBillingEmailShell({
    previewText,
    headline: `Overdue Notice: Invoice #${invoiceNumber}`,
    subheadline: `Payment was due on ${dueDate}. Immediate action required.`,
    contentHtml,
    ctaText: 'Pay Outstanding Balance Now',
    ctaUrl: invoiceUrl || `${BRAND.website}/invoices/${invoiceNumber}`,
    invoiceNumber,
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
      ['Invoice Number', `<strong>#${escapeHtml(invoiceNumber)}</strong>`],
      ['Cancellation Date', escapeHtml(cancelledDate)],
      ['Reason', escapeHtml(reason || 'Administrative adjustment')],
      ['Status', '<strong style="color: #64748b;">Cancelled (Void)</strong>'],
    ])}

    <p style="font-size: 14px; color: #64748b;">
      No payment is required for this cancelled invoice. If a replacement invoice is issued, you will receive a separate notification.
    </p>
  `

  const html = renderBillingEmailShell({
    previewText,
    headline: `Invoice #${invoiceNumber} Cancelled`,
    subheadline: 'This invoice has been voided.',
    contentHtml,
    invoiceNumber,
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
