import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';
import { Link } from 'react-router-dom';

const Subprocessors = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Sub-processors"
        description="List of third-party sub-processors used by Kourti Legal to deliver its services, including their purpose, data categories, and location."
        path="/subprocessors"
      />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Sub-processors</h1>
          <p className="text-muted-foreground mb-8">Last Updated: May 2026</p>

          <p className="text-muted-foreground leading-relaxed mb-8">
            Kourti Technologies Ltd (trading as <strong>Kourti Legal</strong>) engages a limited
            number of trusted third-party service providers ("sub-processors") to deliver the Kourti
            Legal platform. Each sub-processor has access only to the personal data necessary for
            their specific function, and each is bound by data-processing obligations at least as
            protective as those set out in Kourti's{' '}
            <Link to="/dpa" className="text-primary hover:underline">
              Data Processing Agreement
            </Link>
            . This page is maintained as Annex 3 to the DPA and is updated whenever the
            sub-processor list changes.
          </p>

          <div className="space-y-8">
            {/* Sub-processor Table */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Current Sub-processor List
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border border-border bg-muted/50">
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Sub-processor
                      </th>
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Purpose
                      </th>
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Data Categories
                      </th>
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Railway (Railway Corp.)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Backend application hosting, managed database, and file storage
                      </td>
                      <td className="border border-border px-4 py-3">
                        All Customer personal data — identification, contact, legal matter,
                        financial, authentication, and audit data
                      </td>
                      <td className="border border-border px-4 py-3">United States</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Anthropic, Inc. (Claude)
                      </td>
                      <td className="border border-border px-4 py-3">
                        AI inference for document analysis, drafting assistance, and summarisation
                        features
                      </td>
                      <td className="border border-border px-4 py-3">
                        Document text, client names, matter details, and personal data contained in
                        documents submitted to AI features (transient inference only; no training
                        use)
                      </td>
                      <td className="border border-border px-4 py-3">United States</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        OpenAI, LLC
                      </td>
                      <td className="border border-border px-4 py-3">
                        AI inference (primary/fallback), text embeddings for semantic search
                      </td>
                      <td className="border border-border px-4 py-3">
                        Document text, client names, matter details, and personal data contained in
                        documents submitted to AI features (transient inference only; no training
                        use)
                      </td>
                      <td className="border border-border px-4 py-3">United States</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        OpenRouter, Inc.
                      </td>
                      <td className="border border-border px-4 py-3">
                        AI inference gateway and routing; text embeddings; speech-to-text
                        transcription
                      </td>
                      <td className="border border-border px-4 py-3">
                        Document text, client names, matter details, audio recordings (where
                        speech-to-text features are used), and personal data in documents submitted
                        via the gateway (transient; no training use)
                      </td>
                      <td className="border border-border px-4 py-3">
                        United States (routes to various underlying model providers)
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Resend, Inc.
                      </td>
                      <td className="border border-border px-4 py-3">
                        Transactional email delivery (account verification, password reset, matter
                        notifications, portal invitations, system alerts)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Email addresses, full names, one-time codes, expiring tokens, matter titles,
                        notification content
                      </td>
                      <td className="border border-border px-4 py-3">United States</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Brevo SAS (formerly Sendinblue)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Marketing CRM and lifecycle email (subscriber management, marketing
                        communications — distinct from transactional email sent via Resend)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Email addresses, full names, law firm name, subscription plan, subscription
                        lifecycle status. No legal matter data or document content is transmitted to
                        Brevo.
                      </td>
                      <td className="border border-border px-4 py-3">European Union (France)</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Paystack Payments Ltd
                      </td>
                      <td className="border border-border px-4 py-3">
                        Payment processing (subscription billing and plan purchases)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Customer email address, billing name, payment amount, transaction reference.
                        Full card data is processed directly by Paystack and is not stored by
                        Kourti.
                      </td>
                      <td className="border border-border px-4 py-3">Nigeria</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Vercel, Inc.
                      </td>
                      <td className="border border-border px-4 py-3">
                        Marketing website hosting and CDN (kourti.legal and related marketing pages)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Primarily static content delivery; server-side functions may process minimal
                        request metadata (IP address, user-agent) for rendering and routing. No
                        persistent Customer personal data is stored.
                      </td>
                      <td className="border border-border px-4 py-3">
                        United States (CDN edge nodes globally)
                      </td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Mixpanel, Inc.
                      </td>
                      <td className="border border-border px-4 py-3">
                        Product analytics — feature usage tracking, funnel analysis, and user
                        behaviour analytics (consent-gated)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Behavioural event data, IP address (used for approximate geolocation then
                        anonymised), device and browser metadata. Collected only after user consent.
                      </td>
                      <td className="border border-border px-4 py-3">United States</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Microsoft Corporation (Microsoft Clarity)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Session recording and heatmap analytics for UX research (consent-gated;
                        input fields masked)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Behavioural data (mouse movements, scroll depth, click patterns, session
                        replays), IP address, device and browser metadata. Collected only after user
                        consent. Input fields are masked to prevent capture of sensitive data.
                      </td>
                      <td className="border border-border px-4 py-3">United States</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Google LLC (Google Fonts CDN)
                      </td>
                      <td className="border border-border px-4 py-3">
                        Web font delivery via the Google Fonts CDN
                      </td>
                      <td className="border border-border px-4 py-3">
                        IP address and user-agent string transmitted as part of standard browser
                        HTTP requests when fonts are loaded from the CDN
                      </td>
                      <td className="border border-border px-4 py-3">
                        United States (CDN edge nodes globally)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                <strong>Note on AI sub-processors:</strong> Customer personal data submitted to AI
                features (including document text, matter details, and client names) is transmitted
                to the relevant AI inference sub-processor transiently for inference only. Kourti
                contractually prohibits each AI sub-processor from using Customer personal data for
                training, fine-tuning, evaluation, or improvement of AI models.
              </p>
            </section>

            {/* Changes to this list */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Changes to This List</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Kourti manages changes to the sub-processor list in accordance with Clause 5 of
                  the{' '}
                  <Link to="/dpa" className="text-primary hover:underline">
                    Data Processing Agreement
                  </Link>
                  :
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    When Kourti intends to add, replace, or remove a sub-processor, it will send an
                    email notification to the Customer's registered administrator email address at
                    least <strong>30 calendar days</strong> before the change takes effect.
                  </li>
                  <li>
                    Customers may object to an intended change within 30 calendar days of the
                    notification date, on reasonable, documented data-protection grounds.
                  </li>
                  <li>
                    Failure to object within the 30-day period constitutes acceptance of the change.
                  </li>
                  <li>
                    In exceptional circumstances (for example, where a sub-processor becomes
                    insolvent or poses an active security risk), Kourti may engage a replacement
                    sub-processor on shorter notice, in which case Kourti will notify affected
                    customers as promptly as possible.
                  </li>
                </ul>
                <p>
                  To ensure you receive sub-processor change notifications, please keep the
                  administrator email address on your Kourti account current. If you have questions
                  about this list or wish to subscribe to change notices, please contact us at{' '}
                  <a href="mailto:privacy@kourti.com" className="text-primary hover:underline">
                    privacy@kourti.com
                  </a>
                  .
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

export default Subprocessors;
