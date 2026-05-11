import { useEffect } from 'react';

export default function TermsOfService() {
  useEffect(() => {
    document.title = 'Terms of Service · EdenTrack';
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: May 10, 2026</p>

        <p className="mb-10 leading-relaxed">
          These Terms of Service ("Terms") govern your use of EdenTrack, a farm management platform
          provided by EdenTrack ("we", "us", "our"). By creating an account or using the Service,
          you agree to these Terms. If you don't agree, please don't use the Service.
        </p>

        <Section title="1. The Service">
          <p className="mb-4">
            EdenTrack lets farmers track their operations — flocks, ponds, rabbitries, sales,
            expenses, payroll, mortality, and more — and converse with Eden, our AI assistant, to
            log records, generate reports, and get production guidance. The Service is available on
            the web at edentrack.app and through our mobile apps for iOS and Android.
          </p>
        </Section>

        <Section title="2. Your account">
          <p className="mb-4">
            You must be at least 13 years old (16 in the EU) to create an account. You agree to
            provide accurate information when registering and to keep that information up to date.
            You're responsible for keeping your password secure and for all activity on your
            account. Notify us immediately at support@edentrack.app if you suspect unauthorized
            access.
          </p>
        </Section>

        <Section title="3. Subscriptions and payment">
          <p className="mb-4">
            EdenTrack offers a free Starter plan and three paid tiers (Grower, Farm Boss,
            Industry). Paid plans are billed in advance through our payment partners (Stripe,
            Paystack, Campay, or Flutterwave depending on your country). Prices are shown in your
            local currency at checkout.
          </p>
          <p className="mb-4">
            You can change or cancel your plan at any time from your account settings. Cancellation
            takes effect at the end of your current billing cycle. We do not offer pro-rated
            refunds for partial periods unless required by law.
          </p>
          <p className="mb-4">
            On our mobile apps, paid plans are managed through edentrack.app rather than through
            in-app purchases. You'll be directed to a secure browser session to complete checkout
            or change your plan.
          </p>
        </Section>

        <Section title="4. Eden AI — important disclaimer">
          <p className="mb-4">
            Eden is an AI assistant. It is designed to help you record farm data and provide
            general guidance based on common farming practices. <strong>Eden is not a veterinarian,
            financial advisor, or licensed agricultural extension officer.</strong>
          </p>
          <p className="mb-4">
            For health emergencies, disease outbreaks, regulatory questions, or significant
            financial decisions, consult a qualified professional in your jurisdiction. We are not
            responsible for losses arising from decisions you make based on Eden's responses.
          </p>
          <p className="mb-4">
            Eden may occasionally produce inaccurate or incomplete information. Verify important
            information independently before acting on it.
          </p>
        </Section>

        <Section title="5. Acceptable use">
          <p className="mb-4">You agree not to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Use the Service for unlawful purposes or to violate the rights of others</li>
            <li>Upload malicious code, attempt to breach our security, or interfere with the Service's normal operation</li>
            <li>Resell, sublicense, or commercially exploit the Service without our written permission</li>
            <li>Scrape, copy, or reverse-engineer the Service or our AI prompts</li>
            <li>Submit false or misleading data with intent to defraud</li>
            <li>Use the Service to harass, abuse, or harm others</li>
          </ul>
          <p className="mb-4">
            We may suspend or terminate accounts that violate these rules.
          </p>
        </Section>

        <Section title="6. Your content">
          <p className="mb-4">
            You retain ownership of all data you put into EdenTrack — your farm records, photos,
            messages to Eden, sales information, and so on. By using the Service, you grant us a
            limited license to host, process, and display this content as needed to provide the
            Service to you. We do not use your data to train AI models.
          </p>
          <p className="mb-4">
            You can export your data at any time from the Reports section in formats including PDF
            and CSV.
          </p>
        </Section>

        <Section title="7. Our intellectual property">
          <p className="mb-4">
            EdenTrack, the Eden brand, our logos, and the Service's design and code are our
            intellectual property. You may not copy, modify, or create derivative works of these
            without our written permission, except to the extent needed to use the Service as
            intended.
          </p>
        </Section>

        <Section title="8. Service availability">
          <p className="mb-4">
            We work hard to keep EdenTrack available 24/7, but we don't guarantee uninterrupted
            access. Scheduled maintenance, third-party outages (such as our hosting or payment
            providers), and unforeseen technical issues may cause downtime. We aren't liable for
            losses arising from downtime, though we'll do our best to communicate planned
            disruptions in advance.
          </p>
        </Section>

        <Section title="9. Termination">
          <p className="mb-4">
            You can close your account at any time from your account settings. We may suspend or
            terminate your account if you violate these Terms, fail to pay for a paid plan, or if
            we're required to by law. On termination, your right to use the Service ends, and we
            will delete or anonymize your data per our Privacy Policy.
          </p>
        </Section>

        <Section title="10. Disclaimers">
          <p className="mb-4">
            The Service is provided "as is" and "as available" without warranties of any kind,
            either express or implied. To the fullest extent permitted by law, we disclaim all
            warranties including merchantability, fitness for a particular purpose, and
            non-infringement.
          </p>
        </Section>

        <Section title="11. Limitation of liability">
          <p className="mb-4">
            To the fullest extent permitted by law, EdenTrack will not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or any loss of profits or
            revenues, arising from or relating to your use of the Service. Our total liability for
            any claim relating to the Service will not exceed the greater of $100 USD or the
            amount you paid us in the 12 months prior to the claim.
          </p>
        </Section>

        <Section title="12. Changes to these Terms">
          <p className="mb-4">
            We may update these Terms from time to time. When we do, we'll update the "Last
            updated" date and, for material changes, notify you in the app or by email. Continued
            use of the Service after changes means you accept the updated Terms.
          </p>
        </Section>

        <Section title="13. Governing law">
          <p className="mb-4">
            These Terms are governed by the laws of the State of Delaware, USA, without regard to
            conflict of law principles. Any disputes will be resolved in the courts of Delaware,
            unless local law in your jurisdiction requires otherwise.
          </p>
        </Section>

        <Section title="14. Contact us">
          <p className="mb-4">
            Questions about these Terms? Email us at <strong>support@edentrack.app</strong>.
          </p>
        </Section>

        <p className="text-sm text-gray-500 mt-12">
          EdenTrack — Made for farmers everywhere.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="leading-relaxed">{children}</div>
    </section>
  );
}
