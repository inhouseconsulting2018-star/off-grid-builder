import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export type ReportDeliveryStatus = "sent" | "queued" | "failed" | "not_configured";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "OffGrid Solar Builder <onboarding@resend.dev>";
const SUPPORT_EMAIL = "support@offgridsolarbuilder.com";

export interface DeliverReportEmailInput {
  projectId: number;
  email: string;
  /** Link back to the results page where the customer can re-open the paid report. */
  reportUrl: string;
  /** Direct, token-authenticated link to download the PDF. */
  pdfUrl?: string | null;
  projectName?: string | null;
  planLabel?: string | null;
}

/**
 * Resolves a Resend API key — tries the Replit connector first, then the
 * RESEND_API_KEY env var. Returns null when neither is configured.
 */
async function getResendApiKey(): Promise<string | null> {
  const envKey = env.resendApiKey ?? null;

  const hostname = env.replitConnectorsHostname;
  const xReplitToken = env.replitIdentity
    ? "repl " + env.replitIdentity
    : env.webReplRenewal
      ? "depl " + env.webReplRenewal
      : null;

  // No connector context — fall straight back to the env var (may be null).
  if (!hostname || !xReplitToken) return envKey;

  try {
    const targetEnvironment = env.isReplitDeployment ? "production" : "development";
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set("include_secrets", "true");
    url.searchParams.set("connector_names", "resend");
    url.searchParams.set("environment", targetEnvironment);

    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
      signal: AbortSignal.timeout(8_000),
    });

    if (resp.ok) {
      const data = (await resp.json()) as {
        items?: Array<{ settings?: Record<string, unknown> }>;
      };
      const settings = data.items?.[0]?.settings ?? {};
      const key =
        (settings.api_key as string | undefined) ??
        (settings.apiKey as string | undefined) ??
        (settings.secret as string | undefined) ??
        (settings.key as string | undefined);
      if (key) return key;
    }
  } catch (err) {
    logger.warn({ err }, "Resend connector fetch failed — will try RESEND_API_KEY fallback");
  }

  return envKey;
}

function escape(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildEmailContent(input: DeliverReportEmailInput): { subject: string; html: string; text: string } {
  const name = input.projectName?.trim() || `Project #${input.projectId}`;
  const plan = input.planLabel?.trim();
  const ref = `OGS-${String(input.projectId).padStart(5, "0")}`;
  const subject = `Your OffGrid Solar report is ready — ${name}`;

  const pdfBtn = input.pdfUrl
    ? `<a href="${escape(input.pdfUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;margin:6px 8px 6px 0">Download PDF report</a>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
      <div style="background:#0f766e;padding:20px 24px">
        <div style="color:#fff;font-size:18px;font-weight:700">OffGrid Solar Builder</div>
        <div style="color:#99f6e4;font-size:13px;margin-top:2px">Your full solar report is unlocked</div>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 12px">Thanks for your purchase. Your full report for <strong>${escape(name)}</strong> is ready.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 18px">
          <tr><td style="padding:6px 0;color:#64748b">Reference</td><td style="padding:6px 0;text-align:right;font-weight:600">${escape(ref)}</td></tr>
          ${plan ? `<tr><td style="padding:6px 0;color:#64748b">Plan</td><td style="padding:6px 0;text-align:right;font-weight:600">${escape(plan)}</td></tr>` : ""}
        </table>
        <div style="margin:0 0 18px">
          <a href="${escape(input.reportUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;margin:6px 8px 6px 0">Open my report</a>
          ${pdfBtn}
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#475569">Bookmark the "Open my report" link — you can reopen your saved project and download the PDF any time from that page.</p>
        <p style="margin:0 0 8px;font-size:13px;color:#475569">Need help? Contact <a href="mailto:${SUPPORT_EMAIL}" style="color:#0f766e">${SUPPORT_EMAIL}</a>.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
        <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.5">This report is a preliminary planning estimate, not a quote or permit-ready engineering plan. Final system design, sizing, code compliance, and permitting must be verified by a licensed solar and electrical professional in your jurisdiction.</p>
      </div>
    </div>
  </div>
</body></html>`;

  const text = [
    `Your OffGrid Solar report is ready — ${name}`,
    ``,
    `Reference: ${ref}`,
    plan ? `Plan: ${plan}` : ``,
    ``,
    `Open my report: ${input.reportUrl}`,
    input.pdfUrl ? `Download PDF: ${input.pdfUrl}` : ``,
    ``,
    `Bookmark the report link — you can reopen your saved project and download the PDF any time from that page.`,
    `Need help? Contact ${SUPPORT_EMAIL}.`,
    ``,
    `This report is a preliminary planning estimate, not a quote or permit-ready engineering plan. Final system design, sizing, code compliance, and permitting must be verified by a licensed solar and electrical professional in your jurisdiction.`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}

async function sendViaResend(apiKey: string, input: DeliverReportEmailInput): Promise<ReportDeliveryStatus> {
  const { subject, html, text } = buildEmailContent(input);
  const from = env.reportEmailFrom || DEFAULT_FROM;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to: [input.email], subject, html, text }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn(
      { projectId: input.projectId, status: response.status, body: body.slice(0, 500) },
      "Resend returned an error sending the report email",
    );
    return "failed";
  }

  logger.info({ projectId: input.projectId }, "Report email sent via Resend");
  return "sent";
}

async function sendViaWebhook(webhookUrl: string, input: DeliverReportEmailInput): Promise<ReportDeliveryStatus> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: input.email,
      template: "solar-report-unlocked",
      projectId: input.projectId,
      projectName: input.projectName,
      planLabel: input.planLabel,
      reportUrl: input.reportUrl,
      pdfUrl: input.pdfUrl,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    logger.warn(
      { projectId: input.projectId, status: response.status },
      "Report email webhook returned an error",
    );
    return "failed";
  }
  return "sent";
}

/**
 * Delivers the report-ready email. This function NEVER throws — email delivery
 * must not block or roll back the customer's paid entitlement. It returns a
 * status that the caller persists for support/observability.
 */
export async function deliverReportEmail(input: DeliverReportEmailInput): Promise<ReportDeliveryStatus> {
  try {
    if (!input.email) return "not_configured";

    const apiKey = await getResendApiKey();
    if (apiKey) {
      return await sendViaResend(apiKey, input);
    }

    if (env.reportEmailWebhookUrl) {
      return await sendViaWebhook(env.reportEmailWebhookUrl, input);
    }

    logger.info(
      { projectId: input.projectId },
      "No email provider configured (Resend connector / RESEND_API_KEY / REPORT_EMAIL_WEBHOOK_URL); report email skipped",
    );
    return "not_configured";
  } catch (err) {
    logger.warn({ err, projectId: input.projectId }, "Report email delivery failed");
    return "failed";
  }
}
