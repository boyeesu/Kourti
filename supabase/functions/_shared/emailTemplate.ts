import { escapeHtml } from './htmlEscape.ts';

/**
 * Kourti AI - Unified Email Template System
 *
 * All transactional emails share this base template for brand consistency.
 * Design: warm, calming, professional with soft blue-lavender palette.
 */

// Brand constants
const BRAND = {
  name: 'Kourti AI',
  ceo: 'Rachael Eugene Michael',
  ceoTitle: 'CEO, Kourti AI',
  supportEmail: 'support@kourti.com',
  website: 'https://kourti.com',
  appUrl: 'https://app.kourti.com',
  // Warm, calming color palette
  colors: {
    primary: '#2B4C7E', // Deep calming blue
    primaryLight: '#3D6098', // Lighter primary
    accent: '#5B8DB8', // Soft blue-lavender
    accentLight: '#8BB4D9', // Light accent
    cta: '#2B4C7E', // CTA button color (calming blue)
    ctaHover: '#1E3A5F',
    success: '#3A8F6B', // Soft green
    warning: '#D4912A', // Warm amber
    urgent: '#C04040', // Muted red
    text: '#2D3748', // Dark gray text
    textSecondary: '#5A6578', // Medium gray
    textLight: '#8A94A6', // Light gray text
    background: '#F7F8FA', // Very light gray bg
    surface: '#FFFFFF', // White surface
    border: '#E8ECF1', // Soft border
    footerBg: '#F0F2F5', // Footer bg
  },
  fonts:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
};

export interface EmailTemplateOptions {
  /** Preheader text (shown in email client preview) */
  preheader?: string;
  /** Show CEO signature block */
  showSignature?: boolean;
  /** Custom footer text (replaces default) */
  footerText?: string;
  /** Show unsubscribe link */
  showUnsubscribe?: boolean;
  /** Organization name override */
  organizationName?: string;
}

/**
 * Wraps email body content in the unified Kourti AI template.
 */
