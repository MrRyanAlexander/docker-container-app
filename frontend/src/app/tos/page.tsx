import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold text-blue-600">
              ContainerApp
            </Link>
            <div className="space-x-4">
              <Link href="/" className="text-gray-600 hover:text-blue-600 transition-colors">
                Home
              </Link>
              <a
                href="/auth/login"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Login
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Terms of Service</h1>
        
        <div className="bg-white rounded-lg shadow-sm p-8 prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6">
            <strong>Last updated:</strong> {new Date().toLocaleDateString()}
          </p>

          <h2>Acceptance of Terms</h2>
          <p>
            By accessing and using ContainerApp, you accept and agree to be bound by the terms 
            and provision of this agreement.
          </p>

          <h2>Use License</h2>
          <p>
            Permission is granted to temporarily use ContainerApp for personal, non-commercial 
            transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
          </p>
          <ul>
            <li>Modify or copy the materials</li>
            <li>Use the materials for any commercial purpose or for any public display</li>
            <li>Attempt to reverse engineer any software contained on the website</li>
            <li>Remove any copyright or other proprietary notations from the materials</li>
          </ul>

          <h2>Container Usage</h2>
          <p>
            Each user is allocated container resources with specific limits:
          </p>
          <ul>
            <li>Maximum CPU: 0.5 cores</li>
            <li>Maximum Memory: 512Mi</li>
            <li>Storage: 1Gi persistent volume</li>
            <li>Network: Isolated environment with no external access</li>
          </ul>

          <h2>Prohibited Activities</h2>
          <p>
            You may not use your container environment for:
          </p>
          <ul>
            <li>Cryptocurrency mining</li>
            <li>Network scanning or penetration testing</li>
            <li>Hosting malicious software or content</li>
            <li>Violating any applicable laws or regulations</li>
            <li>Attempting to access other users' containers or data</li>
          </ul>

          <h2>Data and Privacy</h2>
          <p>
            Your container data is private and isolated. We do not access your container contents 
            except for technical support purposes with your explicit consent.
          </p>

          <h2>Service Availability</h2>
          <p>
            We strive to maintain high availability but do not guarantee uninterrupted service. 
            Containers may be stopped or restarted for maintenance purposes.
          </p>

          <h2>Termination</h2>
          <p>
            We may terminate your access to the service at any time for violation of these terms 
            or for any other reason at our sole discretion.
          </p>

          <h2>Contact Information</h2>
          <p>
            If you have any questions about these Terms of Service, please contact us at{' '}
            <a href="mailto:legal@containerapp.com" className="text-blue-600 hover:text-blue-800">
              legal@containerapp.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
} 