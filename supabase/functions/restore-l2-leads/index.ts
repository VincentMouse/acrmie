import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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
    )

    // Get the affected leads from history
    const { data: historyData, error: historyError } = await supabaseClient
      .from('lead_history')
      .select('lead_id, old_assigned_to')
      .eq('old_status', 'L2-Call reschedule')
      .is('new_assigned_to', null)
      .eq('new_status', 'L0-Fresh Lead')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })

    if (historyError) throw historyError

    // Get unique leads (in case multiple history entries exist)
    const uniqueLeads = historyData.reduce((acc: any[], curr) => {
      if (!acc.find(l => l.lead_id === curr.lead_id)) {
        acc.push(curr)
      }
      return acc
    }, [])

    // Check which leads still need restoration
    const { data: leadsToRestore, error: leadsError } = await supabaseClient
      .from('leads')
      .select('id, first_name, last_name, phone')
      .in('id', uniqueLeads.map(l => l.lead_id))
      .eq('status', 'L0-Fresh Lead')
      .is('assigned_to', null)

    if (leadsError) throw leadsError

    if (!leadsToRestore || leadsToRestore.length === 0) {
    return new Response(
      JSON.stringify({ 
        message: 'No leads need restoration',
        count: 0 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    }

    // Restore each lead
    const restoredLeads = []
    for (const lead of leadsToRestore) {
      const historyEntry = uniqueLeads.find(h => h.lead_id === lead.id)
      if (historyEntry) {
        const { error: updateError } = await supabaseClient
          .from('leads')
          .update({
            assigned_to: historyEntry.old_assigned_to,
            status: 'L2-Call reschedule',
            updated_at: new Date().toISOString()
          })
          .eq('id', lead.id)

        if (!updateError) {
          restoredLeads.push({
            ...lead,
            restored_to: historyEntry.old_assigned_to
          })
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Leads restored successfully',
        count: restoredLeads.length,
        leads: restoredLeads
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