export function wrapInEmailTemplate(bodyHtml: string, options: EmailTemplateOptions = {}): string {
  const {
    preheader = '',
    showSignature = false,
    footerText,
    showUnsubscribe = false,
    organizationName,
  } = options;

  const displayName = organizationName || BRAND.name;
  const year = new Date().getFullYear();

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:#f7f8fa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader)}</div>`
    : '';

  const signatureHtml = showSignature
    ? `
              <!-- CEO Signature -->
              <table cellpadding="0" cellspacing="0" style="margin: 32px 0 0; border-top: 1px solid ${BRAND.colors.border}; padding-top: 24px; width: 100%;">
                <tr>
                  <td>
                    <p style="color: ${BRAND.colors.text}; font-size: 15px; line-height: 1.5; margin: 0;">
                      Warmly,
                    </p>
                    <p style="color: ${BRAND.colors.primary}; font-size: 16px; font-weight: 600; margin: 8px 0 2px;">
                      ${escapeHtml(BRAND.ceo)}
                    </p>
                    <p style="color: ${BRAND.colors.textSecondary}; font-size: 13px; margin: 0;">
                      ${escapeHtml(BRAND.ceoTitle)}
                    </p>
                  </td>
                </tr>
              </table>
    `
    : '';

  const unsubscribeHtml = showUnsubscribe
    ? `<p style="color: ${BRAND.colors.textLight}; font-size: 12px; margin: 12px 0 0; text-align: center;">
                <a href="${BRAND.appUrl}/settings?tab=notifications" style="color: ${BRAND.colors.textLight}; text-decoration: underline;">Manage email preferences</a>
              </p>`
    : '';

  const footerContent =
    footerText ||
    `This email was sent by ${escapeHtml(displayName)}.<br>
                If you have any questions, reach out to us at <a href="mailto:${BRAND.supportEmail}" style="color: ${BRAND.colors.accent}; text-decoration: none;">${BRAND.supportEmail}</a>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(displayName)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .email-body { padding: 24px 16px !important; }
      .email-header { padding: 28px 16px !important; }
      .email-footer { padding: 20px 16px !important; }
      .cta-button { padding: 14px 24px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: ${BRAND.fonts}; background-color: ${BRAND.colors.background}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  ${preheaderHtml}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.colors.background}; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Email Container -->
        <table role="presentation" class="email-container" width="580" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.colors.surface}; border-radius: 16px; box-shadow: 0 2px 16px rgba(43, 76, 126, 0.06); overflow: hidden; max-width: 580px;">

          <!-- Header -->
          <tr>
            <td class="email-header" style="background: linear-gradient(135deg, ${BRAND.colors.primary} 0%, ${BRAND.colors.primaryLight} 50%, ${BRAND.colors.accent} 100%); padding: 32px 36px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 0.3px;">
                ${escapeHtml(displayName)}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="email-body" style="padding: 36px 36px 28px;">
              ${bodyHtml}
              ${signatureHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="email-footer" style="background-color: ${BRAND.colors.footerBg}; padding: 24px 36px; border-top: 1px solid ${BRAND.colors.border};">
              <p style="color: ${BRAND.colors.textLight}; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                ${footerContent}
              </p>
              ${unsubscribeHtml}
              <p style="color: ${BRAND.colors.textLight}; font-size: 12px; margin: 14px 0 0; text-align: center;">
                &copy; ${year} ${escapeHtml(displayName)}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Builds a primary CTA button.
 */
export function buildCtaButton(text: string, url: string, color?: string): string {
  const btnColor = color || BRAND.colors.cta;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
      <tr>
        <td style="background-color: ${btnColor}; border-radius: 10px;">
          <a href="${escapeHtml(url)}" class="cta-button" style="display: inline-block; padding: 15px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; letter-spacing: 0.2px;">
            ${escapeHtml(text)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Builds a secondary (outlined) CTA button.
 */
export function buildSecondaryButton(text: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
      <tr>
        <td style="border: 2px solid ${BRAND.colors.accent}; border-radius: 10px;">
          <a href="${escapeHtml(url)}" style="display: inline-block; padding: 13px 28px; color: ${BRAND.colors.primary}; text-decoration: none; font-weight: 600; font-size: 15px;">
            ${escapeHtml(text)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Builds a fallback URL line.
 */
export function buildFallbackUrl(url: string): string {
  return `
    <p style="color: ${BRAND.colors.textLight}; font-size: 12px; margin: 20px 0 0;">
      If the button doesn't work, copy this link into your browser:<br>
      <a href="${escapeHtml(url)}" style="color: ${BRAND.colors.accent}; word-break: break-all; font-size: 12px;">${escapeHtml(url)}</a>
    </p>
  `;
}

/**
 * Builds a greeting line.
 */
export function buildGreeting(name: string): string {
  return `<p style="color: ${BRAND.colors.text}; font-size: 17px; margin: 0 0 20px; font-weight: 500;">Hello ${escapeHtml(name)},</p>`;
}

/**
 * Builds a paragraph of body text.
 */
export function buildParagraph(text: string): string {
  return `<p style="color: ${BRAND.colors.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${text}</p>`;
}

/**
 * Builds a highlight/info box.
 */
export function buildInfoBox(contentHtml: string, borderColor?: string): string {
  const border = borderColor || BRAND.colors.accentLight;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 20px 0; width: 100%; background-color: #F0F4F8; border-radius: 10px; border-left: 4px solid ${border};">
      <tr>
        <td style="padding: 18px 20px;">
          ${contentHtml}
        </td>
      </tr>
    </table>
  `;
}

/**
 * Builds a feature list with checkmarks.
 */
export function buildFeatureList(items: string[]): string {
  const listItems = items
    .map(
      (item) =>
        `<tr><td style="padding: 6px 0; color: ${BRAND.colors.textSecondary}; font-size: 15px; line-height: 1.6; vertical-align: top;">
          <span style="color: ${BRAND.colors.success}; margin-right: 8px; font-size: 16px;">&#10003;</span> ${escapeHtml(item)}
        </td></tr>`
    )
    .join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 16px 0; width: 100%;">
      ${listItems}
    </table>
  `;
}

/**
 * Builds a divider line.
 */
export function buildDivider(): string {
  return `<hr style="border: none; border-top: 1px solid ${BRAND.colors.border}; margin: 24px 0;">`;
}

export { BRAND };
