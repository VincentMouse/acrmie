import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('Starting L6 leads assignment fix...');

    // Get all L6 leads with NULL assigned_to that were created by tele sales
    const { data: leadsToFix, error: fetchError } = await supabaseClient
      .from('leads')
      .select(`
        id,
        first_name,
        last_name,
        phone,
        created_by,
        created_at,
        profiles!leads_created_by_fkey(nickname)
      `)
      .eq('status', 'L6-Appointment set')
      .is('assigned_to', null);

    if (fetchError) {
      console.error('Error fetching leads:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${leadsToFix?.length || 0} L6 leads to fix`);

    // Get all tele sales user IDs
    const { data: teleSales, error: teleSalesError } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('role', 'tele_sales');

    if (teleSalesError) {
      console.error('Error fetching tele sales:', teleSalesError);
      throw teleSalesError;
    }

    const teleSalesIds = new Set(teleSales?.map(ts => ts.user_id) || []);
    
    // Filter to only leads created by tele sales
    const leadsCreatedByTeleSales = leadsToFix?.filter(lead => 
      lead.created_by && teleSalesIds.has(lead.created_by)
    ) || [];

    console.log(`${leadsCreatedByTeleSales.length} leads were created by tele sales`);

    const fixed = [];
    const errors = [];

    // Fix each lead  
    for (const lead of leadsCreatedByTeleSales) {
      console.log(`Fixing lead ${lead.phone} - ${lead.first_name} ${lead.last_name}`);
      
      const { error: updateError } = await supabaseClient
        .from('leads')
        .update({
          assigned_to: lead.created_by,
          assigned_at: lead.created_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lead.id);

      if (updateError) {
        console.error(`Error updating lead ${lead.id}:`, updateError);
        errors.push({
          lead_id: lead.id,
          phone: lead.phone,
          error: updateError.message
        });
      } else {
        fixed.push({
          id: lead.id,
          phone: lead.phone,
          name: `${lead.first_name} ${lead.last_name}`,
          assigned_to: (lead.profiles as any)?.nickname
        });
      }
    }

    console.log(`Fixed ${fixed.length} leads, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        fixed_count: fixed.length,
        error_count: errors.length,
        fixed_leads: fixed,
        errors: errors
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
