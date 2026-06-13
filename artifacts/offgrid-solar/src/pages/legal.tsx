import { ReactNode } from "react";
import { Link } from "wouter";
import { Sun } from "lucide-react";
import { SiteFooter } from "@/components/layout/SiteFooter";

const LAST_UPDATED = "June 13, 2026";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-3xl mx-auto w-full flex items-center justify-between px-4 py-4">
          <Link href="/">
            <div className="flex items-center gap-2 font-semibold text-lg cursor-pointer">
              <Sun className="h-6 w-6 text-primary" />
              <span>OffGrid Builder</span>
            </div>
          </Link>
          <Link href="/">
            <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">Back to home</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full">
        <article className="max-w-3xl mx-auto px-4 py-10">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-2 mb-8">Last updated: {LAST_UPDATED}</p>
          <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground/90 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
            {children}
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using OffGrid Solar Builder (the &ldquo;Service&rdquo;), you agree to be bound by these
          Terms of Service. If you do not agree, do not use the Service.
        </p>
      </section>
      <section>
        <h2>2. What the Service Provides</h2>
        <p>
          OffGrid Solar Builder is a self-service tool that produces <strong>preliminary, estimated</strong> solar
          system designs, equipment lists, production figures, and cost ranges based on the information you provide
          and third-party data sources. The Service is an informational planning aid only. It is not engineering,
          electrical, financial, tax, or legal advice, and it does not replace a site assessment or design by a
          licensed professional.
        </p>
      </section>
      <section>
        <h2>3. No Professional Advice; Your Responsibility</h2>
        <p>
          All outputs are estimates and may differ materially from a final installed system. Before purchasing
          equipment or beginning any installation, you must have your design reviewed and verified by a licensed
          solar or electrical professional, and you must obtain all required permits. You are solely responsible for
          decisions made using the Service.
        </p>
      </section>
      <section>
        <h2>4. Access Links and Projects</h2>
        <p>
          Projects are accessed using a private link or access token rather than a traditional account. Anyone with
          your project link can view that project, so keep it confidential. We are not responsible for access gained
          through a shared or leaked link.
        </p>
      </section>
      <section>
        <h2>5. Payments</h2>
        <p>
          Paid reports and plans are processed by our payment provider, Stripe. Prices are shown before checkout.
          One-time purchases unlock the applicable report or credits; subscription plans renew on the stated cycle
          until cancelled. Promotional or trial codes may unlock a report at a reduced or zero price subject to their
          stated limits. See our <Link href="/refunds"><span className="text-primary underline cursor-pointer">Refund Policy</span></Link>.
        </p>
      </section>
      <section>
        <h2>6. Acceptable Use</h2>
        <ul>
          <li>Do not misuse, scrape, overload, or attempt to gain unauthorized access to the Service.</li>
          <li>Do not resell or redistribute reports as your own certified engineering documents.</li>
          <li>Do not use the Service for any unlawful purpose.</li>
        </ul>
      </section>
      <section>
        <h2>7. Intellectual Property</h2>
        <p>
          The Service, including its software, design, and report templates, is owned by OffGrid Solar Builder. The
          report content generated for your project is provided for your own planning and contractor-coordination use.
        </p>
      </section>
      <section>
        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind,
          express or implied, including accuracy, fitness for a particular purpose, or non-infringement. We do not
          warrant that estimates will match actual system performance, cost, or savings.
        </p>
      </section>
      <section>
        <h2>9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, OffGrid Solar Builder will not be liable for any indirect,
          incidental, or consequential damages, or for any loss arising from reliance on the estimates. Our total
          liability for any claim relating to the Service is limited to the amount you paid us for the report at issue.
        </p>
      </section>
      <section>
        <h2>10. Changes</h2>
        <p>
          We may update these Terms from time to time. Continued use of the Service after changes take effect
          constitutes acceptance of the revised Terms.
        </p>
      </section>
      <section>
        <h2>11. Contact</h2>
        <p>Questions about these Terms can be sent through the support channel listed on our website.</p>
      </section>
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <section>
        <p>
          This Privacy Policy explains what information OffGrid Solar Builder collects, how we use it, and the choices
          you have. By using the Service you agree to this policy.
        </p>
      </section>
      <section>
        <h2>1. Information We Collect</h2>
        <ul>
          <li><strong>Project details you provide:</strong> property address, energy usage, equipment preferences, and similar inputs used to generate your estimate.</li>
          <li><strong>Email address:</strong> when you request report delivery or redeem a promo/trial code.</li>
          <li><strong>Payment information:</strong> processed directly by Stripe. We do not store full card numbers; we receive limited transaction details (such as status and amount) to fulfill your purchase.</li>
          <li><strong>Usage and device data:</strong> basic analytics events and standard log information to operate and improve the Service.</li>
        </ul>
      </section>
      <section>
        <h2>2. How We Use Information</h2>
        <ul>
          <li>To generate and deliver your solar estimate and reports.</li>
          <li>To process payments and apply promo/trial codes.</li>
          <li>To operate, secure, and improve the Service.</li>
          <li>To respond to support requests.</li>
        </ul>
      </section>
      <section>
        <h2>3. Third-Party Services</h2>
        <p>
          To produce estimates we share necessary data with service providers, including Stripe (payments), mapping
          and geocoding providers (to locate your property), and NREL PVWatts (to estimate solar production from your
          location). These providers process data under their own terms. We do not sell your personal information.
        </p>
      </section>
      <section>
        <h2>4. Cookies and Local Storage</h2>
        <p>
          We use browser local storage to keep your project access links on your device and to remember basic
          preferences. Clearing your browser storage may remove access links saved on that device.
        </p>
      </section>
      <section>
        <h2>5. Data Retention</h2>
        <p>
          We retain project and transaction records for as long as needed to provide the Service, comply with legal
          obligations, resolve disputes, and enforce our agreements.
        </p>
      </section>
      <section>
        <h2>6. Your Choices</h2>
        <p>
          You may request access to, correction of, or deletion of your personal information by contacting us through
          our support channel. Some records may be retained where required for legal or accounting purposes.
        </p>
      </section>
      <section>
        <h2>7. Security</h2>
        <p>
          We use reasonable technical and organizational measures to protect your information. No method of
          transmission or storage is completely secure, so we cannot guarantee absolute security.
        </p>
      </section>
      <section>
        <h2>8. Contact</h2>
        <p>Privacy questions can be sent through the support channel listed on our website.</p>
      </section>
    </LegalLayout>
  );
}

