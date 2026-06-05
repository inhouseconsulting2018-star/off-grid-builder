import { env } from "../../config/env";
import { logger } from "../../utils/logger";

export type ReportDeliveryStatus = "sent" | "queued" | "failed";

export async function deliverReportEmail(input: {
  projectId: number;
  email: string;
  reportUrl: string;
  projectName?: string | null;
}): Promise<ReportDeliveryStatus> {
  if (!env.reportEmailWebhookUrl) {
    logger.info(
      { projectId: input.projectId, email: input.email },
      "REPORT_EMAIL_WEBHOOK_URL not configured; report email queued for manual delivery",
    );
    return "queued";
  }

  try {
    const response = await fetch(env.reportEmailWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: input.email,
        template: "solar-report-unlocked",
        projectId: input.projectId,
        projectName: input.projectName,
        reportUrl: input.reportUrl,
      }),
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
