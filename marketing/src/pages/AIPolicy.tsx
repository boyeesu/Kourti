import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';

const AIPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="AI Policy"
        description="Learn how Kourti Legal builds, governs and uses artificial intelligence responsibly. Read our AI policy covering data handling, model providers, human oversight, accuracy, confidentiality and your rights."
        path="/ai-policy"
      />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">AI Policy of Kourti Legal</h1>
          <p className="text-muted-foreground mb-8">Last Updated: May 2026</p>

          <p className="text-muted-foreground leading-relaxed mb-8">
            This AI Policy explains how Kourti Legal ("Kourti", "we", "us" or "our") designs,
            deploys, governs and uses artificial intelligence ("AI") within our platform and
            services ("Services"). It is intended to give legal professionals and their clients a
            clear understanding of how our AI features work, what safeguards apply, and what
            responsibilities are shared between Kourti and our users. This policy should be read
            together with our{' '}
            <a href="/privacy-policy" className="text-primary hover:underline">
              Privacy Policy
            </a>{' '}
            and{' '}
            <a href="/terms-of-use" className="text-primary hover:underline">
              Terms of Use
            </a>
            .
          </p>

          <div className="space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">1. Our AI Principles</h2>
              <p className="text-muted-foreground mb-4">
                Kourti builds AI for the practice of law, where accuracy, confidentiality and
                accountability are non-negotiable. Every AI feature we ship is governed by the
                following principles:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1">
                <li>
                  <strong>Human in control.</strong> AI assists lawyers; it does not replace
                  professional judgment. A qualified person remains responsible for all legal work
                  product.
                </li>
                <li>
                  <strong>Confidential by design.</strong> Client and matter data is treated as
                  privileged and is never used to train third-party foundation models.
                </li>
                <li>
                  <strong>Transparent.</strong> We tell you where AI is used, what it can and cannot
                  do, and where it may be wrong.
                </li>
                <li>
                  <strong>Accountable.</strong> AI actions are logged and attributable, supporting
                  audit and supervision obligations.
                </li>
                <li>
                  <strong>Fair and lawful.</strong> We work to limit bias and to comply with
                  applicable data-protection and professional-conduct rules.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. How We Use AI in the Platform
              </h2>
              <p className="text-muted-foreground mb-2">
                AI powers a number of features across the Services, which may include:
              </p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1 mb-4">
                <li>Document and contract review, summarization and clause extraction.</li>
                <li>Drafting assistance and suggested edits (including redline suggestions).</li>
                <li>Legal research support and retrieval of relevant information.</li>
                <li>Matter, deadline and task organization and intelligent suggestions.</li>
                <li>
                  Conversational assistants that answer questions about your data or our product.
                </li>
              </ul>
              <p className="text-muted-foreground">
                AI features are tools that produce suggestions and drafts. Outputs are not legal
                advice and must be reviewed and verified by a qualified professional before they are
                relied upon or shared.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. AI Providers and Subprocessors
              </h2>
              <p className="text-muted-foreground mb-2">
                <strong>3.1</strong> We use trusted third-party model providers to deliver certain
                AI capabilities. These providers act as subprocessors and are bound by
                confidentiality and data-protection obligations.
              </p>
              <p className="text-muted-foreground mb-2">
                <strong>3.2</strong> We contractually require that data you submit through the
                Services is{' '}
                <strong>not used to train or improve third-party foundation models</strong> and is
                processed only to return results to you.
              </p>
              <p className="text-muted-foreground">
                <strong>3.3</strong> The list of AI subprocessors may change as our technology
                evolves. Material changes will be reflected in this policy or in our subprocessor
                documentation.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Data Handling and Confidentiality
              </h2>
              <p className="text-muted-foreground mb-2">
                <strong>4.1</strong> Content you submit to AI features (such as documents, prompts
                and matter information) is processed solely to generate the requested output and to
                operate the Services.
              </p>
              <p className="text-muted-foreground mb-2">
                <strong>4.2</strong> We do not sell your data, and we do not use the contents of
                your privileged or confidential materials to train models offered to other
                customers.
              </p>
              <p className="text-muted-foreground mb-2">
                <strong>4.3</strong> Data in transit and at rest is protected using encryption and
                access controls consistent with our security practices. See our{' '}
                <a href="/security" className="text-primary hover:underline">
                  Security
                </a>{' '}
                page for more detail.
              </p>
              <p className="text-muted-foreground">
                <strong>4.4</strong> Where we use aggregated or de-identified data to improve our
                own Services, we do so in a manner that does not identify you, your clients or your
                matters.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                5. Accuracy, Limitations and Hallucinations
              </h2>
              <p className="text-muted-foreground mb-2">
                <strong>5.1</strong> AI systems can produce output that is incomplete, outdated or
                factually incorrect ("hallucinations"). AI does not understand your matter the way a
                lawyer does.
              </p>
              <p className="text-muted-foreground mb-2">
                <strong>5.2</strong> Citations, authorities, figures and quotations generated by AI
                must be independently verified before use. Do not rely on AI output as a substitute
                for legal research or professional review.
              </p>
              <p className="text-muted-foreground">
                <strong>5.3</strong> AI output may not reflect the most current law, regulations or
                court rules in your jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                6. Human Oversight and Professional Responsibility
              </h2>
              <p className="text-muted-foreground mb-2">
                <strong>6.1</strong> You remain responsible for all work product produced with the
                assistance of AI, including its accuracy, completeness and compliance with
                applicable professional-conduct rules.
              </p>
              <p className="text-muted-foreground mb-2">
                <strong>6.2</strong> AI features that can take actions on your behalf (for example,
                automations or agents) operate within limits you configure and remain subject to
                your review and supervision.
              </p>
              <p className="text-muted-foreground">
                <strong>6.3</strong> You are responsible for determining whether disclosure of AI
                use to clients, courts or counterparties is required in your jurisdiction.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">7. Fairness and Bias</h2>
              <p className="text-muted-foreground">
                AI models can reflect biases present in their training data. We take reasonable
                steps to evaluate and reduce harmful bias in our AI features, but we cannot
                guarantee that output is free from bias. Users should exercise judgment,
                particularly where output could affect individuals' rights or interests.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Acceptable Use of AI Features
              </h2>
              <p className="text-muted-foreground mb-2">You agree not to use our AI features to:</p>
              <ul className="list-[lower-alpha] pl-6 text-muted-foreground space-y-1">
                <li>Generate or distribute unlawful, infringing, deceptive or harmful content.</li>
                <li>
                  Submit data you are not authorized to process, or that violates third-party rights
                  or confidentiality obligations.
                </li>
                <li>
                  Attempt to reverse engineer, extract or misuse the underlying models or training
                  data.
                </li>
                <li>
                  Present AI output as independent legal advice without appropriate professional
                  review.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                9. Logging, Auditability and Governance
              </h2>
              <p className="text-muted-foreground">
                Use of AI features may be logged to support security, troubleshooting, audit and
                supervision. We maintain internal governance processes for evaluating new AI
                capabilities and model providers before they are made available in the Services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">10. Your Choices</h2>
              <p className="text-muted-foreground">
                Where AI features are optional, administrators may be able to enable or disable them
                for their organization. Disabling certain AI features may limit functionality.
                Contact us if you have questions about configuring AI features for your firm.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                11. Updates to This Policy
              </h2>
              <p className="text-muted-foreground">
                We may update this AI Policy as our technology, providers and legal obligations
                evolve. The updated version will be posted on our website with a new effective date.
                Continued use of the Services constitutes acceptance of the revised policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">12. Contact Us</h2>
              <p className="text-muted-foreground mb-2">
                For questions about this AI Policy or our use of AI, contact us at:
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

export default AIPolicy;