export function RefundPage() {
  return (
    <LegalLayout title="Refund Policy">
      <section>
        <p>
          OffGrid Solar Builder sells digital products (instant-access reports, report credits, and subscriptions).
          This policy explains when refunds are and are not available.
        </p>
      </section>
      <section>
        <h2>1. Digital Products</h2>
        <p>
          Because reports are delivered instantly and reveal their full content on unlock, purchases are generally
          <strong> non-refundable once the report has been unlocked or downloaded</strong>. Please review the free
          preview before purchasing.
        </p>
      </section>
      <section>
        <h2>2. Technical Issues</h2>
        <p>
          If a technical problem on our side prevented you from accessing a report you paid for, and we are unable to
          resolve it, contact us within 14 days of purchase and we will work with you to fix the issue or provide a
          refund for that report.
        </p>
      </section>
      <section>
        <h2>3. Duplicate or Accidental Charges</h2>
        <p>Duplicate charges or clear billing errors will be refunded once verified.</p>
      </section>
      <section>
        <h2>4. Subscriptions</h2>
        <p>
          Subscription plans (such as Contractor Annual) renew automatically until cancelled. You may cancel at any
          time to stop future renewals; cancellation stops the next renewal and does not retroactively refund the
          current term. Remaining credits and access remain available through the end of the paid period.
        </p>
      </section>
      <section>
        <h2>5. How to Request a Refund</h2>
        <p>
          Send your request through our support channel with your project link and the email used at checkout. We aim
          to respond promptly.
        </p>
      </section>
      <section>
        <h2>6. Chargebacks</h2>
        <p>
          If you believe a charge is incorrect, please contact us first so we can resolve it. Filing a chargeback
          without contacting us may delay resolution.
        </p>
      </section>
    </LegalLayout>
  );
}

export function DisclaimerPage() {
  return (
    <LegalLayout title="Report Disclaimer">
      <section>
        <h2>Preliminary Planning Estimate Only</h2>
        <p>
          Preliminary planning estimate only. Final design should be verified by a licensed solar/electrical
          professional. This report is not a permit-ready engineering plan. Equipment quantities, wire sizing,
          protection device ratings, and structural requirements are preliminary and subject to change. Always obtain
          proper permits before installation.
        </p>
      </section>
      <section>
        <h2>How Estimates Are Produced</h2>
        <p>
          System sizing and annual production are calculated using standard rule-of-thumb solar formulas. Production
          uses peak sun hours from NREL PVWatts when location data is available, and falls back to a state-level
          seasonal average when it is not. A flat system derate factor is applied to account for real-world losses.
          Panel wattage, peak sun hours, and the data source used are shown in each report so you can see the basis of
          the estimate.
        </p>
      </section>
      <section>
        <h2>Pricing and Savings</h2>
        <p>
          Prices are preliminary estimates for the selected equipment tier and may vary by 15&ndash;25% based on
          market conditions, specific equipment selection, local labor rates, and site conditions. Federal, state, and
          local incentives (such as the 30% federal tax credit) are generally not reflected and can significantly
          change net cost. Estimated savings depend on your utility rates and usage and are not guaranteed.
        </p>
      </section>
      <section>
        <h2>No Warranty</h2>
        <p>
          OffGrid Solar Builder makes no warranty that the estimates will match a final installed system&rsquo;s
          performance, cost, or savings. You are responsible for verifying all figures with a qualified professional
          before making any purchase or installation decision. See our{" "}
          <Link href="/terms"><span className="text-primary underline cursor-pointer">Terms of Service</span></Link>{" "}
          for the full limitation of liability.
        </p>
      </section>
    </LegalLayout>
  );
}
