import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';
import { Link } from 'react-router-dom';

const CookiePolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Cookie Policy"
        description="Learn how Kourti Legal uses cookies and similar technologies, what categories of cookies are set, and how to manage your cookie preferences."
        path="/cookie-policy"
      />
      <Navigation />
      <main className="pt-24 pb-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">Cookie Policy</h1>
          <p className="text-muted-foreground mb-8">Last Updated: May 2026</p>

          <p className="text-muted-foreground leading-relaxed mb-8">
            This Cookie Policy explains how Kourti Technologies Ltd (trading as{' '}
            <strong>Kourti Legal</strong>, "we", "us", or "our") uses cookies and similar
            technologies on the Kourti Legal website and platform. It should be read alongside our{' '}
            <Link to="/privacy-policy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            , which contains broader information about how we handle your personal data.
          </p>

          <div className="space-y-8">
            {/* What are cookies */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">What Are Cookies?</h2>
              <p className="text-muted-foreground leading-relaxed">
                Cookies are small text files that a website places on your device when you visit.
                They allow the website to recognise your device, remember your preferences, and
                improve your experience. Similar technologies — such as local storage, session
                storage, and browser fingerprinting — can serve comparable purposes and are covered
                by this policy.
              </p>
            </section>

            {/* Cookie categories */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Cookie Categories We Use
              </h2>
              <div className="space-y-6 text-muted-foreground leading-relaxed">
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    Strictly Necessary Cookies
                  </h3>
                  <p>
                    These cookies are essential for the Kourti Legal platform to function correctly.
                    They enable core features such as:
                  </p>
                  <ul className="list-disc pl-6 mt-3 space-y-2">
                    <li>
                      <strong>Authentication and session management</strong> — keeping you signed in
                      while you navigate the platform and maintaining the security of your session;
                    </li>
                    <li>
                      <strong>Cookie-consent preference storage</strong> — remembering whether you
                      have accepted or declined non-essential cookies so that we do not ask you
                      again on every visit; and
                    </li>
                    <li>
                      <strong>Security and anti-fraud controls</strong> — protecting your account
                      and preventing unauthorised access.
                    </li>
                  </ul>
                  <p className="mt-3">
                    Strictly necessary cookies do not require your consent and cannot be disabled
                    without significantly impairing platform functionality.
                  </p>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Analytics Cookies</h3>
                  <p>
                    We use analytics tools to understand how visitors and users interact with our
                    website and platform, so that we can improve usability, identify bugs, and
                    prioritise features. These cookies are only set{' '}
                    <strong>after you have given your consent</strong> via the cookie banner. The
                    analytics tools we use are:
                  </p>
                  <ul className="list-disc pl-6 mt-3 space-y-2">
                    <li>
                      <strong>Mixpanel</strong> — tracks feature interactions, navigation flows, and
                      usage patterns. IP addresses are anonymised. You can also opt out at any time
                      via the "Privacy &amp; Data" settings in your Kourti account.
                    </li>
                    <li>
                      <strong>Microsoft Clarity</strong> — records anonymised session replays and
                      heatmaps to help us understand UX issues. Input fields (including passwords
                      and document content) are automatically masked and never captured. Session
                      data is retained by Microsoft for 90 days.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Cookie table */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Cookies and Tools in Use
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border border-border bg-muted/50">
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Cookie / Tool
                      </th>
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Purpose
                      </th>
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Category
                      </th>
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground">
                        Set only after consent?
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Session / auth token
                      </td>
                      <td className="border border-border px-4 py-3">
                        Keeps you signed in and maintains a secure, authenticated session while you
                        use the platform
                      </td>
                      <td className="border border-border px-4 py-3">Strictly necessary</td>
                      <td className="border border-border px-4 py-3">No</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Cookie-consent preference
                      </td>
                      <td className="border border-border px-4 py-3">
                        Stores your accept/decline choice so the consent banner does not re-appear
                        on every page load
                      </td>
                      <td className="border border-border px-4 py-3">Strictly necessary</td>
                      <td className="border border-border px-4 py-3">No</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Mixpanel
                      </td>
                      <td className="border border-border px-4 py-3">
                        Tracks feature usage, navigation events, and funnel analytics to help us
                        improve the platform
                      </td>
                      <td className="border border-border px-4 py-3">Analytics</td>
                      <td className="border border-border px-4 py-3">Yes</td>
                    </tr>
                    <tr className="border border-border">
                      <td className="border border-border px-4 py-3 font-medium text-foreground">
                        Microsoft Clarity
                      </td>
                      <td className="border border-border px-4 py-3">
                        Anonymised session recordings and heatmaps for UX research; input fields are
                        masked
                      </td>
                      <td className="border border-border px-4 py-3">Analytics</td>
                      <td className="border border-border px-4 py-3">Yes</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* How to manage */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How to Accept or Withdraw Consent
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  <strong>Cookie banner.</strong> When you first visit the Kourti Legal website, a
                  cookie banner appears at the bottom of the screen. You can accept or decline
                  non-essential analytics cookies using the "Accept" or "Decline" buttons. Your
                  choice is saved in your browser's local storage.
                </p>
                <p>
                  Non-essential cookies (Mixpanel and Microsoft Clarity) are{' '}
                  <strong>not loaded</strong> unless and until you click "Accept". If you click
                  "Decline", no analytics cookies are set.
                </p>
                <p>
                  <strong>In-app privacy settings.</strong> If you have a Kourti account, you can
                  update your analytics preferences at any time via the "Privacy &amp; Data" section
                  of your account settings.
                </p>
                <p>
                  <strong>Browser controls.</strong> You can manage, block, or delete cookies at any
                  time using your browser's built-in privacy or cookie settings. Please note that
                  blocking strictly necessary cookies will impair your ability to sign in and use
                  the platform. The steps to manage cookies differ by browser — consult your
                  browser's help documentation for details.
                </p>
                <p>
                  <strong>Third-party opt-outs.</strong> You can opt out of Mixpanel tracking
                  directly via{' '}
                  <a
                    href="https://mixpanel.com/optout"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    mixpanel.com/optout
                  </a>
                  . For Microsoft Clarity, you can opt out via the Microsoft privacy settings for
                  your region.
                </p>
              </div>
            </section>

            {/* Updates */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Updates to This Policy
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Cookie Policy from time to time to reflect changes in the
                technologies we use or in applicable law. Material changes will be communicated via
                the cookie banner or by other appropriate means. The "Last Updated" date at the top
                of this page indicates when the policy was most recently revised.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have any questions about our use of cookies, please contact us at{' '}
                <a href="mailto:privacy@kourti.com" className="text-primary hover:underline">
                  privacy@kourti.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CookiePolicy;
