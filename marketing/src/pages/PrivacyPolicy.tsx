import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Privacy Policy"
        description="Learn how Kourti Legal collects, uses, stores and protects your personal information. Read our full privacy policy covering data security, cookies, and your rights."
        path="/privacy-policy"
      />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Privacy Policy of Kourti Legal
          </h1>
          <p className="text-muted-foreground mb-8">Last Updated: November 2025</p>

          <p className="text-muted-foreground leading-relaxed mb-8">
            This Privacy Policy describes how Kourti Legal ("Kourti", "we", "us" or "our") collects,
            uses, stores, discloses and protects personal information of individuals who access our
            website, platform, or related services ("Services"). By using our Services, you consent
            to the practices described in this Privacy Policy.
          </p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">1. Definitions</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For the purpose of this Privacy Policy:
              </p>
              <div className="space-y-3 text-muted-foreground">
                <p>
                  <strong>1.1</strong> "Personal Information" means any information that identifies
                  or can be used to identify an individual, including but not limited to name, email
                  address, phone number, business details, billing information or user credentials.
                </p>
                <p>
                  <strong>1.2</strong> "Non Personal Information" means information that cannot be
                  used to identify an individual, such as aggregated data, usage analytics or
                  general technical information.
                </p>
                <p>
                  <strong>1.3</strong> "User" or "You" means any individual or entity that accesses
                  or uses the Services.
                </p>
                <p>
                  <strong>1.4</strong> "Processing" means any operation performed on Personal
                  Information including collection, storage, use, disclosure, transfer or deletion.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. Information We Collect
              </h2>

              <h3 className="text-lg font-medium text-foreground mb-2">
                2.1 Personal Information Provided Directly by You
              </h3>
              <p className="text-muted-foreground mb-2">
                We may collect Personal Information that you voluntarily provide when you:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1 mb-4">
                <li>Create an account on the Kourti platform.</li>
                <li>Sign up for updates, newsletters or product releases.</li>
                <li>Submit documents, legal briefs, forms or content through the platform.</li>
                <li>Request support or engage with our team.</li>
                <li>Make payments for any paid services.</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mb-2">
                2.2 Information Collected Automatically
              </h3>
              <p className="text-muted-foreground mb-2">
                When you access our website or platform, we may automatically collect:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1 mb-4">
                <li>IP address.</li>
                <li>Device and browser information.</li>
                <li>Log files, usage data and clickstream activities.</li>
                <li>Cookies and similar tracking technologies.</li>
                <li>Performance and analytics data.</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mb-2">
                2.3 Third Party Information
              </h3>
              <p className="text-muted-foreground">
                We may obtain information from third party providers, such as payment processors,
                identity verification platforms or integration partners, as permitted by applicable
                law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. How We Use Your Information
              </h2>
              <p className="text-muted-foreground mb-4">
                We may use Personal Information for the following purposes:
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">
                3.1 To Provide and Operate the Services
              </h3>
              <p className="text-muted-foreground mb-4">
                Including authentication, document management, workflow automation, billing, and
                user account administration.
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">
                3.2 To Improve Our Platform
              </h3>
              <p className="text-muted-foreground mb-4">
                Including research, analytics, performance monitoring, product enhancement and
                testing new features.
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">
                3.3 To Communicate With You
              </h3>
              <p className="text-muted-foreground mb-4">
                Including service updates, policy changes, technical notices, security alerts and
                customer support messages.
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">
                3.4 For Legal and Compliance Purposes
              </h3>
              <p className="text-muted-foreground mb-4">
                Including adherence to regulatory obligations, investigation of potential
                violations, fraud prevention and protection of Kourti's rights.
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">
                3.5 For Security and Risk Management
              </h3>
              <p className="text-muted-foreground">
                Including detection of suspicious activity, prevention of unauthorized access,
                system monitoring and other protective measures.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Legal Basis for Processing (Where Applicable)
              </h2>
              <p className="text-muted-foreground mb-2">
                Depending on your jurisdiction, our processing activities may be based on:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1">
                <li>Your consent.</li>
                <li>The necessity of processing for performance of a contract.</li>
                <li>Compliance with a legal obligation.</li>
                <li>
                  Our legitimate business interests which do not override your fundamental rights.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                5. Sharing and Disclosure of Information
              </h2>
              <p className="text-muted-foreground mb-4">
                We may share Personal Information in the following circumstances:
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">5.1 Service Providers</h3>
              <p className="text-muted-foreground mb-4">
                We may disclose information to trusted third party vendors who perform functions
                such as hosting, cloud storage, analytics, communications or payment processing.
                These parties are bound by confidentiality obligations.
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">
                5.2 Legal Compliance or Requests
              </h3>
              <p className="text-muted-foreground mb-4">
                We may disclose information if required by law, subpoena, court order or government
                request.
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">
                5.3 Business Transactions
              </h3>
              <p className="text-muted-foreground mb-4">
                In the event of a merger, acquisition, restructuring, asset transfer or similar
                corporate activity, Personal Information may be transferred to involved parties
                under confidentiality.
              </p>

              <h3 className="text-lg font-medium text-foreground mb-2">5.4 With Your Consent</h3>
              <p className="text-muted-foreground mb-4">
                We may share your information with third parties when you explicitly authorize us to
                do so.
              </p>

              <p className="text-muted-foreground font-medium">
                We do not sell Personal Information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                6. Data Storage and Security
              </h2>
              <p className="text-muted-foreground mb-2">
                <strong>6.1</strong> We use commercially reasonable administrative, technical and
                physical safeguards to protect Personal Information.
              </p>
              <p className="text-muted-foreground">
                <strong>6.2</strong> Despite our efforts, no system can guarantee absolute security.
                Users access the platform at their own risk.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">7. Data Retention</h2>
              <p className="text-muted-foreground mb-2">
                <strong>7.1</strong> We retain Personal Information only for as long as reasonably
                necessary to fulfill the purposes described in this Privacy Policy unless a longer
                retention period is required by law.
              </p>
              <p className="text-muted-foreground">
                <strong>7.2</strong> Users may request deletion of their data, subject to legal and
                contractual limitations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">8. Your Rights</h2>
              <p className="text-muted-foreground mb-2">
                Depending on your jurisdiction, you may have rights to:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1 mb-4">
                <li>Access the Personal Information we hold about you.</li>
                <li>Request correction or updates.</li>
                <li>Request deletion or restriction of processing.</li>
                <li>Withdraw consent at any time.</li>
                <li>Request a copy of your data in a portable format.</li>
              </ul>
              <p className="text-muted-foreground">
                Requests may be submitted to{' '}
                <a href="mailto:info@kourti.com" className="text-primary hover:underline">
                  info@kourti.com
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. Cookies and Tracking Technologies
              </h2>
              <p className="text-muted-foreground">
                We use cookies for authentication, analytics, performance measurement and platform
                optimization. You may disable cookies in your browser settings, although some
                features may be affected.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">10. Third Party Links</h2>
              <p className="text-muted-foreground">
                Our Services may contain links to external websites or resources. We are not
                responsible for their privacy practices or content.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                11. Updates to This Policy
              </h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy periodically. The updated version will be posted
                on our website with the effective date. Continued use of our Services constitutes
                acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                12. Contact Information
              </h2>
              <p className="text-muted-foreground mb-2">
                For questions regarding this Privacy Policy, contact us at:
              </p>
              <p className="text-muted-foreground">
                Email:{' '}
                <a href="mailto:info@kourti.com" className="text-primary hover:underline">
                  info@kourti.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
