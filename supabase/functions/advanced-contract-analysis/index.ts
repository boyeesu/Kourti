import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Advanced contract analysis request received');
    
    const { text, analysisType, goal, documentId } = await req.json();
    
    console.log('Request payload:', { text: text?.length || 0, analysisType, goal });
    
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('No text provided or empty text');
      throw new Error('Document text is required and cannot be empty');
    }

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Get user info from request headers
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let userId = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    console.log('Processing analysis request for user:', userId);

    // Enhanced system prompt for better legal analysis
    const systemPrompt = `You are an expert legal AI assistant specializing in contract and document analysis. Your role is to provide comprehensive, structured, and actionable legal insights.

IMPORTANT OUTPUT FORMATTING RULES:
- Do NOT use # headings or - bullet points in responses
- Use plain text with clear sections separated by double line breaks
- Use numbered lists (1., 2., 3.) when listing items
- Use structured paragraphs for readability
- Remove all markdown formatting from output

Your analysis should be:
1. Thorough and detailed
2. Legally accurate and practical
3. Easy to understand for legal professionals
4. Structured and well-organized
5. Action-oriented where applicable

For contract analysis, always consider:
- Key terms and conditions
- Potential risks and liabilities
- Missing or unclear provisions
- Compliance requirements
- Enforceability issues
- Recommendations for improvement`;

    let userPrompt = '';
    
    switch (analysisType) {
      case 'summarize':
      case 'general':
        userPrompt = `Please provide a comprehensive analysis of this legal document:

${text}

Your analysis should include:

DOCUMENT OVERVIEW
Provide a clear summary of what this document is and its primary purpose.

KEY PROVISIONS
Identify and explain the most important terms, conditions, and obligations.

PARTIES AND ROLES
Describe who the parties are and their respective responsibilities.

FINANCIAL TERMS
Outline any payment terms, amounts, or financial obligations.

TIMEFRAMES AND DEADLINES
Highlight important dates, deadlines, or duration terms.

RISK ASSESSMENT
Identify potential legal risks, liabilities, or areas of concern.

COMPLIANCE CONSIDERATIONS
Note any regulatory or legal compliance requirements.

RECOMMENDATIONS
Provide specific suggestions for improvement or areas that need attention.

Please ensure your response is detailed, professional, and actionable.`;
        break;
        
      case 'risk':
        userPrompt = `Conduct a thorough risk analysis of this legal document:

${text}

Focus on:

HIGH RISK AREAS
Identify provisions that could expose parties to significant legal or financial risk.

LIABILITY CONCERNS
Analyze liability clauses, indemnification terms, and limitation provisions.

ENFORCEMENT ISSUES
Evaluate the enforceability of key provisions and potential challenges.

COMPLIANCE GAPS
Identify any regulatory or legal compliance issues.

MISSING PROTECTIONS
Note important protective clauses that may be absent.

AMBIGUOUS TERMS
Highlight vague or unclear provisions that could lead to disputes.

MITIGATION STRATEGIES
Recommend specific actions to reduce identified risks.

Provide a detailed risk assessment with specific recommendations.`;
        break;
        
      case 'extract':
        userPrompt = `Extract and organize the key legal elements from this document:

${text}

Please provide:

PARTIES INVOLVED
List all parties with their roles and contact information.

CONTRACTUAL OBLIGATIONS
Detail what each party must do or provide.

PAYMENT TERMS
Extract all financial terms, amounts, and payment schedules.

IMPORTANT DATES
List all deadlines, effective dates, and expiration dates.

TERMINATION CONDITIONS
Describe how and when the agreement can be terminated.

GOVERNING LAW
Identify applicable jurisdiction and governing law.

DISPUTE RESOLUTION
Outline procedures for handling disputes.

CONFIDENTIALITY PROVISIONS
Extract any non-disclosure or confidentiality terms.

INTELLECTUAL PROPERTY
Note any IP rights, licenses, or restrictions.

REGULATORY REQUIREMENTS
Identify any compliance or regulatory obligations.

Present the information in a clear, organized format.`;
        break;
        
      case 'compare':
        userPrompt = `Analyze this document for comparison purposes:

${text}

Provide:

DOCUMENT CLASSIFICATION
Identify the type and purpose of this document.

STANDARD PROVISIONS
List common/standard clauses found in similar documents.

UNIQUE TERMS
Highlight unusual or non-standard provisions.

MISSING ELEMENTS
Note typical clauses that appear to be missing.

STRUCTURAL ANALYSIS
Evaluate the organization and flow of the document.

LEGAL COMPLETENESS
Assess whether the document covers all necessary legal aspects.

INDUSTRY STANDARDS
Compare against typical industry practices where applicable.

This analysis will be used for document comparison purposes.`;
        break;
        
      default:
        userPrompt = goal || `Please analyze this legal document and provide insights:

${text}

Provide a comprehensive analysis covering key terms, risks, and recommendations.`;
    }

    console.log('Making request to OpenAI GPT-4');

    // Use GPT-4 for high-quality analysis
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14', // Use GPT-4.1 for reliable results
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 3000,
        temperature: 0.3, // Lower temperature for more consistent legal analysis
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('OpenAI response received');

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected OpenAI response structure:', data);
      throw new Error('Unexpected response from OpenAI API');
    }

    let analysis = data.choices[0].message.content;

    // Clean up the analysis by removing markdown formatting
    analysis = analysis
      .replace(/^#{1,6}\s+/gm, '') // Remove # headings
      .replace(/^\s*-\s+/gm, '') // Remove - bullet points
      .replace(/^\s*\*\s+/gm, '') // Remove * bullet points
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .replace(/`([^`]+)`/g, '$1') // Remove code formatting
      .trim();

    // Log successful completion
    console.log('Analysis completed successfully, length:', analysis.length);

    // Store analysis if documentId is provided
    if (documentId && userId) {
      try {
        await supabase
          .from('document_analyses')
          .insert({
            document_id: documentId,
            analysis_type: analysisType || 'general',
            content: analysis,
            status: 'completed',
            created_by: userId,
            organization_id: null // Will be set by RLS if needed
          });
        console.log('Analysis stored in database');
      } catch (dbError) {
        console.error('Failed to store analysis:', dbError);
        // Continue even if storage fails
      }
    }

    return new Response(JSON.stringify({ 
      analysis,
      success: true,
      tokensUsed: data.usage?.total_tokens || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in advanced contract analysis:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Analysis failed',
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});