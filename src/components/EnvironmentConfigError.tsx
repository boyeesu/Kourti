import React from 'react';
import type { MissingEnvVariable } from '@/lib/env';

interface EnvironmentConfigErrorProps {
  missingVariables: MissingEnvVariable[];
}

const EnvironmentConfigError: React.FC<EnvironmentConfigErrorProps> = ({ missingVariables }) => {
  const hasMissingVariables = missingVariables.length > 0;

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-card border border-border rounded-xl shadow-lg p-8 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Configuration required</h1>
          <p className="text-sm text-muted-foreground">
            The application cannot start because the required environment variables are not configured.
          </p>
        </div>

        {hasMissingVariables && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-left">
            <p className="font-medium text-destructive">Missing variables</p>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-destructive">
              {missingVariables.map((variable) => (
                <li key={variable.key}>
                  <span className="font-semibold">{variable.label}</span>
                  <span className="text-muted-foreground"> ({variable.key})</span>: {variable.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Please update your <code className="px-1 py-0.5 rounded bg-muted text-foreground">.env</code> file or the deployment
            environment with the missing values and reload the page.
          </p>
          <p>
            Required variables typically include the Supabase URL and anonymous key used to connect to your database. You can find
            these values in the Supabase dashboard under <span className="font-medium">Project Settings → API</span>.
          </p>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Retry loading application
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnvironmentConfigError;
