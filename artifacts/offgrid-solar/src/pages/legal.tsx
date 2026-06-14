import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";

type LegalKind = "terms" | "privacy" | "refund" | "disclaimer";

const effectiveDate = "June 14, 2026";

const legalContent: Record<LegalKind, {
  title: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
}> = {
  terms: {
    title: "Terms of Service",
    sections: [
      {
        heading: "Service",
        paragraphs: [
          "OffGrid Solar Builder provides residential solar estimating software, downloadable digital reports, and related consulting or report services. We do not sell solar equipment, installation, financing, loans, insurance, investment products, or permit-ready engineering plans.",
          "You must provide accurate property and energy-use information and use the service only for lawful preliminary planning.",
        ],
      },
      {
        heading: "Purchases and access",
        paragraphs: [
          "Paid and promotional report access is limited to the plan or code granted. Secure project links are your responsibility. You may not bypass payment, reuse promotional access beyond its stated limits, probe private projects, or interfere with the service.",
          "Digital access may be suspended for fraud, abuse, chargebacks, unlawful use, or material violation of these terms.",
        ],
      },
      {
        heading: "Estimate limitations",
        paragraphs: [
          "Results depend on user inputs, third-party data, regional assumptions, and preliminary calculation models. Actual production, equipment, cost, incentives, site conditions, and code requirements may differ.",
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "To the maximum extent allowed by law, the service is provided without guarantees of installation feasibility, savings, production, approval, or code compliance. Do not purchase equipment or begin construction without appropriate professional review.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        heading: "Information collected",
        paragraphs: [
          "We process property addresses, location coordinates, energy-use inputs, project configuration, secure project tokens, purchase status, and email addresses supplied for payment, report delivery, support, or promotional-code redemption.",
        ],
      },
      {
        heading: "How information is used",
        paragraphs: [
          "Information is used to calculate estimates, save and reopen projects, generate reports, enforce access limits, process payments, deliver reports, prevent abuse, provide support, and maintain service security.",
        ],
      },
      {
        heading: "Service providers",
        paragraphs: [
          "We may send necessary data to infrastructure, geocoding, mapping, solar-data, email, database, analytics, and payment providers. Stripe processes payment information; this application does not store full card numbers.",
        ],
      },
      {
        heading: "Retention and choices",
        paragraphs: [
          "Project and transaction records may be retained for service delivery, fraud prevention, accounting, and legal obligations. Browser-saved project links can be removed from Settings. Contact support@offgridsolarbuilder.com for privacy requests.",
        ],
      },
    ],
  },
  refund: {
    title: "Refund Policy",
    sections: [
      {
        heading: "Digital reports",
        paragraphs: [
          "Because professional reports and access are digital products delivered immediately, completed purchases are generally non-refundable once the report has been unlocked or downloaded, except where required by law.",
        ],
      },
      {
        heading: "Technical problems",
        paragraphs: [
          "If a verified payment does not unlock the purchased access, or a report cannot be generated because of a service defect, contact support@offgridsolarbuilder.com with the purchase email and project details. We will restore access, regenerate the report, or issue an appropriate refund when the service cannot be delivered.",
        ],
      },
      {
        heading: "Subscriptions",
        paragraphs: [
          "Subscription cancellation stops future renewals but does not automatically refund an already completed billing period. Promotional and trial access has no cash value and is not refundable.",
        ],
      },
    ],
  },
  disclaimer: {
    title: "Report Disclaimer",
    sections: [
      {
        heading: "Preliminary estimate only",
        paragraphs: [
          "This is a preliminary solar estimate only. It is not a final engineering design, permit plan, utility approval, tax advice, legal advice, financial advice, financing offer, or guaranteed installation quote. Final system design and code compliance must be verified by the proper licensed professionals, utility, and/or authority having jurisdiction.",
          "Results are based on user-provided information, available API or location data, and documented assumptions or regional fallback values. Actual site conditions, shading, structural capacity, electrical service, equipment availability, utility rules, incentives, costs, and production may differ.",
        ],
      },
      {
        heading: "Professional verification required",
        paragraphs: [
          "Final system design, equipment selection, structural loading, electrical design, code compliance, permitting, interconnection, and installation must be verified by the appropriate licensed solar contractor, engineer, electrician, utility, and/or authority having jurisdiction.",
        ],
      },
    ],
  },
};

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const content = legalContent[kind];
  return (
    <AppLayout>
      <article className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{content.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Effective {effectiveDate}</p>
        </div>
        {content.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-xl font-semibold">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm text-muted-foreground leading-7">{paragraph}</p>
            ))}
          </section>
        ))}
        <div className="border-t pt-5 flex flex-wrap gap-3">
          <Link href="/"><Button variant="outline">Home</Button></Link>
          <a href="mailto:support@offgridsolarbuilder.com"><Button>Contact Support</Button></a>
        </div>
      </article>
    </AppLayout>
  );
}
