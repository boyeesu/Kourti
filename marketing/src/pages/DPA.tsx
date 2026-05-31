import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';
import { Link } from 'react-router-dom';

const DPA = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Data Processing Agreement"
        description="Kourti Legal's Data Processing Agreement (DPA) — governing how we process customer personal data as a data processor under GDPR and NDPR."
        path="/dpa"
      />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Data Processing Agreement</h1>
          <p className="text-muted-foreground mb-8">Last Updated: May 2026</p>

          <p className="text-muted-foreground leading-relaxed mb-8">
            This Data Processing Agreement ("DPA") governs the processing of personal data by Kourti
            Technologies Ltd (trading as <strong>Kourti Legal</strong>) on behalf of its customers.
            It forms part of, and is incorporated into, the Kourti Legal Terms of Service or any
            applicable Order Form (the "Main Agreement"). In the event of a conflict between this
            DPA and the Main Agreement on data protection matters, this DPA prevails. This DPA is
            intended to comply with Regulation (EU) 2016/679 ("GDPR"), the Nigeria Data Protection
            Act 2023 and the Nigeria Data Protection Regulation 2019 (collectively "NDPR/NDPA"), and
            any other applicable data-protection legislation.
          </p>

          <div className="space-y-8">
            {/* 1. Parties and Roles */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">1. Parties and Roles</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  <strong>Kourti Legal (Processor).</strong> Kourti Technologies Ltd (trading as
                  Kourti Legal), a company incorporated under the laws of the Federal Republic of
                  Nigeria, acts as the <strong>Data Processor</strong> when providing the Kourti
                  Legal platform and related services (the "Service").
                </p>
                <p>
                  <strong>Customer (Controller).</strong> The entity that has accepted the Kourti
                  Legal Terms of Service or signed an Order Form incorporating this DPA acts as the{' '}
                  <strong>Data Controller</strong> in respect of the personal data of its own
                  clients, staff, opposing parties, and other individuals whose data it inputs into
                  or generates through the Service.
                </p>
                <p>
                  This DPA applies from the date on which the Customer accepted the Terms of Service
                  or signed an applicable Order Form, whichever is earlier ("Effective Date"), and
                  remains in force for the duration of the Main Agreement and any post-termination
                  period required by Clause 9 below.
                </p>
              </div>
            </section>

            {/* 2. Subject Matter, Nature, and Purpose */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                2. Subject Matter, Nature, and Purpose of Processing
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Kourti processes Customer personal data solely to provide the Service under the
                  Main Agreement, including:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Hosting and storing legal matter files, documents, and communications;</li>
                  <li>
                    Running AI-assisted analysis, summarization, drafting assistance, and document
                    review on uploaded materials;
                  </li>
                  <li>Generating automated notifications, reminders, and client portal updates;</li>
                  <li>Enabling Client Portal access for the law firm's own clients; and</li>
                  <li>Facilitating internal collaboration tools for the Customer's staff.</li>
                </ul>
                <p>
                  The nature of processing includes storage, retrieval, structuring, AI/LLM
                  inference, transmission, and display of Customer personal data within the Service.
                  Processing is carried out for the duration of the Main Agreement and, thereafter,
                  only as needed to fulfil any statutory retention obligations or to comply with
                  Clause 9 (Return and Deletion), whichever is shorter.
                </p>
              </div>
            </section>

            {/* 3. Categories of Data Subjects and Personal Data */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                3. Categories of Data Subjects and Personal Data
              </h2>

              <h3 className="text-lg font-medium text-foreground mb-2">Data Subjects</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Customer personal data processed under this DPA may relate to:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2 mb-6">
                <li>
                  <strong>Law firm staff</strong> — solicitors, associates, paralegals, support
                  staff, and other personnel of the Customer who use the Service;
                </li>
                <li>
                  <strong>The Customer's clients</strong> — individuals and corporate
                  representatives whose legal matters are managed through the platform;
                </li>
                <li>
                  <strong>Opposing parties and third parties</strong> — individuals named in legal
                  documents, contracts, correspondence, or matter notes uploaded to the platform;
                  and
                </li>
                <li>
                  <strong>Third-party contacts</strong> — witnesses, experts, counterparties, and
                  other individuals referenced in uploaded materials.
                </li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mb-2">
                Categories of Personal Data
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                The following categories of personal data may be processed:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>
                  <strong>Identification data:</strong> Full names, national identification numbers,
                  passport numbers, dates of birth;
                </li>
                <li>
                  <strong>Contact data:</strong> Email addresses, postal addresses, telephone
                  numbers;
                </li>
                <li>
                  <strong>Professional data:</strong> Job titles, employer names, bar registration
                  numbers, professional licences;
                </li>
                <li>
                  <strong>Legal matter data:</strong> Case names, matter references, legal documents
                  (contracts, pleadings, evidence, correspondence), legal advice, litigation
                  strategy;
                </li>
                <li>
                  <strong>Financial data:</strong> Bank account details, payment amounts, fee
                  arrangements, financial disclosures in legal proceedings;
                </li>
                <li>
                  <strong>Authentication data:</strong> Hashed passwords and multi-factor
                  authentication credentials (processed transiently; not stored in recoverable
                  form); and
                </li>
                <li>
                  <strong>Special categories of data (potentially):</strong> Legal documents
                  uploaded by the Customer may incidentally contain health data, biometric data,
                  criminal-offence data, or other special-category data as defined under GDPR
                  Article 9. The Customer, as Controller, is responsible for determining the lawful
                  basis for any such processing.
                </li>
              </ul>
            </section>

            {/* 4. Processor Obligations */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                4. Processor Obligations
              </h2>
              <div className="space-y-6 text-muted-foreground leading-relaxed">
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    4.1 Process Only on Instructions
                  </h3>
                  <p>
                    Kourti will process Customer personal data only on the documented instructions
                    of the Customer, including as set out in this DPA and the Main Agreement, unless
                    required to do otherwise by applicable law (in which case Kourti will, to the
                    extent permitted by law, inform the Customer of that requirement before
                    processing). The Customer's use of the platform's configuration options and
                    feature selections constitutes documented instructions for the purposes of this
                    clause. Kourti will promptly inform the Customer if, in its opinion, an
                    instruction infringes applicable data-protection law.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">4.2 Confidentiality</h3>
                  <p>
                    Kourti will ensure that all personnel authorised to process Customer personal
                    data are bound by written confidentiality obligations or are under an
                    appropriate statutory duty of confidentiality. Kourti will not disclose Customer
                    personal data to any third party except as expressly permitted under this DPA,
                    as required by law, or to approved sub-processors as set out in Clause 6.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">4.3 Security</h3>
                  <p>
                    Kourti will implement and maintain appropriate technical and organisational
                    measures (TOMs) to ensure a level of security appropriate to the risks presented
                    by the processing, taking into account the state of the art, the costs of
                    implementation, and the nature, scope, context, and purposes of the processing.
                    These measures include, at a minimum:
                  </p>
                  <ul className="list-disc pl-6 mt-3 space-y-2">
                    <li>
                      Encryption of data in transit (TLS 1.2 or higher) and at rest
                      (infrastructure-level encryption);
                    </li>
                    <li>
                      Role-based access controls enforcing least-privilege access and logical tenant
                      isolation;
                    </li>
                    <li>
                      Multi-factor authentication available for all accounts and enforced for
                      administrator-level accounts;
                    </li>
                    <li>
                      Tamper-evident audit logging of significant platform actions, retained for a
                      minimum of 24 months;
                    </li>
                    <li>Regular database backups with tested restoration procedures; and</li>
                    <li>
                      Staff data-protection training and documented incident-response procedures.
                    </li>
                  </ul>
                  <p className="mt-3">
                    Kourti may update these measures from time to time to reflect improvements in
                    security technology and practice, provided that the overall level of protection
                    is not reduced.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    4.4 Assistance with Data-Subject Rights
                  </h3>
                  <p>
                    Kourti will assist the Customer, by implementing appropriate technical and
                    organisational measures, in fulfilling the Customer's obligations to respond to
                    data-subject requests under Chapter III of the GDPR and Part IV of the NDPA
                    (including rights of access, rectification, erasure, restriction, portability,
                    and objection). Where Kourti receives a request directly from a data subject, it
                    will forward that request to the Customer without undue delay and will not
                    respond to the request directly except on the Customer's documented
                    instructions.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    4.5 Assistance with Compliance Obligations
                  </h3>
                  <p>
                    Kourti will assist the Customer, taking into account the nature of the
                    processing and the information available to Kourti, in ensuring compliance with
                    obligations relating to security of processing, breach notification to
                    supervisory authorities and data subjects, data-protection impact assessments,
                    and prior consultation with supervisory authorities, as required under GDPR
                    Articles 32–36 and equivalent NDPA provisions.
                  </p>
                </div>
              </div>
            </section>

            {/* 5. Sub-processors */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">5. Sub-processors</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  The Customer grants Kourti general authorisation to engage sub-processors for the
                  purposes set out in this DPA. The current list of approved sub-processors is
                  published at{' '}
                  <Link to="/subprocessors" className="text-primary hover:underline">
                    kourti.legal/subprocessors
                  </Link>
                  , which is incorporated into and forms part of this DPA.
                </p>
                <p>
                  Kourti will impose data-protection obligations on each sub-processor that are
                  equivalent to those set out in this DPA, by way of a written contract. Where a
                  sub-processor fails to fulfil its data-protection obligations, Kourti remains
                  liable to the Customer for the performance of those obligations to the extent that
                  Kourti is liable under this DPA.
                </p>
                <p>
                  Kourti will notify the Customer of any intended changes to the sub-processor list
                  (whether by addition or replacement) by updating the published list and sending an
                  email notification to the Customer's registered administrator email address at
                  least <strong>30 calendar days</strong> before the change takes effect. The
                  Customer may object to the addition or replacement of a sub-processor within 30
                  calendar days of receiving notice, on reasonable, documented data-protection
                  grounds. If the parties cannot resolve the objection, the Customer may terminate
                  the relevant portion of the Service without penalty. Failure to object within the
                  30-day period constitutes acceptance of the change.
                </p>
              </div>
            </section>

            {/* 6. International Transfers */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                6. International Transfers
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  The Customer acknowledges and accepts that some sub-processors listed in the
                  sub-processor register are located outside the European Economic Area (EEA) and
                  Nigeria, in particular in the United States of America. Processing by such
                  sub-processors involves the transfer of Customer personal data to a third country.
                </p>
                <p>
                  Kourti ensures that any transfer of Customer personal data to a third country is
                  subject to an appropriate transfer mechanism, including:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Standard Contractual Clauses (SCCs):</strong> Where required, Kourti
                    enters into, or procures that the relevant sub-processor enters into, the EU
                    Standard Contractual Clauses (Module 3: Processor-to-processor) for transfers
                    from the EEA;
                  </li>
                  <li>
                    <strong>Equivalent contractual protections</strong> for transfers involving UK
                    or Nigerian personal data, as documented in the sub-processor register; and
                  </li>
                  <li>
                    <strong>No-training commitments:</strong> Where an AI/LLM sub-processor
                    processes Customer personal data for inference purposes, Kourti contractually
                    requires that sub-processor not to use such data for model training or
                    improvement.
                  </li>
                </ul>
                <p>
                  Details of the transfer safeguard applicable to each sub-processor are set out in
                  the{' '}
                  <Link to="/subprocessors" className="text-primary hover:underline">
                    sub-processor register
                  </Link>
                  .
                </p>
              </div>
            </section>

            {/* 7. Breach Notification */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                7. Personal Data Breach Notification
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Upon becoming aware of a personal data breach affecting Customer personal data,
                  Kourti will:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Immediately activate its internal incident-response procedure;</li>
                  <li>Take all necessary steps to contain and mitigate the breach; and</li>
                  <li>Preserve evidence and document the breach in its internal incident log.</li>
                </ul>
                <p>
                  Kourti will notify the Customer of a personal data breach{' '}
                  <strong>without undue delay</strong> and, where feasible,{' '}
                  <strong>no later than 48 hours</strong> after becoming aware. Where a complete
                  notification cannot be made within 48 hours, Kourti will provide an initial
                  notification with the information available at that time, followed by further
                  updates as additional information becomes available.
                </p>
                <p>The notification will include, to the extent available:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    A description of the nature of the breach, including the categories and
                    approximate number of data subjects and personal data records affected;
                  </li>
                  <li>
                    The name and contact details of Kourti's data-protection point of contact;
                  </li>
                  <li>A description of the likely consequences of the breach; and</li>
                  <li>
                    A description of the measures taken or proposed to address the breach and
                    mitigate its possible adverse effects.
                  </li>
                </ul>
                <p>
                  The Customer remains solely responsible for notifying the relevant supervisory
                  authority and affected data subjects in accordance with applicable law. Kourti's
                  breach notification to the Customer does not constitute an admission of fault or
                  liability.
                </p>
              </div>
            </section>

            {/* 8. Return and Deletion */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                8. Return and Deletion of Data
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Upon termination or expiry of the Main Agreement, or upon written request by the
                  Customer, Kourti will, at the Customer's election:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Return:</strong> Export and make available to the Customer a complete
                    copy of all Customer personal data in a structured, commonly used,
                    machine-readable format (such as JSON or CSV) within{' '}
                    <strong>30 calendar days</strong>; or
                  </li>
                  <li>
                    <strong>Delete:</strong> Securely delete or destroy all Customer personal data
                    (including copies held by sub-processors, where technically feasible) within{' '}
                    <strong>30 calendar days</strong>.
                  </li>
                </ul>
                <p>
                  Where the Customer does not make an election within 30 days of termination, Kourti
                  will delete Customer personal data in accordance with its standard data retention
                  schedule.
                </p>
                <p>
                  Kourti may retain Customer personal data for a longer period to the extent
                  required by applicable law (including financial, tax, and regulatory
                  record-keeping obligations), provided that such data is retained only for the
                  period strictly required, kept separate from active Customer data with restricted
                  access, and the Customer is notified of any such retention obligation.
                </p>
                <p>
                  Upon completion of deletion, Kourti will, upon request, provide the Customer with
                  written certification that all Customer personal data has been deleted or
                  returned.
                </p>
              </div>
            </section>

            {/* 9. Audit Rights */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">9. Audit Rights</h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  Kourti will make available to the Customer all information reasonably necessary to
                  demonstrate compliance with this DPA and will allow for and contribute to audits,
                  including inspections, conducted by the Customer or an auditor mandated by the
                  Customer, subject to the following conditions:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    The Customer must give Kourti reasonable notice of no less than{' '}
                    <strong>30 calendar days</strong> before commencing an audit;
                  </li>
                  <li>
                    Audits must be conducted during normal business hours, no more than once per
                    calendar year (unless a personal data breach has occurred), and in a manner that
                    minimises disruption to Kourti's operations;
                  </li>
                  <li>The Customer bears the costs of any third-party auditor it engages; and</li>
                  <li>
                    Kourti may satisfy its audit obligations by providing relevant third-party audit
                    reports (e.g., SOC 2 or ISO 27001 certifications) or security-questionnaire
                    responses, subject to any applicable confidentiality undertaking.
                  </li>
                </ul>
                <p>
                  All information obtained during an audit must be treated as Confidential
                  Information subject to the terms of the Main Agreement.
                </p>
              </div>
            </section>

            {/* 10. General Provisions */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                10. General Provisions
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  <strong>Order of precedence.</strong> Where Standard Contractual Clauses apply to
                  a particular transfer, those clauses prevail over this DPA to the extent of any
                  conflict.
                </p>
                <p>
                  <strong>Governing law.</strong> This DPA is governed by the laws of the Federal
                  Republic of Nigeria, except where GDPR or UK GDPR requires the application of the
                  law of an EU Member State or the United Kingdom.
                </p>
                <p>
                  <strong>Updates.</strong> Kourti may update this DPA from time to time to reflect
                  changes in applicable data-protection law. Kourti will provide the Customer with
                  at least <strong>30 calendar days' notice</strong> of material changes. Continued
                  use of the Service after the notice period constitutes acceptance of the updated
                  DPA.
                </p>
                <p>
                  <strong>Severability.</strong> If any provision of this DPA is held invalid or
                  unenforceable, the remaining provisions continue in full force and effect.
                </p>
              </div>
            </section>

            {/* Request Executed Copy */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Request a Countersigned Copy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Customers who require an executed, countersigned copy of this DPA for their
                compliance records may request one by emailing{' '}
                <a href="mailto:legal@kourti.com" className="text-primary hover:underline">
                  legal@kourti.com
                </a>
                . Please include your organisation name and the email address registered on your
                Kourti account. Kourti will provide a countersigned copy within a reasonable
                timeframe.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DPA;
