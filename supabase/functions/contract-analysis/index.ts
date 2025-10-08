import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { handleContractAnalysisRequest } from "../_shared/contract-analysis.ts";

serve(handleContractAnalysisRequest);
