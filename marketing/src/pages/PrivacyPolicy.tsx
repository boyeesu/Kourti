import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';
import { Link } from 'react-router-dom';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Privacy Policy"
        description="Learn how Kourti Legal collects, uses, stores and protects your personal information. Read our full privacy policy covering data security, cookies, your rights, and how to contact us."
        path="/privacy-policy"
      />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Privacy Policy of Kourti Legal
          </h1>
          <p className="text-muted-foreground mb-8">Last Updated: May 2026</p>

          <p className="text-muted-foreground leading-relaxed mb-8">
            This Privacy Policy describes how Kourti Technologies Ltd (trading as{' '}
            <strong>Kourti Legal</strong>, "we", "us", or "our") collects, uses, stores, discloses,
            and protects personal data of individuals who access our website, platform, or related
            services (the "Services"). It is provided under Article 13 of the EU General Data
            Protection Regulation (GDPR), the Nigeria Data Protection Act 2023 and the Nigeria
            Data Protection Regulation 2019 (collectively "NDPR/NDPA"), and any other applicable
            data-protection law.
          </p>

          <div className="space-y-8">
            {/* 1. Data Controller Identity */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                1. Data Controller
              </h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>
                  The data controller in respect of your personal data is:
                </p>
                <p>
                  <strong>Kourti Technologies Ltd</strong> (trading as Kourti Legal)<br />
                  [Registered address — to be completed]<br />
                  Lagos, Nigeria
                </p>
                <p>
                  <strong>Privacy contact:</strong>{' '}
                  <a href="mailto:privacy@kourti.com" className="text-primary hover:underline">
                    privacy@kourti.com
                  </a>
                </p>
                <p>
                  Where Kourti Legal processes the personal data of a law firm's own clients,
                  opposing parties, or other third parties on behalf of that law firm, Kourti acts
                  as a <strong>data processor</strong> and the law firm acts as the data controller.
                  Those processing activities are governed by our{' '}
                  <Link to="/dpa" className="text-primary hover:underline">
                    Data Processing Agreement (DPA)
                  </Link>
                  . This Privacy Policy applies to data for which Kourti is itself the controller
                  (for example, data about users of our platform and visitors to our website).
                </p>
              </div>
            </section>

            {/* 2. Information We Collect */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. Information We Collect
              </h2>

              <h3 className="text-lg font-medium text-foreground mb-2">
                2.1 Information You Provide Directly
              </h3>
              <p className="text-muted-foreground mb-2 leading-relaxed">
                We may collect personal data that you voluntarily provide when you:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1 mb-4">
                <li>Create an account on the Kourti platform;</li>
                <li>Sign up for updates, newsletters, or product releases;</li>
                <li>Submit documents, legal briefs, forms, or content through the platform;</li>
                <li>Request support or engage with our team; or</li>
                <li>Make payments for any paid services.</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mb-2">
                2.2 Information Collected Automatically
              </h3>
              <p className="text-muted-foreground mb-2 leading-relaxed">
                When you access our website or platform, we may automatically collect:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1 mb-4">
                <li>IP address;</li>
                <li>Device and browser information;</li>
                <li>Log files, usage data, and clickstream activity;</li>
                <li>Cookies and similar tracking technologies (see Section 10 and our{' '}
                  <Link to="/cookie-policy" className="text-primary hover:underline">
                    Cookie Policy
                  </Link>); and
                </li>
                <li>Performance and analytics data (where you have given consent).</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mb-2">
                2.3 Information from Third Parties
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                We may obtain information from third-party providers such as payment processors,
                identity-verification platforms, or integration partners, as permitted by
                applicable law.
              </p>
            </section>

            {/* 3. Purposes and Lawful Bases */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. Purposes and Lawful Bases for Processing
              </h2>
              <p className="text-muted-foreground mb-4 leading-relaxed">
                We process personal data only where we have a lawful basis to do so. The table
                below sets out the main purposes for which we process personal data and the lawful
                basis that applies in each case.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border border-border bg-muted/50">
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Purpose
                      </th>
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Lawful Basis
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3">
                        Providing and operating the Services — account management, document handling,
                        workflows, billing, and user administration
                      </td>
                      <td className="border border-border px-4 py-3">
                        <strong>Contract</strong> — processing is necessary for the performance of
                        our agreement with you (GDPR Art. 6(1)(b); NDPA)
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3">
                        Sending transactional and service communications — account verification,
                        password reset, matter notifications, security alerts
                      </td>
                      <td className="border border-border px-4 py-3">
                        <strong>Contract</strong> — necessary for the performance of the agreement
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3">
                        Marketing communications — product updates, newsletters, and promotional
                        messages
                      </td>
                      <td className="border border-border px-4 py-3">
                        <strong>Consent</strong> — we only send marketing emails where you have
                        opted in (GDPR Art. 6(1)(a)). You may withdraw consent at any time by
                        clicking "unsubscribe" in any marketing email or adjusting your
                        preferences in your account settings.
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3">
                        Platform analytics and product improvement — understanding feature usage,
                        identifying bugs, and improving the user experience
                      </td>
                      <td className="border border-border px-4 py-3">
                        <strong>Consent</strong> — analytics cookies (Mixpanel, Microsoft Clarity)
                        are only loaded after you accept via the cookie banner
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3">
                        Security, anti-fraud, and system monitoring — detecting suspicious activity,
                        preventing unauthorised access, and maintaining platform integrity
                      </td>
                      <td className="border border-border px-4 py-3">
                        <strong>Legitimate interests</strong> — in protecting our platform and
                        customers from harm, which does not override your fundamental rights
                        (GDPR Art. 6(1)(f))
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3">
                        Financial record-keeping and tax compliance
                      </td>
                      <td className="border border-border px-4 py-3">
                        <strong>Legal obligation</strong> — compliance with applicable financial
                        and tax law (GDPR Art. 6(1)(c))
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3">
                        Responding to legal requests and protecting our rights — complying with
                        court orders, regulatory requests, and enforcing our terms
                      </td>
                      <td className="border border-border px-4 py-3">
                        <strong>Legal obligation</strong> and/or <strong>legitimate interests</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4. Recipients and Sub-processors */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Recipients and Sub-processors
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  We may share personal data in the following circumstances:
                </p>
                <p>
                  <strong>Sub-processors.</strong> We engage trusted third-party service providers
                  ("sub-processors") to help us deliver the Services. These include providers of
                  cloud hosting, AI inference, payment processing, email delivery, and analytics.
                  Each sub-processor is bound by a written data-processing agreement that imposes
                  obligations at least as protective as those set out in our{' '}
                  <Link to="/dpa" className="text-primary hover:underline">DPA</Link>
                  . The full, up-to-date list of sub-processors — including their purpose, the
                  categories of data they receive, and their location — is published at{' '}
                  <Link to="/subprocessors" className="text-primary hover:underline">
                    kourti.legal/subprocessors
                  </Link>
                  .
                </p>
                <p>
                  <strong>Legal compliance.</strong> We may disclose personal data if required by
                  law, subpoena, court order, or government request.
                </p>
                <p>
                  <strong>Business transactions.</strong> In the event of a merger, acquisition,
                  restructuring, or asset transfer, personal data may be transferred to involved
                  parties under appropriate confidentiality obligations.
                </p>
                <p>
                  <strong>With your consent.</strong> We may share your information with third
                  parties when you explicitly authorise us to do so.
                </p>
                <p className="font-medium">
                  We do not sell personal data.
                </p>
              </div>
            </section>

            {/* 5. International Transfers */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                5. International Transfers
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Some of our sub-processors are based in the United States and other countries
                outside the European Economic Area (EEA) and Nigeria. Where we transfer personal
                data to such countries, we ensure that appropriate safeguards are in place,
                including EU Standard Contractual Clauses (SCCs) for transfers from the EEA and
                equivalent contractual protections for transfers from Nigeria. Where an AI
                sub-processor processes personal data for inference purposes, we contractually
                require that sub-processor not to use such data for model training or improvement.
                Full details of the transfer mechanism applicable to each sub-processor are set
                out in our{' '}
                <Link to="/subprocessors" className="text-primary hover:underline">
                  sub-processor register
                </Link>
                .
              </p>
            </section>

            {/* 6. Data Retention */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">6. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We retain personal data only for as long as is necessary for the purposes for which
                it was collected, or as required by law. The following plain-language summary
                describes our main retention periods:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-3 leading-relaxed">
                <li>
                  <strong>Account and matter data.</strong> Personal data linked to your Kourti
                  account and legal matters is retained for the duration of your active
                  subscription. After you close your account, we delete or anonymise personal data
                  within 30 days, subject to the exceptions below.
                </li>
                <li>
                  <strong>Financial and billing records.</strong> Records of payments and
                  subscriptions are retained for approximately 6–7 years to comply with Nigerian
                  tax law and financial-records requirements. Personal data in such records is
                  anonymised at the point of deletion, but the financial figures and transaction
                  references are kept for the required period.
                </li>
                <li>
                  <strong>Marketing data.</strong> If you have opted in to marketing
                  communications, we retain your contact details for marketing purposes until you
                  unsubscribe or withdraw your consent.
                </li>
                <li>
                  <strong>Security and audit logs.</strong> Platform audit and security logs are
                  retained for up to 24 months to support security investigation and compliance
                  obligations.
                </li>
                <li>
                  <strong>AI conversation data.</strong> AI conversation histories are retained
                  while your account is active and are deleted approximately 12 months after the
                  last activity in that conversation.
                </li>
                <li>
                  <strong>Backups.</strong> Deleted personal data may persist in encrypted database
                  backups for up to 3 months. After the backup retention window expires, backups
                  containing the data are deleted automatically.
                </li>
              </ul>
            </section>

            {/* 7. Security */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                7. Data Security
              </h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                <p>
                  We implement appropriate technical and organisational measures to protect personal
                  data against accidental or unlawful destruction, loss, alteration, unauthorised
                  disclosure, or access. These measures include encryption of data in transit and
                  at rest, role-based access controls, multi-factor authentication, audit logging,
                  regular backups, and staff training.
                </p>
                <p>
                  Despite our efforts, no system can guarantee absolute security. In the event of a
                  personal data breach that is likely to result in a risk to your rights and
                  freedoms, we will notify the relevant supervisory authority and, where required,
                  affected individuals, in accordance with applicable law.
                </p>
              </div>
            </section>

            {/* 8. Your Rights */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Your Data-Subject Rights
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Depending on your jurisdiction and the circumstances of processing, you may have the
                following rights in relation to your personal data:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-6 leading-relaxed">
                <li>
                  <strong>Right of access</strong> — to receive a copy of the personal data we
                  hold about you;
                </li>
                <li>
                  <strong>Right to rectification</strong> — to have inaccurate or incomplete
                  personal data corrected;
                </li>
                <li>
                  <strong>Right to erasure</strong> — to request deletion of your personal data,
                  subject to applicable legal retention obligations;
                </li>
                <li>
                  <strong>Right to restriction</strong> — to ask us to limit how we process your
                  personal data in certain circumstances;
                </li>
                <li>
                  <strong>Right to data portability</strong> — to receive your personal data in a
                  structured, commonly used, machine-readable format and to transfer it to another
                  controller;
                </li>
                <li>
                  <strong>Right to object</strong> — to object to processing based on our
                  legitimate interests, and to object to direct marketing at any time; and
                </li>
                <li>
                  <strong>Right to withdraw consent</strong> — where processing is based on your
                  consent, to withdraw that consent at any time without affecting the lawfulness
                  of processing before withdrawal.
                </li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mb-2">How to Exercise Your Rights</h3>
              <p className="text-muted-foreground leading-relaxed mb-2">
                You can exercise many of these rights directly from within your Kourti account:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1 mb-4">
                <li>
                  Go to <strong>Account Settings &rarr; Privacy &amp; Data</strong> to export a
                  copy of your data, request deletion of your account, or update your marketing
                  communication preferences.
                </li>
              </ul>
              <p className="text-muted-foreground leading-relaxed">
                You can also submit a request by emailing{' '}
                <a href="mailto:privacy@kourti.com" className="text-primary hover:underline">
                  privacy@kourti.com
                </a>
                . We will respond within the timeframe required by applicable law (within 30 days
                under GDPR; within 14 days under the NDPA). We may ask you to verify your identity
                before processing your request.
              </p>
            </section>

            {/* 9. Right to Lodge a Complaint */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. Right to Lodge a Complaint
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                If you believe that we have not handled your personal data in accordance with
                applicable law, you have the right to lodge a complaint with a supervisory
                authority. We would appreciate the opportunity to address your concerns before you
                contact a regulator, so please contact us first at{' '}
                <a href="mailto:privacy@kourti.com" className="text-primary hover:underline">
                  privacy@kourti.com
                </a>
                .
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mt-4 leading-relaxed">
                <li>
                  <strong>Nigeria (NDPR/NDPA):</strong> Nigeria Data Protection Commission (NDPC)
                  — the principal supervisory authority for data protection in Nigeria.
                  Website:{' '}
                  <a
                    href="https://ndpc.gov.ng"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    ndpc.gov.ng
                  </a>
                </li>
                <li>
                  <strong>EU/EEA (GDPR):</strong> The competent data-protection supervisory
                  authority in the EU Member State where you reside or work, or where the alleged
                  infringement occurred.
                </li>
              </ul>
            </section>

            {/* 10. Cookies */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                10. Cookies and Tracking Technologies
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We use cookies and similar technologies for authentication, session management, and
                (where you have given your consent) analytics and product improvement. We do not
                load non-essential analytics cookies until you have consented via the cookie banner
                shown when you first visit our website. For full details of the cookies we use,
                the tools involved, and how to manage your preferences, please see our{' '}
                <Link to="/cookie-policy" className="text-primary hover:underline">
                  Cookie Policy
                </Link>
                .
              </p>
            </section>

            {/* 11. Children */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">11. Children</h2>
              <p className="text-muted-foreground leading-relaxed">
                The Kourti Legal platform is a professional tool intended solely for use by law
                firms and legal professionals. Our Services are not directed to individuals under
                the age of 18, and we do not knowingly collect personal data from anyone under 18.
                If you believe we have inadvertently collected information from a child, please
                contact us at{' '}
                <a href="mailto:privacy@kourti.com" className="text-primary hover:underline">
                  privacy@kourti.com
                </a>{' '}
                so that we can promptly delete it.
              </p>
            </section>

            {/* 12. Third-Party Links */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                12. Third-Party Links
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Our Services may contain links to external websites or resources. We are not
                responsible for the privacy practices or content of those third-party sites. We
                encourage you to review the privacy policy of any website you visit.
              </p>
            </section>

            {/* 13. Updates */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                13. Updates to This Policy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy periodically to reflect changes in our practices
                or applicable law. The updated version will be posted on our website with the
                "Last Updated" date. Where changes are material, we will provide additional notice
                (for example, by email or by displaying a notice within the platform). Continued
                use of our Services after the notice period constitutes acceptance of the revised
                policy.
              </p>
            </section>

            {/* 14. Contact */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                14. Contact Us
              </h2>
              <div className="text-muted-foreground leading-relaxed space-y-2">
                <p>For questions or concerns about this Privacy Policy, please contact:</p>
                <p>
                  <strong>Kourti Technologies Ltd</strong> (trading as Kourti Legal)<br />
                  [Registered address — to be completed]<br />
                  Lagos, Nigeria
                </p>
                <p>
                  Email:{' '}
                  <a href="mailto:privacy@kourti.com" className="text-primary hover:underline">
                    privacy@kourti.com
                  </a>
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
