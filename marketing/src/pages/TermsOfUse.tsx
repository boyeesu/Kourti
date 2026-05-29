import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';

const TermsOfUse = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Terms of Service"
        description="Read the Terms of Service for Kourti Legal. Understand your rights and obligations when using our AI-powered legal practice management platform."
        path="/terms-of-use"
      />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Terms of Service of Kourti Legal
          </h1>
          <p className="text-muted-foreground mb-8">Last Updated: November 2025</p>

          <p className="text-muted-foreground leading-relaxed mb-8">
            These Terms of Service govern your access to and use of the Kourti Legal website,
            platform and related Services. By using the Services, you agree to be bound by these
            Terms.
          </p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">1. Definitions</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For the purpose of these Terms:
              </p>
              <div className="space-y-3 text-muted-foreground">
                <p>
                  <strong>1.1</strong> "Services" means all products, websites, software,
                  information, platforms or tools offered by Kourti Legal.
                </p>
                <p>
                  <strong>1.2</strong> "User" or "You" means any person or entity accessing or using
                  the Services.
                </p>
                <p>
                  <strong>1.3</strong> "Account" means the registered profile created by a User to
                  access the Kourti platform.
                </p>
                <p>
                  <strong>1.4</strong> "Content" means any documents, data, text, files or materials
                  uploaded, submitted or generated through the platform.
                </p>
                <p>
                  <strong>1.5</strong> "Paid Services" means any subscription based or transaction
                  based services that require payment.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. Acceptance of Terms
              </h2>
              <p className="text-muted-foreground">
                By accessing or using the Services, you enter into a binding agreement with Kourti
                Legal and confirm that you have read, understood and agree to comply with these
                Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">3. Eligibility</h2>
              <p className="text-muted-foreground">
                You must be at least eighteen years old and have the legal capacity to enter into a
                binding agreement. If you are using the Services on behalf of an organization, you
                represent that you have the authority to bind that organization.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. User Accounts and Responsibilities
              </h2>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  <strong>4.1</strong> You must provide accurate and complete information when
                  creating an Account.
                </p>
                <p>
                  <strong>4.2</strong> You are responsible for maintaining the confidentiality of
                  your login credentials.
                </p>
                <p>
                  <strong>4.3</strong> You are responsible for all activities performed under your
                  Account.
                </p>
                <p>
                  <strong>4.4</strong> You must promptly notify us of any unauthorized use or
                  security breach.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                5. Permitted Use and Restrictions
              </h2>
              <p className="text-muted-foreground mb-2">
                <strong>5.1</strong> You may use the Services solely for lawful purposes and in
                accordance with these Terms.
              </p>
              <p className="text-muted-foreground mb-2">
                <strong>5.2</strong> You agree not to:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1">
                <li>Use the Services for fraudulent or illegal activities.</li>
                <li>Upload harmful, malicious, defamatory or infringing content.</li>
                <li>Attempt to access unauthorized parts of the platform.</li>
                <li>Reverse engineer, copy or misappropriate any part of the Services.</li>
                <li>Interfere with the performance or security of the platform.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">6. User Content</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  <strong>6.1</strong> You retain ownership of all Content you upload.
                </p>
                <p>
                  <strong>6.2</strong> By submitting Content, you grant Kourti a limited, non
                  exclusive license to store, process and use the Content to provide the Services.
                </p>
                <p>
                  <strong>6.3</strong> You represent that you have the necessary legal rights and
                  permissions to upload any Content provided.
                </p>
                <p>
                  <strong>6.4</strong> Kourti does not provide legal advice and does not review or
                  validate the accuracy of your Content.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                7. Intellectual Property
              </h2>
              <p className="text-muted-foreground mb-4">
                All software, trademarks, graphics, designs and materials within the Services are
                owned or licensed by Kourti. You are granted a limited, revocable and non
                transferable right to access the Services for your personal or organizational use.
              </p>
              <p className="text-muted-foreground">
                You may not copy, modify or redistribute any proprietary materials without prior
                written consent.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Payment and Billing
              </h2>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  <strong>8.1</strong> Paid Services, if applicable, will require upfront payment or
                  subscription fees.
                </p>
                <p>
                  <strong>8.2</strong> All fees will be clearly displayed before purchase.
                </p>
                <p>
                  <strong>8.3</strong> Failure to pay may result in suspension or termination of
                  access.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. Service Availability
              </h2>
              <p className="text-muted-foreground">
                We strive to maintain continuous access but do not guarantee uninterrupted or error
                free service. Maintenance, upgrades or unforeseen outages may occur.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">10. Disclaimers</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  <strong>10.1</strong> Kourti provides a platform to support legal operations and
                  workflows. Kourti does not provide legal advice or legal services.
                </p>
                <p>
                  <strong>10.2</strong> Any outputs generated by the platform should be reviewed by
                  qualified legal professionals.
                </p>
                <p>
                  <strong>10.3</strong> The Services are provided on an "as is" and "as available"
                  basis without warranties of any kind.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                11. Limitation of Liability
              </h2>
              <p className="text-muted-foreground mb-2">
                To the maximum extent permitted by law, Kourti is not liable for:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1 mb-4">
                <li>Loss of data.</li>
                <li>Indirect, incidental or consequential damages.</li>
                <li>Errors resulting from incorrect or incomplete User Content.</li>
                <li>Business interruptions or loss of profits.</li>
              </ul>
              <p className="text-muted-foreground">
                Your sole remedy for dissatisfaction with the Services is to discontinue use.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">12. Indemnification</h2>
              <p className="text-muted-foreground mb-2">
                You agree to indemnify and hold Kourti harmless from any claims, damages or
                liabilities arising from:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1">
                <li>Your use of the Services.</li>
                <li>Violation of these Terms.</li>
                <li>Infringement of third party rights due to Content you upload.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">13. Termination</h2>
              <div className="space-y-2 text-muted-foreground">
                <p>
                  <strong>13.1</strong> We may suspend or terminate your Account at our discretion
                  for violation of these Terms or unlawful conduct.
                </p>
                <p>
                  <strong>13.2</strong> You may request account deletion at any time.
                </p>
                <p>
                  <strong>13.3</strong> Upon termination, your right to use the Services will cease.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">14. Governing Law</h2>
              <p className="text-muted-foreground">
                These Terms are governed by the laws of the Federal Republic of Nigeria unless
                otherwise required by applicable jurisdictional rules.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">15. Amendments</h2>
              <p className="text-muted-foreground">
                We may revise these Terms periodically. The updated version will be posted on our
                website. Continued use of the Services after changes are posted constitutes
                acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                16. Contact Information
              </h2>
              <p className="text-muted-foreground">
                For inquiries regarding these Terms, contact:{' '}
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

export default TermsOfUse;
