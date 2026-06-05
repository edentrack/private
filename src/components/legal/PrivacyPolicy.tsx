import { useEffect } from 'react';

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy · EdenTrack';
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-16 text-gray-800">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: June 4, 2026</p>

        <p className="mb-6 leading-relaxed">
          This Privacy Policy explains how EdenTrack ("we", "us", "our") collects, uses, and shares
          information when you use the EdenTrack web app, mobile app, and related services
          (collectively, the "Service"). EdenTrack is a farm management platform that helps farmers
          track their operations and converse with Eden, our in-product AI assistant.
        </p>
        <p className="mb-10 leading-relaxed">
          By using the Service, you agree to the collection and use of information described here.
          If you don't agree, please don't use the Service.
        </p>

        <Section title="1. Information we collect">
          <p className="mb-4">We collect three categories of information:</p>
          <SubHeading>Information you give us</SubHeading>
          <p className="mb-4">
            When you create an account: your name, email address, phone number (optional), country,
            and password. When you set up a farm: farm name, location, species, flock and pond
            details, sales records, expenses, payroll, mortality records, and similar farm
            operations data. When you talk to Eden: the messages you send, photos you upload (e.g.,
            of sick animals), and voice recordings you submit for transcription.
          </p>
          <SubHeading>Information collected automatically</SubHeading>
          <p className="mb-4">
            Device information (model, operating system, app version), usage data (pages visited,
            features used, error logs), approximate location (when you grant location permission for
            weather data), and IP address.
          </p>
          <SubHeading>Information from third parties</SubHeading>
          <p className="mb-4">
            If you sign in via a single-sign-on provider, we receive basic profile information from
            that provider. Payment processors share confirmation of a successful charge but never
            share your full card number with us.
          </p>
        </Section>

        <Section title="2. How we use your information">
          <p className="mb-4">We use the information to:</p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li>Provide, maintain, and improve the Service</li>
            <li>Generate AI responses through Eden, including transcribing your voice messages and analyzing photos you upload</li>
            <li>Send you receipts, vaccination reminders, and other transactional messages</li>
            <li>Process payments through our payment partners</li>
            <li>Diagnose and fix bugs, monitor service health, and prevent abuse</li>
            <li>Communicate with you about updates, support requests, and product changes</li>
            <li>Comply with legal obligations</li>
          </ul>
        </Section>

        <Section title="3. Third-party services we use">
          <p className="mb-4">
            EdenTrack relies on third parties to deliver the Service. Each handles a portion of your
            data subject to their own privacy practices:
          </p>
          <ul className="list-disc pl-6 mb-4 space-y-2">
            <li><strong>Supabase</strong>: database, authentication, and file storage</li>
            <li><strong>Vercel</strong>: web app hosting</li>
            <li><strong>Anthropic</strong>: powers Eden's responses (Claude AI). Your messages and photos sent to Eden are forwarded to Anthropic for processing</li>
            <li><strong>OpenAI</strong>: transcribes voice messages you record (Whisper)</li>
            <li><strong>PostHog</strong>: product analytics and error tracking</li>
            <li><strong>Crisp</strong>: in-app support chat (web only; disabled in mobile apps)</li>
            <li><strong>Stripe</strong>: card payment processing for South Africa and international users</li>
            <li><strong>Flutterwave</strong>: card and mobile money payment processing for African countries</li>
            <li><strong>Apple Push Notification service & Firebase Cloud Messaging</strong>: to deliver push notifications to your phone</li>
          </ul>
          <p className="mb-4">
            We share with these providers only what they need to provide their service. We do not
            sell your personal information to anyone.
          </p>
        </Section>

        <Section title="4. Data retention">
          <p className="mb-4">
            We retain your account data for as long as your account is active. If you close your
            account, we delete or anonymize your personal data within 90 days, except where we are
            required by law to retain it longer (e.g., financial records for tax purposes).
          </p>
          <p className="mb-4">
            Eden conversation history is retained so you can refer to past chats. You can delete
            individual conversations or your entire chat history from within the app.
          </p>
        </Section>

        <Section title="5. Your rights">
          <p className="mb-4">
            Depending on where you live, you may have the right to: access the personal information
            we hold about you, correct inaccurate data, delete your data, export your data in a
            portable format, restrict or object to certain processing, and withdraw consent at any
            time. To exercise these rights, email us at <strong>support@edentrack.app</strong>. We
            respond to verified requests within 30 days.
          </p>
        </Section>

        <Section title="6. International data transfers">
          <p className="mb-4">
            EdenTrack operates globally and your data may be processed in countries other than your
            own, including the United States and the European Union. These transfers are protected
            by standard contractual clauses or equivalent safeguards.
          </p>
        </Section>

        <Section title="7. Security">
          <p className="mb-4">
            We use industry-standard measures to protect your information, including HTTPS for all
            traffic, encrypted database storage, biometric authentication on mobile apps, and
            row-level security in our database. No system is perfectly secure, however, and we
            cannot guarantee absolute security.
          </p>
        </Section>

        <Section title="8. Children's privacy">
          <p className="mb-4">
            EdenTrack is not directed at children under 13 (or under 16 in the EU). We do not
            knowingly collect personal information from children. If you believe a child has
            provided us personal information, contact us and we will delete it.
          </p>
        </Section>

        <Section title="9. Changes to this policy">
          <p className="mb-4">
            We may update this Privacy Policy from time to time. When we do, we'll update the
            "Last updated" date at the top and, for material changes, notify you in the app or by
            email. Continued use of the Service after changes means you accept the updated policy.
          </p>
        </Section>

        <Section title="10. Contact us">
          <p className="mb-4">
            Questions or concerns about this Privacy Policy or our data practices? Email us at{' '}
            <strong>support@edentrack.app</strong>.
          </p>
        </Section>

        <p className="text-sm text-gray-500 mt-12">
          EdenTrack. Made for farmers everywhere.
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

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="font-semibold text-gray-900 mt-4 mb-2">{children}</h3>;
}
