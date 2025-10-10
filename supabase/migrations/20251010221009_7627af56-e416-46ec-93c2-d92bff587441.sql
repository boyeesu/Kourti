-- First, let's ensure all required columns exist
DO $$ 
BEGIN
  -- Add domain_hint
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN domain_hint TEXT;
  EXCEPTION
    WHEN duplicate_column THEN
      -- Column already exists, skip
      NULL;
  END;

  -- Add redirect_uri
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN redirect_uri TEXT;
  EXCEPTION
    WHEN duplicate_column THEN
      NULL;
  END;

  -- Add created_by
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN created_by UUID REFERENCES auth.users(id);
  EXCEPTION
    WHEN duplicate_column THEN
      NULL;
  END;

  -- Add updated_by
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  EXCEPTION
    WHEN duplicate_column THEN
      NULL;
  END;
END $$;