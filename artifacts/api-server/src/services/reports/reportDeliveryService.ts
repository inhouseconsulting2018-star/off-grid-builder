import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export type ReportDeliveryStatus = "sent" | "queued" | "failed";

export type ReportEmailInput = {
  projectId: number;
  email: string;
  reportUrl: string;
  pdfUrl: string;
  projectName?: string | null;
};

export function buildReportEmailPayload(input: ReportEmailInput) {
  return {
    to: input.email,
    template: "solar-report-unlocked",
    projectId: input.projectId,
    projectName: input.projectName,
    subject: "Your OffGrid Solar Builder Solar Report",
    text: [
      "Thanks for your purchase.",
      "",
      "Your full OffGrid Solar Builder report is ready:",
      input.reportUrl,
      "",
      "Direct PDF link:",
      input.pdfUrl,
      "",
      "Keep this email private. These secure links provide access to your project.",
      "",
      "Need help? Contact support@offgridsolarbuilder.com.",
      "",
      "Solar designs and cost estimates are informational. Verify final engineering, permitting, equipment, and installation requirements with qualified local professionals.",
    ].join("\n"),
    reportUrl: input.reportUrl,
    pdfUrl: input.pdfUrl,
    supportEmail: "support@offgridsolarbuilder.com",
  };
}

export async function deliverReportEmail(input: ReportEmailInput): Promise<ReportDeliveryStatus> {
  if (!env.reportEmailWebhookUrl) {
    logger.info(
      { projectId: input.projectId },
      "REPORT_EMAIL_WEBHOOK_URL not configured; report email queued for manual delivery",
    );
    return "queued";
  }

  try {
    const response = await fetch(env.reportEmailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildReportEmailPayload(input)),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn(
        { projectId: input.projectId, status: response.status },
        "Report email provider returned an error",
      );
      return "failed";
    }

    return "sent";
  } catch (err) {
    logger.warn({ err, projectId: input.projectId }, "Report email delivery failed");
    return "failed";
  }
}
