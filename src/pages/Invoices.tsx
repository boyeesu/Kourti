// This page shows a coming soon message for the invoices module

export default function Invoices() {
  // Only show coming soon, do not serve real content
  return (
    <div className="w-full h-[70vh] flex flex-col items-center justify-center animate-fade-in">
      <div className="bg-blue-100 text-blue-700 py-3 px-6 rounded-md text-center text-lg font-bold shadow mb-4">
        🚧 Invoicing & Billing Module is Coming Soon
      </div>
      <p className="text-muted-foreground text-center max-w-sm">
        The invoicing and revenue features will be available in a future release. Thank you for your patience!
      </p>
    </div>
  );
}